import { useState, useEffect, useCallback, useMemo } from 'react'
import { emergencyFlowData } from '../../../data/emergencyFlow'

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

export const useEmergencyState = (initialState = 'SOS_ACTIVE') => {
  const [currentState, setCurrentState] = useState(initialState)
  const [isAutoPlaying, setIsAutoPlaying] = useState(false)
  const [simulationSpeed, setSimulationSpeed] = useState(1) // 1x, 1.5x, 2x
  const [isCancelModalOpen, setIsCancelModalOpen] = useState(false)
  const [locationStatus, setLocationStatus] = useState('ACTIVE') // ACTIVE, ACQUIRING, RETRYING
  const [connectivityStatus, setConnectivityStatus] = useState('CONNECTED') // CONNECTED, LIMITED_CONNECTION, OFFLINE, RECONNECTING

  // Current state metadata
  const currentInfo = useMemo(() => {
    return emergencyFlowData.states[currentState] || emergencyFlowData.states.SOS_ACTIVE
  }, [currentState])

  // Current instructions tailored to active state
  const currentInstructions = useMemo(() => {
    return (
      emergencyFlowData.instructions[currentState] ||
      emergencyFlowData.instructions.SOS_ACTIVE ||
      []
    )
  }, [currentState])

  // Dynamic ETA calculation based on state
  const etaMinutes = useMemo(() => {
    if (typeof currentInfo.etaMinutes !== 'undefined') {
      return currentInfo.etaMinutes
    }
    return 7
  }, [currentInfo])

  // Dynamic distance based on state
  const distanceText = useMemo(() => {
    return currentInfo.distanceText || '1.8 km'
  }, [currentInfo])

  // Dynamic responder coordinates
  const responderPos = useMemo(() => {
    return currentInfo.responderPos || { x: 22, y: 76 }
  }, [currentInfo])

  // State focal category for progressive disclosure
  const focalCategory = useMemo(() => {
    switch (currentState) {
      case 'SOS_ACTIVE':
      case 'TRIAGING':
      case 'VERIFIED':
        return 'triage' // Focus on incident telemetry, AI evaluation & coordinator verification
      case 'ASSIGNED':
      case 'EN_ROUTE':
        return 'tracking' // Focus on rescue radar map & moving vessel telemetry
      case 'NEARBY':
        return 'proximity' // Focus on proximity alert & visual/acoustic signaling
      case 'ON_SCENE':
        return 'on_scene' // Focus on arrival confirmation & evacuation handoff
      case 'RESOLVED':
        return 'resolved' // Focus on safe closure & reception registry
      case 'CANCELLED':
        return 'cancelled'
      default:
        return 'triage'
    }
  }, [currentState])

  // Step navigation with state guard
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

  const confirmCancelEmergency = useCallback(() => {
    setIsAutoPlaying(false)
    setIsCancelModalOpen(false)
    setCurrentState('CANCELLED')
  }, [])

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

  // Auto-play simulation effect
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
    incident: emergencyFlowData.incident,
    aiTriage: emergencyFlowData.aiTriage,
    responder: emergencyFlowData.responder,
    routes: emergencyFlowData.routes,
    timelineSteps: emergencyFlowData.timelineSteps,
    instructions: currentInstructions,
    setCurrentState: selectState,
    goToNextState,
    goToPrevState,
    resetEmergency,
    triggerSos,
    toggleAutoPlay: () => setIsAutoPlaying((prev) => !prev),
  }
}
