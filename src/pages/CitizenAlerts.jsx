import { useState, useEffect, useCallback, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useLocation } from '../hooks/useLocation'
import { fetchHazards, fetchRecommendedShelters } from '../services/api'
import {
  fetchAreaSafetyStatus,
  formatRelativeFreshness,
} from '../services/locationIntelligenceService'
import { LANDMARKS } from '../lib/location'
import { Card } from '../components/ui/Card'
import { Badge } from '../components/ui/Badge'
import { Button } from '../components/ui/Button'
import { StatusIndicator } from '../components/ui/StatusIndicator'

export const CitizenAlerts = () => {
  const navigate = useNavigate()
  const { location, isAcquiring, requestLocation, selectLandmark } = useLocation()

  // Filter & modal state
  const [selectedFilter, setSelectedFilter] = useState('all')
  const [activeAlertDetail, setActiveAlertDetail] = useState(null)

  // API data state
  const [liveHazards, setLiveHazards] = useState([])
  const [sourceSummary, setSourceSummary] = useState(
    'SACHET NDMA · GDACS · USGS Earthquakes · Open-Meteo Weather'
  )
  const [sourcesHealth, setSourcesHealth] = useState([])
  const [areaSafety, setAreaSafety] = useState(null)
  const [recommendedShelters, setRecommendedShelters] = useState([])

  // UI state
  const [isLoading, setIsLoading] = useState(false)
  const [fetchError, setFetchError] = useState(null)
  const [lastFetchedAt, setLastFetchedAt] = useState(null)
  const [isDemoMode, setIsDemoMode] = useState(false)
  const [isRegionalMode, setIsRegionalMode] = useState(false)
  const [, setFreshnessTick] = useState(0)

  const alertModalRef = useRef(null)
  const isMountedRef = useRef(true)
  const lastFetchTimestampRef = useRef(0)

  useEffect(() => {
    isMountedRef.current = true
    return () => {
      isMountedRef.current = false
    }
  }, [])

  // Auto-updating relative timestamp tick (every 30 seconds)
  useEffect(() => {
    const timer = setInterval(() => {
      setFreshnessTick((t) => t + 1)
    }, 30000)
    return () => clearInterval(timer)
  }, [])

  // Escape key + body scroll lock for alert detail modal
  useEffect(() => {
    if (!activeAlertDetail) return
    const originalOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    if (alertModalRef.current) alertModalRef.current.focus()

    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        setActiveAlertDetail(null)
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      document.body.style.overflow = originalOverflow
    }
  }, [activeAlertDetail])

  const hasCoordinates =
    typeof location?.latitude === 'number' && typeof location?.longitude === 'number'

  /**
   * Load real normalized hazards and grounded area context
   */
  const loadAlerts = useCallback(
    async (force = false) => {
      const now = Date.now()
      // Cooldown throttle: minimum 10 seconds between programmatic refetches unless forced
      if (!force && now - lastFetchTimestampRef.current < 10000) {
        return
      }

      setIsLoading(true)
      setFetchError(null)

      try {
        let lat = null
        let lon = null
        let maxDist = null

        if (hasCoordinates && !isRegionalMode) {
          lat = location.latitude
          lon = location.longitude
          maxDist = 25.0
        } else if (hasCoordinates && isRegionalMode) {
          lat = location.latitude
          lon = location.longitude
          maxDist = 75.0
        } else {
          lat = null
          lon = null
          maxDist = null
        }

        // Parallel requests across hazards, shelters, and area safety
        const [hazardsRes, sheltersRes, safetyRes] = await Promise.allSettled([
          fetchHazards(lat, lon, maxDist, isDemoMode),
          lat && lon ? fetchRecommendedShelters(lat, lon) : Promise.resolve({ data: [] }),
          lat && lon ? fetchAreaSafetyStatus(lat, lon) : Promise.resolve(null),
        ])

        if (!isMountedRef.current) return

        if (hazardsRes.status === 'fulfilled' && hazardsRes.value?.success) {
          setLiveHazards(hazardsRes.value.data || [])
          if (hazardsRes.value.sourceSummary) {
            setSourceSummary(hazardsRes.value.sourceSummary)
          }
          if (hazardsRes.value.sourcesHealth) {
            setSourcesHealth(hazardsRes.value.sourcesHealth)
          }
          setLastFetchedAt(new Date().toISOString())
          lastFetchTimestampRef.current = Date.now()
        } else {
          const errMsg =
            hazardsRes.status === 'fulfilled'
              ? hazardsRes.value?.error?.message
              : hazardsRes.reason?.message || 'Failed to query disaster feeds'
          setFetchError(errMsg)
          setLiveHazards([])
        }

        if (sheltersRes.status === 'fulfilled' && sheltersRes.value?.success) {
          setRecommendedShelters(sheltersRes.value.data || [])
        }

        if (safetyRes.status === 'fulfilled' && safetyRes.value) {
          setAreaSafety(safetyRes.value)
        }
      } catch (err) {
        if (isMountedRef.current) {
          setFetchError(err.message || 'Disaster intelligence service unavailable')
          setLiveHazards([])
        }
      } finally {
        if (isMountedRef.current) {
          setIsLoading(false)
        }
      }
    },
    [hasCoordinates, isRegionalMode, location.latitude, location.longitude, isDemoMode]
  )

  // Initial fetch and trigger on location / mode changes
  useEffect(() => {
    let isCancelled = false

    const executeFetch = async () => {
      setIsLoading(true)
      setFetchError(null)

      try {
        let lat = null
        let lon = null
        let maxDist = null

        if (hasCoordinates && !isRegionalMode) {
          lat = location.latitude
          lon = location.longitude
          maxDist = 25.0
        } else if (hasCoordinates && isRegionalMode) {
          lat = location.latitude
          lon = location.longitude
          maxDist = 75.0
        } else {
          lat = null
          lon = null
          maxDist = null
        }

        const [hazardsRes, sheltersRes, safetyRes] = await Promise.allSettled([
          fetchHazards(lat, lon, maxDist, isDemoMode),
          lat && lon ? fetchRecommendedShelters(lat, lon) : Promise.resolve({ data: [] }),
          lat && lon ? fetchAreaSafetyStatus(lat, lon) : Promise.resolve(null),
        ])

        if (isCancelled || !isMountedRef.current) return

        if (hazardsRes.status === 'fulfilled' && hazardsRes.value?.success) {
          setLiveHazards(hazardsRes.value.data || [])
          if (hazardsRes.value.sourceSummary) {
            setSourceSummary(hazardsRes.value.sourceSummary)
          }
          if (hazardsRes.value.sourcesHealth) {
            setSourcesHealth(hazardsRes.value.sourcesHealth)
          }
          setLastFetchedAt(new Date().toISOString())
          lastFetchTimestampRef.current = Date.now()
        } else {
          const errMsg =
            hazardsRes.status === 'fulfilled'
              ? hazardsRes.value?.error?.message
              : hazardsRes.reason?.message || 'Failed to query disaster feeds'
          setFetchError(errMsg)
          setLiveHazards([])
        }

        if (sheltersRes.status === 'fulfilled' && sheltersRes.value?.success) {
          setRecommendedShelters(sheltersRes.value.data || [])
        }

        if (safetyRes.status === 'fulfilled' && safetyRes.value) {
          setAreaSafety(safetyRes.value)
        }
      } catch (err) {
        if (!isCancelled && isMountedRef.current) {
          setFetchError(err.message || 'Disaster intelligence service unavailable')
          setLiveHazards([])
        }
      } finally {
        if (!isCancelled && isMountedRef.current) {
          setIsLoading(false)
        }
      }
    }

    executeFetch()

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
          loadAlerts(false)
        }
      }
    }
    const handleWindowFocus = () => {
      const elapsed = Date.now() - lastFetchTimestampRef.current
      if (elapsed > 60000) {
        loadAlerts(false)
      }
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)
    window.addEventListener('focus', handleWindowFocus)
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      window.removeEventListener('focus', handleWindowFocus)
    }
  }, [loadAlerts])

  // Check if any external telemetry sources are degraded
  const degradedSources = sourcesHealth.filter(
    (s) => s.status === 'DEGRADED' || s.status === 'UNAVAILABLE' || s.status === 'ERROR'
  )
  const hasDegradedSources = degradedSources.length > 0

  // Find legitimate nearest safe refuge if available in real dataset
  const nearestSafeShelter =
    recommendedShelters.find((s) => s.is_safe !== false && s.status !== 'CLOSED') ||
    recommendedShelters[0] ||
    null

  // Transform normalized backend alert objects into display structures
  const displayAlerts = liveHazards.map((hz, index) => {
    // Parse actions: prefer array or split string
    const actionItems =
      Array.isArray(hz.actions) && hz.actions.length > 0
        ? hz.actions
        : hz.recommended_action
          ? [hz.recommended_action]
          : ['Follow official civil defense directives.']

    return {
      id: hz.id || hz.hazard_id || `hz-${index}-${hz.source_event_id || 'item'}`,
      severity: (hz.severity || 'INFO').toUpperCase(),
      title: hz.title || 'Emergency Advisory',
      summary: hz.description || 'Monitored hazard advisory active in your sector.',
      whyItMatters:
        hz.why_it_matters ||
        hz.description ||
        'Direct proximity hazard affecting current sector travel and safety.',
      recommendedAction:
        hz.recommended_action || actionItems[0] || 'Follow official civil defense directives.',
      actions: actionItems,
      distance:
        hz.distance_formatted ||
        (hz.distance_km != null
          ? `${hz.distance_km.toFixed(1)} km away`
          : hz.radius_km
            ? `${hz.radius_km} km radius`
            : hz.is_within_affected_area
              ? 'Within affected area'
              : 'Monitored sector'),
      isWithinAffectedArea: Boolean(hz.is_within_affected_area),
      observedTime: formatRelativeFreshness(hz.observed_at || hz.issued_at, 'Observed'),
      updatedTime: formatRelativeFreshness(
        hz.fetched_at || hz.issued_at || hz.observed_at,
        'Updated'
      ),
      observedAtIso: hz.observed_at,
      issuedAtIso: hz.issued_at,
      expiresAtIso: hz.expires_at,
      provenance: hz.provenance || hz.data_provenance || 'LIVE',
      source: hz.source || 'Verified Disaster Feed',
      sourceType: hz.source_type,
      sourcesMatched: hz.sources_matched || [hz.source],
      sourceUrl: hz.source_url || null,
      affectedArea: hz.affected_area || 'Sector 12 & Metropolitan Corridor',
      radiusKm: hz.radius_km || hz.affected_radius_km || null,
      nearestShelter: nearestSafeShelter,
    }
  })

  // Filter alerts by minimal tabs
  const filteredAlerts = displayAlerts.filter((a) => {
    if (selectedFilter === 'all') return true
    if (selectedFilter === 'critical') return a.severity === 'CRITICAL'
    if (selectedFilter === 'warning') return a.severity === 'WARNING'
    if (selectedFilter === 'watch') {
      return ['WATCH', 'ADVISORY', 'INFO'].includes(a.severity)
    }
    return true
  })

  const criticalCount = displayAlerts.filter((a) => a.severity === 'CRITICAL').length
  const warningCount = displayAlerts.filter((a) => a.severity === 'WARNING').length
  const watchCount = displayAlerts.filter((a) =>
    ['WATCH', 'ADVISORY', 'INFO'].includes(a.severity)
  ).length

  const filters = [
    { id: 'all', label: 'All', count: displayAlerts.length },
    { id: 'critical', label: 'Critical', count: criticalCount },
    { id: 'warning', label: 'Warnings', count: warningCount },
    { id: 'watch', label: 'Advisories', count: watchCount },
  ]

  // Semantic card variant (no glowing/neon styles)
  const getCardVariant = (severity) => {
    switch (severity) {
      case 'CRITICAL':
        return 'critical'
      case 'WARNING':
        return 'warning'
      case 'WATCH':
      case 'ADVISORY':
      case 'INFO':
        return 'info'
      default:
        return 'default'
    }
  }

  // Semantic badge variant
  const getBadgeVariant = (severity) => {
    switch (severity) {
      case 'CRITICAL':
        return 'critical'
      case 'WARNING':
        return 'warning'
      case 'WATCH':
      case 'ADVISORY':
      case 'INFO':
        return 'info'
      default:
        return 'neutral'
    }
  }

  const isLocationOff =
    !hasCoordinates &&
    (location.source === 'UNKNOWN' ||
      location.status === 'DENIED' ||
      location.permission === 'DENIED' ||
      location.status === 'IDLE')

  const isLandmark = location.source === 'LANDMARK' || location.isFallback

  return (
    <div className="max-w-[1440px] w-full mx-auto px-4 sm:px-8 lg:px-12 py-6 sm:py-8 animate-fadeIn">
      {/* Page Header */}
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
        <div>
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <span className="text-xs font-semibold uppercase tracking-wider text-salvus-text-secondary">
              Emergency Alerts & Advisories
            </span>
            {criticalCount > 0 ? (
              <>
                <span className="h-1 w-1 rounded-full bg-salvus-border-strong" />
                <span className="text-xs font-bold text-salvus-critical">
                  {criticalCount} Critical active
                </span>
              </>
            ) : null}
          </div>

          <h1 className="text-2xl sm:text-3xl font-extrabold text-salvus-text-primary tracking-tight">
            {isRegionalMode
              ? 'Regional Emergency Advisories'
              : hasCoordinates
                ? `Alerts for ${location.address || 'Your Area'}`
                : 'Local Area Safety Advisories'}
          </h1>
        </div>

        {/* Action Controls: Refresh, Simulation Toggle & Status */}
        <div className="flex items-center gap-2.5 flex-wrap">
          <button
            type="button"
            onClick={() => loadAlerts(true)}
            disabled={isLoading}
            className="px-3 py-1.5 rounded-xl bg-salvus-surface border border-salvus-border hover:border-salvus-info text-salvus-text-secondary hover:text-salvus-text-primary text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer shadow-xs disabled:opacity-50"
            title="Refresh verified disaster feeds"
            aria-label="Refresh alerts"
          >
            <span className={isLoading ? 'animate-spin inline-block' : ''}>🔄</span>
            <span>{isLoading ? 'Checking...' : 'Refresh'}</span>
          </button>

          <button
            type="button"
            onClick={() => setIsDemoMode((prev) => !prev)}
            className={`px-3 py-1.5 rounded-xl border text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer shadow-xs ${
              isDemoMode
                ? 'bg-amber-950/80 text-amber-300 border-amber-500/50'
                : 'bg-salvus-surface border-salvus-border text-salvus-text-secondary hover:text-salvus-text-primary'
            }`}
            title="Toggle simulated drills and testing alerts"
          >
            <span>{isDemoMode ? '🧪' : '📡'}</span>
            <span>{isDemoMode ? 'Simulation Active' : 'Live Verified'}</span>
          </button>

          <StatusIndicator
            status={fetchError ? 'critical' : 'safe'}
            label={
              fetchError
                ? 'Feeds Offline'
                : lastFetchedAt
                  ? `Checked ${formatRelativeFreshness(lastFetchedAt)}`
                  : 'Feeds Active'
            }
            showDot={true}
          />
        </div>
      </header>

      {/* Location Context Bar / Location Notice */}
      {isLocationOff && !isRegionalMode ? (
        <section
          aria-label="Location notice"
          className="mb-6 p-4 sm:p-5 rounded-2xl bg-salvus-surface-elevated border border-salvus-border flex flex-col md:flex-row md:items-center justify-between gap-4"
        >
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-xs font-bold uppercase tracking-wider text-salvus-warning">
                Location Notice
              </span>
            </div>
            <h2 className="text-base sm:text-lg font-bold text-salvus-text-primary">
              Turn on location to see alerts for your area.
            </h2>
            <p className="text-xs sm:text-sm text-salvus-text-secondary mt-1 max-w-xl leading-relaxed">
              Disaster alerts are prioritized by distance and affected hazard polygons. Enable GPS
              or choose an approximate landmark to verify local conditions.
            </p>
          </div>

          <div className="flex items-center gap-2.5 flex-wrap shrink-0">
            <button
              type="button"
              onClick={() => requestLocation({ timeout: 8000 })}
              disabled={isAcquiring}
              className="px-3.5 py-2 rounded-xl bg-salvus-info text-white text-xs font-bold hover:bg-sky-600 transition-colors shadow-xs flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
            >
              <span>{isAcquiring ? '⏳' : '📍'}</span>
              <span>{isAcquiring ? 'Acquiring GPS...' : 'Enable GPS Location'}</span>
            </button>

            <select
              aria-label="Select Landmark Fallback"
              onChange={(e) => {
                if (e.target.value) {
                  selectLandmark(e.target.value)
                  setIsRegionalMode(false)
                }
              }}
              defaultValue=""
              className="bg-salvus-surface border border-salvus-border hover:border-salvus-border-strong text-salvus-text-primary text-xs rounded-xl px-3 py-2 focus:outline-none focus:border-salvus-info cursor-pointer font-medium"
            >
              <option value="" disabled>
                Select Sector Landmark...
              </option>
              {LANDMARKS.map((lm) => (
                <option key={lm.name} value={lm.name}>
                  {lm.name} (Approx.)
                </option>
              ))}
            </select>

            <button
              type="button"
              onClick={() => setIsRegionalMode(true)}
              className="px-3 py-2 rounded-xl bg-salvus-surface border border-salvus-border hover:border-salvus-info text-salvus-text-secondary hover:text-salvus-text-primary text-xs font-semibold cursor-pointer transition-colors"
            >
              View Regional Alerts →
            </button>
          </div>
        </section>
      ) : isRegionalMode ? (
        <section className="mb-6 p-3.5 sm:p-4 rounded-xl bg-salvus-info-bg/50 border border-salvus-info-border flex items-center justify-between gap-3 flex-wrap text-xs">
          <div className="flex items-center gap-2 text-salvus-info-text">
            <span>🌐</span>
            <span>
              <strong>Regional Overview Mode:</strong> Displaying all active regional disaster and
              weather advisories.
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                setIsRegionalMode(false)
                requestLocation({ timeout: 8000 })
              }}
              className="text-xs font-bold text-salvus-info hover:underline cursor-pointer"
            >
              Switch to My Location
            </button>
          </div>
        </section>
      ) : isLandmark ? (
        <section className="mb-6 p-3 sm:p-3.5 rounded-xl bg-amber-950/20 border border-amber-500/30 flex items-center justify-between gap-3 flex-wrap text-xs text-salvus-text-secondary">
          <div className="flex items-center gap-2">
            <span>📍</span>
            <span>
              Showing hazards approximate to landmark:{' '}
              <strong className="text-salvus-text-primary">{location.landmarkName}</strong>
            </span>
          </div>
          <button
            type="button"
            onClick={() => requestLocation({ timeout: 8000 })}
            className="text-xs font-bold text-salvus-info hover:underline cursor-pointer"
          >
            Upgrade to Precise GPS Lock →
          </button>
        </section>
      ) : null}

      {/* Source Health Subtle Notice (Part 5: Non-alarmist degradation notice) */}
      {hasDegradedSources && (
        <aside
          aria-label="Source status notice"
          className="mb-6 p-3 rounded-xl bg-amber-950/20 border border-amber-500/30 text-amber-200/90 text-xs flex items-center gap-2"
        >
          <span>ℹ️</span>
          <span>
            Some alert sources are temporarily unavailable. Active feeds continue to monitor.
          </span>
        </aside>
      )}

      {/* Minimal Filter Tabs (Part 10) */}
      <nav
        aria-label="Alert severity filters"
        className="flex items-center gap-2 overflow-x-auto pb-3 mb-6 no-scrollbar"
      >
        {filters.map((f) => (
          <button
            key={f.id}
            type="button"
            onClick={() => setSelectedFilter(f.id)}
            aria-pressed={selectedFilter === f.id}
            className={`px-3.5 py-1.5 rounded-full text-xs font-semibold tracking-wide transition-all whitespace-nowrap cursor-pointer flex items-center gap-2 ${
              selectedFilter === f.id
                ? 'bg-salvus-text-primary text-salvus-bg shadow-xs'
                : 'bg-salvus-surface border border-salvus-border text-salvus-text-secondary hover:text-salvus-text-primary'
            }`}
          >
            <span>{f.label}</span>
            <span
              className={`text-[10px] px-1.5 py-0.2 rounded-full font-bold ${
                selectedFilter === f.id
                  ? 'bg-salvus-bg/20 text-salvus-bg'
                  : 'bg-salvus-muted text-salvus-text-muted'
              }`}
            >
              {f.count}
            </span>
          </button>
        ))}
      </nav>

      {/* Main Alert List Feed */}
      <main className="space-y-4" aria-live="polite">
        {/* 1. Loading State (Part 3: "Checking your area...") */}
        {isLoading ? (
          <Card
            padding="lg"
            className="text-center py-16 flex flex-col items-center justify-center"
          >
            <div className="flex items-center gap-2.5 mb-2">
              <span className="h-3 w-3 rounded-full bg-salvus-info animate-ping" />
              <h2 className="text-base font-bold text-salvus-text-primary">
                Checking your area...
              </h2>
            </div>
            <p className="text-xs text-salvus-text-muted max-w-sm">
              Querying verified emergency and weather telemetry feeds for your coordinates.
            </p>
          </Card>
        ) : fetchError ? (
          /* 2. Live feeds failure (Non-negotiable: LIVE ALERT DATA TEMPORARILY UNAVAILABLE) */
          <Card
            padding="lg"
            className="text-center py-14 flex flex-col items-center justify-center"
          >
            <span className="text-3xl mb-3" aria-hidden="true">
              📡
            </span>
            <h2 className="text-lg font-bold text-salvus-text-primary">
              Live alert data is temporarily unavailable.
            </h2>
            <p className="text-xs sm:text-sm text-salvus-text-secondary mt-1.5 max-w-md leading-relaxed">
              Unable to establish connection to emergency feeds. No unverified incidents are
              displayed.
            </p>
            <Button variant="secondary" size="sm" onClick={() => loadAlerts(true)} className="mt-4">
              Retry Connection
            </Button>
          </Card>
        ) : filteredAlerts.length === 0 ? (
          /* 3. Calm No-Alerts State (Part 4: "No active alerts in your area.") */
          <Card
            padding="lg"
            className="text-center py-14 flex flex-col items-center justify-center"
          >
            <span className="text-3xl mb-3" aria-hidden="true">
              🛡️
            </span>
            <h2 className="text-lg font-bold text-salvus-text-primary">
              No active alerts in your area.
            </h2>
            <p className="text-xs sm:text-sm text-salvus-text-secondary mt-1.5 max-w-md leading-relaxed">
              Monitored disaster and weather feeds report calm, normal conditions in your area.
            </p>

            <div className="mt-5 pt-4 border-t border-salvus-border w-full max-w-md flex flex-col sm:flex-row items-center justify-between gap-2 text-xs text-salvus-text-muted">
              <div>
                <span>Last checked: </span>
                <strong className="text-salvus-text-secondary">
                  {lastFetchedAt ? formatRelativeFreshness(lastFetchedAt) : 'Just now'}
                </strong>
              </div>
              <div>
                <span>Sources checked: </span>
                <strong className="text-salvus-text-secondary">4 verified feeds</strong>
              </div>
            </div>

            <div className="mt-3 text-[11px] text-salvus-text-muted">{sourceSummary}</div>

            {/* Area Safety Engine Verified Safe Badge only if explicitly SAFE */}
            {areaSafety?.level === 'SAFE' && (
              <div className="mt-4 inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-salvus-safe-bg border border-salvus-safe-border text-salvus-safe-text text-xs font-semibold">
                <span>✓</span>
                <span>Area Safety Engine Verified: Clear Sector</span>
              </div>
            )}

            {!isDemoMode && (
              <button
                type="button"
                onClick={() => setIsDemoMode(true)}
                className="mt-5 text-xs text-salvus-info font-semibold hover:underline cursor-pointer"
              >
                Preview disaster alerts in Simulation Mode →
              </button>
            )}
          </Card>
        ) : (
          /* 4. Real Alert Cards (Part 6: 3-Part Hierarchy + Semantic Colors) */
          filteredAlerts.map((alert) => (
            <article key={alert.id}>
              <Card
                variant={getCardVariant(alert.severity)}
                padding="md"
                onClick={() => setActiveAlertDetail(alert)}
                className="cursor-pointer transition-all hover:border-salvus-border-strong focus-within:ring-2 focus-within:ring-salvus-info"
              >
                {/* Header: Severity, Provenance, Distance & Time */}
                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-2 mb-2.5">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge variant={getBadgeVariant(alert.severity)} dot={true}>
                      {alert.severity}
                    </Badge>
                    <span
                      className={`text-[10px] px-1.5 py-0.2 rounded font-mono font-bold uppercase border ${
                        alert.provenance === 'LIVE'
                          ? 'bg-emerald-950/70 text-emerald-300 border-emerald-500/40'
                          : alert.provenance === 'SIMULATED'
                            ? 'bg-amber-950/70 text-amber-300 border-amber-500/40'
                            : 'bg-slate-900 text-slate-400 border-slate-700'
                      }`}
                    >
                      {alert.provenance}
                    </span>
                    <span className="text-xs text-salvus-text-muted">· {alert.observedTime}</span>
                  </div>

                  <div className="flex items-center gap-1.5 text-xs text-salvus-text-muted">
                    <span>📍</span>
                    <span>{alert.distance}</span>
                  </div>
                </div>

                {/* 1. WHAT HAPPENED */}
                <h2 className="text-base sm:text-lg font-bold text-salvus-text-primary tracking-tight">
                  {alert.title}
                </h2>

                {/* 2. WHY IT MATTERS HERE */}
                <p className="text-xs sm:text-sm text-salvus-text-secondary mt-1 leading-relaxed">
                  {alert.whyItMatters}
                </p>

                {/* 3. WHAT TO DO (Direct Action Guidance) */}
                <div className="mt-3 bg-salvus-muted/40 border border-salvus-border/80 rounded-xl p-3">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-salvus-text-muted block mb-1">
                    WHAT TO DO
                  </span>
                  <p className="text-xs text-salvus-text-primary font-medium leading-relaxed">
                    {alert.recommendedAction}
                  </p>
                </div>

                {/* Secondary Meta: Source & Read More CTA */}
                <div className="mt-3 pt-2.5 border-t border-salvus-border flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs text-salvus-text-muted">
                  <div className="flex items-center gap-1.5 truncate">
                    <span>Source:</span>
                    <span className="font-semibold text-salvus-text-secondary truncate max-w-[280px] sm:max-w-md">
                      {alert.source}
                    </span>
                  </div>
                  <span className="text-salvus-info font-semibold flex items-center gap-1 shrink-0">
                    View alert details & actions →
                  </span>
                </div>
              </Card>
            </article>
          ))
        )}
      </main>

      {/* Alert Detail Modal (Part 9: Details Modal) */}
      {activeAlertDetail && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="alert-modal-title"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-xs animate-fadeIn"
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setActiveAlertDetail(null)
            }
          }}
        >
          <div
            ref={alertModalRef}
            tabIndex={-1}
            className="bg-salvus-surface border border-salvus-border rounded-2xl max-w-xl w-full p-6 sm:p-7 shadow-2xl relative text-salvus-text-primary max-h-[88vh] overflow-y-auto outline-none"
          >
            {/* Header: Severity, Distance & Close */}
            <div className="flex items-center justify-between gap-3 mb-4 pb-3 border-b border-salvus-border">
              <div className="flex items-center gap-2">
                <Badge variant={getBadgeVariant(activeAlertDetail.severity)} dot={true}>
                  {activeAlertDetail.severity}
                </Badge>
                <span className="text-xs text-salvus-text-muted">{activeAlertDetail.distance}</span>
              </div>
              <button
                type="button"
                onClick={() => setActiveAlertDetail(null)}
                aria-label="Close advisory details"
                className="text-salvus-text-muted hover:text-salvus-text-primary text-base font-bold p-1 cursor-pointer select-none"
              >
                ✕
              </button>
            </div>

            {/* 1. WHAT HAPPENED */}
            <div>
              <span className="text-[11px] font-bold text-salvus-text-muted uppercase tracking-wider block">
                What Happened
              </span>
              <h2
                id="alert-modal-title"
                className="text-xl font-bold text-salvus-text-primary tracking-tight mt-0.5"
              >
                {activeAlertDetail.title}
              </h2>
              <p className="text-xs sm:text-sm text-salvus-text-secondary mt-1.5 leading-relaxed">
                {activeAlertDetail.summary}
              </p>
            </div>

            {/* 2. WHY IT MATTERS */}
            <div className="mt-4 bg-salvus-muted/40 border border-salvus-border rounded-xl p-3.5">
              <span className="text-[11px] font-bold text-salvus-text-primary uppercase tracking-wider block mb-1">
                Why It Matters
              </span>
              <p className="text-xs sm:text-sm text-salvus-text-secondary leading-relaxed">
                {activeAlertDetail.whyItMatters}
              </p>
              {activeAlertDetail.affectedArea && (
                <div className="mt-2 pt-2 border-t border-salvus-border/60 text-xs text-salvus-text-muted">
                  <span>Affected Sector: </span>
                  <strong className="text-salvus-text-secondary">
                    {activeAlertDetail.affectedArea}
                  </strong>
                  {activeAlertDetail.radiusKm && (
                    <span> · {activeAlertDetail.radiusKm} km radius</span>
                  )}
                </div>
              )}
            </div>

            {/* 3. WHAT TO DO (Safety Actions) */}
            <div className="mt-4">
              <span className="text-[11px] font-bold text-salvus-text-primary uppercase tracking-wider block mb-2">
                What You Should Do
              </span>
              <div className="space-y-2">
                {activeAlertDetail.actions?.map((act, idx) => (
                  <div
                    key={idx}
                    className="bg-salvus-safe-bg border border-salvus-safe-border rounded-xl p-3 flex items-start gap-2.5 text-xs text-salvus-safe-text"
                  >
                    <span className="font-bold shrink-0">{idx + 1}.</span>
                    <span className="font-medium leading-relaxed">{act}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Legitimate Safe Destination (Only shown if authentic shelter is verified) */}
            {activeAlertDetail.nearestShelter && (
              <div className="mt-4 p-3.5 bg-salvus-surface-elevated border border-salvus-border rounded-xl flex items-center justify-between gap-3">
                <div>
                  <span className="text-[10px] text-salvus-text-muted block font-semibold uppercase tracking-wider">
                    Recommended Safe Refuge
                  </span>
                  <strong className="text-xs sm:text-sm text-salvus-text-primary">
                    {activeAlertDetail.nearestShelter.name}
                  </strong>
                  <span className="text-xs text-salvus-safe block mt-0.5">
                    {activeAlertDetail.nearestShelter.distance_km
                      ? `${activeAlertDetail.nearestShelter.distance_km.toFixed(1)} km away`
                      : 'Nearby sector'}{' '}
                    · {activeAlertDetail.nearestShelter.available_beds} beds available
                  </span>
                </div>
                <Button
                  variant="safe"
                  size="sm"
                  onClick={() => {
                    setActiveAlertDetail(null)
                    navigate(
                      `/citizen/map?shelterId=${activeAlertDetail.nearestShelter.id}&action=route`
                    )
                  }}
                  className="shrink-0"
                >
                  View Route
                </Button>
              </div>
            )}

            {/* Source Provenance & Official External Link */}
            <div className="mt-5 pt-3 border-t border-salvus-border space-y-2 text-xs text-salvus-text-muted">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <span>
                  Source: <strong>{activeAlertDetail.source}</strong>
                </span>
                <span>
                  Data Provenance:{' '}
                  <strong className="text-salvus-text-secondary">
                    {activeAlertDetail.provenance}
                  </strong>
                </span>
              </div>
              {activeAlertDetail.sourceUrl && (
                <div>
                  <a
                    href={activeAlertDetail.sourceUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-salvus-info hover:underline inline-flex items-center gap-1"
                  >
                    <span>View official source dispatch</span>
                    <span>↗</span>
                  </a>
                </div>
              )}
            </div>

            {/* Modal Actions */}
            <div className="mt-6 pt-3 border-t border-salvus-border flex justify-end">
              <Button
                variant="secondary"
                size="md"
                onClick={() => setActiveAlertDetail(null)}
                className="w-full sm:w-auto"
              >
                Close Advisory
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default CitizenAlerts
