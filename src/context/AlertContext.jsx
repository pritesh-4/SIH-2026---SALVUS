import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { useLocation } from '../hooks/useLocation'
import { AlertContext } from './alertContextDef'
import { fetchHazards, fetchRecommendedShelters, fetchWeatherIntelligence } from '../services/api'
import { fetchAreaSafetyStatus } from '../services/locationIntelligenceService'
import { getSocket } from '../lib/realtime/socket'
import {
  normalizeAlert,
  deduplicateAlertsList,
  filterAlertsByLocation,
  isAlertActiveAndUnexpired,
  loadAlertInteractions,
  saveAlertInteractions,
  recordAlertInteraction,
  computeBadgeCount,
  AlertInteractionStatus,
} from '../lib/alertNormalization'

export const AlertProvider = ({ children }) => {
  const { location } = useLocation()

  // Central Alert & Telemetry Data State
  const [rawHazards, setRawHazards] = useState([])
  const [weatherData, setWeatherData] = useState(null)
  const [areaSafety, setAreaSafety] = useState(null)
  const [recommendedShelters, setRecommendedShelters] = useState([])
  const [sourcesHealth, setSourcesHealth] = useState([])
  const [sourceSummary, setSourceSummary] = useState(
    'SACHET NDMA · GDACS · USGS Earthquakes · Open-Meteo Weather'
  )

  // Status & Fetching Lifecycle
  const [status, setStatus] = useState('IDLE') // 'IDLE' | 'LOADING' | 'AVAILABLE' | 'PARTIAL' | 'UNAVAILABLE' | 'ERROR'
  const [fetchError, setFetchError] = useState(null)
  const [lastFetchedAt, setLastFetchedAt] = useState(null)
  const [isWeatherLoading, setIsWeatherLoading] = useState(false)

  // Mode Toggles
  const [isDemoMode, setIsDemoMode] = useState(() => {
    if (typeof window === 'undefined') return false
    const params = new URLSearchParams(window.location.search)
    return (
      params.get('demo') === 'true' ||
      params.get('dev') === 'true' ||
      localStorage.getItem('salvus_demo_mode') === 'true'
    )
  })
  const [isRegionalMode, setIsRegionalMode] = useState(false)

  // User Read / Acknowledged / Dismissed Interaction State
  const [userInteractions, setUserInteractions] = useState(() => loadAlertInteractions())

  const isMountedRef = useRef(true)
  const lastFetchTimestampRef = useRef(0)

  useEffect(() => {
    isMountedRef.current = true
    return () => {
      isMountedRef.current = false
    }
  }, [])

  // Sync demo mode toggle events across windows/tabs
  useEffect(() => {
    const handleDemoSync = (e) => {
      if (e.detail !== undefined) {
        setIsDemoMode(e.detail)
      }
    }
    window.addEventListener('salvus_demo_toggle', handleDemoSync)
    return () => window.removeEventListener('salvus_demo_toggle', handleDemoSync)
  }, [])

  const hasCoordinates =
    typeof location?.latitude === 'number' && typeof location?.longitude === 'number'

  // Find legitimate nearest safe refuge from current shelter dataset
  const nearestSafeShelter = useMemo(() => {
    return (
      recommendedShelters.find((s) => s.is_safe !== false && s.status !== 'CLOSED') ||
      recommendedShelters[0] ||
      null
    )
  }, [recommendedShelters])

  // Normalized Canonical Active Alerts
  const alerts = useMemo(() => {
    if (!Array.isArray(rawHazards)) return []

    // 1. Normalize all incoming raw alerts
    const normalizedList = rawHazards
      .map((h) => normalizeAlert(h, location, nearestSafeShelter))
      .filter((a) => a !== null && isAlertActiveAndUnexpired(a))

    // 2. Deduplicate
    const dedupedList = deduplicateAlertsList(normalizedList)

    // 3. Filter by location relevance if user coordinates are available
    const maxDist = isRegionalMode ? 75.0 : 25.0
    const filteredList = hasCoordinates
      ? filterAlertsByLocation(dedupedList, location, maxDist)
      : dedupedList

    return filteredList
  }, [rawHazards, location, nearestSafeShelter, isRegionalMode, hasCoordinates])

  // Derived Severity Counts
  const criticalCount = useMemo(
    () => alerts.filter((a) => a.severity === 'CRITICAL').length,
    [alerts]
  )
  const warningCount = useMemo(
    () => alerts.filter((a) => a.severity === 'WARNING').length,
    [alerts]
  )
  const watchCount = useMemo(
    () => alerts.filter((a) => ['WATCH', 'ADVISORY', 'INFO'].includes(a.severity)).length,
    [alerts]
  )

  // Derived Authoritative Notification Badge Count
  // Active + Location-Relevant + Unexpired + Uncancelled + Unseen
  const badgeCount = useMemo(() => {
    // If provider failed completely or is unavailable, badge should not falsely indicate unread alerts
    if (status === 'UNAVAILABLE' || status === 'ERROR') {
      return 0
    }
    return computeBadgeCount(alerts, userInteractions)
  }, [alerts, userInteractions, status])

  const unreadCount = badgeCount

  /**
   * Load real normalized hazards, weather telemetry, and area context from authoritative backend.
   */
  const refreshAlerts = useCallback(
    async (force = false) => {
      const now = Date.now()
      // Cooldown throttle: minimum 6 seconds between programmatic auto-refetches unless forced
      if (!force && now - lastFetchTimestampRef.current < 6000) {
        return
      }

      try {
        let lat = null
        let lon = null
        let maxDist = null

        if (hasCoordinates) {
          lat = location.latitude
          lon = location.longitude
          maxDist = isRegionalMode ? 75.0 : 25.0
        }

        // Parallel requests across hazards, shelters, area safety, and weather telemetry
        const [hazardsRes, sheltersRes, safetyRes, weatherRes] = await Promise.allSettled([
          fetchHazards(lat, lon, maxDist, isDemoMode),
          lat && lon
            ? fetchRecommendedShelters(lat, lon, null, {
                maxRadiusKm: isRegionalMode ? 75.0 : 25.0,
                demo: isDemoMode,
              })
            : Promise.resolve({ data: [] }),
          lat && lon ? fetchAreaSafetyStatus(lat, lon) : Promise.resolve(null),
          lat && lon ? fetchWeatherIntelligence(lat, lon, force) : Promise.resolve(null),
        ])

        if (!isMountedRef.current) return

        // 1. Process Hazards
        if (hazardsRes.status === 'fulfilled' && hazardsRes.value?.success) {
          const hazardData = hazardsRes.value.data || []
          setRawHazards(hazardData)
          if (hazardsRes.value.sourceSummary) {
            setSourceSummary(hazardsRes.value.sourceSummary)
          }
          if (hazardsRes.value.sourcesHealth) {
            setSourcesHealth(hazardsRes.value.sourcesHealth)
            const degraded = hazardsRes.value.sourcesHealth.some(
              (s) => s.status === 'DEGRADED' || s.status === 'ERROR'
            )
            setStatus(degraded ? 'PARTIAL' : 'AVAILABLE')
          } else {
            setStatus('AVAILABLE')
          }
          setLastFetchedAt(new Date().toISOString())
          lastFetchTimestampRef.current = Date.now()
          setFetchError(null)
        } else {
          const errMsg =
            hazardsRes.status === 'fulfilled'
              ? hazardsRes.value?.error?.message
              : hazardsRes.reason?.message || 'Failed to query disaster feeds'
          setFetchError(errMsg)
          setRawHazards([])
          setStatus('UNAVAILABLE')
        }

        // 2. Process Shelters
        if (sheltersRes.status === 'fulfilled' && sheltersRes.value?.success) {
          setRecommendedShelters(sheltersRes.value.data || [])
        }

        // 3. Process Area Safety
        if (safetyRes.status === 'fulfilled' && safetyRes.value) {
          setAreaSafety(safetyRes.value)
        }

        // 4. Process Weather Intelligence
        if (weatherRes.status === 'fulfilled' && weatherRes.value?.success) {
          setWeatherData(weatherRes.value)
        }
      } catch (err) {
        if (isMountedRef.current) {
          setFetchError(err.message || 'Disaster intelligence service unavailable')
          setRawHazards([])
          setStatus('ERROR')
        }
      } finally {
        if (isMountedRef.current) {
          setIsWeatherLoading(false)
        }
      }
    },
    [hasCoordinates, isRegionalMode, location.latitude, location.longitude, isDemoMode]
  )

  // Trigger fetch and update on location coordinates or mode change
  useEffect(() => {
    let isCancelled = false

    const loadData = async () => {
      try {
        let lat = null
        let lon = null
        let maxDist = null

        if (hasCoordinates) {
          lat = location.latitude
          lon = location.longitude
          maxDist = isRegionalMode ? 75.0 : 25.0
        }

        const [hazardsRes, sheltersRes, safetyRes, weatherRes] = await Promise.allSettled([
          fetchHazards(lat, lon, maxDist, isDemoMode),
          lat && lon
            ? fetchRecommendedShelters(lat, lon, null, {
                maxRadiusKm: isRegionalMode ? 75.0 : 25.0,
                demo: isDemoMode,
              })
            : Promise.resolve({ data: [] }),
          lat && lon ? fetchAreaSafetyStatus(lat, lon) : Promise.resolve(null),
          lat && lon ? fetchWeatherIntelligence(lat, lon) : Promise.resolve(null),
        ])

        if (isCancelled || !isMountedRef.current) return

        if (hazardsRes.status === 'fulfilled' && hazardsRes.value?.success) {
          const hazardData = hazardsRes.value.data || []
          setRawHazards(hazardData)
          if (hazardsRes.value.sourceSummary) {
            setSourceSummary(hazardsRes.value.sourceSummary)
          }
          if (hazardsRes.value.sourcesHealth) {
            setSourcesHealth(hazardsRes.value.sourcesHealth)
            const degraded = hazardsRes.value.sourcesHealth.some(
              (s) => s.status === 'DEGRADED' || s.status === 'ERROR'
            )
            setStatus(degraded ? 'PARTIAL' : 'AVAILABLE')
          } else {
            setStatus('AVAILABLE')
          }
          setLastFetchedAt(new Date().toISOString())
          lastFetchTimestampRef.current = Date.now()
          setFetchError(null)
        } else {
          const errMsg =
            hazardsRes.status === 'fulfilled'
              ? hazardsRes.value?.error?.message
              : hazardsRes.reason?.message || 'Failed to query disaster feeds'
          setFetchError(errMsg)
          setRawHazards([])
          setStatus('UNAVAILABLE')
        }

        if (sheltersRes.status === 'fulfilled' && sheltersRes.value?.success) {
          setRecommendedShelters(sheltersRes.value.data || [])
        }

        if (safetyRes.status === 'fulfilled' && safetyRes.value) {
          setAreaSafety(safetyRes.value)
        }

        if (weatherRes.status === 'fulfilled' && weatherRes.value?.success) {
          setWeatherData(weatherRes.value)
        }
      } catch (err) {
        if (!isCancelled && isMountedRef.current) {
          setFetchError(err.message || 'Disaster intelligence service unavailable')
          setRawHazards([])
          setStatus('ERROR')
        }
      }
    }

    loadData()

    return () => {
      isCancelled = true
    }
  }, [hasCoordinates, isRegionalMode, location.latitude, location.longitude, isDemoMode])

  // Background refresh on tab focus / visibility change (with 60-second cooldown)
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        const elapsed = Date.now() - lastFetchTimestampRef.current
        if (elapsed > 60000) {
          refreshAlerts(false)
        }
      }
    }
    const handleWindowFocus = () => {
      const elapsed = Date.now() - lastFetchTimestampRef.current
      if (elapsed > 60000) {
        refreshAlerts(false)
      }
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)
    window.addEventListener('focus', handleWindowFocus)
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      window.removeEventListener('focus', handleWindowFocus)
    }
  }, [refreshAlerts])

  // Realtime Socket.IO subscriptions for verified disaster alert lifecycle
  useEffect(() => {
    let socket = null
    try {
      socket = getSocket()
    } catch {
      return
    }

    if (!socket) return

    const handleAlertCreated = (data) => {
      if (!data || !data.id) return
      setRawHazards((prev) => {
        const exists = prev.some((a) => a.id === data.id)
        if (exists) {
          return prev.map((a) => (a.id === data.id ? { ...a, ...data } : a))
        }
        return [data, ...prev]
      })
      setLastFetchedAt(new Date().toISOString())
    }

    const handleAlertUpdated = (data) => {
      if (!data || !data.id) return
      setRawHazards((prev) => prev.map((a) => (a.id === data.id ? { ...a, ...data } : a)))
      setLastFetchedAt(new Date().toISOString())
    }

    const handleAlertExpired = (data) => {
      const expiredId = data?.id || data?.alert_id
      if (!expiredId) return
      setRawHazards((prev) => prev.filter((a) => a.id !== expiredId))
      setLastFetchedAt(new Date().toISOString())
    }

    const handleRefreshRequested = () => {
      refreshAlerts(true)
    }

    socket.on('hazard.alert_created', handleAlertCreated)
    socket.on('hazard:alert_created', handleAlertCreated)
    socket.on('hazard.alert_updated', handleAlertUpdated)
    socket.on('hazard:alert_updated', handleAlertUpdated)
    socket.on('hazard.alert_expired', handleAlertExpired)
    socket.on('hazard:alert_expired', handleAlertExpired)
    socket.on('hazard.refresh_requested', handleRefreshRequested)
    socket.on('hazard:refresh_requested', handleRefreshRequested)

    return () => {
      socket.off('hazard.alert_created', handleAlertCreated)
      socket.off('hazard:alert_created', handleAlertCreated)
      socket.off('hazard.alert_updated', handleAlertUpdated)
      socket.off('hazard:alert_updated', handleAlertUpdated)
      socket.off('hazard.alert_expired', handleAlertExpired)
      socket.off('hazard:alert_expired', handleAlertExpired)
      socket.off('hazard.refresh_requested', handleRefreshRequested)
      socket.off('hazard:refresh_requested', handleRefreshRequested)
    }
  }, [refreshAlerts])

  // ---------------------------------------------------------------------------
  // User Alert State Actions
  // ---------------------------------------------------------------------------

  /**
   * Mark a specific alert as READ / SEEN.
   * Immediately decrements the active unread notification badge count.
   */
  const markAsRead = useCallback((alertId) => {
    if (!alertId) return
    setUserInteractions((prev) => {
      if (prev[alertId]?.status === AlertInteractionStatus.READ) {
        return prev
      }
      const updated = {
        ...prev,
        [alertId]: {
          status: AlertInteractionStatus.READ,
          updatedAt: Date.now(),
        },
      }
      saveAlertInteractions(updated)
      return updated
    })
  }, [])

  /**
   * Mark all currently active alerts as READ.
   */
  const markAllAsRead = useCallback(() => {
    setUserInteractions((prev) => {
      const updated = { ...prev }
      const now = Date.now()
      for (const a of alerts) {
        if (a && a.id) {
          updated[a.id] = {
            status: AlertInteractionStatus.READ,
            updatedAt: now,
          }
        }
      }
      saveAlertInteractions(updated)
      return updated
    })
  }, [alerts])

  /**
   * Explicitly record citizen acknowledgement for an alert.
   */
  const acknowledgeAlert = useCallback((alertId) => {
    if (!alertId) return
    const updated = recordAlertInteraction(alertId, AlertInteractionStatus.ACKNOWLEDGED)
    setUserInteractions(updated)
  }, [])

  /**
   * Dismiss an alert from active display and badge count.
   */
  const dismissAlert = useCallback((alertId) => {
    if (!alertId) return
    const updated = recordAlertInteraction(alertId, AlertInteractionStatus.DISMISSED)
    setUserInteractions(updated)
  }, [])

  /**
   * Check interaction state for a given alert ID.
   */
  const getAlertInteraction = useCallback(
    (alertId) => {
      return userInteractions[alertId] || null
    },
    [userInteractions]
  )

  const value = {
    // Alert Datasets
    alerts,
    rawHazards,
    // Counts
    badgeCount,
    unreadCount,
    criticalCount,
    warningCount,
    watchCount,
    // Status & Diagnostics
    status,
    fetchError,
    lastFetchedAt,
    sourcesHealth,
    sourceSummary,
    // Ancillary Telemetry
    weatherData,
    isWeatherLoading,
    areaSafety,
    recommendedShelters,
    nearestSafeShelter,
    // Modes
    isDemoMode,
    isRegionalMode,
    setIsDemoMode,
    setIsRegionalMode,
    // Actions
    refreshAlerts,
    markAsRead,
    markAllAsRead,
    acknowledgeAlert,
    dismissAlert,
    getAlertInteraction,
    userInteractions,
  }

  return <AlertContext.Provider value={value}>{children}</AlertContext.Provider>
}

export default AlertProvider
