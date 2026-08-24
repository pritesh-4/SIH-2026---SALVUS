import { useState, useMemo, useEffect } from 'react'
import { authorityData } from '../data/authority/authorityMock'
import { useAuthorityIncidents } from '../features/authority/useAuthorityIncidents'
import { SalvusLeafletMap } from '../components/common/SalvusLeafletMap'
import { SimulatedBadge, LiveBadge } from '../components/common/SimulatedBadge'
import { fetchResponders, fetchShelters } from '../services/api'
import { subscribeToEvent } from '../lib/realtime/socket'

export const AuthorityCommandCenter = () => {
  const { hub } = authorityData

  const {
    incidents,
    selectedIncident,
    setSelectedIncident,
    isLoading,
    error,
    connectivityStatus,
    newlyArrivedId,
    changeStatus,
    isUpdatingStatus,
    computedMetrics,
    refetch,
  } = useAuthorityIncidents()

  const [activeIncidentFilter, setActiveIncidentFilter] = useState('all')
  const [rightPanelTab, setRightPanelTab] = useState('inspector') // 'inspector' | 'fleet' | 'shelters'
  const [mapLayers, setMapLayers] = useState({
    incidents: true,
    responders: true,
    shelters: true,
  })
  const [actionSuccessMessage, setActionSuccessMessage] = useState(null)

  // Real backend responders and shelters state
  const [liveResponders, setLiveResponders] = useState([])
  const [liveShelters, setLiveShelters] = useState([])
  const [isLoadingFleet, setIsLoadingFleet] = useState(true)

  // Fetch responders and shelters from backend on mount and subscribe to realtime updates
  useEffect(() => {
    let isMounted = true

    const loadData = async () => {
      const [respResult, shlResult] = await Promise.all([fetchResponders(), fetchShelters()])

      if (!isMounted) return

      if (respResult.success && respResult.data.length > 0) {
        setLiveResponders(respResult.data)
      } else {
        setLiveResponders(authorityData.responders || [])
      }

      if (shlResult.success && shlResult.data.length > 0) {
        setLiveShelters(shlResult.data)
      } else {
        setLiveShelters(authorityData.shelters || [])
      }

      setIsLoadingFleet(false)
    }

    loadData()

    // Realtime subscriptions for fleet updates
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

    return () => {
      isMounted = false
      unsubStatus()
      unsubLoc()
    }
  }, [])

  // Map points derived from real or fallback datasets
  const responderMapPoints = useMemo(() => {
    return liveResponders.map((r) => ({
      id: r.id,
      name: `${r.unit_name || r.unitName || 'NDRF Unit'} (${r.team_lead || r.lead || 'Team'})`,
      vessel: `${r.vehicle_type || r.vesselClass || r.vehicle || 'Rescue Vehicle'} · ${r.status || 'ACTIVE'}`,
      lat: r.latitude || r.lat || (r.coordinates?.x ? 22.572 + r.coordinates.x * 0.0002 : 22.574),
      lng: r.longitude || r.lng || (r.coordinates?.y ? 88.362 + r.coordinates.y * 0.0002 : 88.372),
    }))
  }, [liveResponders])

  const shelterMapPoints = useMemo(() => {
    return liveShelters.map((s) => ({
      id: s.id,
      name: s.name,
      address: s.address,
      lat: s.latitude || s.lat || (s.pos?.x ? 22.568 + s.pos.x * 0.0002 : 22.568),
      lng: s.longitude || s.lng || (s.pos?.y ? 88.398 + s.pos.y * 0.0002 : 88.406),
      capacity: `${s.available_beds ?? s.availableBeds ?? 0} beds free (${s.occupancy_rate || s.occupancyRate || '0%'} occ)`,
    }))
  }, [liveShelters])

  // Filter incidents in queue according to operational priorities
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

  // When user selects an incident, ensure the right panel is on inspector tab
  const handleSelectIncident = (inc) => {
    setSelectedIncident(inc)
    setRightPanelTab('inspector')
  }

  // Handle status transitions
  const handleTransition = async (targetStatus, label) => {
    if (!selectedIncident) return

    const result = await changeStatus(selectedIncident.id, targetStatus)
    if (result.success) {
      setActionSuccessMessage(`✓ Status updated: ${label}`)
      setTimeout(() => setActionSuccessMessage(null), 3000)
    }
  }

  // Standardized semantic status badge styles
  const getStatusBadge = (status) => {
    switch (status) {
      case 'NEW':
        return {
          label: 'NEW',
          classes: 'bg-amber-950/40 text-amber-300 border-amber-500/40',
        }
      case 'TRIAGE_PENDING':
        return {
          label: 'TRIAGE PENDING',
          classes: 'bg-amber-950/30 text-amber-400 border-amber-500/30',
        }
      case 'VERIFIED':
        return {
          label: 'VERIFIED',
          classes: 'bg-blue-950/40 text-blue-300 border-blue-500/40',
        }
      case 'ASSIGNED':
        return {
          label: 'ASSIGNED',
          classes: 'bg-indigo-950/40 text-indigo-300 border-indigo-500/40',
        }
      case 'EN_ROUTE':
        return {
          label: 'EN ROUTE',
          classes: 'bg-sky-950/40 text-sky-300 border-sky-500/40',
        }
      case 'ON_SCENE':
        return {
          label: 'ON SCENE',
          classes: 'bg-emerald-950/40 text-emerald-300 border-emerald-500/40',
        }
      case 'RESOLVED':
        return {
          label: 'RESOLVED',
          classes: 'bg-emerald-950/30 text-emerald-400 border-emerald-500/30',
        }
      case 'CANCELLED':
        return {
          label: 'CANCELLED',
          classes: 'bg-slate-900 text-slate-400 border-slate-700',
        }
      default:
        return {
          label: status || 'ACTIVE',
          classes: 'bg-slate-900 text-slate-300 border-slate-700',
        }
    }
  }

  const getSeverityBadge = (severity) => {
    switch (severity) {
      case 'CRITICAL':
        return {
          label: 'CRITICAL',
          classes: 'bg-rose-950/50 text-rose-300 border-rose-500/40 font-bold',
        }
      case 'HIGH':
        return {
          label: 'HIGH',
          classes: 'bg-amber-950/40 text-amber-300 border-amber-500/40',
        }
      case 'MEDIUM':
        return {
          label: 'MEDIUM',
          classes: 'bg-slate-800/80 text-slate-300 border-slate-700',
        }
      case 'LOW':
        return {
          label: 'LOW',
          classes: 'bg-slate-800/60 text-slate-400 border-slate-700/60',
        }
      default:
        return {
          label: severity || 'NORMAL',
          classes: 'bg-slate-800 text-slate-300 border-slate-700',
        }
    }
  }

  const activeRespondersCount = liveResponders.filter(
    (r) => r.status === 'ASSIGNED' || r.status === 'ON_SCENE' || r.status === 'EN_ROUTE'
  ).length

  const totalBedsAvailable = liveShelters.reduce(
    (sum, s) => sum + (s.available_beds ?? s.availableBeds ?? 0),
    0
  )

  return (
    <div className="space-y-3.5">
      {/* Realtime Connectivity Notice (Quiet & Semantic) */}
      {connectivityStatus !== 'CONNECTED' && (
        <div
          role="alert"
          className="bg-[#14120E] border border-amber-500/30 rounded-lg px-3.5 py-2 flex items-center justify-between text-xs text-amber-200"
        >
          <div className="flex items-center gap-2 font-mono">
            <span className="h-1.5 w-1.5 rounded-full bg-amber-400"></span>
            <span>
              <strong>Realtime Gateway: {connectivityStatus}</strong> — Live sync interrupted.
              Displaying cached sector intelligence.
            </span>
          </div>
          <button
            type="button"
            onClick={() => refetch()}
            className="text-[10px] font-mono text-amber-300 hover:text-white uppercase tracking-wider underline cursor-pointer"
          >
            Reconnect
          </button>
        </div>
      )}

      {/* Operations Subheader / Context Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 bg-[#0C121B] border border-[#182332] px-3.5 py-2 rounded-lg text-xs">
        <div className="flex items-center gap-2.5 flex-wrap">
          <span className="font-mono text-slate-200 font-semibold">{hub.name}</span>
          <span className="text-slate-600">·</span>
          <span className="text-slate-400 font-mono text-[11px]">{hub.sector}</span>
          <span className="text-slate-600">·</span>
          <div className="flex items-center gap-1 font-mono text-[11px] text-slate-400">
            {incidents.length > 0 && incidents[0].ticket_id ? (
              <LiveBadge label="OPERATIONAL GRID" />
            ) : (
              <SimulatedBadge label="CACHED GRID" />
            )}
            <span className="text-slate-300 font-medium">({incidents.length} Records)</span>
          </div>
        </div>

        <div className="flex items-center gap-2 font-mono text-[11px] text-slate-400">
          <span className="text-slate-300">🌧️ {hub.weatherCondition}</span>
          <span className="text-slate-600">·</span>
          <span className="text-slate-400">Flood Threat Active</span>
        </div>
      </div>

      {/* Top Operational Metrics Bar (4 Essential Operational Metrics) */}
      <section aria-label="Operational Metrics" className="grid grid-cols-2 lg:grid-cols-4 gap-2.5">
        {/* 1. Critical Threats (Red only when > 0, otherwise calm slate) */}
        <div
          className={`bg-[#0C121B] border p-3 rounded-lg flex flex-col justify-between transition-colors ${
            computedMetrics.criticalThreats > 0 ? 'border-rose-500/40' : 'border-[#182332]'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-mono font-medium uppercase text-slate-400">
              Critical Threats
            </span>
            <span
              className={`h-1.5 w-1.5 rounded-full ${
                computedMetrics.criticalThreats > 0 ? 'bg-rose-500' : 'bg-slate-600'
              }`}
            ></span>
          </div>
          <div className="mt-1 flex items-baseline gap-2">
            <span
              className={`text-2xl font-bold font-mono ${
                computedMetrics.criticalThreats > 0 ? 'text-rose-400' : 'text-slate-200'
              }`}
            >
              {computedMetrics.criticalThreats}
            </span>
            <span className="text-[10px] text-slate-500 font-mono">Immediate Action</span>
          </div>
        </div>

        {/* 2. Active Incidents */}
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

        {/* 3. Fleet Deployed */}
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

        {/* 4. Shelter Capacity */}
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

      {/* Main 3-Column Command Surface */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-3.5 items-start">
        {/* ================================================================= */}
        {/* COLUMN 1: Priority Incident Queue (lg:col-span-4 xl:col-span-3)   */}
        {/* ================================================================= */}
        <section
          aria-label="Incident Triage Queue"
          className="lg:col-span-4 xl:col-span-3 bg-[#0C121B] border border-[#182332] rounded-xl p-3.5 flex flex-col space-y-3"
        >
          {/* Header & Filter Controls */}
          <div className="flex items-center justify-between pb-2 border-b border-[#182332]">
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-slate-200 uppercase tracking-wider font-mono">
                Incident Queue
              </span>
            </div>
            <span className="text-[10px] font-mono text-slate-400 bg-slate-800/80 px-2 py-0.5 rounded border border-slate-700">
              {filteredIncidents.length} Total
            </span>
          </div>

          {/* Filter Pills (Operational Priorities) */}
          <div className="flex items-center gap-1 overflow-x-auto pb-1">
            {[
              { id: 'all', label: 'All' },
              { id: 'immediate', label: 'Immediate Action' },
              { id: 'review', label: 'Needs Review' },
              { id: 'response', label: 'In Response' },
              { id: 'resolved', label: 'Resolved' },
            ].map((f) => (
              <button
                key={f.id}
                type="button"
                onClick={() => setActiveIncidentFilter(f.id)}
                className={`px-2 py-1 rounded text-[10px] font-mono font-medium uppercase whitespace-nowrap transition-colors cursor-pointer ${
                  activeIncidentFilter === f.id
                    ? 'bg-slate-700 text-white font-semibold shadow-sm'
                    : 'bg-[#080C12] text-slate-400 hover:text-slate-200 border border-[#182332]'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>

          {/* Incident Scroll List */}
          {isLoading ? (
            <div className="py-12 text-center text-xs font-mono text-slate-500">
              Syncing active incident queue...
            </div>
          ) : error && incidents.length === 0 ? (
            <div className="py-6 text-center text-xs font-mono text-amber-400 bg-amber-950/20 border border-amber-500/30 rounded-lg p-3">
              ⚠️ {error}
            </div>
          ) : filteredIncidents.length === 0 ? (
            <div className="py-12 text-center text-xs font-mono text-slate-500">
              No incidents matching filter "{activeIncidentFilter}".
            </div>
          ) : (
            <div className="space-y-2 max-h-[560px] overflow-y-auto pr-1">
              {filteredIncidents.map((inc) => {
                const isSelected = selectedIncident?.id === inc.id
                const isNew = newlyArrivedId === inc.id
                const isCritical = inc.severity === 'CRITICAL'
                const sevBadge = getSeverityBadge(inc.severity)
                const statBadge = getStatusBadge(inc.status)

                return (
                  <div
                    key={inc.id}
                    onClick={() => handleSelectIncident(inc)}
                    className={`p-3 rounded-lg border text-left transition-all cursor-pointer relative ${
                      isSelected
                        ? 'bg-[#121B27] border-blue-500/60 shadow-md ring-1 ring-blue-500/40'
                        : 'bg-[#080C12] border-[#182332] hover:border-slate-700 hover:bg-[#0E1520]'
                    } ${isCritical ? 'border-l-4 border-l-rose-500' : ''} ${
                      isNew ? 'ring-2 ring-rose-500 animate-pulse' : ''
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5 font-mono">
                        <span className="font-bold text-slate-200 text-xs">
                          {inc.ticket_id || `SV-${(inc.id || '').slice(-4)}`}
                        </span>
                        {inc.is_sos && (
                          <span className="text-[9px] bg-rose-600/90 text-white px-1.5 py-0.2 rounded font-bold uppercase tracking-wider">
                            SOS
                          </span>
                        )}
                      </div>
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

                    <div className="mt-1.5">
                      <span className="text-xs font-semibold text-slate-200 block truncate">
                        {inc.type?.replace('_', ' ') || 'Flood Inundation'}
                      </span>
                      <p className="text-[11px] text-slate-400 line-clamp-1 mt-0.5">
                        {inc.description || 'Distress hazard reported.'}
                      </p>
                    </div>

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

        {/* ================================================================= */}
        {/* COLUMN 2: Tactical OpenStreetMap Surface (lg:col-span-5 xl:col-span-6) */}
        {/* ================================================================= */}
        <section
          aria-label="Tactical Command Map"
          className="lg:col-span-5 xl:col-span-6 bg-[#0C121B] border border-[#182332] rounded-xl p-3.5 flex flex-col justify-between min-h-[580px]"
        >
          <div>
            {/* Map Header & Layer Toggles */}
            <div className="flex flex-wrap items-center justify-between gap-2 mb-2 pb-2 border-b border-[#182332]">
              <div className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-emerald-500"></span>
                <h2 className="text-xs font-bold text-slate-200 uppercase tracking-wider font-mono">
                  Geospatial Tactical Surface
                </h2>
              </div>

              <div className="flex items-center gap-1.5 font-mono text-[10px]">
                <button
                  type="button"
                  onClick={() => setMapLayers((prev) => ({ ...prev, incidents: !prev.incidents }))}
                  className={`px-2 py-0.5 rounded uppercase font-medium transition-colors cursor-pointer border ${
                    mapLayers.incidents
                      ? 'bg-slate-700 text-white border-slate-600'
                      : 'bg-[#080C12] text-slate-500 border-[#182332]'
                  }`}
                >
                  Incidents ({incidents.length})
                </button>
                <button
                  type="button"
                  onClick={() =>
                    setMapLayers((prev) => ({ ...prev, responders: !prev.responders }))
                  }
                  className={`px-2 py-0.5 rounded uppercase font-medium transition-colors cursor-pointer border ${
                    mapLayers.responders
                      ? 'bg-slate-700 text-white border-slate-600'
                      : 'bg-[#080C12] text-slate-500 border-[#182332]'
                  }`}
                >
                  Fleet ({responderMapPoints.length})
                </button>
                <button
                  type="button"
                  onClick={() => setMapLayers((prev) => ({ ...prev, shelters: !prev.shelters }))}
                  className={`px-2 py-0.5 rounded uppercase font-medium transition-colors cursor-pointer border ${
                    mapLayers.shelters
                      ? 'bg-slate-700 text-white border-slate-600'
                      : 'bg-[#080C12] text-slate-500 border-[#182332]'
                  }`}
                >
                  Shelters ({shelterMapPoints.length})
                </button>
              </div>
            </div>

            {/* Interactive Tactical Map Container */}
            <div className="relative w-full h-[470px] rounded-lg overflow-hidden border border-[#15202E]">
              <SalvusLeafletMap
                center={
                  selectedIncident && selectedIncident.latitude
                    ? [selectedIncident.latitude, selectedIncident.longitude]
                    : [22.5726, 88.3639]
                }
                zoom={14}
                incidents={incidents}
                selectedIncidentId={selectedIncident?.id}
                onSelectIncident={(inc) => handleSelectIncident(inc)}
                shelters={shelterMapPoints}
                responders={responderMapPoints}
                showLayers={mapLayers}
                autoFocusSelected={true}
                className="h-full w-full"
              />
            </div>
          </div>

          {/* Map Footer Legend */}
          <div className="mt-2.5 pt-2 border-t border-[#182332] flex items-center justify-between text-[10px] font-mono text-slate-400 flex-wrap gap-2">
            <div className="flex items-center gap-3 flex-wrap">
              <span className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-rose-500"></span> Critical / SOS
              </span>
              <span className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-amber-400"></span> Triage / High
              </span>
              <span className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-blue-400"></span> Verified / Fleet
              </span>
              <span className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-emerald-400"></span> Resolved / Shelter
              </span>
            </div>
            <span className="text-slate-500">Sector 12 Grid · OpenStreetMap</span>
          </div>
        </section>

        {/* ================================================================= */}
        {/* COLUMN 3: Command Inspector & Resource Logistics (lg:col-span-3)   */}
        {/* ================================================================= */}
        <section
          aria-label="Command Decision and Resource Hub"
          className="lg:col-span-3 bg-[#0C121B] border border-[#182332] rounded-xl p-3.5 flex flex-col space-y-3 min-h-[580px]"
        >
          {/* Navigation Tabs for Right Operational Column */}
          <div className="flex items-center gap-1 pb-2 border-b border-[#182332]">
            <button
              type="button"
              onClick={() => setRightPanelTab('inspector')}
              className={`flex-1 py-1 px-2 rounded text-[10px] font-mono font-medium uppercase transition-colors cursor-pointer text-center ${
                rightPanelTab === 'inspector'
                  ? 'bg-slate-700 text-white font-bold'
                  : 'bg-[#080C12] text-slate-400 hover:text-slate-200 border border-[#182332]'
              }`}
            >
              Inspector
            </button>
            <button
              type="button"
              onClick={() => setRightPanelTab('fleet')}
              className={`flex-1 py-1 px-2 rounded text-[10px] font-mono font-medium uppercase transition-colors cursor-pointer text-center ${
                rightPanelTab === 'fleet'
                  ? 'bg-slate-700 text-white font-bold'
                  : 'bg-[#080C12] text-slate-400 hover:text-slate-200 border border-[#182332]'
              }`}
            >
              Fleet ({liveResponders.length})
            </button>
            <button
              type="button"
              onClick={() => setRightPanelTab('shelters')}
              className={`flex-1 py-1 px-2 rounded text-[10px] font-mono font-medium uppercase transition-colors cursor-pointer text-center ${
                rightPanelTab === 'shelters'
                  ? 'bg-slate-700 text-white font-bold'
                  : 'bg-[#080C12] text-slate-400 hover:text-slate-200 border border-[#182332]'
              }`}
            >
              Shelters ({liveShelters.length})
            </button>
          </div>

          {/* TAB 1: Selected Incident Command Inspector */}
          {rightPanelTab === 'inspector' && (
            <div className="space-y-3 flex-1 flex flex-col justify-between">
              {selectedIncident ? (
                <div className="space-y-3 text-xs">
                  {/* Ticket Header & Status */}
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
                        className={`text-[9px] font-mono px-1.5 py-0.5 rounded border ${
                          getSeverityBadge(selectedIncident.severity).classes
                        }`}
                      >
                        {selectedIncident.severity}
                      </span>
                      <span
                        className={`text-[9px] font-mono px-1.5 py-0.5 rounded border ${
                          getStatusBadge(selectedIncident.status).classes
                        }`}
                      >
                        {selectedIncident.status}
                      </span>
                    </div>
                  </div>

                  {/* Incident Description */}
                  <div className="bg-[#080C12] border border-[#182332] p-2.5 rounded-lg space-y-1">
                    <span className="text-[10px] font-mono font-semibold text-slate-400 block uppercase">
                      Incident Summary
                    </span>
                    <p className="text-slate-200 leading-relaxed text-[11px]">
                      {selectedIncident.description}
                    </p>
                  </div>

                  {/* Location & Metadata */}
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

                  {/* AI Situation Intelligence (Calm Command Intelligence) */}
                  {selectedIncident.ai_triage && (
                    <div className="bg-[#080C12] border border-blue-500/20 p-2.5 rounded-lg space-y-1.5">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-mono font-semibold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
                          <span className="h-1.5 w-1.5 rounded-full bg-blue-400"></span>
                          Command Intelligence
                        </span>
                        {selectedIncident.ai_triage.confidence && (
                          <span className="text-[9px] font-mono text-slate-400">
                            Confidence: {selectedIncident.ai_triage.confidence}
                          </span>
                        )}
                      </div>

                      <p className="text-[11px] text-slate-300 leading-snug">
                        {selectedIncident.ai_triage.priorityReasoning ||
                          selectedIncident.ai_triage.hazardType}
                      </p>

                      {selectedIncident.ai_triage.recommendedUnit && (
                        <div className="pt-1 border-t border-slate-800 text-[10px] font-mono text-slate-400 flex items-center justify-between">
                          <span>Recommended Unit:</span>
                          <span className="text-blue-300 font-medium truncate max-w-[140px]">
                            {selectedIncident.ai_triage.recommendedUnit}
                          </span>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Action Confirmation Banner */}
                  {actionSuccessMessage && (
                    <div className="bg-emerald-950/40 border border-emerald-500/40 text-emerald-300 p-2 rounded-lg text-center font-mono text-[11px]">
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
                      {isUpdatingStatus ? 'Processing...' : '✓ Verify & Dispatch'}
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

          {/* TAB 2: Responder Fleet Matrix */}
          {rightPanelTab === 'fleet' && (
            <div className="space-y-2 flex-1 overflow-y-auto pr-1">
              <div className="flex items-center justify-between pb-1 text-[10px] font-mono text-slate-400">
                <span>RESCUE UNITS</span>
                <span>STATUS</span>
              </div>

              {isLoadingFleet ? (
                <div className="py-12 text-center text-xs font-mono text-slate-500">
                  Syncing fleet telemetry...
                </div>
              ) : (
                liveResponders.map((resp) => {
                  const unitName = resp.unit_name || resp.unitName || 'Unit'
                  const teamLead = resp.team_lead || resp.lead || 'NDRF Team'
                  const radio = resp.radio_channel || resp.radioChannel || 'VHF Ch. 1'
                  const vessel = resp.vehicle_type || resp.vesselClass || resp.vehicle || 'Rig'
                  const stat = resp.status || 'AVAILABLE'

                  return (
                    <div
                      key={resp.id}
                      className="bg-[#080C12] border border-[#182332] p-2.5 rounded-lg text-xs space-y-1"
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-semibold text-slate-200 text-[11px] truncate max-w-[140px]">
                          {unitName}
                        </span>
                        <span
                          className={`text-[9px] font-mono px-1.5 py-0.2 rounded font-semibold border ${
                            stat === 'ASSIGNED'
                              ? 'bg-blue-950/40 text-blue-300 border-blue-500/30'
                              : stat === 'ON_SCENE'
                                ? 'bg-emerald-950/40 text-emerald-300 border-emerald-500/30'
                                : 'bg-slate-800 text-slate-400 border-slate-700'
                          }`}
                        >
                          {stat}
                        </span>
                      </div>
                      <p className="text-[10px] text-slate-400 font-mono">
                        {teamLead} · {radio}
                      </p>
                      <p className="text-[10px] text-slate-500 font-mono truncate">
                        Craft: {vessel}
                      </p>
                    </div>
                  )
                })
              )}
            </div>
          )}

          {/* TAB 3: Shelter Supply Logistics */}
          {rightPanelTab === 'shelters' && (
            <div className="space-y-2 flex-1 overflow-y-auto pr-1">
              <div className="flex items-center justify-between pb-1 text-[10px] font-mono text-slate-400">
                <span>EVACUATION HUBS</span>
                <span>CAPACITY</span>
              </div>

              {liveShelters.map((shl) => {
                const avail = shl.available_beds ?? shl.availableBeds ?? 0
                const occ = shl.occupancy_rate || shl.occupancyRate || '0%'
                const supplies = shl.supplies_status || shl.foodWaterSupply || 'Standard'

                return (
                  <div
                    key={shl.id}
                    className="bg-[#080C12] border border-[#182332] p-2.5 rounded-lg text-xs space-y-1.5"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-slate-200 text-[11px] truncate max-w-[140px]">
                        {shl.name}
                      </span>
                      <span className="font-mono text-[10px] text-emerald-400 font-semibold">
                        {avail} beds free
                      </span>
                    </div>

                    {/* Single-tone clean capacity bar */}
                    <div className="w-full bg-[#121B27] h-1.5 rounded-full overflow-hidden border border-[#182332]">
                      <div className="h-full bg-slate-500" style={{ width: occ }}></div>
                    </div>

                    <div className="flex items-center justify-between text-[9px] text-slate-400 font-mono">
                      <span>Occupancy: {occ}</span>
                      <span className="truncate max-w-[120px]">Rations: {supplies}</span>
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
