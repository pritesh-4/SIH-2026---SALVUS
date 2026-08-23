import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { emergencyFlowData } from '../../../data/emergencyFlow'
import { fetchIncidentById, updateIncidentStatus, createIncident } from '../../../services/api'
import {
  joinRoom,
  leaveRoom,
  subscribeToEvent,
  onSocketStatusChange,
} from '../../../lib/realtime/socket'
import { watchEmergencyLocation, getCurrentLocation } from '../../../lib/location'

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
  RESOLVED: 'RESOLVED',
  CANCELLED: 'CANCELLED',
}

export const useEmergencyState = (initialState = 'SOS_ACTIVE', activeIncidentId = null) => {
  const [incidentId, setIncidentId] = useState(activeIncidentId)
  const [liveIncident, setLiveIncident] = useState(null)
  const [currentState, setCurrentState] = useState(initialState)
  const [isAutoPlaying, setIsAutoPlaying] = useState(false)
  const [simulationSpeed, setSimulationSpeed] = useState(1) // 1x, 1.5x, 2x
  const [isCancelModalOpen, setIsCancelModalOpen] = useState(false)
  const [locationStatus, setLocationStatus] = useState('ACTIVE') // ACTIVE, ACQUIRING, RETRYING
  const [connectivityStatus, setConnectivityStatus] = useState('CONNECTED') // CONNECTED, LIMITED_CONNECTION, OFFLINE, RECONNECTING
  const [userLocation, setUserLocation] = useState(emergencyFlowData.incident.userLocation)

  const stopLocationWatchRef = useRef(null)

  // -------------------------------------------------------------------------
  // 1. Initial Load & Realtime Sync for Live Incident
  // -------------------------------------------------------------------------
  useEffect(() => {
    if (!incidentId) return

    let isMounted = true

    // Fetch initial state from backend
    const loadIncident = async () => {
      const result = await fetchIncidentById(incidentId)
      if (result.success && result.data && isMounted) {
        setLiveIncident(result.data)
        const mappedState = STATUS_TO_STATE_MAP[result.data.status] || 'SOS_ACTIVE'
        setCurrentState(mappedState)
        if (result.data.latitude && result.data.longitude) {
          setUserLocation((prev) => ({
            ...prev,
            coordinates: `${result.data.latitude.toFixed(4)}° N, ${result.data.longitude.toFixed(4)}° E`,
          }))
        }
      }
    }

    loadIncident()

    // Join the incident-specific Socket.IO room
    const roomName = `incident:${incidentId}`
    joinRoom(roomName)

    // Listen for live status change broadcasts with ordering guard
    const unsubscribeStatus = subscribeToEvent('incident:status_changed', (payload) => {
      if (!isMounted) return
      if (payload.incident_id === incidentId || payload.id === incidentId) {
        console.log(`[Citizen Realtime] Status updated for ${incidentId} -> ${payload.status}`)
        const mappedState = STATUS_TO_STATE_MAP[payload.status] || 'SOS_ACTIVE'

        const STATUS_RANKS = {
          NEW: 1,
          TRIAGE_PENDING: 2,
          VERIFIED: 3,
          RESOLVED: 4,
          CANCELLED: 4,
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
    })

    // Listen for socket connectivity health
    const unsubscribeConn = onSocketStatusChange((status) => {
      if (isMounted) {
        setConnectivityStatus(status)
      }
    })

    return () => {
      isMounted = false
      leaveRoom(roomName)
      unsubscribeStatus()
      unsubscribeConn()
    }
  }, [incidentId])

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
      (loc) => {
        setUserLocation((prev) => ({
          ...prev,
          coordinates: loc.coordinates,
          accuracy: loc.accuracy,
          status: 'ACTIVE',
        }))
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
  // 3. Computed State Metadata
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

  const etaMinutes = useMemo(() => {
    if (typeof currentInfo.etaMinutes !== 'undefined') {
      return currentInfo.etaMinutes
    }
    return 7
  }, [currentInfo])

  const distanceText = useMemo(() => {
    return currentInfo.distanceText || '1.8 km'
  }, [currentInfo])

  const responderPos = useMemo(() => {
    return currentInfo.responderPos || { x: 22, y: 76 }
  }, [currentInfo])

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
    const result = await createIncident({
      type: 'flood',
      severity: 'CRITICAL',
      description: 'DEMO SOS Beacon — Realtime Pipeline Test',
      reporter_name: 'Aditi Roy (Demo)',
      reporter_phone: '+91 98301 24890',
      latitude: loc.latitude,
      longitude: loc.longitude,
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
    responder: emergencyFlowData.responder,
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
