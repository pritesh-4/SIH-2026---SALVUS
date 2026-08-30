import { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import { fetchResponderCandidates } from '../../../services/api'
import { fetchRoute } from '../../../services/routingService'

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
