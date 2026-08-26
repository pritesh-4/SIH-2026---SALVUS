import { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import { fetchResponderCandidates } from '../../../services/api'
import { fetchRoute } from '../../../services/routingService'
import { calculateDistanceKm } from '../incidents/incidentUtils'

export const useDispatchRecommendation = ({
  selectedIncident = null,
  liveResponders = [],
  currentlyAssignedResponder = null,
} = {}) => {
  const [candidateList, setCandidateList] = useState([])
  const [isLoadingCandidates, setIsLoadingCandidates] = useState(false)
  const [activeRoute, setActiveRoute] = useState(null)
  const [previewRoute, setPreviewRoute] = useState(null)
  const lastRouteKeyRef = useRef(null)

  // ---------------------------------------------------------------------------
  // 1. Fetch Candidates & Compute Route on Incident Selection
  // ---------------------------------------------------------------------------
  useEffect(() => {
    let isMounted = true

    if (!selectedIncident) {
      return () => {
        isMounted = false
      }
    }

    const loadCandidatesAndRoute = async () => {
      setIsLoadingCandidates(true)
      const candRes = await fetchResponderCandidates(selectedIncident.id)
      if (!isMounted) return

      if (candRes.success && candRes.data.length > 0) {
        setCandidateList(candRes.data)

        const assigned = liveResponders.find((r) => r.assigned_incident_id === selectedIncident.id)
        const primaryTarget =
          assigned || candRes.data.find((c) => c.is_recommended) || candRes.data[0]

        if (primaryTarget && primaryTarget.latitude && primaryTarget.longitude) {
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
  }, [selectedIncident, liveResponders])

  // ---------------------------------------------------------------------------
  // 2. Fallback Deterministic Candidate Ranking
  // ---------------------------------------------------------------------------
  const candidateResponders = useMemo(() => {
    if (!selectedIncident) return []
    if (candidateList.length > 0) return candidateList
    if (!liveResponders.length) return []

    const incLat = selectedIncident.latitude || 22.5726
    const incLon = selectedIncident.longitude || 88.3639
    const incType = (selectedIncident.type || '').toLowerCase()

    const list = liveResponders
      .filter((r) => r.status !== 'OFFLINE')
      .map((resp) => {
        const distKm = calculateDistanceKm(incLat, incLon, resp.latitude, resp.longitude)

        let capScore = 15
        let matchReason = 'General Auxiliary Support'

        if (incType === 'flood') {
          if (resp.capability === 'FLOOD_BOAT') {
            capScore = 35
            matchReason = 'Specialized Inflatable Flood Rescue Watercraft'
          } else if (resp.capability === 'AMBULANCE') {
            capScore = 24
            matchReason = 'High-Water Medical Evacuation Support'
          } else if (resp.capability === 'STRETCHER_TEAM') {
            capScore = 20
            matchReason = 'Shallow Water Stretcher Extraction'
          }
        } else if (incType === 'medical') {
          if (resp.capability === 'AMBULANCE') {
            capScore = 35
            matchReason = 'Primary Advanced Life Support Ambulance'
          } else if (resp.capability === 'STRETCHER_TEAM') {
            capScore = 28
            matchReason = 'Field Triage & Stretcher Transfer'
          }
        }

        let availScore = 0
        if (resp.status === 'AVAILABLE') availScore = 20
        else if (resp.status === 'NEARBY') availScore = 15
        else if (resp.status === 'EN_ROUTE') availScore = 8

        const sevScore = selectedIncident.severity === 'CRITICAL' ? 20 : 15
        const proxScore = distKm < 1 ? 15 : distKm < 3 ? 12 : distKm < 6 ? 8 : 4
        const loadPenalty = Math.round((resp.current_load / Math.max(1, resp.max_capacity)) * 10)

        const totalScore = Math.max(
          0,
          Math.min(100, capScore + sevScore + availScore + proxScore - loadPenalty)
        )

        return {
          ...resp,
          distance_km: distKm,
          eta_formatted: `${Math.max(1, Math.round((distKm / 35) * 60))} min`,
          match_score: totalScore,
          match_reason: matchReason,
          is_recommended: false,
          explanation: {
            headline: 'Recommended Primary Unit',
            positive_factors: [
              `✓ ${matchReason}`,
              resp.status === 'AVAILABLE'
                ? '✓ Available immediately'
                : `✓ Operating in adjacent sector (${resp.status})`,
              `✓ Rapid transit (~${distKm} km)`,
              `✓ Zero load backlog (${resp.current_load}/${resp.max_capacity} in use)`,
            ],
            negative_factors: [],
            breakdown: {
              capability_score: capScore,
              severity_alignment: sevScore,
              availability_score: availScore,
              proximity_score: proxScore,
              workload_penalty: loadPenalty,
              total_score: totalScore,
            },
          },
        }
      })

    list.sort((a, b) => b.match_score - a.match_score || a.distance_km - b.distance_km)
    if (list.length > 0) list[0].is_recommended = true
    return list
  }, [candidateList, selectedIncident, liveResponders])

  const topRecommendedCandidate = useMemo(() => {
    return candidateResponders.find((c) => c.is_recommended) || candidateResponders[0] || null
  }, [candidateResponders])

  const alternativeCandidates = useMemo(() => {
    if (candidateResponders.length <= 1) return []
    return candidateResponders.slice(1, 3)
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
      if (!selectedIncident || !candidate || !candidate.latitude || !candidate.longitude) return

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
          distanceKm: candidate.distance_km ?? candidate.distanceKm ?? 1.2,
          etaFormatted: candidate.eta_formatted ?? candidate.etaFormatted ?? '5 min',
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
    const candRes = await fetchResponderCandidates(selectedIncident.id)
    if (candRes.success) {
      setCandidateList(candRes.data || [])
    }
    setIsLoadingCandidates(false)
  }, [selectedIncident])

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
    selectCandidateRoute,
    refreshCandidates,
    clearRoute,
  }
}
