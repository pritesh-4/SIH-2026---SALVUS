import { useState, useEffect, useRef, useCallback } from 'react'
import { sendSimulationStep, advanceResponderLifecycle } from '../../../services/api'

export const useMovementSimulation = ({
  activeRoute = null,
  selectedIncident = null,
  liveResponders = [],
  onStatusMessage = null,
} = {}) => {
  const [isSimulatingMovement, setIsSimulatingMovement] = useState(false)
  const [simulationSpeedMultiplier, setSimulationSpeedMultiplier] = useState(1) // 1x, 2x, 5x
  const simulationTimerRef = useRef(null)
  const simStepIndexRef = useRef(0)

  const isSendingRef = useRef(false)

  useEffect(() => {
    let isMounted = true

    if (!isSimulatingMovement || !activeRoute?.coordinates?.length || !selectedIncident) {
      if (simulationTimerRef.current) {
        clearInterval(simulationTimerRef.current)
        simulationTimerRef.current = null
      }
      return
    }

    const coords = activeRoute.coordinates
    const totalSteps = coords.length
    const assignedResp = liveResponders.find((r) => r.assigned_incident_id === selectedIncident.id)
    const responderId = assignedResp?.id || activeRoute.responderId

    if (!responderId) return

    const intervalMs = Math.max(200, Math.floor(1000 / simulationSpeedMultiplier))

    simulationTimerRef.current = setInterval(async () => {
      if (!isMounted || isSendingRef.current) return

      const idx = simStepIndexRef.current

      if (idx >= totalSteps) {
        // Destination reached -> Transition to ON_SCENE
        clearInterval(simulationTimerRef.current)
        simulationTimerRef.current = null
        if (isMounted) {
          setIsSimulatingMovement(false)
        }
        await advanceResponderLifecycle(responderId, 'ON_SCENE', 'simulation_engine')
        if (isMounted && onStatusMessage) {
          onStatusMessage(`⚓ Unit arrived at incident coordinates: ON SCENE`)
        }
        return
      }

      const [lat, lon] = coords[idx]

      // Determine lifecycle milestone status
      let targetStatus = null
      if (idx === 0) {
        targetStatus = 'EN_ROUTE'
      } else if (idx >= totalSteps - 3) {
        targetStatus = 'NEARBY'
      }

      isSendingRef.current = true
      try {
        // Stream simulated telemetry to backend
        await sendSimulationStep({
          responder_id: responderId,
          incident_id: selectedIncident.id,
          step_index: idx,
          total_steps: totalSteps,
          latitude: lat,
          longitude: lon,
          target_status: targetStatus,
        })
      } finally {
        isSendingRef.current = false
      }

      if (isMounted) {
        simStepIndexRef.current = idx + 1
      }
    }, intervalMs)

    return () => {
      isMounted = false
      if (simulationTimerRef.current) {
        clearInterval(simulationTimerRef.current)
        simulationTimerRef.current = null
      }
    }
  }, [
    isSimulatingMovement,
    activeRoute,
    selectedIncident,
    liveResponders,
    simulationSpeedMultiplier,
    onStatusMessage,
  ])

  const toggleMovementSimulation = useCallback(() => {
    if (isSimulatingMovement) {
      setIsSimulatingMovement(false)
    } else {
      simStepIndexRef.current = 0
      setIsSimulatingMovement(true)
      if (onStatusMessage) {
        onStatusMessage(`▶ GPS Telemetry Simulation Started (${simulationSpeedMultiplier}x)`)
      }
    }
  }, [isSimulatingMovement, simulationSpeedMultiplier, onStatusMessage])

  const stopMovementSimulation = useCallback(() => {
    setIsSimulatingMovement(false)
    simStepIndexRef.current = 0
    if (simulationTimerRef.current) {
      clearInterval(simulationTimerRef.current)
      simulationTimerRef.current = null
    }
  }, [])

  return {
    isSimulatingMovement,
    setIsSimulatingMovement,
    simulationSpeedMultiplier,
    setSimulationSpeedMultiplier,
    toggleMovementSimulation,
    stopMovementSimulation,
  }
}
