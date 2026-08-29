import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { emergencyFlowData } from '../../../data/emergencyFlow'
import {
  fetchIncidentById,
  updateIncidentStatus,
  createIncident,
  fetchIncidentAssignments,
  fetchResponders,
} from '../../../services/api'
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
import { haversineDistanceKm } from '../../../services/routingService'

export const STATE_ORDER = [
  'SOS_ACTIVE',
  'TRIAGING',
  'VERIFIED',
  'ASSIGNED',
  'EN_ROUTE',
  'NEARBY',
  'ON_SCENE',
  'RESOLVED',
]

// State duration map in seconds for demo progression
export const STATE_DURATIONS = {
  SOS_ACTIVE: 3,
  TRIAGING: 3.5,
  VERIFIED: 2.5,
  ASSIGNED: 3.5,
  EN_ROUTE: 4.5,
  NEARBY: 3.5,
  ON_SCENE: 3.5,
  RESOLVED: 4,
}

// Map backend IncidentStatus to frontend emergency UI flow state
const STATUS_TO_STATE_MAP = {
  NEW: 'SOS_ACTIVE',
  TRIAGE_PENDING: 'TRIAGING',
  VERIFIED: 'VERIFIED',
  ASSIGNED: 'ASSIGNED',
  EN_ROUTE: 'EN_ROUTE',
  NEARBY: 'NEARBY',
  ON_SCENE: 'ON_SCENE',
  RESOLVED: 'RESOLVED',
  CANCELLED: 'CANCELLED',
}

const STATUS_RANKS = {
  NEW: 1,
  TRIAGE_PENDING: 2,
  VERIFIED: 3,
  ASSIGNED: 4,
  EN_ROUTE: 5,
  NEARBY: 6,
  ON_SCENE: 7,
  RESOLVED: 8,
  CANCELLED: 8,
}

export const useEmergencyState = (initialState = 'SOS_ACTIVE', activeIncidentId = null) => {
  const [incidentId, setIncidentId] = useState(() => {
    return activeIncidentId || localStorage.getItem('salvus_active_incident_id') || null
  })
  const effectiveIncidentId = activeIncidentId || incidentId

  const [liveIncident, setLiveIncident] = useState(null)
  const [assignedResponder, setAssignedResponder] = useState(null)
  const [currentState, setCurrentState] = useState(initialState)
  const [isAutoPlaying, setIsAutoPlaying] = useState(false)
  const [simulationSpeed, setSimulationSpeed] = useState(1) // 1x, 1.5x, 2x
  const [isCancelModalOpen, setIsCancelModalOpen] = useState(false)
  const [locationStatus, setLocationStatus] = useState('ACTIVE') // ACTIVE, ACQUIRING, RETRYING
  const [connectivityStatus, setConnectivityStatus] = useState('CONNECTED') // CONNECTED, LIMITED_CONNECTION, OFFLINE, RECONNECTING
  const [userLocation, setUserLocation] = useState(() => INITIAL_LOCATION_STATE)

  const stopLocationWatchRef = useRef(null)
  const assignedResponderRef = useRef(assignedResponder)

  useEffect(() => {
    assignedResponderRef.current = assignedResponder
  }, [assignedResponder])

  // -------------------------------------------------------------------------
  // 1. Initial Load & Realtime Sync for Live Incident
  // -------------------------------------------------------------------------
  useEffect(() => {
    if (!effectiveIncidentId) return

    let isMounted = true

    // Fetch initial state from backend
    const loadIncident = async () => {
      const result = await fetchIncidentById(effectiveIncidentId)
      if (result.success && result.data && isMounted) {
        localStorage.setItem('salvus_active_incident_id', result.data.id)
        setLiveIncident(result.data)
        const mappedState = STATUS_TO_STATE_MAP[result.data.status] || 'SOS_ACTIVE'
        setCurrentState(mappedState)
        if (result.data.latitude && result.data.longitude) {
          setUserLocation(
            createLocationModel({
              latitude: result.data.latitude,
              longitude: result.data.longitude,
              coordinates: formatCoordinates(result.data.latitude, result.data.longitude),
              source: 'INCIDENT',
              permission: 'GRANTED',
              status: 'ACTIVE',
              address: result.data.location_name || 'Incident Scene',
            })
          )
        }

        // Also check if responder or active assignment exists for this incident
        if (['ASSIGNED', 'EN_ROUTE', 'NEARBY', 'ON_SCENE'].includes(result.data.status)) {
          const [assignRes, respRes] = await Promise.all([
            fetchIncidentAssignments(effectiveIncidentId),
            fetchResponders(),
          ])
          if (isMounted && assignRes.success && assignRes.data?.length > 0 && respRes.success) {
            const activeAssign =
              assignRes.data.find((a) =>
                ['ASSIGNED', 'EN_ROUTE', 'NEARBY', 'ON_SCENE'].includes(a.status)
              ) || assignRes.data[0]
            if (activeAssign) {
              const matchedResp = respRes.data.find((r) => r.id === activeAssign.responder_id)
              if (matchedResp) {
                setAssignedResponder(matchedResp)
              }
            }
          }
        }
      }
    }

    loadIncident()

    // Join the incident-specific Socket.IO room
    const roomName = `incident:${effectiveIncidentId}`
    joinRoom(roomName)

    // Helper for handling incident response state updates
    const handleStatusChange = (payload) => {
      if (!isMounted) return
      if (payload.incident_id === effectiveIncidentId || payload.id === effectiveIncidentId) {
        console.log(
          `[Citizen Realtime] Status updated for ${effectiveIncidentId} -> ${payload.status}`
        )
        const mappedState = STATUS_TO_STATE_MAP[payload.status] || 'SOS_ACTIVE'

        if (payload.responder) {
          setAssignedResponder(payload.responder)
        }

        setLiveIncident((prev) => {
          if (prev) {
            const currentRank = STATUS_RANKS[prev.status] || 0
            const incomingRank = STATUS_RANKS[payload.status] || 0
            if (incomingRank < currentRank && prev.status !== 'CANCELLED') {
              console.warn(`[Citizen Guard] Ignored out-of-order status: ${payload.status}`)
              return prev
            }
          }
          setCurrentState(mappedState)
          return payload.incident || (prev ? { ...prev, status: payload.status } : null)
        })
      }
    }

    // Helper for handling assignment creation & status change
    const handleAssignmentChange = (payload) => {
      if (!isMounted) return
      if (payload.incident_id === effectiveIncidentId || payload.id === effectiveIncidentId) {
        console.log(
          '[Citizen Realtime] Assignment event received:',
          payload.status,
          payload.responder?.unit_name
        )
        if (payload.responder) {
          setAssignedResponder(payload.responder)
        }
        const mapped = STATUS_TO_STATE_MAP[payload.status] || 'ASSIGNED'
        setCurrentState(mapped)
        setLiveIncident((prev) => (prev ? { ...prev, status: payload.status } : null))
      }
    }

    // Helper for handling responder telemetry
    const handleResponderLocation = (payload) => {
      if (!isMounted) return
      if (
        payload.assigned_incident_id === effectiveIncidentId ||
        assignedResponderRef.current?.id === payload.id
      ) {
        setAssignedResponder((prev) => (prev ? { ...prev, ...payload } : payload))
      }
    }

    const handleResponderStatus = (payload) => {
      if (!isMounted) return
      if (
        payload.assigned_incident_id === effectiveIncidentId ||
        assignedResponderRef.current?.id === payload.id
      ) {
        setAssignedResponder((prev) => (prev ? { ...prev, ...payload } : payload))
        if (STATUS_TO_STATE_MAP[payload.status]) {
          setCurrentState(STATUS_TO_STATE_MAP[payload.status])
        }
      }
    }

    // Listen strictly to canonical Socket.IO events (no aliases)
    const unsub1 = subscribeToEvent('incident.response_state_changed', handleStatusChange)
    const unsub2 = subscribeToEvent('assignment.created', handleAssignmentChange)
    const unsub3 = subscribeToEvent('assignment.status_changed', handleAssignmentChange)
    const unsub4 = subscribeToEvent('responder.location_updated', handleResponderLocation)
    const unsub5 = subscribeToEvent('responder.status_changed', handleResponderStatus)

    // Listen for socket connectivity health with automatic re-sync on reconnect
    const unsubscribeConn = onSocketStatusChange((status) => {
      if (isMounted) {
        setConnectivityStatus(status)
        if (status === 'CONNECTED') {
          loadIncident()
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
  }, [effectiveIncidentId])

  // -------------------------------------------------------------------------
  // 2. Emergency Mode Geolocation Watcher (Privacy-compliant)
  // -------------------------------------------------------------------------
  useEffect(() => {
    if (currentState === 'CANCELLED' || currentState === 'RESOLVED') {
      if (stopLocationWatchRef.current) {
        stopLocationWatchRef.current()
        stopLocationWatchRef.current = null
      }
      return
    }

    // Start watching position during active emergency
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
  // 3. Computed State Metadata & Live Distance/ETA
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

  // Dynamic live distance calculation if live telemetry is active
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

  // Dynamic incident data merging mock template with live backend data
  const dynamicIncident = useMemo(() => {
    if (liveIncident) {
      return {
        id: liveIncident.ticket_id || liveIncident.id || 'SV-2048',
        rawId: liveIncident.id,
        category:
          liveIncident.type === 'flood'
            ? 'Flood / Water Inundation'
            : liveIncident.type.replace('_', ' ').toUpperCase(),
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
          coordinates: `${liveIncident.latitude.toFixed(4)}° N, ${liveIncident.longitude.toFixed(4)}° E`,
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

  // Dynamic timeline mapping
  const timelineSteps = useMemo(() => {
    if (!liveIncident || !liveIncident.events || liveIncident.events.length === 0) {
      return emergencyFlowData.timelineSteps
    }

    return emergencyFlowData.timelineSteps.map((step) => {
      const matchingEvent = liveIncident.events.find(
        (e) =>
          (e.event_type === 'CREATED' && step.id === 'SOS_ACTIVE') ||
          (e.new_status && STATUS_TO_STATE_MAP[e.new_status] === step.id)
      )

      if (matchingEvent) {
        return {
          ...step,
          description: `${step.description} (${new Date(matchingEvent.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })})`,
        }
      }
      return step
    })
  }, [liveIncident])

  // -------------------------------------------------------------------------
  // 4. Action Handlers
  // -------------------------------------------------------------------------
  const goToNextState = useCallback(() => {
    setCurrentState((prev) => {
      const currentIndex = STATE_ORDER.indexOf(prev)
      if (currentIndex >= 0 && currentIndex < STATE_ORDER.length - 1) {
        return STATE_ORDER[currentIndex + 1]
      }
      return prev
    })
  }, [])

  const goToPrevState = useCallback(() => {
    setCurrentState((prev) => {
      const currentIndex = STATE_ORDER.indexOf(prev)
      if (currentIndex > 0) {
        return STATE_ORDER[currentIndex - 1]
      }
      return prev
    })
  }, [])

  const selectState = useCallback((stateKey) => {
    if (emergencyFlowData.states[stateKey]) {
      setCurrentState(stateKey)
    }
  }, [])

  const openCancelModal = useCallback(() => {
    setIsCancelModalOpen(true)
  }, [])

  const closeCancelModal = useCallback(() => {
    setIsCancelModalOpen(false)
  }, [])

  const confirmCancelEmergency = useCallback(async () => {
    setIsAutoPlaying(false)
    setIsCancelModalOpen(false)
    setCurrentState('CANCELLED')

    if (incidentId) {
      try {
        await updateIncidentStatus(incidentId, 'CANCELLED', 'citizen')
      } catch (err) {
        console.error('Failed to cancel incident on backend:', err)
      }
    }
  }, [incidentId])

  const resetEmergency = useCallback(() => {
    setIsAutoPlaying(false)
    setIsCancelModalOpen(false)
    setCurrentState('SOS_ACTIVE')
    setLocationStatus('ACTIVE')
    setConnectivityStatus('CONNECTED')
    setAssignedResponder(null)
  }, [])

  const triggerSos = useCallback(() => {
    setIsAutoPlaying(false)
    setIsCancelModalOpen(false)
    setCurrentState('SOS_ACTIVE')
    setLocationStatus('ACTIVE')
    setConnectivityStatus('CONNECTED')
  }, [])

  // Trigger real live demo incident connecting to backend API & WebSocket
  const triggerLiveDemoSos = useCallback(async () => {
    setIsAutoPlaying(false)
    const loc = await getCurrentLocation()
    const lat = loc.latitude || loc.model?.latitude || 22.5726
    const lng = loc.longitude || loc.model?.longitude || 88.3639
    const result = await createIncident({
      type: 'flood',
      severity: 'CRITICAL',
      description: 'DEMO SOS Beacon — Realtime Pipeline Test',
      reporter_name: 'Aditi Roy (Demo)',
      reporter_phone: '+91 98301 24890',
      latitude: lat,
      longitude: lng,
      affected_count: 3,
      is_sos: true,
    })

    if (result.success && result.data) {
      setIncidentId(result.data.id)
      setLiveIncident(result.data)
      setCurrentState('SOS_ACTIVE')
    }
  }, [])

  // Auto-play simulation effect (when auto-play is activated in demo controls)
  useEffect(() => {
    if (!isAutoPlaying) return

    const baseDuration = STATE_DURATIONS[currentState] || 3
    const durationMs = (baseDuration * 1000) / simulationSpeed

    const timer = setTimeout(() => {
      setCurrentState((prev) => {
        const currentIndex = STATE_ORDER.indexOf(prev)
        if (currentIndex >= 0 && currentIndex < STATE_ORDER.length - 1) {
          return STATE_ORDER[currentIndex + 1]
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
    timelineSteps,
    instructions: currentInstructions,
    setCurrentState: selectState,
    goToNextState,
    goToPrevState,
    resetEmergency,
    triggerSos,
    triggerLiveDemoSos,
    toggleAutoPlay: () => setIsAutoPlaying((prev) => !prev),
  }
}
