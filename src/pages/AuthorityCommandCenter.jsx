import { useState, useMemo, useEffect, useCallback, useRef } from 'react'
import { authorityData } from '../data/authority/authorityMock'
import { useAuthorityIncidents } from '../features/authority/useAuthorityIncidents'
import { SalvusLeafletMap } from '../components/common/SalvusLeafletMap'
import { AiTriageAssessmentCard } from '../components/authority/AiTriageAssessmentCard'
import {
  fetchResponders,
  fetchShelters,
  fetchResponderCandidates,
  assignResponder,
  updateResponderStatus,
  updateShelterOccupancy,
  advanceResponderLifecycle,
  sendSimulationStep,
  analyzeIncidentTriage,
  verifyIncidentTriage,
  adjustIncidentTriage,
} from '../services/api'
import { fetchRoute } from '../services/routingService'
import { subscribeToEvent } from '../lib/realtime/socket'

const calculateDistanceKm = (lat1, lon1, lat2, lon2) => {
  if (!lat1 || !lon1 || !lat2 || !lon2) return 1.2
  const R = 6371
  const dLat = ((lat2 - lat1) * Math.PI) / 180
  const dLon = ((lon2 - lon1) * Math.PI) / 180
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2)
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  return Math.round(R * c * 10) / 10
}

export const AuthorityCommandCenter = () => {
  const { hub } = authorityData

  const {
    incidents,
    selectedIncident,
    setSelectedIncident,
    isLoading,
    error,
    newlyArrivedId,
    changeStatus,
    isUpdatingStatus,
    computedMetrics,
    refetch,
  } = useAuthorityIncidents()

  const [activeIncidentFilter, setActiveIncidentFilter] = useState('all')
  const [rightPanelTab, setRightPanelTab] = useState('inspector')
  const [mapLayers, setMapLayers] = useState({
    incidents: true,
    responders: true,
    shelters: true,
    routes: true,
  })
  const [actionSuccessMessage, setActionSuccessMessage] = useState(null)
  const [isAssigningUnit, setIsAssigningUnit] = useState(false)
  const [showScoreBreakdown, setShowScoreBreakdown] = useState(false)
  const [isAnalyzingTriage, setIsAnalyzingTriage] = useState(false)
  const [isVerifyingTriage, setIsVerifyingTriage] = useState(false)

  // Simulation controls
  const [isSimulatingMovement, setIsSimulatingMovement] = useState(false)
  const [simulationSpeedMultiplier, setSimulationSpeedMultiplier] = useState(1) // 1x, 2x, 5x
  const simulationTimerRef = useRef(null)
  const simStepIndexRef = useRef(0)

  // Fleet & candidate states
  const [fleetCapabilityFilter, setFleetCapabilityFilter] = useState('all')
  const [fleetStatusFilter, setFleetStatusFilter] = useState('all')
  const [selectedResponderDetail, setSelectedResponderDetail] = useState(null)

  const [liveResponders, setLiveResponders] = useState([])
  const [liveShelters, setLiveShelters] = useState([])
  const [candidateList, setCandidateList] = useState([])
  const [isLoadingCandidates, setIsLoadingCandidates] = useState(false)
  const [isLoadingFleet, setIsLoadingFleet] = useState(true)
  const [dataProvenance, setDataProvenance] = useState('LIVE')

  // Map Route Vectors
  const [activeRoute, setActiveRoute] = useState(null)
  const [previewRoute, setPreviewRoute] = useState(null)

  const loadFleetAndShelters = useCallback(async () => {
    const isDemo =
      typeof window !== 'undefined' &&
      (window.location.search.includes('demo=true') ||
        localStorage.getItem('salvus_demo_mode') === 'true')

    if (isDemo) {
      setDataProvenance('SIMULATED')
    }

    const [respResult, shlResult] = await Promise.all([fetchResponders(), fetchShelters()])

    if (respResult.success && respResult.data.length > 0) {
      setLiveResponders(respResult.data)
      if (!isDemo) setDataProvenance('LIVE')
    } else {
      setLiveResponders(authorityData.responders || [])
      if (!isDemo) setDataProvenance('CACHED')
    }

    if (shlResult.success && shlResult.data.length > 0) {
      setLiveShelters(shlResult.data)
    } else {
      setLiveShelters(authorityData.shelters || [])
    }

    setIsLoadingFleet(false)
  }, [])

  // ---------------------------------------------------------------------------
  // 1. Initial Load & Realtime Socket Listeners
  // ---------------------------------------------------------------------------
  useEffect(() => {
    let isMounted = true

    const init = async () => {
      await loadFleetAndShelters()
    }
    if (isMounted) {
      init()
    }

    const unsubStatus = subscribeToEvent('responder:status_changed', (updatedResp) => {
      setLiveResponders((prev) =>
        prev.map((r) => (r.id === updatedResp.id ? { ...r, ...updatedResp } : r))
      )
    })

    const unsubLoc = subscribeToEvent('responder:location_updated', (updatedResp) => {
      setLiveResponders((prev) =>
        prev.map((r) => (r.id === updatedResp.id ? { ...r, ...updatedResp } : r))
      )
    })

    const unsubAssign = subscribeToEvent('assignment:created', (payload) => {
      if (payload.responder) {
        setLiveResponders((prev) =>
          prev.map((r) => (r.id === payload.responder.id ? { ...r, ...payload.responder } : r))
        )
      }
      refetch(true)
    })

    const unsubShelter = subscribeToEvent('shelter:updated', (updatedShelter) => {
      setLiveShelters((prev) =>
        prev.map((s) => (s.id === updatedShelter.id ? { ...s, ...updatedShelter } : s))
      )
    })

    return () => {
      isMounted = false
      unsubStatus()
      unsubLoc()
      unsubAssign()
      unsubShelter()
    }
  }, [loadFleetAndShelters, refetch])

  // ---------------------------------------------------------------------------
  // 2. Fetch Candidates & Compute Route on Incident Selection
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

        if (primaryTarget) {
          const profile = primaryTarget.capability === 'FLOOD_BOAT' ? 'boat' : 'driving'
          const routeRes = await fetchRoute(
            primaryTarget.latitude,
            primaryTarget.longitude,
            selectedIncident.latitude,
            selectedIncident.longitude,
            profile
          )
          if (routeRes.success && isMounted) {
            setActiveRoute({
              responderId: primaryTarget.id,
              coordinates: routeRes.data.coordinates,
              distanceKm: routeRes.data.distance_km,
              etaFormatted: routeRes.data.eta_formatted,
              status: routeRes.data.status,
              isFallback: routeRes.data.is_fallback,
              label: `${primaryTarget.unit_name || primaryTarget.unitName} Route`,
            })
          }
        }
      } else {
        setCandidateList([])
      }
      setIsLoadingCandidates(false)
    }

    loadCandidatesAndRoute()

    return () => {
      isMounted = false
    }
  }, [selectedIncident, liveResponders])

  // ---------------------------------------------------------------------------
  // 3. Movement Simulation Engine along real route polyline
  // ---------------------------------------------------------------------------
  useEffect(() => {
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
      const idx = simStepIndexRef.current

      if (idx >= totalSteps) {
        // Reached destination -> Transition to ON_SCENE
        clearInterval(simulationTimerRef.current)
        simulationTimerRef.current = null
        setIsSimulatingMovement(false)
        await advanceResponderLifecycle(responderId, 'ON_SCENE', 'simulation_engine')
        setActionSuccessMessage(`⚓ Unit arrived at incident coordinates: ON SCENE`)
        setTimeout(() => setActionSuccessMessage(null), 3500)
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

      // Stream real simulated telemetry to backend
      await sendSimulationStep({
        responder_id: responderId,
        incident_id: selectedIncident.id,
        step_index: idx,
        total_steps: totalSteps,
        latitude: lat,
        longitude: lon,
        target_status: targetStatus,
      })

      simStepIndexRef.current = idx + 1
    }, intervalMs)

    return () => {
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
  ])

  const toggleMovementSimulation = () => {
    if (isSimulatingMovement) {
      setIsSimulatingMovement(false)
    } else {
      simStepIndexRef.current = 0
      setIsSimulatingMovement(true)
      setActionSuccessMessage(`▶ GPS Telemetry Simulation Started (${simulationSpeedMultiplier}x)`)
      setTimeout(() => setActionSuccessMessage(null), 2500)
    }
  }

  // ---------------------------------------------------------------------------
  // 4. Computed Values & Memoized State
  // ---------------------------------------------------------------------------
  const currentlyAssignedResponder = useMemo(() => {
    if (!selectedIncident) return null
    return liveResponders.find((r) => r.assigned_incident_id === selectedIncident.id) || null
  }, [selectedIncident, liveResponders])

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
    return candidateResponders.slice(0, 3)
  }, [candidateResponders])

  const candidateShelters = useMemo(() => {
    if (!selectedIncident || !liveShelters.length) return []

    const incLat = selectedIncident.latitude || 22.5726
    const incLon = selectedIncident.longitude || 88.3639

    return liveShelters
      .filter((s) => s.is_active && s.status !== 'CLOSED')
      .map((s) => {
        const distKm = calculateDistanceKm(incLat, incLon, s.latitude, s.longitude)
        const walkMin = Math.max(1, Math.ceil(distKm * 12))
        return {
          ...s,
          distanceKm: distKm,
          walkMin,
        }
      })
      .sort((a, b) => a.distanceKm - b.distanceKm)
      .slice(0, 2)
  }, [selectedIncident, liveShelters])

  const responderMapPoints = useMemo(() => {
    return liveResponders.map((r) => ({
      id: r.id,
      name: `${r.unit_name || r.unitName || 'NDRF Unit'} (${r.team_lead || r.lead || 'Team'})`,
      vessel: `${r.vehicle_type || r.vehicle || 'Rescue Vehicle'} · ${r.status || 'AVAILABLE'}`,
      lat: r.latitude || 22.574,
      lng: r.longitude || 88.372,
    }))
  }, [liveResponders])

  const shelterMapPoints = useMemo(() => {
    return liveShelters.map((s) => ({
      id: s.id,
      name: s.name,
      address: s.address,
      lat: s.latitude || 22.568,
      lng: s.longitude || 88.406,
      capacity: `${s.available_beds ?? 0} beds free (${s.occupancy_rate || '0%'} occ)`,
    }))
  }, [liveShelters])

  const filteredIncidents = useMemo(() => {
    return incidents.filter((inc) => {
      if (activeIncidentFilter === 'immediate') {
        return inc.severity === 'CRITICAL' || inc.is_sos || inc.status === 'NEW'
      }
      if (activeIncidentFilter === 'review') {
        return ['NEW', 'TRIAGE_PENDING'].includes(inc.status)
      }
      if (activeIncidentFilter === 'response') {
        return ['VERIFIED', 'ASSIGNED', 'EN_ROUTE', 'NEARBY', 'ON_SCENE'].includes(inc.status)
      }
      if (activeIncidentFilter === 'resolved') {
        return ['RESOLVED', 'CANCELLED'].includes(inc.status)
      }
      return true
    })
  }, [incidents, activeIncidentFilter])

  const filteredFleet = useMemo(() => {
    return liveResponders.filter((r) => {
      if (fleetCapabilityFilter !== 'all' && r.capability !== fleetCapabilityFilter) return false
      if (fleetStatusFilter !== 'all' && r.status !== fleetStatusFilter) return false
      return true
    })
  }, [liveResponders, fleetCapabilityFilter, fleetStatusFilter])

  const activeRespondersCount = useMemo(
    () =>
      liveResponders.filter((r) =>
        ['ASSIGNED', 'EN_ROUTE', 'NEARBY', 'ON_SCENE'].includes(r.status)
      ).length,
    [liveResponders]
  )

  const totalBedsAvailable = useMemo(
    () => liveShelters.reduce((acc, s) => acc + (s.available_beds ?? s.availableBeds ?? 0), 0),
    [liveShelters]
  )

  // ---------------------------------------------------------------------------
  // 5. Action Handlers
  // ---------------------------------------------------------------------------
  const handleSelectIncident = (inc) => {
    setSelectedIncident(inc)
    setRightPanelTab('inspector')
    setActiveRoute(null)
    setPreviewRoute(null)
    setCandidateList([])
    setIsSimulatingMovement(false)
    simStepIndexRef.current = 0
  }

  const handleTransition = async (targetStatus, label) => {
    if (!selectedIncident) return

    const result = await changeStatus(selectedIncident.id, targetStatus)
    if (result.success) {
      setActionSuccessMessage(`✓ Status updated: ${label}`)
      setTimeout(() => setActionSuccessMessage(null), 3000)
    }
  }

  const handleVerifyTriage = async (customData = null) => {
    if (!selectedIncident) return
    setIsVerifyingTriage(true)
    const result = await verifyIncidentTriage(
      selectedIncident.id,
      customData || { actor: 'Authority Dispatcher' }
    )
    setIsVerifyingTriage(false)

    if (result.success) {
      setActionSuccessMessage(`✓ AI Triage verified for #${selectedIncident.ticket_id}`)
      refetch(true)
      setTimeout(() => setActionSuccessMessage(null), 3000)
    } else {
      setActionSuccessMessage(`❌ ${result.error?.message || 'Verification failed'}`)
      setTimeout(() => setActionSuccessMessage(null), 3500)
    }
  }

  const handleAdjustTriage = async (adjustmentData) => {
    if (!selectedIncident) return
    setIsVerifyingTriage(true)
    const result = await adjustIncidentTriage(selectedIncident.id, {
      ...adjustmentData,
      actor: 'Authority Dispatcher',
    })
    setIsVerifyingTriage(false)

    if (result.success) {
      setActionSuccessMessage(`✓ AI Triage adjusted & verified for #${selectedIncident.ticket_id}`)
      refetch(true)
      setTimeout(() => setActionSuccessMessage(null), 3000)
    } else {
      setActionSuccessMessage(`❌ ${result.error?.message || 'Adjustment failed'}`)
      setTimeout(() => setActionSuccessMessage(null), 3500)
    }
  }

  const handleReevaluateTriage = async () => {
    if (!selectedIncident) return
    setIsAnalyzingTriage(true)
    const result = await analyzeIncidentTriage(selectedIncident.id)
    setIsAnalyzingTriage(false)

    if (result.success) {
      setActionSuccessMessage(`✓ Re-evaluated triage for #${selectedIncident.ticket_id}`)
      refetch(true)
      setTimeout(() => setActionSuccessMessage(null), 3000)
    } else {
      setActionSuccessMessage(`❌ ${result.error?.message || 'Triage analysis failed'}`)
      setTimeout(() => setActionSuccessMessage(null), 3500)
    }
  }

  const handleDispatchResponder = async (responderId) => {
    if (!selectedIncident) return

    setIsAssigningUnit(true)
    const result = await assignResponder(responderId, selectedIncident.id, 'ASSIGNED', 'authority')
    setIsAssigningUnit(false)

    if (result.success) {
      setActionSuccessMessage(
        `✓ Authoritatively dispatched ${result.data.unit_name} to #${selectedIncident.ticket_id}`
      )
      setLiveResponders((prev) =>
        prev.map((r) => (r.id === responderId ? { ...r, ...result.data } : r))
      )
      refetch(true)
      setTimeout(() => setActionSuccessMessage(null), 3500)
    } else {
      setActionSuccessMessage(`❌ ${result.error?.message || 'Dispatch failed'}`)
      setTimeout(() => setActionSuccessMessage(null), 3500)
    }
  }

  const handleAdvanceLifecycle = async (targetStatus) => {
    const assigned = currentlyAssignedResponder
    if (!assigned) return

    const result = await advanceResponderLifecycle(assigned.id, targetStatus, 'authority')
    if (result.success) {
      setActionSuccessMessage(`✓ Unit advanced to: ${targetStatus}`)
      setLiveResponders((prev) =>
        prev.map((r) => (r.id === assigned.id ? { ...r, ...result.data } : r))
      )
      refetch(true)
      setTimeout(() => setActionSuccessMessage(null), 3000)
    } else {
      setActionSuccessMessage(`❌ ${result.error?.message || 'Lifecycle transition failed'}`)
      setTimeout(() => setActionSuccessMessage(null), 3000)
    }
  }

  const handleAdjustBeds = async (shelterId, currentAvail, delta) => {
    const newAvail = Math.max(0, currentAvail + delta)
    const result = await updateShelterOccupancy(shelterId, newAvail)
    if (result.success) {
      setLiveShelters((prev) =>
        prev.map((s) => (s.id === shelterId ? { ...s, ...result.data } : s))
      )
    }
  }

  const getStatusBadge = (status) => {
    switch (status) {
      case 'NEW':
        return { label: 'NEW', classes: 'bg-amber-950/40 text-amber-300 border-amber-500/40' }
      case 'TRIAGE_PENDING':
        return {
          label: 'TRIAGE PENDING',
          classes: 'bg-amber-950/30 text-amber-400 border-amber-500/30',
        }
      case 'VERIFIED':
        return { label: 'VERIFIED', classes: 'bg-blue-950/40 text-blue-300 border-blue-500/40' }
      case 'ASSIGNED':
        return {
          label: 'ASSIGNED',
          classes: 'bg-sky-950/50 text-sky-300 border-sky-500/40',
        }
      case 'EN_ROUTE':
        return {
          label: 'EN ROUTE',
          classes: 'bg-indigo-950/50 text-indigo-300 border-indigo-500/40 animate-pulse',
        }
      case 'NEARBY':
        return {
          label: 'NEARBY (<100M)',
          classes: 'bg-amber-950/60 text-amber-300 border-amber-500/50 animate-ping',
        }
      case 'ON_SCENE':
        return {
          label: 'ON SCENE',
          classes: 'bg-emerald-950/50 text-emerald-300 border-emerald-500/40',
        }
      case 'RESOLVED':
        return {
          label: 'RESOLVED',
          classes: 'bg-emerald-950/40 text-emerald-400 border-emerald-500/30',
        }
      case 'CANCELLED':
        return { label: 'CANCELLED', classes: 'bg-slate-900 text-slate-400 border-slate-700' }
      default:
        return { label: status, classes: 'bg-slate-900 text-slate-400 border-slate-700' }
    }
  }

  const getSeverityBadge = (severity) => {
    switch (severity) {
      case 'CRITICAL':
        return { label: 'CRITICAL', classes: 'bg-rose-950/50 text-rose-300 border-rose-500/50' }
      case 'HIGH':
        return { label: 'HIGH', classes: 'bg-amber-950/40 text-amber-300 border-amber-500/40' }
      case 'MEDIUM':
        return { label: 'MEDIUM', classes: 'bg-slate-900 text-slate-300 border-slate-700' }
      case 'LOW':
        return { label: 'LOW', classes: 'bg-slate-900/60 text-slate-400 border-slate-800' }
      default:
        return { label: severity, classes: 'bg-slate-900 text-slate-400 border-slate-800' }
    }
  }

  return (
    <div className="space-y-3.5 pb-8">
      {/* Top District Header */}
      <header className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 bg-[#0C121B] border border-[#182332] rounded-xl px-4 py-3">
        <div>
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse"></span>
            <span className="font-mono text-xs font-bold text-slate-200 tracking-wider uppercase">
              {hub.name} · SECTOR 12 GRID
            </span>
            <span className="text-[10px] font-mono text-slate-400 bg-slate-800 px-1.5 py-0.5 rounded border border-slate-700">
              {dataProvenance}
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-0.5">
            Operational Intelligence & Deterministic Dispatch Allocation Surface
          </p>
        </div>

        <div className="flex items-center gap-3 font-mono text-xs">
          <div className="flex items-center gap-1.5 bg-[#080C12] border border-[#182332] px-2.5 py-1 rounded-lg text-slate-300">
            <span className="text-slate-500">DISPATCHER:</span>
            <span className="font-bold text-slate-200">{hub.activeDispatcher}</span>
          </div>
          <div className="flex items-center gap-1.5 bg-[#080C12] border border-[#182332] px-2.5 py-1 rounded-lg text-sky-400 font-bold">
            <span>VHF:</span>
            <span>{hub.radioChannel}</span>
          </div>
        </div>
      </header>

      {/* Metrics Strip */}
      <section
        aria-label="District Operational Metrics"
        className="grid grid-cols-2 sm:grid-cols-5 gap-2.5"
      >
        <div className="bg-[#0C121B] border border-[#182332] rounded-xl p-3">
          <span className="text-[10px] font-mono text-slate-400 block uppercase">
            Active Incidents
          </span>
          <span className="text-xl font-bold font-mono text-slate-100">
            {computedMetrics.active}
          </span>
        </div>
        <div className="bg-[#0C121B] border border-[#182332] rounded-xl p-3">
          <span className="text-[10px] font-mono text-rose-400 block uppercase">
            Critical Threats
          </span>
          <span className="text-xl font-bold font-mono text-rose-400">
            {computedMetrics.critical}
          </span>
        </div>
        <div className="bg-[#0C121B] border border-[#182332] rounded-xl p-3">
          <span className="text-[10px] font-mono text-sky-400 block uppercase">Fleet Deployed</span>
          <span className="text-xl font-bold font-mono text-sky-300">
            {activeRespondersCount} / {liveResponders.length}
          </span>
        </div>
        <div className="bg-[#0C121B] border border-[#182332] rounded-xl p-3">
          <span className="text-[10px] font-mono text-emerald-400 block uppercase">
            Available Beds
          </span>
          <span className="text-xl font-bold font-mono text-emerald-300">{totalBedsAvailable}</span>
        </div>
        <div className="bg-[#0C121B] border border-[#182332] rounded-xl p-3 col-span-2 sm:col-span-1">
          <span className="text-[10px] font-mono text-slate-400 block uppercase">
            Resolved Cases
          </span>
          <span className="text-xl font-bold font-mono text-emerald-400">
            {computedMetrics.resolved}
          </span>
        </div>
      </section>

      {/* 3-Column Command Workspace */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-3.5 items-start">
        {/* Column 1: Incidents Queue */}
        <section
          aria-label="Incident Triage Queue"
          className="lg:col-span-4 xl:col-span-3 bg-[#0C121B] border border-[#182332] rounded-xl p-3.5 flex flex-col space-y-3"
        >
          <div className="flex items-center justify-between pb-2 border-b border-[#182332]">
            <span className="text-xs font-bold text-slate-200 uppercase tracking-wider font-mono">
              Incident Queue
            </span>
            <span className="text-[10px] font-mono text-slate-400 bg-slate-800/80 px-2 py-0.5 rounded border border-slate-700">
              {filteredIncidents.length} Total
            </span>
          </div>

          <div className="flex items-center gap-1 overflow-x-auto pb-1">
            {[
              { id: 'all', label: 'All' },
              { id: 'immediate', label: 'Immediate' },
              { id: 'review', label: 'Review' },
              { id: 'response', label: 'Response' },
              { id: 'resolved', label: 'Resolved' },
            ].map((f) => (
              <button
                key={f.id}
                type="button"
                onClick={() => setActiveIncidentFilter(f.id)}
                className={`px-2 py-1 rounded text-[10px] font-mono font-medium uppercase whitespace-nowrap transition-colors cursor-pointer ${activeIncidentFilter === f.id ? 'bg-slate-700 text-white font-semibold' : 'bg-[#080C12] text-slate-400 border border-[#182332]'}`}
              >
                {f.label}
              </button>
            ))}
          </div>

          {isLoading ? (
            <div className="py-12 text-center text-xs font-mono text-slate-500">
              Syncing incidents...
            </div>
          ) : error && incidents.length === 0 ? (
            <div className="py-6 text-center text-xs font-mono text-amber-400 bg-amber-950/20 border border-amber-500/30 rounded-lg p-3">
              ⚠️ {error}
            </div>
          ) : (
            <div className="space-y-2 max-h-[580px] overflow-y-auto pr-1">
              {filteredIncidents.map((inc) => {
                const isSelected = selectedIncident?.id === inc.id
                const isNew = newlyArrivedId === inc.id
                const sevBadge = getSeverityBadge(inc.severity)
                const statBadge = getStatusBadge(inc.status)
                return (
                  <div
                    key={inc.id}
                    onClick={() => handleSelectIncident(inc)}
                    className={`p-3 rounded-lg border text-left transition-all cursor-pointer ${
                      isSelected
                        ? 'bg-[#121B27] border-blue-500/60 shadow-md ring-1 ring-blue-500/40'
                        : 'bg-[#080C12] border-[#182332] hover:border-slate-700 hover:bg-[#0E1520]'
                    } ${isNew ? 'ring-2 ring-rose-500 animate-pulse' : ''}`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-bold text-slate-200 text-xs">
                        {inc.ticket_id || `SV-${(inc.id || '').slice(-4)}`}
                      </span>
                      <div className="flex items-center gap-1">
                        <span
                          className={`text-[9px] font-mono px-1.5 py-0.2 rounded border ${sevBadge.classes}`}
                        >
                          {sevBadge.label}
                        </span>
                        <span
                          className={`text-[9px] font-mono px-1.5 py-0.2 rounded border ${statBadge.classes}`}
                        >
                          {statBadge.label}
                        </span>
                      </div>
                    </div>
                    <p className="text-[11px] text-slate-400 line-clamp-1 mt-1.5">
                      {inc.description}
                    </p>
                    <div className="flex items-center justify-between text-[10px] text-slate-500 font-mono mt-2 pt-1.5 border-t border-[#182332]/80">
                      <span className="truncate max-w-[140px]">
                        📍 {inc.location_name || 'Sector 12'}
                      </span>
                      <span>
                        {inc.created_at
                          ? new Date(inc.created_at).toLocaleTimeString([], {
                              hour: '2-digit',
                              minute: '2-digit',
                            })
                          : 'Live'}
                      </span>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </section>

        {/* Column 2: Geospatial Tactical Map with Route Polylines */}
        <section
          aria-label="Tactical Operations Map"
          className="lg:col-span-8 xl:col-span-5 bg-[#0C121B] border border-[#182332] rounded-xl p-3.5 flex flex-col justify-between relative min-h-[600px]"
        >
          <div className="flex items-center justify-between pb-2 mb-2 border-b border-[#182332] z-10">
            <span className="text-xs font-bold text-slate-200 font-mono uppercase tracking-wider flex items-center gap-2">
              <span>Geospatial Tactical Map</span>
              {activeRoute && (
                <span className="text-[10px] font-mono text-sky-400 bg-sky-950/60 border border-sky-500/40 px-2 py-0.5 rounded-full">
                  Route Active ({activeRoute.distanceKm} km · {activeRoute.etaFormatted})
                </span>
              )}
            </span>

            <div className="flex items-center gap-1.5 text-[10px] font-mono">
              <button
                type="button"
                onClick={() => setMapLayers((p) => ({ ...p, routes: !p.routes }))}
                className={`px-2 py-0.5 rounded border ${mapLayers.routes ? 'bg-sky-950/60 text-sky-300 border-sky-500/40' : 'bg-[#080C12] text-slate-500 border-[#182332]'}`}
              >
                Routes
              </button>
              <button
                type="button"
                onClick={() => setMapLayers((p) => ({ ...p, incidents: !p.incidents }))}
                className={`px-2 py-0.5 rounded border ${mapLayers.incidents ? 'bg-rose-950/40 text-rose-300 border-rose-500/40' : 'bg-[#080C12] text-slate-500 border-[#182332]'}`}
              >
                Incidents ({incidents.length})
              </button>
              <button
                type="button"
                onClick={() => setMapLayers((p) => ({ ...p, responders: !p.responders }))}
                className={`px-2 py-0.5 rounded border ${mapLayers.responders ? 'bg-blue-950/40 text-blue-300 border-blue-500/40' : 'bg-[#080C12] text-slate-500 border-[#182332]'}`}
              >
                Fleet ({liveResponders.length})
              </button>
            </div>
          </div>

          <div className="relative w-full h-[500px] rounded-lg border border-[#162230] overflow-hidden">
            <SalvusLeafletMap
              center={[22.5726, 88.3639]}
              zoom={13}
              incidents={incidents}
              responders={responderMapPoints}
              shelters={shelterMapPoints}
              selectedIncidentId={selectedIncident?.id}
              onSelectIncident={(inc) => handleSelectIncident(inc)}
              activeRoute={activeRoute}
              previewRoute={previewRoute}
              showLayers={mapLayers}
              className="h-full w-full"
            />
          </div>

          <div className="mt-2.5 bg-[#080C12] px-3 py-1.5 rounded-lg border border-[#182332] flex items-center justify-between text-[10px] text-slate-400 font-mono">
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1">
                <span className="h-2 w-2 rounded-full bg-rose-500"></span>Critical Hazard
              </div>
              <div className="flex items-center gap-1">
                <span className="h-2 w-2 rounded-full bg-sky-400"></span>Rescue Route
              </div>
              <div className="flex items-center gap-1">
                <span className="h-2 w-2 rounded-full bg-blue-400"></span>Rescue Craft
              </div>
              <div className="flex items-center gap-1">
                <span className="h-2 w-2 rounded-full bg-emerald-400"></span>Shelter
              </div>
            </div>
            <span>Tactical OSRM Routing Engine</span>
          </div>
        </section>

        {/* Column 3: Command Inspector & Explainable Allocation Hub */}
        <section
          aria-label="Command Inspector and Resource Hub"
          className="lg:col-span-12 xl:col-span-4 bg-[#0C121B] border border-[#182332] rounded-xl p-3.5 flex flex-col space-y-3 min-h-[600px]"
        >
          <div className="flex items-center justify-between border-b border-[#182332] pb-2">
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setRightPanelTab('inspector')}
                className={`px-2.5 py-1 rounded text-xs font-mono font-bold uppercase transition-colors cursor-pointer ${
                  rightPanelTab === 'inspector'
                    ? 'bg-slate-700 text-white shadow-sm'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Inspector
              </button>
              <button
                type="button"
                onClick={() => setRightPanelTab('fleet')}
                className={`px-2.5 py-1 rounded text-xs font-mono font-bold uppercase transition-colors cursor-pointer ${
                  rightPanelTab === 'fleet'
                    ? 'bg-slate-700 text-white shadow-sm'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Fleet ({liveResponders.length})
              </button>
              <button
                type="button"
                onClick={() => setRightPanelTab('shelters')}
                className={`px-2.5 py-1 rounded text-xs font-mono font-bold uppercase transition-colors cursor-pointer ${
                  rightPanelTab === 'shelters'
                    ? 'bg-slate-700 text-white shadow-sm'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Shelters ({liveShelters.length})
              </button>
            </div>
            <button
              type="button"
              onClick={() => {
                refetch()
                loadFleetAndShelters()
              }}
              className="text-[10px] font-mono text-slate-400 hover:text-slate-200 cursor-pointer"
              title="Refresh all operational feeds"
            >
              ↻ Sync
            </button>
          </div>

          {/* TAB 1: Inspector */}
          {rightPanelTab === 'inspector' && (
            <div className="space-y-3 flex-1 flex flex-col justify-between">
              {selectedIncident ? (
                <div className="space-y-3 text-xs">
                  {/* Header */}
                  <div className="flex items-center justify-between pb-2 border-b border-[#182332]">
                    <div>
                      <span className="text-[10px] font-mono text-slate-400 block">
                        INCIDENT ID
                      </span>
                      <span className="font-mono text-sm font-bold text-slate-100">
                        {selectedIncident.ticket_id || selectedIncident.id}
                      </span>
                    </div>
                    <div className="flex items-center gap-1">
                      <span
                        className={`text-[9px] font-mono px-1.5 py-0.5 rounded border ${getSeverityBadge(selectedIncident.severity).classes}`}
                      >
                        {selectedIncident.severity}
                      </span>
                      <span
                        className={`text-[9px] font-mono px-1.5 py-0.5 rounded border ${getStatusBadge(selectedIncident.status).classes}`}
                      >
                        {selectedIncident.status}
                      </span>
                    </div>
                  </div>

                  {/* Summary */}
                  <div className="bg-[#080C12] border border-[#182332] p-2.5 rounded-lg space-y-1">
                    <span className="text-[10px] font-mono font-semibold text-slate-400 block uppercase">
                      Incident Summary
                    </span>
                    <p className="text-slate-200 leading-relaxed text-[11px]">
                      {selectedIncident.description}
                    </p>
                  </div>

                  {/* Location & Affected */}
                  <div className="grid grid-cols-2 gap-2 text-[10px] font-mono">
                    <div className="bg-[#080C12] border border-[#182332] p-2 rounded-lg">
                      <span className="text-slate-400 block font-medium">LOCATION</span>
                      <span className="text-slate-200 font-semibold truncate block">
                        {selectedIncident.location_name || 'Sector 12, Kolkata'}
                      </span>
                      <span className="text-slate-500 text-[9px] block">
                        {selectedIncident.latitude?.toFixed(4)}°N,{' '}
                        {selectedIncident.longitude?.toFixed(4)}°E
                      </span>
                    </div>
                    <div className="bg-[#080C12] border border-[#182332] p-2 rounded-lg">
                      <span className="text-slate-400 block font-medium">AFFECTED</span>
                      <span className="text-slate-100 font-bold text-xs block">
                        {selectedIncident.affected_count || 1} Persons
                      </span>
                      <span className="text-slate-400 text-[9px] block">
                        Reporter: {selectedIncident.reporter_name || 'Citizen'}
                      </span>
                    </div>
                  </div>

                  {/* AI INCIDENT TRIAGE & DECISION SUPPORT CARD */}
                  <AiTriageAssessmentCard
                    incident={selectedIncident}
                    onVerify={handleVerifyTriage}
                    onAdjust={handleAdjustTriage}
                    onReevaluate={handleReevaluateTriage}
                    isVerifying={isVerifyingTriage}
                    isAnalyzing={isAnalyzingTriage}
                  />

                  {/* EXPLAINABLE ALLOCATION SECTION OR ACTIVE MISSION */}
                  {currentlyAssignedResponder ? (
                    /* Active Mission Display */
                    <div className="bg-[#0A131F] border border-sky-500/40 p-3 rounded-xl space-y-2.5">
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] font-mono font-bold text-sky-300 uppercase tracking-wider flex items-center gap-1.5">
                          <span className="h-2 w-2 rounded-full bg-sky-400 animate-ping"></span>
                          Active Dispatched Unit
                        </span>
                        <span className="text-[9px] font-mono bg-sky-950 text-sky-300 border border-sky-500/50 px-2 py-0.5 rounded font-bold uppercase">
                          {currentlyAssignedResponder.status}
                        </span>
                      </div>

                      <div className="bg-[#060D15] p-2.5 rounded-lg border border-[#182332] space-y-1">
                        <div className="flex items-center justify-between">
                          <span className="font-bold text-slate-100 text-xs">
                            {currentlyAssignedResponder.unit_name}
                          </span>
                          <span className="text-[10px] font-mono text-slate-400">
                            {currentlyAssignedResponder.radio_channel}
                          </span>
                        </div>
                        <p className="text-[10px] text-slate-400 font-mono">
                          Lead: {currentlyAssignedResponder.team_lead} · Craft:{' '}
                          {currentlyAssignedResponder.vehicle_type}
                        </p>
                        <div className="flex items-center justify-between text-[10px] font-mono text-sky-300 pt-1 border-t border-[#182332]">
                          <span>Distance: {activeRoute?.distanceKm || '1.2'} km</span>
                          <span>ETA: {activeRoute?.etaFormatted || '4 min'}</span>
                        </div>
                      </div>

                      {/* Journey Progression Buttons */}
                      <div className="space-y-1.5 pt-1">
                        <span className="text-[10px] font-mono text-slate-400 block font-semibold uppercase">
                          Operational Journey Lifecycle
                        </span>
                        <div className="grid grid-cols-4 gap-1 text-[9px] font-mono font-bold">
                          <button
                            type="button"
                            onClick={() => handleAdvanceLifecycle('EN_ROUTE')}
                            className={`py-1.5 rounded border transition-colors cursor-pointer ${currentlyAssignedResponder.status === 'EN_ROUTE' ? 'bg-sky-600 text-white border-sky-400' : 'bg-slate-800 hover:bg-slate-700 text-slate-300 border-slate-700'}`}
                          >
                            EN ROUTE
                          </button>
                          <button
                            type="button"
                            onClick={() => handleAdvanceLifecycle('NEARBY')}
                            className={`py-1.5 rounded border transition-colors cursor-pointer ${currentlyAssignedResponder.status === 'NEARBY' ? 'bg-amber-600 text-white border-amber-400' : 'bg-slate-800 hover:bg-slate-700 text-slate-300 border-slate-700'}`}
                          >
                            NEARBY
                          </button>
                          <button
                            type="button"
                            onClick={() => handleAdvanceLifecycle('ON_SCENE')}
                            className={`py-1.5 rounded border transition-colors cursor-pointer ${currentlyAssignedResponder.status === 'ON_SCENE' ? 'bg-indigo-600 text-white border-indigo-400' : 'bg-slate-800 hover:bg-slate-700 text-slate-300 border-slate-700'}`}
                          >
                            ON SCENE
                          </button>
                          <button
                            type="button"
                            onClick={() => handleAdvanceLifecycle('AVAILABLE')}
                            className="py-1.5 rounded border bg-emerald-700 hover:bg-emerald-600 text-white border-emerald-500 transition-colors cursor-pointer"
                          >
                            RESOLVE
                          </button>
                        </div>

                        {/* GPS Movement Simulation Controls */}
                        <div className="mt-2 bg-[#060D15] p-2 rounded-lg border border-[#182332] flex items-center justify-between text-[10px] font-mono">
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={toggleMovementSimulation}
                              className={`px-2.5 py-1 rounded font-bold uppercase transition-colors cursor-pointer ${
                                isSimulatingMovement
                                  ? 'bg-rose-600 hover:bg-rose-500 text-white'
                                  : 'bg-blue-600 hover:bg-blue-500 text-white'
                              }`}
                            >
                              {isSimulatingMovement ? '⏸ Pause GPS' : '▶ Simulate GPS Telemetry'}
                            </button>
                            {isSimulatingMovement && (
                              <span className="h-2 w-2 rounded-full bg-emerald-400 animate-ping"></span>
                            )}
                          </div>

                          <div className="flex items-center gap-1 text-slate-400">
                            <span>Speed:</span>
                            {[1, 2, 5].map((speed) => (
                              <button
                                key={speed}
                                type="button"
                                onClick={() => setSimulationSpeedMultiplier(speed)}
                                className={`px-1.5 py-0.5 rounded text-[9px] font-mono font-bold cursor-pointer ${
                                  simulationSpeedMultiplier === speed
                                    ? 'bg-slate-700 text-white'
                                    : 'bg-slate-900 text-slate-500 border border-slate-800'
                                }`}
                              >
                                {speed}x
                              </button>
                            ))}
                          </div>
                        </div>
                      </div>
                    </div>
                  ) : (
                    /* Explainable Recommendation & Alternatives */
                    <div className="bg-[#080C12] border border-[#182332] p-3 rounded-xl space-y-3">
                      <div className="flex items-center justify-between border-b border-[#182332] pb-1.5">
                        <span className="text-[10px] font-mono font-bold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
                          <span className="h-1.5 w-1.5 rounded-full bg-blue-400"></span>
                          Explainable Responder Allocation
                        </span>
                        <span className="text-[9px] font-mono text-slate-500">
                          Deterministic Scoring Engine
                        </span>
                      </div>

                      {isLoadingCandidates ? (
                        <div className="py-6 text-center text-xs font-mono text-slate-500">
                          Calculating optimal routing vectors & scores...
                        </div>
                      ) : topRecommendedCandidate ? (
                        <div className="space-y-2.5">
                          {/* Recommended Primary Unit Hero Card */}
                          <div className="bg-[#0F1A2A] border border-blue-500/50 p-3 rounded-lg space-y-2 relative overflow-hidden">
                            <div className="flex items-start justify-between gap-2">
                              <div>
                                <span className="text-[9px] font-mono font-bold uppercase tracking-wider text-sky-400 bg-sky-950/80 px-1.5 py-0.5 rounded border border-sky-500/40">
                                  ★ RECOMMENDED UNIT
                                </span>
                                <h4 className="font-bold text-slate-100 text-xs mt-1">
                                  {topRecommendedCandidate.unit_name}
                                </h4>
                                <p className="text-[10px] text-slate-300 font-mono">
                                  {topRecommendedCandidate.team_lead} ·{' '}
                                  {topRecommendedCandidate.vehicle_type}
                                </p>
                              </div>

                              <div className="text-right">
                                <div className="bg-blue-950 text-blue-300 border border-blue-400/60 px-2 py-1 rounded-md text-center font-mono">
                                  <span className="text-xs font-bold block leading-none">
                                    {topRecommendedCandidate.match_score}
                                  </span>
                                  <span className="text-[8px] text-slate-400 uppercase">
                                    Score / 100
                                  </span>
                                </div>
                              </div>
                            </div>

                            {/* Deterministic Justification Bullets */}
                            <div className="bg-[#070E18] p-2 rounded border border-slate-800/80 space-y-1">
                              <span className="text-[9px] font-mono font-bold text-slate-400 uppercase block">
                                Why Salvus Selected This Unit:
                              </span>
                              <div className="space-y-0.5 text-[10px] font-mono text-slate-200">
                                {topRecommendedCandidate.explanation?.positive_factors?.map(
                                  (fact, idx) => (
                                    <div
                                      key={idx}
                                      className="text-emerald-300 flex items-start gap-1"
                                    >
                                      <span>{fact}</span>
                                    </div>
                                  )
                                )}
                                {topRecommendedCandidate.explanation?.negative_factors?.map(
                                  (fact, idx) => (
                                    <div
                                      key={idx}
                                      className="text-amber-400 flex items-start gap-1"
                                    >
                                      <span>{fact}</span>
                                    </div>
                                  )
                                )}
                              </div>
                            </div>

                            {/* Breakdown Toggle */}
                            <div className="pt-1">
                              <button
                                type="button"
                                onClick={() => setShowScoreBreakdown((p) => !p)}
                                className="text-[10px] font-mono text-sky-400 hover:text-sky-300 flex items-center justify-between w-full cursor-pointer"
                              >
                                <span>
                                  {showScoreBreakdown
                                    ? '▼ Hide Score Formula Breakdown'
                                    : '▶ Inspect Formula Breakdown'}
                                </span>
                                <span className="text-slate-500 font-normal">Audit Trail</span>
                              </button>

                              {showScoreBreakdown &&
                                topRecommendedCandidate.explanation?.breakdown && (
                                  <div className="mt-2 p-2 bg-[#04080E] rounded border border-slate-800 text-[9px] font-mono space-y-1.5 text-slate-300">
                                    <div className="flex justify-between">
                                      <span>Capability Match (Max 35):</span>
                                      <span className="text-sky-300 font-bold">
                                        {
                                          topRecommendedCandidate.explanation.breakdown
                                            .capability_score
                                        }{' '}
                                        pts
                                      </span>
                                    </div>
                                    <div className="flex justify-between">
                                      <span>Severity Alignment (Max 20):</span>
                                      <span className="text-sky-300 font-bold">
                                        {
                                          topRecommendedCandidate.explanation.breakdown
                                            .severity_alignment
                                        }{' '}
                                        pts
                                      </span>
                                    </div>
                                    <div className="flex justify-between">
                                      <span>Operational Availability (Max 20):</span>
                                      <span className="text-sky-300 font-bold">
                                        {
                                          topRecommendedCandidate.explanation.breakdown
                                            .availability_score
                                        }{' '}
                                        pts
                                      </span>
                                    </div>
                                    <div className="flex justify-between">
                                      <span>Spatial Proximity (Max 15):</span>
                                      <span className="text-sky-300 font-bold">
                                        {
                                          topRecommendedCandidate.explanation.breakdown
                                            .proximity_score
                                        }{' '}
                                        pts
                                      </span>
                                    </div>
                                    <div className="flex justify-between">
                                      <span>Workload Penalty (Max -10):</span>
                                      <span className="text-rose-400 font-bold">
                                        -
                                        {
                                          topRecommendedCandidate.explanation.breakdown
                                            .workload_penalty
                                        }{' '}
                                        pts
                                      </span>
                                    </div>
                                    <div className="flex justify-between border-t border-slate-800 pt-1 font-bold text-slate-100">
                                      <span>Total Auditable Score:</span>
                                      <span className="text-emerald-400">
                                        {topRecommendedCandidate.match_score} / 100
                                      </span>
                                    </div>
                                  </div>
                                )}
                            </div>

                            {/* Assign Button */}
                            <button
                              type="button"
                              disabled={
                                isAssigningUnit || topRecommendedCandidate.status === 'OFFLINE'
                              }
                              onClick={() => handleDispatchResponder(topRecommendedCandidate.id)}
                              className="w-full py-2 px-3 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-mono text-xs font-bold uppercase tracking-wider transition-colors cursor-pointer disabled:opacity-50 shadow-md flex items-center justify-center gap-1.5"
                            >
                              {isAssigningUnit ? (
                                'Dispatching...'
                              ) : (
                                <>
                                  <span>
                                    🚀 ASSIGN & DISPATCH{' '}
                                    {topRecommendedCandidate.unit_name.split(' ')[0]}
                                  </span>
                                </>
                              )}
                            </button>
                          </div>

                          {/* Top 3 Alternative Candidates */}
                          <div className="space-y-1.5 pt-1">
                            <span className="text-[10px] font-mono font-bold text-slate-400 uppercase block">
                              Alternative Candidates & Operator Override:
                            </span>

                            <div className="space-y-1.5 max-h-40 overflow-y-auto pr-0.5">
                              {alternativeCandidates.map((cand, idx) => (
                                <div
                                  key={cand.id}
                                  onMouseEnter={() => {
                                    if (cand.route_geometry && cand.route_geometry.length > 0) {
                                      setPreviewRoute({
                                        coordinates: cand.route_geometry,
                                        color: '#f59e0b',
                                        label: `${cand.unit_name} Route`,
                                      })
                                    }
                                  }}
                                  onMouseLeave={() => setPreviewRoute(null)}
                                  className={`p-2 rounded-lg border text-[10px] transition-colors flex items-center justify-between gap-2 ${
                                    cand.is_recommended
                                      ? 'bg-[#0E1520] border-blue-500/30'
                                      : 'bg-[#060A0E] border-[#182332] hover:border-slate-700'
                                  }`}
                                >
                                  <div>
                                    <div className="flex items-center gap-1.5">
                                      <span className="font-mono font-bold text-slate-400 text-[9px]">
                                        #{idx + 1}
                                      </span>
                                      <span className="font-bold text-slate-200">
                                        {cand.unit_name}
                                      </span>
                                    </div>
                                    <span className="text-[9px] text-slate-400 font-mono block">
                                      {cand.distance_km || cand.distanceKm} km ·{' '}
                                      {cand.eta_formatted || '4 min'} · {cand.status}
                                    </span>
                                  </div>

                                  <div className="flex items-center gap-2">
                                    <span className="font-mono font-bold text-xs text-sky-300">
                                      {cand.match_score || cand.matchScore}
                                    </span>
                                    {!cand.is_recommended && (
                                      <button
                                        type="button"
                                        disabled={isAssigningUnit}
                                        onClick={() => handleDispatchResponder(cand.id)}
                                        className="py-1 px-2 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 font-mono text-[9px] font-bold uppercase transition-colors cursor-pointer"
                                      >
                                        Assign
                                      </button>
                                    )}
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        </div>
                      ) : (
                        <div className="py-6 text-center text-xs font-mono text-slate-500">
                          No active candidate units available for dispatch.
                        </div>
                      )}
                    </div>
                  )}

                  {/* Shelters */}
                  <div className="bg-[#080C12] border border-[#182332] p-2.5 rounded-lg space-y-1.5">
                    <span className="text-[10px] font-mono font-bold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
                      <span className="h-1.5 w-1.5 rounded-full bg-emerald-400"></span>
                      Evacuation Shelter Reception
                    </span>
                    <div className="space-y-1.5">
                      {candidateShelters.map((shl) => (
                        <div
                          key={shl.id}
                          className="bg-[#060A0E] border border-[#182332] p-2 rounded-lg flex items-center justify-between text-[10px]"
                        >
                          <div>
                            <span className="font-semibold text-slate-200 block truncate max-w-[180px]">
                              {shl.name}
                            </span>
                            <span className="text-[9px] text-slate-400 block mt-0.5">
                              {shl.distanceKm} km · ~{shl.walkMin} min walk
                            </span>
                          </div>
                          <div className="text-right">
                            <span className="font-bold text-emerald-400 block font-mono">
                              {shl.available_beds ?? 0} beds free
                            </span>
                            <span className="text-[9px] text-slate-500 font-mono">
                              {shl.occupancy_rate} occ
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {actionSuccessMessage && (
                    <div className="bg-emerald-950/40 border border-emerald-500/40 text-emerald-300 p-2 rounded-lg text-center font-mono text-[11px] animate-fadeIn">
                      {actionSuccessMessage}
                    </div>
                  )}
                </div>
              ) : (
                <div className="py-16 text-center text-xs font-mono text-slate-500">
                  Select an incident from the queue or tactical map to inspect candidates and
                  routing vectors.
                </div>
              )}

              {/* Action Decision Toolbar */}
              {selectedIncident && (
                <div className="pt-2 border-t border-[#182332] space-y-1.5">
                  {selectedIncident.status === 'NEW' && (
                    <button
                      type="button"
                      disabled={isUpdatingStatus}
                      onClick={() => handleTransition('TRIAGE_PENDING', 'Pending AI Triage')}
                      className="w-full py-2 px-3 rounded-lg bg-amber-600 hover:bg-amber-500 text-slate-950 font-bold font-mono text-xs uppercase transition-colors cursor-pointer disabled:opacity-50"
                    >
                      {isUpdatingStatus ? 'Processing...' : '▶ Initiate Triage Queue'}
                    </button>
                  )}

                  {selectedIncident.status === 'TRIAGE_PENDING' && (
                    <button
                      type="button"
                      disabled={isUpdatingStatus}
                      onClick={() => handleTransition('VERIFIED', 'Verified Distress')}
                      className="w-full py-2 px-3 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-bold font-mono text-xs uppercase transition-colors cursor-pointer disabled:opacity-50"
                    >
                      {isUpdatingStatus ? 'Processing...' : '✓ Verify Distress'}
                    </button>
                  )}

                  {selectedIncident.status === 'VERIFIED' && (
                    <button
                      type="button"
                      disabled={isUpdatingStatus}
                      onClick={() => handleTransition('RESOLVED', 'Safe Rescue & Resolved')}
                      className="w-full py-2 px-3 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold font-mono text-xs uppercase transition-colors cursor-pointer disabled:opacity-50"
                    >
                      {isUpdatingStatus ? 'Processing...' : '✓ Confirm Rescue & Resolve'}
                    </button>
                  )}

                  {!['RESOLVED', 'CANCELLED'].includes(selectedIncident.status) && (
                    <button
                      type="button"
                      disabled={isUpdatingStatus}
                      onClick={() => handleTransition('CANCELLED', 'Cancellation')}
                      className="w-full py-1.5 px-3 rounded-lg bg-slate-800/80 hover:bg-slate-700 text-slate-400 hover:text-slate-200 border border-slate-700 text-[10px] font-mono uppercase transition-colors cursor-pointer disabled:opacity-50"
                    >
                      Stand Down / Cancel Ticket
                    </button>
                  )}

                  {selectedIncident.status === 'RESOLVED' && (
                    <div className="bg-emerald-950/20 border border-emerald-500/20 p-2 rounded-lg text-center text-xs font-mono text-emerald-300">
                      ✓ Incident Safely Resolved & Archived
                    </div>
                  )}

                  {selectedIncident.status === 'CANCELLED' && (
                    <div className="bg-slate-900 border border-slate-800 p-2 rounded-lg text-center text-xs font-mono text-slate-400">
                      🛑 Incident Cancelled & Stood Down
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* TAB 2: Fleet */}
          {rightPanelTab === 'fleet' && (
            <div className="space-y-2.5 flex-1 flex flex-col justify-between overflow-y-auto pr-1">
              <div className="space-y-2">
                <div className="grid grid-cols-2 gap-1.5 text-[10px] font-mono">
                  <select
                    value={fleetCapabilityFilter}
                    onChange={(e) => setFleetCapabilityFilter(e.target.value)}
                    className="bg-[#080C12] border border-[#182332] text-slate-300 p-1.5 rounded"
                  >
                    <option value="all">All Capabilities</option>
                    <option value="FLOOD_BOAT">Flood Boat</option>
                    <option value="AMBULANCE">Ambulance</option>
                    <option value="STRETCHER_TEAM">Stretcher Team</option>
                    <option value="HAZMAT">Hazmat / Grid</option>
                  </select>

                  <select
                    value={fleetStatusFilter}
                    onChange={(e) => setFleetStatusFilter(e.target.value)}
                    className="bg-[#080C12] border border-[#182332] text-slate-300 p-1.5 rounded"
                  >
                    <option value="all">All Statuses</option>
                    <option value="AVAILABLE">Available</option>
                    <option value="ASSIGNED">Assigned</option>
                    <option value="EN_ROUTE">En Route</option>
                    <option value="NEARBY">Nearby</option>
                    <option value="ON_SCENE">On Scene</option>
                    <option value="OFFLINE">Offline</option>
                  </select>
                </div>

                {isLoadingFleet ? (
                  <div className="py-12 text-center text-xs font-mono text-slate-500">
                    Syncing fleet telemetry...
                  </div>
                ) : filteredFleet.length === 0 ? (
                  <div className="py-12 text-center text-xs font-mono text-slate-500">
                    No response units match filter.
                  </div>
                ) : (
                  filteredFleet.map((resp) => {
                    const isSelected = selectedResponderDetail?.id === resp.id
                    return (
                      <div
                        key={resp.id}
                        onClick={() => setSelectedResponderDetail(resp)}
                        className={`bg-[#080C12] border p-2.5 rounded-lg text-xs space-y-1.5 cursor-pointer transition-colors ${
                          isSelected
                            ? 'border-blue-500/60 bg-[#121B27]'
                            : 'border-[#182332] hover:border-slate-700'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-semibold text-slate-200 text-[11px] truncate max-w-[150px]">
                            {resp.unit_name}
                          </span>
                          <span
                            className={`text-[9px] font-mono px-1.5 py-0.2 rounded font-semibold border ${
                              resp.status === 'AVAILABLE'
                                ? 'bg-emerald-950/40 text-emerald-300 border-emerald-500/30'
                                : resp.status === 'ASSIGNED' || resp.status === 'EN_ROUTE'
                                  ? 'bg-blue-950/40 text-blue-300 border-blue-500/30'
                                  : resp.status === 'ON_SCENE'
                                    ? 'bg-indigo-950/40 text-indigo-300 border-indigo-500/30'
                                    : 'bg-slate-800 text-slate-400 border-slate-700'
                            }`}
                          >
                            {resp.status}
                          </span>
                        </div>
                        <p className="text-[10px] text-slate-400 font-mono">
                          {resp.team_lead} · {resp.vehicle_type}
                        </p>
                        <div className="flex items-center justify-between text-[9px] text-slate-500 font-mono pt-1 border-t border-[#182332]">
                          <span>{resp.radio_channel}</span>
                          <span>
                            Load: {resp.current_load} / {resp.max_capacity}
                          </span>
                        </div>
                      </div>
                    )
                  })
                )}
              </div>

              {selectedResponderDetail && (
                <div className="bg-[#080C12] border border-blue-500/30 p-3 rounded-xl text-xs space-y-2 mt-2">
                  <div className="flex items-center justify-between border-b border-[#182332] pb-1.5">
                    <span className="font-bold text-slate-100 font-mono text-xs">
                      {selectedResponderDetail.unit_name}
                    </span>
                    <button
                      type="button"
                      onClick={() => setSelectedResponderDetail(null)}
                      className="text-slate-400 hover:text-white font-mono text-xs p-0.5 cursor-pointer"
                    >
                      ✕
                    </button>
                  </div>
                  <div className="grid grid-cols-2 gap-1.5 text-[10px] font-mono text-slate-300">
                    <div>
                      <span className="text-slate-500 block">CAPABILITY</span>
                      <span>{selectedResponderDetail.capability}</span>
                    </div>
                    <div>
                      <span className="text-slate-500 block">RADIO CHANNEL</span>
                      <span>{selectedResponderDetail.radio_channel}</span>
                    </div>
                    <div>
                      <span className="text-slate-500 block">POSITION</span>
                      <span>
                        {selectedResponderDetail.latitude?.toFixed(4)}°N,{' '}
                        {selectedResponderDetail.longitude?.toFixed(4)}°E
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-500 block">CURRENT LOAD</span>
                      <span>
                        {selectedResponderDetail.current_load} /{' '}
                        {selectedResponderDetail.max_capacity}
                      </span>
                    </div>
                  </div>
                  {selectedResponderDetail.assigned_incident_id && (
                    <div className="bg-[#121B27] p-1.5 rounded text-[10px] font-mono text-blue-300">
                      Assigned to Ticket #{selectedResponderDetail.assigned_incident_id}
                    </div>
                  )}
                  <div className="grid grid-cols-3 gap-1 pt-1">
                    <button
                      type="button"
                      onClick={async () => {
                        await updateResponderStatus(selectedResponderDetail.id, 'AVAILABLE', null)
                        loadFleetAndShelters()
                        setSelectedResponderDetail((p) =>
                          p ? { ...p, status: 'AVAILABLE', assigned_incident_id: null } : null
                        )
                      }}
                      className="py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 text-[9px] font-mono uppercase cursor-pointer"
                    >
                      Set Available
                    </button>
                    <button
                      type="button"
                      onClick={async () => {
                        await updateResponderStatus(selectedResponderDetail.id, 'ON_SCENE')
                        loadFleetAndShelters()
                        setSelectedResponderDetail((p) => (p ? { ...p, status: 'ON_SCENE' } : null))
                      }}
                      className="py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 text-[9px] font-mono uppercase cursor-pointer"
                    >
                      Set On Scene
                    </button>
                    <button
                      type="button"
                      onClick={async () => {
                        await updateResponderStatus(selectedResponderDetail.id, 'OFFLINE')
                        loadFleetAndShelters()
                        setSelectedResponderDetail((p) => (p ? { ...p, status: 'OFFLINE' } : null))
                      }}
                      className="py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 text-[9px] font-mono uppercase cursor-pointer"
                    >
                      Set Offline
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* TAB 3: Shelters */}
          {rightPanelTab === 'shelters' && (
            <div className="space-y-2 flex-1 overflow-y-auto pr-1">
              <div className="flex items-center justify-between pb-1 text-[10px] font-mono text-slate-400">
                <span>EVACUATION HUBS</span>
                <span>CAPACITY</span>
              </div>

              {liveShelters.map((shl) => {
                const avail = shl.available_beds ?? 0
                const total = shl.total_beds || 1
                const occ = shl.occupancy_rate || `${Math.round(((total - avail) / total) * 100)}%`
                const supplies = shl.supplies_status || 'Adequate'

                return (
                  <div
                    key={shl.id}
                    className="bg-[#080C12] border border-[#182332] p-2.5 rounded-lg text-xs space-y-2"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-slate-200 text-[11px] truncate max-w-[150px]">
                        {shl.name}
                      </span>
                      <span
                        className={`text-[9px] font-mono px-1.5 py-0.2 rounded font-bold border ${
                          shl.status === 'OPEN'
                            ? 'bg-emerald-950/40 text-emerald-300 border-emerald-500/30'
                            : shl.status === 'NEAR_CAPACITY'
                              ? 'bg-amber-950/40 text-amber-300 border-amber-500/30'
                              : 'bg-rose-950/40 text-rose-300 border-rose-500/30'
                        }`}
                      >
                        {shl.status}
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-[10px] font-mono">
                      <span className="text-emerald-400 font-bold">{avail} beds available</span>
                      <span className="text-slate-400">Total: {total}</span>
                    </div>
                    <div className="w-full bg-[#121B27] h-1.5 rounded-full overflow-hidden border border-[#182332]">
                      <div
                        className={`h-full ${shl.status === 'NEAR_CAPACITY' ? 'bg-amber-500' : 'bg-emerald-500'}`}
                        style={{ width: occ }}
                      ></div>
                    </div>
                    <div className="flex items-center justify-between text-[9px] text-slate-400 font-mono">
                      <span>Occupancy: {occ}</span>
                      <span className="truncate max-w-[130px]">Rations: {supplies}</span>
                    </div>
                    <div className="flex items-center justify-between pt-1 border-t border-[#182332] text-[9px] font-mono">
                      <span className="text-slate-500">Quick Intake:</span>
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => handleAdjustBeds(shl.id, avail, -25)}
                          className="px-1.5 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 cursor-pointer"
                        >
                          +25 Occupants
                        </button>
                        <button
                          type="button"
                          onClick={() => handleAdjustBeds(shl.id, avail, 25)}
                          className="px-1.5 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 cursor-pointer"
                        >
                          -25 Released
                        </button>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </section>
      </div>
    </div>
  )
}

export default AuthorityCommandCenter
