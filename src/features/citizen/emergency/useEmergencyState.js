import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { emergencyFlowData } from '../../../data/emergencyFlow'
import {
  fetchIncidentById,
  updateIncidentStatus,
  createIncident,
  fetchIncidentAssignments,
  fetchResponders,
} from '../../../services/api'
import { fetchCitizenProfile, fetchEmergencyContacts } from '../../../services/profileService'
import {
  joinRoom,
  leaveRoom,
  subscribeToEvent,
  onSocketStatusChange,
} from '../../../lib/realtime/socket'
import {
  watchEmergencyLocation,
  getCurrentLocation,
  createLocationModel,
  formatCoordinates,
  INITIAL_LOCATION_STATE,
} from '../../../lib/location'
import { haversineDistanceKm, RouteManager } from '../../../services/routingService'
import {
  EMERGENCY_STATE,
  STATE_ORDER,
  STATUS_TO_STATE,
  normalizeToUiState,
  validateTransition,
  isTerminalState,
  shouldAcceptStatusUpdate,
  getNextState,
  getPreviousState,
  deriveTimelineSteps,
} from '../../../lib/stateMachine'
import {
  EMERGENCY_CACHE_KEY,
  saveEmergencyCache,
  loadEmergencyCache,
  clearEmergencyCache,
  isCacheStale,
  formatSyncFreshness,
  generateIdempotencyKey,
} from '../../../lib/emergencyCache'

// Re-export constants for downstream consumer convenience
export { STATE_ORDER }

// State duration map in seconds for demo progression
export const STATE_DURATIONS = Object.freeze({
  SOS_ACTIVE: 3,
  TRIAGING: 3.5,
  VERIFIED: 2.5,
  ASSIGNED: 3.5,
  EN_ROUTE: 4.5,
  NEARBY: 3.5,
  ON_SCENE: 3.5,
  RESOLVED: 4,
})

export const useEmergencyState = (
  initialState = EMERGENCY_STATE.SOS_ACTIVE,
  activeIncidentId = null
) => {
  // 1. Initial hydration: Load recovery hint from cache immediately to prevent screen flash
  const cachedRecoveryHint = useMemo(() => loadEmergencyCache(), [])

  const [incidentId, setIncidentId] = useState(() => {
    return activeIncidentId || cachedRecoveryHint?.incidentId || null
  })
  const effectiveIncidentId = activeIncidentId || incidentId

  const [liveIncident, setLiveIncident] = useState(() => cachedRecoveryHint?.cachedIncident || null)
  const [assignedResponder, setAssignedResponder] = useState(
    () => cachedRecoveryHint?.cachedResponder || null
  )
  const [currentState, setCurrentState] = useState(() => {
    if (cachedRecoveryHint?.lastKnownStatus) {
      return normalizeToUiState(cachedRecoveryHint.lastKnownStatus)
    }
    return normalizeToUiState(initialState)
  })

  const [lastSyncedAt, setLastSyncedAt] = useState(() => cachedRecoveryHint?.lastSyncedAt || null)
  const [submittingState, setSubmittingState] = useState('idle') // 'idle' | 'submitting' | 'success' | 'failure' | 'conflict'
  const [isAutoPlaying, setIsAutoPlaying] = useState(false)
  const [simulationSpeed, setSimulationSpeed] = useState(1) // 1x, 1.5x, 2x
  const [isCancelModalOpen, setIsCancelModalOpen] = useState(false)
  const [locationStatus, setLocationStatus] = useState('ACTIVE') // ACTIVE, ACQUIRING, RETRYING
  const [connectivityStatus, setConnectivityStatus] = useState('CONNECTED') // CONNECTED, LIMITED_CONNECTION, OFFLINE, RECONNECTING
  const [userLocation, setUserLocation] = useState(
    () => cachedRecoveryHint?.cachedUserLocation || INITIAL_LOCATION_STATE
  )

  const [emergencyContacts, setEmergencyContacts] = useState([])
  const [citizenProfile, setCitizenProfile] = useState(null)

  // Current active SOS idempotency key (stable across retries of the SAME emergency submission)
  const pendingSosIdempotencyKeyRef = useRef(null)
  const routeManagerRef = useRef(new RouteManager(30))
  const stopLocationWatchRef = useRef(null)
  const assignedResponderRef = useRef(assignedResponder)
  const currentStateRef = useRef(currentState)
  const liveIncidentRef = useRef(liveIncident)

  useEffect(() => {
    assignedResponderRef.current = assignedResponder
  }, [assignedResponder])

  useEffect(() => {
    currentStateRef.current = currentState
  }, [currentState])

  useEffect(() => {
    liveIncidentRef.current = liveIncident
  }, [liveIncident])

  // Profile and contacts bootstrap
  useEffect(() => {
    let isMounted = true
    Promise.all([fetchEmergencyContacts(), fetchCitizenProfile()]).then(([contRes, profRes]) => {
      if (!isMounted) return
      if (contRes.success && Array.isArray(contRes.data)) {
        setEmergencyContacts(contRes.data)
      }
      if (profRes.success && profRes.data) {
        setCitizenProfile(profRes.data)
      }
    })
    return () => {
      isMounted = false
    }
  }, [])

  // -------------------------------------------------------------------------
  // 2. Unified Authoritative Rehydration Engine: rehydrateEmergency(incidentId)
  // -------------------------------------------------------------------------
  const rehydrateEmergency = useCallback(async (targetId, isSilentBackground = false) => {
    if (!targetId) return

    try {
      const result = await fetchIncidentById(targetId)

      if (result.success && result.data) {
        const inc = result.data
        const authoritativeUiState = normalizeToUiState(inc.status)

        // If incident is terminal on server, reflect it authoritatively and clean cache
        if (isTerminalState(authoritativeUiState) || isTerminalState(inc.status)) {
          setCurrentState(authoritativeUiState)
          setLiveIncident(inc)
          clearEmergencyCache()
          return
        }

        // Server is authoritative: update live incident and state
        setLiveIncident(inc)
        setCurrentState(authoritativeUiState)
        const nowIso = new Date().toISOString()
        setLastSyncedAt(nowIso)
        setConnectivityStatus('CONNECTED')

        if (inc.latitude && inc.longitude) {
          setUserLocation(
            createLocationModel({
              latitude: inc.latitude,
              longitude: inc.longitude,
              coordinates: formatCoordinates(inc.latitude, inc.longitude),
              source: 'INCIDENT',
              permission: 'GRANTED',
              status: 'ACTIVE',
              address: inc.location_name || 'Incident Scene',
            })
          )
        }

        // Reconcile assignments & assigned responder
        if (['ASSIGNED', 'EN_ROUTE', 'NEARBY', 'ON_SCENE'].includes(inc.status)) {
          const [assignRes, respRes] = await Promise.all([
            fetchIncidentAssignments(targetId),
            fetchResponders(),
          ])
          if (assignRes.success && assignRes.data?.length > 0 && respRes.success) {
            const activeAssign =
              assignRes.data.find((a) =>
                ['ASSIGNED', 'EN_ROUTE', 'NEARBY', 'ON_SCENE'].includes(a.status)
              ) || assignRes.data[0]
            if (activeAssign) {
              const matchedResp = respRes.data.find((r) => r.id === activeAssign.responder_id)
              if (matchedResp) {
                setAssignedResponder(matchedResp)
                saveEmergencyCache(inc, matchedResp)
                return
              }
            }
          }
        }

        saveEmergencyCache(inc, assignedResponderRef.current)
      } else if (result.error?.status === 404) {
        // Incident no longer exists on server -> clear stale local cache
        console.warn(
          `[Citizen Hydration] Incident #${targetId} not found on server. Clearing cache.`
        )
        clearEmergencyCache()
        setLiveIncident(null)
        setAssignedResponder(null)
        setIncidentId(null)
        setCurrentState(EMERGENCY_STATE.SOS_ACTIVE)
      } else {
        // Transient network failure during refresh: preserve last-known cache safely
        if (!isSilentBackground) {
          setConnectivityStatus('OFFLINE')
          console.warn(
            '[Citizen Hydration] Server unreachable during rehydration. Retaining last-known cache.'
          )
        }
      }
    } catch (err) {
      if (!isSilentBackground) {
        setConnectivityStatus('OFFLINE')
        console.warn('[Citizen Hydration] Network error during rehydration:', err.message)
      }
    }
  }, [])

  // -------------------------------------------------------------------------
  // 3. Initial Load & Realtime Socket Subscription
  // -------------------------------------------------------------------------
  useEffect(() => {
    if (!effectiveIncidentId) return

    let isMounted = true

    // Initial authoritative reconciliation
    const syncAuthoritativeState = async () => {
      if (isMounted) {
        await rehydrateEmergency(effectiveIncidentId)
      }
    }
    syncAuthoritativeState()

    // Join the incident-specific Socket.IO room
    const roomName = `incident:${effectiveIncidentId}`
    joinRoom(roomName)

    // Realtime Handlers with Out-of-Order Packet Guards
    const handleStatusChange = (payload) => {
      if (!isMounted) return
      if (payload.incident_id === effectiveIncidentId || payload.id === effectiveIncidentId) {
        const incomingStatus = payload.status
        const incomingUiState = normalizeToUiState(incomingStatus)

        // Protect against out-of-order packets and lock terminal state
        if (!shouldAcceptStatusUpdate(currentStateRef.current, incomingStatus)) {
          console.warn(`[Citizen Realtime] Ignored stale/out-of-order packet: ${incomingStatus}`)
          return
        }

        console.log(`[Citizen Realtime] Status: ${incomingStatus} (${incomingUiState})`)

        if (payload.responder) {
          setAssignedResponder(payload.responder)
        }

        setCurrentState(incomingUiState)
        const updatedInc =
          payload.incident ||
          (liveIncidentRef.current ? { ...liveIncidentRef.current, status: incomingStatus } : null)
        setLiveIncident(updatedInc)
        const nowIso = new Date().toISOString()
        setLastSyncedAt(nowIso)

        if (isTerminalState(incomingUiState)) {
          clearEmergencyCache()
        } else if (updatedInc) {
          saveEmergencyCache(updatedInc, payload.responder || assignedResponderRef.current)
        }
      }
    }

    const handleAssignmentChange = (payload) => {
      if (!isMounted) return
      if (payload.incident_id === effectiveIncidentId || payload.id === effectiveIncidentId) {
        if (payload.responder) {
          setAssignedResponder(payload.responder)
        }
        const incomingStatus = payload.status || 'ASSIGNED'
        const incomingUiState = normalizeToUiState(incomingStatus)

        if (shouldAcceptStatusUpdate(currentStateRef.current, incomingStatus)) {
          setCurrentState(incomingUiState)
          const updatedInc = liveIncidentRef.current
            ? { ...liveIncidentRef.current, status: incomingStatus }
            : null
          setLiveIncident(updatedInc)
          const nowIso = new Date().toISOString()
          setLastSyncedAt(nowIso)
          if (updatedInc) {
            saveEmergencyCache(updatedInc, payload.responder || assignedResponderRef.current)
          }
        }
      }
    }

    const handleResponderLocation = (payload) => {
      if (!isMounted) return
      if (
        payload.assigned_incident_id === effectiveIncidentId ||
        assignedResponderRef.current?.id === payload.id
      ) {
        setAssignedResponder((prev) => {
          const next = prev ? { ...prev, ...payload } : payload
          if (liveIncidentRef.current) {
            saveEmergencyCache(liveIncidentRef.current, next)
          }
          return next
        })
      }
    }

    const handleResponderStatus = (payload) => {
      if (!isMounted) return
      if (
        payload.assigned_incident_id === effectiveIncidentId ||
        assignedResponderRef.current?.id === payload.id
      ) {
        setAssignedResponder((prev) => (prev ? { ...prev, ...payload } : payload))
        if (STATUS_TO_STATE[payload.status]) {
          const incomingUi = normalizeToUiState(payload.status)
          if (shouldAcceptStatusUpdate(currentStateRef.current, payload.status)) {
            setCurrentState(incomingUi)
          }
        }
      }
    }

    // Subscribe to canonical realtime events
    const unsub1 = subscribeToEvent('incident.response_state_changed', handleStatusChange)
    const unsub2 = subscribeToEvent('assignment.created', handleAssignmentChange)
    const unsub3 = subscribeToEvent('assignment.status_changed', handleAssignmentChange)
    const unsub4 = subscribeToEvent('responder.location_updated', handleResponderLocation)
    const unsub5 = subscribeToEvent('responder.status_changed', handleResponderStatus)

    // Reconnection health listener: Automatically re-sync authoritative state from backend
    const unsubscribeConn = onSocketStatusChange((status) => {
      if (isMounted) {
        setConnectivityStatus(status)
        if (status === 'CONNECTED') {
          rehydrateEmergency(effectiveIncidentId)
        }
      }
    })

    return () => {
      isMounted = false
      leaveRoom(roomName)
      unsub1()
      unsub2()
      unsub3()
      unsub4()
      unsub5()
      unsubscribeConn()
    }
  }, [effectiveIncidentId, rehydrateEmergency])

  // -------------------------------------------------------------------------
  // 4. App Resume / Visibility Listener (re-validates without blind reloads)
  // -------------------------------------------------------------------------
  useEffect(() => {
    if (!effectiveIncidentId) return

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        const cache = loadEmergencyCache()
        if (isCacheStale(cache, 15)) {
          console.log(
            '[Citizen Resume] App foregrounded & cache stale. Rehydrating from server truth...'
          )
          rehydrateEmergency(effectiveIncidentId, true)
        }
      }
    }

    const handleOnline = () => {
      console.log('[Citizen Network] Browser back online. Rehydrating emergency state...')
      setConnectivityStatus('CONNECTED')
      rehydrateEmergency(effectiveIncidentId)
    }

    const handleOffline = () => {
      setConnectivityStatus('OFFLINE')
    }

    const handleStorageChange = (e) => {
      if (e.key === EMERGENCY_CACHE_KEY) {
        if (!e.newValue) {
          // Cache cleared in another tab (e.g., incident resolved or cancelled)
          rehydrateEmergency(effectiveIncidentId, true)
        } else {
          try {
            const parsed = JSON.parse(e.newValue)
            if (parsed.incidentId && parsed.incidentId === effectiveIncidentId) {
              rehydrateEmergency(effectiveIncidentId, true)
            }
          } catch {
            // Ignore parse error
          }
        }
      }
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)
    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)
    window.addEventListener('storage', handleStorageChange)

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
      window.removeEventListener('storage', handleStorageChange)
    }
  }, [effectiveIncidentId, rehydrateEmergency])

  // -------------------------------------------------------------------------
  // 5. Emergency Mode Geolocation Watcher
  // -------------------------------------------------------------------------
  useEffect(() => {
    if (isTerminalState(currentState)) {
      if (stopLocationWatchRef.current) {
        stopLocationWatchRef.current()
        stopLocationWatchRef.current = null
      }
      return
    }

    stopLocationWatchRef.current = watchEmergencyLocation(
      (locModel) => {
        setUserLocation(locModel)
        setLocationStatus('ACTIVE')
      },
      (err) => {
        setLocationStatus(err.status || 'TEMPORARILY UNAVAILABLE')
      }
    )

    return () => {
      if (stopLocationWatchRef.current) {
        stopLocationWatchRef.current()
        stopLocationWatchRef.current = null
      }
    }
  }, [currentState])

  // -------------------------------------------------------------------------
  // 6. Computed Metadata & Live Distance/ETA
  // -------------------------------------------------------------------------
  const currentInfo = useMemo(() => {
    return emergencyFlowData.states[currentState] || emergencyFlowData.states.SOS_ACTIVE
  }, [currentState])

  const currentInstructions = useMemo(() => {
    return (
      emergencyFlowData.instructions[currentState] ||
      emergencyFlowData.instructions.SOS_ACTIVE ||
      []
    )
  }, [currentState])

  const dynamicDistanceKm = useMemo(() => {
    if (
      assignedResponder?.latitude &&
      assignedResponder?.longitude &&
      liveIncident?.latitude &&
      liveIncident?.longitude
    ) {
      return haversineDistanceKm(
        assignedResponder.latitude,
        assignedResponder.longitude,
        liveIncident.latitude,
        liveIncident.longitude
      )
    }
    return null
  }, [assignedResponder, liveIncident])

  const distanceText = useMemo(() => {
    if (dynamicDistanceKm !== null) {
      return dynamicDistanceKm < 0.1 ? '< 100m' : `${dynamicDistanceKm} km`
    }
    return currentInfo.distanceText || '1.4 km'
  }, [dynamicDistanceKm, currentInfo])

  const etaMinutes = useMemo(() => {
    if (dynamicDistanceKm !== null) {
      const speedKmh = assignedResponder?.capability === 'FLOOD_BOAT' ? 24 : 35
      return Math.max(1, Math.round((dynamicDistanceKm / speedKmh) * 60))
    }
    if (typeof currentInfo.etaMinutes !== 'undefined') {
      return currentInfo.etaMinutes
    }
    return 5
  }, [dynamicDistanceKm, assignedResponder, currentInfo])

  const responderPos = useMemo(() => {
    if (currentState === 'NEARBY') return { x: 62, y: 38 }
    if (currentState === 'ON_SCENE' || currentState === 'RESOLVED') return { x: 68, y: 34 }
    if (currentState === 'EN_ROUTE') return { x: 44, y: 55 }
    return currentInfo.responderPos || { x: 22, y: 76 }
  }, [currentState, currentInfo])

  const focalCategory = useMemo(() => {
    switch (currentState) {
      case 'SOS_ACTIVE':
      case 'TRIAGING':
      case 'VERIFIED':
        return 'triage'
      case 'ASSIGNED':
      case 'EN_ROUTE':
        return 'tracking'
      case 'NEARBY':
        return 'proximity'
      case 'ON_SCENE':
        return 'on_scene'
      case 'RESOLVED':
        return 'resolved'
      case 'CANCELLED':
        return 'cancelled'
      default:
        return 'triage'
    }
  }, [currentState])

  const dynamicIncident = useMemo(() => {
    if (liveIncident) {
      return {
        id: liveIncident.ticket_id || liveIncident.id || 'SV-2048',
        rawId: liveIncident.id,
        category:
          liveIncident.type === 'flood'
            ? 'Flood / Water Inundation'
            : (liveIncident.type || 'EMERGENCY').replace('_', ' ').toUpperCase(),
        severity: liveIncident.severity || 'CRITICAL',
        status: liveIncident.status,
        timestamp: liveIncident.created_at
          ? new Date(liveIncident.created_at).toLocaleTimeString([], {
              hour: '2-digit',
              minute: '2-digit',
            }) + ' IST'
          : 'Just now',
        affectedEstimate: `${liveIncident.affected_count || 1} People at Risk`,
        description: liveIncident.description,
        userLocation: {
          ...emergencyFlowData.incident.userLocation,
          coordinates:
            liveIncident.latitude && liveIncident.longitude
              ? `${liveIncident.latitude.toFixed(4)}° N, ${liveIncident.longitude.toFixed(4)}° E`
              : emergencyFlowData.incident.userLocation.coordinates,
        },
      }
    }
    return {
      ...emergencyFlowData.incident,
      userLocation,
    }
  }, [liveIncident, userLocation])

  const dynamicResponder = useMemo(() => {
    if (assignedResponder) {
      return {
        unitName: assignedResponder.unit_name || 'NDRF Unit 4',
        lead: assignedResponder.team_lead || 'Capt. A. Roy',
        vehicle: assignedResponder.vehicle_type || 'Gemini Z-Craft Inflatable',
        channel: assignedResponder.radio_channel || 'VHF Ch. 4',
        status: assignedResponder.status || 'ASSIGNED',
      }
    }
    return emergencyFlowData.responder
  }, [assignedResponder])

  const timelineSteps = useMemo(() => {
    return deriveTimelineSteps(
      currentState,
      liveIncident?.events || [],
      liveIncident?.created_at || null
    )
  }, [currentState, liveIncident])

  const syncFreshnessText = useMemo(() => {
    return formatSyncFreshness(lastSyncedAt)
  }, [lastSyncedAt])

  const isStale = useMemo(() => {
    return isCacheStale({ lastSyncedAt }, 20)
  }, [lastSyncedAt])

  // -------------------------------------------------------------------------
  // 7. Action Handlers with State-Machine Transition Protection & Idempotency
  // -------------------------------------------------------------------------
  const goToNextState = useCallback(() => {
    setCurrentState((prev) => {
      const next = getNextState(prev)
      if (next) {
        return next
      }
      return prev
    })
  }, [])

  const goToPrevState = useCallback(() => {
    setCurrentState((prev) => {
      const previous = getPreviousState(prev)
      if (previous) {
        return previous
      }
      return prev
    })
  }, [])

  const selectState = useCallback((targetKey) => {
    const targetUi = normalizeToUiState(targetKey)
    if (!targetUi) return

    setCurrentState((prev) => {
      if (validateTransition(prev, targetUi)) {
        return targetUi
      }
      console.warn(
        `[Citizen State Machine] Rejected invalid transition attempt: ${prev} → ${targetUi}`
      )
      return prev
    })
  }, [])

  const openCancelModal = useCallback(() => {
    if (isTerminalState(currentState)) {
      return
    }
    setIsCancelModalOpen(true)
  }, [currentState])

  const closeCancelModal = useCallback(() => {
    setIsCancelModalOpen(false)
  }, [])

  const confirmCancelEmergency = useCallback(async () => {
    setIsAutoPlaying(false)
    setIsCancelModalOpen(false)

    if (!validateTransition(currentState, EMERGENCY_STATE.CANCELLED)) {
      console.warn(
        `[Citizen State Machine] Cannot cancel incident from terminal state: ${currentState}`
      )
      return
    }

    if (incidentId) {
      try {
        const res = await updateIncidentStatus(incidentId, 'CANCELLED', 'citizen')
        if (!res.success) {
          // If backend rejected because state is already resolved/terminal
          console.warn('[Citizen State Machine] Cancellation rejected by server:', res.error)
          await rehydrateEmergency(incidentId, true)
          return
        }
      } catch (err) {
        console.error('Failed to cancel incident on backend:', err)
      }
    }

    setCurrentState(EMERGENCY_STATE.CANCELLED)
    clearEmergencyCache()
  }, [currentState, incidentId, rehydrateEmergency])

  const resetEmergency = useCallback(() => {
    setIsAutoPlaying(false)
    setIsCancelModalOpen(false)
    clearEmergencyCache()
    pendingSosIdempotencyKeyRef.current = null
    routeManagerRef.current.clear()
    setIncidentId(null)
    setLiveIncident(null)
    setAssignedResponder(null)
    setCurrentState(EMERGENCY_STATE.SOS_ACTIVE)
    setLocationStatus('ACTIVE')
    setConnectivityStatus('CONNECTED')
    setSubmittingState('idle')
  }, [])

  const triggerSos = useCallback(() => {
    setIsAutoPlaying(false)
    setIsCancelModalOpen(false)
    setCurrentState(EMERGENCY_STATE.SOS_ACTIVE)
    setLocationStatus('ACTIVE')
    setConnectivityStatus('CONNECTED')
    setSubmittingState('idle')
  }, [])

  // Trigger real live demo incident with stable idempotency key across retries
  const triggerLiveDemoSos = useCallback(async () => {
    if (submittingState === 'submitting') {
      console.warn('[Citizen SOS] Submission already in progress. Ignoring duplicate click.')
      return
    }

    setIsAutoPlaying(false)
    setSubmittingState('submitting')

    // Maintain stable idempotency key across retries of the SAME logical SOS trigger
    if (!pendingSosIdempotencyKeyRef.current) {
      pendingSosIdempotencyKeyRef.current = generateIdempotencyKey('sos_cit')
    }
    const idempotencyKey = pendingSosIdempotencyKeyRef.current

    try {
      const loc = await getCurrentLocation()
      const lat = loc.latitude || loc.model?.latitude || 22.5726
      const lng = loc.longitude || loc.model?.longitude || 88.3639

      const reporterName = citizenProfile?.full_name || 'Citizen User'
      const reporterPhone = citizenProfile?.phone || '+91 98301 23456'
      const emergencyId = citizenProfile?.emergency_id || 'SLV-CIT-7829'

      const result = await createIncident({
        type: 'flood',
        severity: 'CRITICAL',
        description: `DEMO SOS Beacon [${emergencyId}] — Realtime Pipeline Test`,
        reporter_name: reporterName,
        reporter_phone: reporterPhone,
        latitude: lat,
        longitude: lng,
        affected_count: 3,
        is_sos: true,
        idempotency_key: idempotencyKey,
      })

      if (result.success && result.data) {
        setSubmittingState('success')
        pendingSosIdempotencyKeyRef.current = null // Completed successfully; reset key for future legitimate emergency
        setIncidentId(result.data.id)
        setLiveIncident(result.data)
        const uiState = normalizeToUiState(result.data.status)
        setCurrentState(uiState)
        saveEmergencyCache(result.data, null)
      } else {
        setSubmittingState(result.error?.code === 'ACTIVE_INCIDENT_EXISTS' ? 'conflict' : 'failure')
      }
    } catch (err) {
      console.error('[Citizen SOS] Error during SOS broadcast:', err)
      setSubmittingState('failure')
    }
  }, [citizenProfile, submittingState])

  // Auto-play simulation effect: drives canonical state machine
  useEffect(() => {
    if (!isAutoPlaying) return

    const baseDuration = STATE_DURATIONS[currentState] || 3
    const durationMs = (baseDuration * 1000) / simulationSpeed

    const timer = setTimeout(() => {
      setCurrentState((prev) => {
        const next = getNextState(prev)
        if (next) {
          return next
        } else {
          setIsAutoPlaying(false)
          return prev
        }
      })
    }, durationMs)

    return () => clearTimeout(timer)
  }, [isAutoPlaying, currentState, simulationSpeed])

  return {
    incidentId,
    currentState,
    currentInfo,
    focalCategory,
    etaMinutes,
    distanceText,
    responderPos,
    locationStatus,
    setLocationStatus,
    connectivityStatus,
    setConnectivityStatus,
    submittingState,
    lastSyncedAt,
    syncFreshnessText,
    isStale,
    isAutoPlaying,
    simulationSpeed,
    setSimulationSpeed,
    isCancelModalOpen,
    openCancelModal,
    closeCancelModal,
    confirmCancelEmergency,
    incident: dynamicIncident,
    aiTriage: emergencyFlowData.aiTriage,
    responder: dynamicResponder,
    routes: emergencyFlowData.routes,
    emergencyContacts,
    citizenProfile,
    timelineSteps,
    instructions: currentInstructions,
    setCurrentState: selectState,
    goToNextState,
    goToPrevState,
    resetEmergency,
    triggerSos,
    triggerLiveDemoSos,
    rehydrateEmergency,
    toggleAutoPlay: () => setIsAutoPlaying((prev) => !prev),
  }
}
