import { useState, useEffect, useCallback } from 'react'
import { emergencyFlowData } from '../../../data/emergencyFlow'

const STATE_ORDER = ['SOS_ACTIVE', 'TRIAGING', 'ASSIGNED', 'EN_ROUTE', 'ON_SCENE', 'RESOLVED']

export const useEmergencyState = (initialState = 'SOS_ACTIVE') => {
  const [currentState, setCurrentState] = useState(initialState)
  const [etaMinutes, setEtaMinutes] = useState(emergencyFlowData.responder.etaMinutes)
  const [isAutoPlaying, setIsAutoPlaying] = useState(false)

  const currentInfo = emergencyFlowData.states[currentState] || emergencyFlowData.states.SOS_ACTIVE

  const goToNextState = useCallback(() => {
    setCurrentState((prev) => {
      const currentIndex = STATE_ORDER.indexOf(prev)
      if (currentIndex >= 0 && currentIndex < STATE_ORDER.length - 1) {
        const next = STATE_ORDER[currentIndex + 1]
        if (next === 'EN_ROUTE') setEtaMinutes(3)
        if (next === 'ON_SCENE') setEtaMinutes(0)
        return next
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

  const cancelEmergency = useCallback(() => {
    setIsAutoPlaying(false)
    setCurrentState('CANCELLED')
  }, [])

  const resetEmergency = useCallback(() => {
    setIsAutoPlaying(false)
    setCurrentState('SOS_ACTIVE')
    setEtaMinutes(4)
  }, [])

  const triggerSos = useCallback(() => {
    setCurrentState('SOS_ACTIVE')
    setEtaMinutes(4)
  }, [])

  // Auto-play simulation effect
  useEffect(() => {
    let timer = null
    if (isAutoPlaying) {
      timer = setInterval(() => {
        setCurrentState((prev) => {
          const currentIndex = STATE_ORDER.indexOf(prev)
          if (currentIndex >= 0 && currentIndex < STATE_ORDER.length - 1) {
            const next = STATE_ORDER[currentIndex + 1]
            if (next === 'EN_ROUTE') setEtaMinutes(3)
            if (next === 'ON_SCENE') setEtaMinutes(0)
            return next
          } else {
            setIsAutoPlaying(false)
            return prev
          }
        })
      }, 3500)
    }
    return () => {
      if (timer) clearInterval(timer)
    }
  }, [isAutoPlaying])

  return {
    currentState,
    currentInfo,
    etaMinutes,
    isAutoPlaying,
    incident: emergencyFlowData.incident,
    responder: emergencyFlowData.responder,
    timelineSteps: emergencyFlowData.timelineSteps,
    instructions: emergencyFlowData.instructions,
    setCurrentState,
    goToNextState,
    goToPrevState,
    cancelEmergency,
    resetEmergency,
    triggerSos,
    toggleAutoPlay: () => setIsAutoPlaying((prev) => !prev),
  }
}
