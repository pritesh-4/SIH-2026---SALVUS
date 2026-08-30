import { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import { fetchResponderCandidates, reassignResponder } from '../../../services/api'
import { fetchRoute, haversineDistance } from '../../../services/routingService'

const MOVEMENT_THRESHOLD_METERS = 200 // 200m minimum movement to trigger re-evaluation
const RECALC_DEBOUNCE_MS = 4000 // Minimum 4s interval between dynamic calculations

export const useDispatchRecommendation = ({
  selectedIncident = null,
  liveResponders = [],
  currentlyAssignedResponder = null,
} = {}) => {
  const [candidateList, setCandidateList] = useState([])
  const [isLoadingCandidates, setIsLoadingCandidates] = useState(false)
  const [activeRoute, setActiveRoute] = useState(null)
  const [previewRoute, setPreviewRoute] = useState(null)
  const [recommendationShift, setRecommendationShift] = useState(null)

  const lastRouteKeyRef = useRef(null)
  const latestRequestIdRef = useRef(0)
  const lastEvaluatedCoordsRef = useRef(new Map())
  const lastEvaluatedTimeRef = useRef(0)
  const lastIncidentKeyRef = useRef(null)

  // ---------------------------------------------------------------------------
  // 1. Dynamic Trigger Evaluation & Stale Request Protection
  // ---------------------------------------------------------------------------
  useEffect(() => {
    let isMounted = true

    if (!selectedIncident) {
      return () => {
        isMounted = false
      }
    }

    const incidentKey = `${selectedIncident.id}_${selectedIncident.status}_${selectedIncident.severity}`
    const isIncidentChange = lastIncidentKeyRef.current !== incidentKey
    const now = Date.now()
    const elapsedSinceLastEval = now - lastEvaluatedTimeRef.current

    // Check if any responder had meaningful movement (>= 200m) or status change
    let hasMeaningfulTelemetryShift = false
    const currentCoordsMap = new Map()

    for (const resp of liveResponders) {
      if (!resp.latitude || !resp.longitude) continue
      currentCoordsMap.set(resp.id, {
        lat: resp.latitude,
        lon: resp.longitude,
        status: resp.status,
      })

      const prev = lastEvaluatedCoordsRef.current.get(resp.id)
      if (!prev) {
        hasMeaningfulTelemetryShift = true
      } else {
        if (prev.status !== resp.status) {
          hasMeaningfulTelemetryShift = true
        } else {
          const distKm = haversineDistance(prev.lat, prev.lon, resp.latitude, resp.longitude)
          if (distKm * 1000 >= MOVEMENT_THRESHOLD_METERS) {
            hasMeaningfulTelemetryShift = true
          }
        }
      }
    }

    // Evaluate trigger criteria
    const shouldRecalculate =
      isIncidentChange ||
      (hasMeaningfulTelemetryShift && elapsedSinceLastEval >= RECALC_DEBOUNCE_MS) ||
      lastEvaluatedTimeRef.current === 0

    if (!shouldRecalculate) {
      return () => {
        isMounted = false
      }
    }

    // Update evaluation markers
    lastIncidentKeyRef.current = incidentKey
    lastEvaluatedTimeRef.current = now
    lastEvaluatedCoordsRef.current = currentCoordsMap

    const currentReqId = ++latestRequestIdRef.current

    const loadCandidatesAndRoute = async () => {
      setIsLoadingCandidates(true)
      const candRes = await fetchResponderCandidates(selectedIncident.id)

      // Discard stale out-of-order response if newer request started
      if (!isMounted || currentReqId < latestRequestIdRef.current) return

      if (candRes.success && candRes.data.length > 0) {
        setCandidateList(candRes.data)

        // Evaluate Dynamic Recommendation Shift if incident is already ASSIGNED
        if (currentlyAssignedResponder) {
          const topCand = candRes.data.find((c) => c.is_recommended) || candRes.data[0]
          if (topCand && topCand.id !== currentlyAssignedResponder.id) {
            // Compute assigned unit's approximate ETA
            const speedKmh = currentlyAssignedResponder.capability === 'FLOOD_BOAT' ? 30.0 : 40.0
            const assignedDistKm = haversineDistance(
              currentlyAssignedResponder.latitude,
              currentlyAssignedResponder.longitude,
              selectedIncident.latitude,
              selectedIncident.longitude
            )
            const assignedEtaMin = (assignedDistKm / Math.max(1, speedKmh)) * 60.0
            const topCandEtaMin = topCand.eta_minutes || 5.0
            const etaDeltaMin = Math.round(assignedEtaMin - topCandEtaMin)

            // Trigger shift notification if candidate is >= 2 min faster or assigned unit is OFFLINE
            if (etaDeltaMin >= 2 || currentlyAssignedResponder.status === 'OFFLINE') {
              setRecommendationShift({
                currentResponder: currentlyAssignedResponder,
                currentEtaFormatted: `${Math.max(1, Math.round(assignedEtaMin))} min`,
                newCandidate: topCand,
                newEtaFormatted:
                  topCand.eta_formatted || `${Math.max(1, Math.round(topCandEtaMin))} min`,
                etaDeltaMinutes: etaDeltaMin,
                reason:
                  currentlyAssignedResponder.status === 'OFFLINE'
                    ? `Currently assigned ${currentlyAssignedResponder.unit_name} is OFFLINE. ${topCand.unit_name} is now recommended.`
                    : `${topCand.unit_name} is now ${etaDeltaMin} min faster (~${topCand.eta_formatted || '5 min'}) and qualified for this incident.`,
                detectedAt: Date.now(),
              })
            }
          } else {
            setRecommendationShift(null)
          }
        } else {
          setRecommendationShift(null)
        }

        const assigned = liveResponders.find((r) => r.assigned_incident_id === selectedIncident.id)
        const primaryTarget =
          assigned || candRes.data.find((c) => c.is_recommended) || candRes.data[0]

        if (
          primaryTarget &&
          typeof primaryTarget.latitude === 'number' &&
          typeof primaryTarget.longitude === 'number' &&
          !isNaN(primaryTarget.latitude) &&
          !isNaN(primaryTarget.longitude) &&
          typeof selectedIncident.latitude === 'number' &&
          typeof selectedIncident.longitude === 'number' &&
          !isNaN(selectedIncident.latitude) &&
          !isNaN(selectedIncident.longitude)
        ) {
          const routeKey = `${selectedIncident.id}_${primaryTarget.id}_${primaryTarget.latitude}_${primaryTarget.longitude}_${selectedIncident.latitude}_${selectedIncident.longitude}`
          if (lastRouteKeyRef.current !== routeKey) {
            lastRouteKeyRef.current = routeKey
            const profile = primaryTarget.capability === 'FLOOD_BOAT' ? 'boat' : 'driving'
            const routeRes = await fetchRoute(
              primaryTarget.latitude,
              primaryTarget.longitude,
              selectedIncident.latitude,
              selectedIncident.longitude,
              profile
            )
            if (routeRes.success && isMounted && routeRes.data) {
              setActiveRoute({
                responderId: primaryTarget.id,
                coordinates: routeRes.data.coordinates || routeRes.data.geometry || [],
                geometry: routeRes.data.geometry || routeRes.data.coordinates || [],
                distanceKm: routeRes.data.distance_km,
                distanceMeters: routeRes.data.distance_meters,
                durationSeconds: routeRes.data.duration_seconds,
                etaFormatted: routeRes.data.eta_formatted,
                provider: routeRes.data.provider,
                status: routeRes.data.status,
                isFallback: routeRes.data.is_fallback,
                label: `${primaryTarget.unit_name || primaryTarget.unitName || 'Unit'} Route`,
              })
            }
          }
        }
      } else if (isMounted) {
        setCandidateList([])
        setActiveRoute(null)
        setRecommendationShift(null)
        lastRouteKeyRef.current = null
      }

      if (isMounted) {
        setIsLoadingCandidates(false)
      }
    }

    loadCandidatesAndRoute()

    return () => {
      isMounted = false
    }
  }, [selectedIncident, liveResponders, currentlyAssignedResponder])

  // ---------------------------------------------------------------------------
  // 2. Canonical Server-Authoritative Candidate Accessors
  // ---------------------------------------------------------------------------
  const candidateResponders = useMemo(() => {
    if (!selectedIncident) return []
    return candidateList || []
  }, [candidateList, selectedIncident])

  const topRecommendedCandidate = useMemo(() => {
    return candidateResponders.find((c) => c.is_recommended) || candidateResponders[0] || null
  }, [candidateResponders])

  const alternativeCandidates = useMemo(() => {
    if (candidateResponders.length <= 1) return []
    return candidateResponders.slice(1, 4)
  }, [candidateResponders])

  const activeTargetResponder = useMemo(() => {
    if (!selectedIncident) return null
    if (currentlyAssignedResponder) return currentlyAssignedResponder
    if (activeRoute?.responderId) {
      return (
        liveResponders.find((r) => r.id === activeRoute.responderId) ||
        candidateResponders.find((c) => c.id === activeRoute.responderId) ||
        null
      )
    }
    return topRecommendedCandidate || null
  }, [
    selectedIncident,
    currentlyAssignedResponder,
    activeRoute,
    liveResponders,
    candidateResponders,
    topRecommendedCandidate,
  ])

  // ---------------------------------------------------------------------------
  // 3. Actions
  // ---------------------------------------------------------------------------
  const selectCandidateRoute = useCallback(
    async (candidate) => {
      if (
        !selectedIncident ||
        !candidate ||
        typeof candidate.latitude !== 'number' ||
        typeof candidate.longitude !== 'number' ||
        isNaN(candidate.latitude) ||
        isNaN(candidate.longitude) ||
        typeof selectedIncident.latitude !== 'number' ||
        typeof selectedIncident.longitude !== 'number' ||
        isNaN(selectedIncident.latitude) ||
        isNaN(selectedIncident.longitude)
      ) {
        return
      }

      const profile = candidate.capability === 'FLOOD_BOAT' ? 'boat' : 'driving'
      const routeRes = await fetchRoute(
        candidate.latitude,
        candidate.longitude,
        selectedIncident.latitude,
        selectedIncident.longitude,
        profile
      )

      if (routeRes.success && routeRes.data) {
        setActiveRoute({
          responderId: candidate.id,
          coordinates: routeRes.data.coordinates || routeRes.data.geometry || [],
          geometry: routeRes.data.geometry || routeRes.data.coordinates || [],
          distanceKm: routeRes.data.distance_km,
          distanceMeters: routeRes.data.distance_meters,
          durationSeconds: routeRes.data.duration_seconds,
          etaFormatted: routeRes.data.eta_formatted,
          provider: routeRes.data.provider,
          status: routeRes.data.status,
          isFallback: routeRes.data.is_fallback,
          label: `${candidate.unit_name || candidate.unitName || 'Unit'} Route`,
        })
      } else {
        setActiveRoute({
          responderId: candidate.id,
          coordinates: candidate.route_geometry || [
            [candidate.latitude, candidate.longitude],
            [selectedIncident.latitude, selectedIncident.longitude],
          ],
          geometry: candidate.route_geometry || [],
          distanceKm: candidate.distance_km ?? candidate.distanceKm ?? null,
          etaFormatted: candidate.eta_formatted ?? candidate.etaFormatted ?? null,
          provider: 'vector_corridor',
          status: 'ESTIMATED',
          isFallback: true,
          label: `${candidate.unit_name || candidate.unitName || 'Unit'} Route`,
        })
      }
    },
    [selectedIncident]
  )

  const refreshCandidates = useCallback(async () => {
    if (!selectedIncident) return
    setIsLoadingCandidates(true)
    const currentReqId = ++latestRequestIdRef.current
    const candRes = await fetchResponderCandidates(selectedIncident.id)
    if (currentReqId < latestRequestIdRef.current) return

    if (candRes.success) {
      setCandidateList(candRes.data || [])
    }
    setIsLoadingCandidates(false)
  }, [selectedIncident])

  const dismissRecommendationShift = useCallback(() => {
    setRecommendationShift(null)
  }, [])

  const executeReassignment = useCallback(
    async (newResponderId, reason) => {
      if (!selectedIncident) return { success: false, error: 'No incident selected' }
      const res = await reassignResponder(newResponderId, selectedIncident.id, reason)
      if (res.success) {
        setRecommendationShift(null)
        await refreshCandidates()
      }
      return res
    },
    [selectedIncident, refreshCandidates]
  )

  const clearRoute = useCallback(() => {
    setActiveRoute(null)
    lastRouteKeyRef.current = null
  }, [])

  return {
    candidateList,
    setCandidateList,
    isLoadingCandidates,
    candidateResponders,
    topRecommendedCandidate,
    alternativeCandidates,
    activeTargetResponder,
    activeRoute,
    setActiveRoute,
    previewRoute,
    setPreviewRoute,
    recommendationShift,
    dismissRecommendationShift,
    executeReassignment,
    selectCandidateRoute,
    refreshCandidates,
    clearRoute,
  }
}

export default useDispatchRecommendation
