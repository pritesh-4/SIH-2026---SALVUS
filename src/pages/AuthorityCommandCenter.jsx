import { useState, useMemo, useEffect, useCallback } from 'react'
import { authorityData } from '../data/authority/authorityMock'
import { useAuthorityIncidents } from '../features/authority/useAuthorityIncidents'
import { SalvusLeafletMap } from '../components/common/SalvusLeafletMap'
import {
  fetchResponders,
  fetchShelters,
  assignResponder,
  updateResponderStatus,
  updateShelterOccupancy,
} from '../services/api'
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
  })
  const [actionSuccessMessage, setActionSuccessMessage] = useState(null)
  const [isAssigningUnit, setIsAssigningUnit] = useState(false)

  const [fleetCapabilityFilter, setFleetCapabilityFilter] = useState('all')
  const [fleetStatusFilter, setFleetStatusFilter] = useState('all')
  const [selectedResponderDetail, setSelectedResponderDetail] = useState(null)

  const [liveResponders, setLiveResponders] = useState([])
  const [liveShelters, setLiveShelters] = useState([])
  const [isLoadingFleet, setIsLoadingFleet] = useState(true)
  const [dataProvenance, setDataProvenance] = useState('LIVE')

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
        return ['VERIFIED', 'ASSIGNED', 'EN_ROUTE', 'ON_SCENE'].includes(inc.status)
      }
      if (activeIncidentFilter === 'resolved') {
        return ['RESOLVED', 'CANCELLED'].includes(inc.status)
      }
      return true
    })
  }, [incidents, activeIncidentFilter])

  const handleSelectIncident = (inc) => {
    setSelectedIncident(inc)
    setRightPanelTab('inspector')
  }

  const handleTransition = async (targetStatus, label) => {
    if (!selectedIncident) return

    const result = await changeStatus(selectedIncident.id, targetStatus)
    if (result.success) {
      setActionSuccessMessage(`✓ Status updated: ${label}`)
      setTimeout(() => setActionSuccessMessage(null), 3000)
    }
  }

  const handleDispatchResponder = async (responderId) => {
    if (!selectedIncident) return

    setIsAssigningUnit(true)
    const result = await assignResponder(responderId, selectedIncident.id, 'ASSIGNED', 'authority')
    setIsAssigningUnit(false)

    if (result.success) {
      setActionSuccessMessage(
        `✓ Dispatched ${result.data.unit_name} to #${selectedIncident.ticket_id}`
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

  const handleAdjustBeds = async (shelterId, currentAvail, delta) => {
    const newAvail = Math.max(0, currentAvail + delta)
    const result = await updateShelterOccupancy(shelterId, newAvail)
    if (result.success) {
      setLiveShelters((prev) =>
        prev.map((s) => (s.id === shelterId ? { ...s, ...result.data } : s))
      )
    }
  }

  const candidateResponders = useMemo(() => {
    if (!selectedIncident || !liveResponders.length) return []

    const incLat = selectedIncident.latitude || 22.5726
    const incLon = selectedIncident.longitude || 88.3639
    const incType = (selectedIncident.type || '').toLowerCase()

    const list = liveResponders.map((resp) => {
      const distKm = calculateDistanceKm(incLat, incLon, resp.latitude, resp.longitude)

      let capScore = 50
      let matchReason = 'General Auxiliary Support'

      if (incType === 'flood') {
        if (resp.capability === 'FLOOD_BOAT') {
          capScore = 95
          matchReason = 'Specialized Flood Watercraft'
        } else if (resp.capability === 'AMBULANCE') {
          capScore = 70
          matchReason = 'Medical Evacuation Support'
        } else if (resp.capability === 'STRETCHER_TEAM') {
          capScore = 65
          matchReason = 'Shallow Water Extraction'
        }
      } else if (incType === 'medical') {
        if (resp.capability === 'AMBULANCE') {
          capScore = 95
          matchReason = 'Primary Advanced Life Support'
        } else if (resp.capability === 'STRETCHER_TEAM') {
          capScore = 85
          matchReason = 'Stretcher Patient Transfer'
        } else if (resp.capability === 'FLOOD_BOAT') {
          capScore = 60
          matchReason = 'Amphibious Medical Transit'
        }
      } else if (incType === 'power_line' || incType === 'hazard' || incType === 'fire') {
        if (resp.capability === 'HAZMAT' || resp.capability === 'DEBRIS_CLEAR') {
          capScore = 95
          matchReason = 'Hazard Mitigation & Isolation'
        } else if (resp.capability === 'STRETCHER_TEAM') {
          capScore = 75
          matchReason = 'Perimeter Safety & Evacuation'
        }
      }

      let statusBonus = 0
      if (resp.status === 'AVAILABLE') statusBonus = 30
      else if (resp.status === 'NEARBY') statusBonus = 20
      else if (resp.status === 'EN_ROUTE') statusBonus = 10
      else if (resp.status === 'ASSIGNED' || resp.status === 'ON_SCENE') statusBonus = -20
      else if (resp.status === 'OFFLINE') statusBonus = -100

      const distPenalty = Math.min(40, Math.round(distKm * 5))
      const loadPenalty = Math.round((resp.current_load / Math.max(1, resp.max_capacity)) * 20)

      const totalScore = Math.max(0, capScore + statusBonus - distPenalty - loadPenalty)

      return {
        ...resp,
        distanceKm: distKm,
        matchScore: totalScore,
        matchReason,
        isAssignedToThis: resp.assigned_incident_id === selectedIncident.id,
      }
    })

    list.sort((a, b) => {
      if (a.isAssignedToThis) return -1
      if (b.isAssignedToThis) return 1
      return b.matchScore - a.matchScore || a.distanceKm - b.distanceKm
    })

    return list
  }, [selectedIncident, liveResponders])

  const currentlyAssignedResponder = useMemo(() => {
    if (!selectedIncident) return null
    return liveResponders.find((r) => r.assigned_incident_id === selectedIncident.id) || null
  }, [selectedIncident, liveResponders])

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
          classes: 'bg-indigo-950/40 text-indigo-300 border-indigo-500/40',
        }
      case 'EN_ROUTE':
        return { label: 'EN ROUTE', classes: 'bg-blue-950/40 text-blue-300 border-blue-500/40' }
      case 'ON_SCENE':
        return {
          label: 'ON SCENE',
          classes: 'bg-emerald-950/40 text-emerald-300 border-emerald-500/40',
        }
      case 'RESOLVED':
        return { label: 'RESOLVED', classes: 'bg-slate-800 text-slate-300 border-slate-700' }
      case 'CANCELLED':
        return { label: 'CANCELLED', classes: 'bg-slate-800 text-slate-400 border-slate-700' }
      default:
        return {
          label: status || 'UNKNOWN',
          classes: 'bg-slate-800 text-slate-300 border-slate-700',
        }
    }
  }

  const getSeverityBadge = (severity) => {
    switch (severity) {
      case 'CRITICAL':
        return { label: 'CRITICAL', classes: 'bg-rose-950/50 text-rose-300 border-rose-500/50' }
      case 'HIGH':
        return { label: 'HIGH', classes: 'bg-amber-950/40 text-amber-300 border-amber-500/40' }
      case 'MEDIUM':
        return { label: 'MEDIUM', classes: 'bg-slate-800 text-slate-300 border-slate-700' }
      case 'LOW':
        return { label: 'LOW', classes: 'bg-slate-800 text-slate-400 border-slate-700' }
      default:
        return {
          label: severity || 'NORMAL',
          classes: 'bg-slate-800 text-slate-400 border-slate-700',
        }
    }
  }

  return (
    <div className="max-w-[1600px] w-full mx-auto px-3 sm:px-6 lg:px-8 py-3 sm:py-4 animate-fadeIn space-y-3 font-sans">
      {/* Top Operations Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2.5 border-b border-[#182332]">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-blue-500"></span>
            <span className="text-xs font-mono font-semibold tracking-wider text-slate-200 uppercase">
              {hub.name}
            </span>
          </div>
          <span className="text-slate-600">·</span>
          <span className="text-xs font-mono text-slate-400">{hub.sector}</span>
        </div>
        <div className="flex items-center gap-2 text-xs font-mono">
          {dataProvenance === 'LIVE' ? (
            <span className="bg-emerald-950/50 border border-emerald-500/40 text-emerald-400 text-[10px] font-mono px-2 py-0.5 rounded font-semibold flex items-center gap-1.5">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400"></span>LIVE GRID API
            </span>
          ) : dataProvenance === 'SIMULATED' ? (
            <span className="bg-purple-950/50 border border-purple-500/40 text-purple-300 text-[10px] font-mono px-2 py-0.5 rounded font-semibold flex items-center gap-1.5">
              <span className="h-1.5 w-1.5 rounded-full bg-purple-400"></span>SIMULATED DEMO
            </span>
          ) : (
            <span className="bg-amber-950/50 border border-amber-500/40 text-amber-400 text-[10px] font-mono px-2 py-0.5 rounded font-semibold flex items-center gap-1.5">
              <span className="h-1.5 w-1.5 rounded-full bg-amber-400"></span>CACHED GRID DATA
            </span>
          )}
          <span className="text-slate-600">·</span>
          <span className="text-slate-400">Flood Threat Active</span>
        </div>
      </div>

      {/* Top 4 Essential KPIs */}
      <section aria-label="Operational Metrics" className="grid grid-cols-2 lg:grid-cols-4 gap-2.5">
        <div
          className={`bg-[#0C121B] border p-3 rounded-lg flex flex-col justify-between transition-colors ${computedMetrics.criticalThreats > 0 ? 'border-rose-500/40' : 'border-[#182332]'}`}
        >
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-mono font-medium uppercase text-slate-400">
              Critical Threats
            </span>
            <span
              className={`h-1.5 w-1.5 rounded-full ${computedMetrics.criticalThreats > 0 ? 'bg-rose-500' : 'bg-slate-600'}`}
            ></span>
          </div>
          <div className="mt-1 flex items-baseline gap-2">
            <span
              className={`text-2xl font-bold font-mono ${computedMetrics.criticalThreats > 0 ? 'text-rose-400' : 'text-slate-200'}`}
            >
              {computedMetrics.criticalThreats}
            </span>
            <span className="text-[10px] text-slate-500 font-mono">Immediate Action</span>
          </div>
        </div>

        <div className="bg-[#0C121B] border border-[#182332] p-3 rounded-lg flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-mono font-medium uppercase text-slate-400">
              Active Incidents
            </span>
            <span className="h-1.5 w-1.5 rounded-full bg-slate-400"></span>
          </div>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="text-2xl font-bold text-slate-100 font-mono">
              {computedMetrics.activeIncidents}
            </span>
            <span className="text-[10px] text-slate-500 font-mono">Triage Queue</span>
          </div>
        </div>

        <div className="bg-[#0C121B] border border-[#182332] p-3 rounded-lg flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-mono font-medium uppercase text-slate-400">
              Responders Deployed
            </span>
            <span className="h-1.5 w-1.5 rounded-full bg-blue-400"></span>
          </div>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="text-2xl font-bold text-slate-100 font-mono">
              {activeRespondersCount}{' '}
              <span className="text-sm font-normal text-slate-500">/ {liveResponders.length}</span>
            </span>
            <span className="text-[10px] text-slate-500 font-mono">Units Active</span>
          </div>
        </div>

        <div className="bg-[#0C121B] border border-[#182332] p-3 rounded-lg flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-mono font-medium uppercase text-slate-400">
              Shelter Capacity
            </span>
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400"></span>
          </div>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="text-2xl font-bold text-slate-100 font-mono">
              {totalBedsAvailable}
            </span>
            <span className="text-[10px] text-slate-500 font-mono">Beds Free</span>
          </div>
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
            <div className="space-y-2 max-h-[560px] overflow-y-auto pr-1">
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

        {/* Column 2: Geospatial Map */}
        <section
          aria-label="Tactical Operations Map"
          className="lg:col-span-8 xl:col-span-5 bg-[#0C121B] border border-[#182332] rounded-xl p-3.5 flex flex-col justify-between relative min-h-[580px]"
        >
          <div className="flex items-center justify-between pb-2 mb-2 border-b border-[#182332] z-10">
            <span className="text-xs font-bold text-slate-200 font-mono uppercase tracking-wider">
              Geospatial Tactical Map
            </span>
            <div className="flex items-center gap-2 text-[10px] font-mono">
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
              <button
                type="button"
                onClick={() => setMapLayers((p) => ({ ...p, shelters: !p.shelters }))}
                className={`px-2 py-0.5 rounded border ${mapLayers.shelters ? 'bg-emerald-950/40 text-emerald-300 border-emerald-500/40' : 'bg-[#080C12] text-slate-500 border-[#182332]'}`}
              >
                Shelters ({liveShelters.length})
              </button>
            </div>
          </div>
          <div className="relative w-full h-[480px] rounded-lg border border-[#162230] overflow-hidden">
            <SalvusLeafletMap
              center={[22.5726, 88.3639]}
              zoom={13}
              incidents={incidents}
              responders={responderMapPoints}
              shelters={shelterMapPoints}
              selectedIncidentId={selectedIncident?.id}
              onSelectIncident={(inc) => handleSelectIncident(inc)}
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
                <span className="h-2 w-2 rounded-full bg-blue-400"></span>Rescue Craft
              </div>
              <div className="flex items-center gap-1">
                <span className="h-2 w-2 rounded-full bg-emerald-400"></span>Safe Shelter
              </div>
            </div>
            <span>District Sector 12 Grid</span>
          </div>
        </section>

        {/* Column 3: Command Inspector & Resource Hub */}
        <section
          aria-label="Command Inspector and Resource Hub"
          className="lg:col-span-12 xl:col-span-4 bg-[#0C121B] border border-[#182332] rounded-xl p-3.5 flex flex-col space-y-3 min-h-[580px]"
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

                  <div className="bg-[#080C12] border border-[#182332] p-2.5 rounded-lg space-y-1">
                    <span className="text-[10px] font-mono font-semibold text-slate-400 block uppercase">
                      Incident Summary
                    </span>
                    <p className="text-slate-200 leading-relaxed text-[11px]">
                      {selectedIncident.description}
                    </p>
                  </div>

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

                  {/* Operational Candidates / Assigned */}
                  <div className="bg-[#080C12] border border-[#182332] p-2.5 rounded-lg space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-mono font-bold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
                        <span className="h-1.5 w-1.5 rounded-full bg-blue-400"></span>
                        {currentlyAssignedResponder
                          ? 'Assigned Rescue Unit'
                          : 'Candidate Response Units'}
                      </span>
                      <span className="text-[9px] font-mono text-slate-500">
                        {candidateResponders.length} units evaluated
                      </span>
                    </div>

                    {currentlyAssignedResponder ? (
                      <div className="bg-[#121B27] border border-blue-500/40 p-2.5 rounded-lg space-y-1.5">
                        <div className="flex items-center justify-between">
                          <span className="font-bold text-slate-100 text-xs">
                            {currentlyAssignedResponder.unit_name}
                          </span>
                          <span className="text-[9px] font-mono bg-blue-950 text-blue-300 border border-blue-500/40 px-1.5 py-0.2 rounded font-bold">
                            {currentlyAssignedResponder.status}
                          </span>
                        </div>
                        <p className="text-[10px] text-slate-300 font-mono">
                          Lead: {currentlyAssignedResponder.team_lead} · Craft:{' '}
                          {currentlyAssignedResponder.vehicle_type}
                        </p>
                        <div className="flex items-center justify-between text-[9px] font-mono text-slate-400 pt-1 border-t border-[#182332]">
                          <span>Radio: {currentlyAssignedResponder.radio_channel}</span>
                          <span>
                            Load: {currentlyAssignedResponder.current_load} /{' '}
                            {currentlyAssignedResponder.max_capacity}
                          </span>
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-1.5 max-h-48 overflow-y-auto pr-0.5">
                        {candidateResponders.slice(0, 3).map((cand) => (
                          <div
                            key={cand.id}
                            className={`p-2 rounded-lg border text-[11px] transition-colors ${cand.is_recommended ? 'bg-[#0E1724] border-blue-500/40' : 'bg-[#060A0E] border-[#182332]'}`}
                          >
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-1.5">
                                <span className="font-bold text-slate-200 text-xs">
                                  {cand.unit_name}
                                </span>
                                {cand.is_recommended && (
                                  <span className="text-[8px] bg-blue-500/20 text-blue-300 border border-blue-500/40 px-1 py-0.2 rounded font-bold uppercase">
                                    TOP MATCH
                                  </span>
                                )}
                              </div>
                              <span className="text-[10px] font-mono text-slate-400 font-bold">
                                {cand.distanceKm} km
                              </span>
                            </div>
                            <div className="flex items-center justify-between text-[10px] text-slate-400 mt-1">
                              <span className="text-slate-300 font-medium truncate max-w-[170px]">
                                {cand.matchReason}
                              </span>
                              <span className="font-mono text-[9px] text-slate-500">
                                {cand.status} ({cand.current_load}/{cand.max_capacity})
                              </span>
                            </div>
                            <button
                              type="button"
                              disabled={isAssigningUnit || cand.status === 'OFFLINE'}
                              onClick={() => handleDispatchResponder(cand.id)}
                              className="mt-1.5 w-full py-1 px-2 rounded bg-blue-600 hover:bg-blue-500 text-white font-mono text-[10px] font-bold uppercase tracking-wider transition-colors cursor-pointer disabled:opacity-50"
                            >
                              {isAssigningUnit
                                ? 'Dispatching...'
                                : `Dispatch ${cand.unit_name.split(' ')[0]}`}
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Shelters */}
                  <div className="bg-[#080C12] border border-[#182332] p-2.5 rounded-lg space-y-1.5">
                    <span className="text-[10px] font-mono font-bold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
                      <span className="h-1.5 w-1.5 rounded-full bg-emerald-400"></span>
                      Recommended Evacuation Shelters
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
                  Select an incident from the queue or map to inspect details.
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
