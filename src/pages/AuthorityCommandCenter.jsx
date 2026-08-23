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
        // Fallback to initial mock if offline
        setLiveResponders(authorityData.responders)
      }

      if (shlResult.success && shlResult.data.length > 0) {
        setLiveShelters(shlResult.data)
      } else {
        setLiveShelters(authorityData.shelters)
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
      name: `${r.unit_name || r.unitName} (${r.team_lead || r.lead || 'Unit'})`,
      vessel: `${r.vehicle_type || r.vesselClass || 'Rescue Vehicle'} (${r.status})`,
      lat: r.latitude || r.lat || 22.574,
      lng: r.longitude || r.lng || 88.372,
    }))
  }, [liveResponders])

  const shelterMapPoints = useMemo(() => {
    return liveShelters.map((s) => ({
      id: s.id,
      name: s.name,
      address: s.address,
      lat: s.latitude || s.lat || 22.568,
      lng: s.longitude || s.lng || 88.406,
      capacity: `${s.available_beds || s.availableBeds || 0} beds free (${s.occupancy_rate || s.occupancyRate || '0%'} occ)`,
    }))
  }, [liveShelters])

  // Filter incidents in queue
  const filteredIncidents = useMemo(() => {
    return incidents.filter((inc) => {
      if (activeIncidentFilter === 'critical') return inc.severity === 'CRITICAL'
      if (activeIncidentFilter === 'pending') return ['NEW', 'TRIAGE_PENDING'].includes(inc.status)
      if (activeIncidentFilter === 'verified') return inc.status === 'VERIFIED'
      if (activeIncidentFilter === 'resolved') return inc.status === 'RESOLVED'
      return true
    })
  }, [incidents, activeIncidentFilter])

  // Handle status transitions
  const handleTransition = async (targetStatus, label) => {
    if (!selectedIncident) return

    const result = await changeStatus(selectedIncident.id, targetStatus)
    if (result.success) {
      setActionSuccessMessage(`✓ ${label} executed`)
      setTimeout(() => setActionSuccessMessage(null), 3000)
    }
  }

  const getStatusBadgeStyle = (status) => {
    switch (status) {
      case 'NEW':
        return 'bg-amber-500/20 text-amber-300 border-amber-500/40 animate-pulse'
      case 'TRIAGE_PENDING':
        return 'bg-orange-500/20 text-orange-300 border-orange-500/40'
      case 'VERIFIED':
        return 'bg-sky-500/20 text-sky-300 border-sky-500/40 font-bold'
      case 'ASSIGNED':
        return 'bg-indigo-500/20 text-indigo-300 border-indigo-500/40 font-bold'
      case 'EN_ROUTE':
        return 'bg-blue-500/20 text-blue-300 border-blue-500/40'
      case 'ON_SCENE':
        return 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
      case 'RESOLVED':
        return 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
      case 'CANCELLED':
        return 'bg-slate-700/40 text-slate-400 border-slate-600/40'
      default:
        return 'bg-slate-800 text-slate-300 border-slate-700'
    }
  }

  const getSeverityBadgeStyle = (severity) => {
    switch (severity) {
      case 'CRITICAL':
        return 'bg-rose-500/20 text-rose-300 border-rose-500/40'
      case 'HIGH':
        return 'bg-orange-500/20 text-orange-300 border-orange-500/40'
      case 'MEDIUM':
        return 'bg-amber-500/20 text-amber-300 border-amber-500/40'
      case 'LOW':
        return 'bg-sky-500/20 text-sky-300 border-sky-500/40'
      default:
        return 'bg-slate-800 text-slate-300'
    }
  }

  return (
    <div className="space-y-5 animate-fadeIn">
      {/* Realtime Connectivity Alert Banner */}
      {connectivityStatus !== 'CONNECTED' && (
        <div
          role="alert"
          className="bg-amber-950/50 border border-amber-500/50 rounded-xl px-4 py-2.5 flex items-center justify-between text-xs text-amber-200 animate-fadeIn"
        >
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-amber-400 animate-ping"></span>
            <span>
              <strong>Realtime Gateway: {connectivityStatus}</strong> — Live updates temporarily
              unavailable. Cached operational grid data displayed.
            </span>
          </div>
          <button
            type="button"
            onClick={() => refetch()}
            className="text-[10px] font-mono text-amber-300 hover:text-white uppercase underline cursor-pointer"
          >
            Force Reconnect
          </button>
        </div>
      )}

      {/* Operations Center Header Subtitle */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 bg-[#0D1520] border border-[#1A2634] px-4 py-2.5 rounded-xl text-xs">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-mono text-cyan-300 font-bold">{hub.name}</span>
          <span className="text-slate-600">|</span>
          <span className="text-slate-400 font-mono text-[11px]">{hub.sector}</span>
          <span className="text-slate-600">|</span>
          <span className="text-emerald-400 font-mono text-[11px] flex items-center gap-1">
            <LiveBadge label="SQLITE WAL ENGINE" />
            <span>{incidents.length} Incident Records</span>
          </span>
        </div>
        <div className="flex items-center gap-2 font-mono text-[11px] text-amber-300">
          <span>🌧️ {hub.weatherCondition}</span>
          <SimulatedBadge label="METEOROLOGICAL MODEL" />
        </div>
      </div>

      {/* Top Operational Metrics KPI Bar */}
      <section
        aria-label="Operational Metrics"
        className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3"
      >
        <div className="bg-[#0D1520] border border-[#1A2634] p-3.5 rounded-xl flex items-center justify-between">
          <div>
            <span className="text-[10px] font-mono font-bold uppercase text-slate-400 block">
              Active Incidents
            </span>
            <span className="text-xl sm:text-2xl font-black text-white font-mono">
              {computedMetrics.activeIncidents}
            </span>
          </div>
          <div className="h-8 w-8 rounded-lg bg-rose-500/10 border border-rose-500/30 flex items-center justify-center text-rose-400 text-sm">
            🚨
          </div>
        </div>

        <div className="bg-[#0D1520] border border-[#1A2634] p-3.5 rounded-xl flex items-center justify-between">
          <div>
            <span className="text-[10px] font-mono font-bold uppercase text-slate-400 block">
              Critical Threats
            </span>
            <span className="text-xl sm:text-2xl font-black text-rose-400 font-mono">
              {computedMetrics.criticalThreats}
            </span>
          </div>
          <div className="h-8 w-8 rounded-lg bg-rose-500/20 border border-rose-500/40 flex items-center justify-center text-rose-400 text-sm animate-pulse">
            ⚠️
          </div>
        </div>

        <div className="bg-[#0D1520] border border-[#1A2634] p-3.5 rounded-xl flex items-center justify-between">
          <div>
            <span className="text-[10px] font-mono font-bold uppercase text-slate-400 block">
              Fleet Deployed
            </span>
            <span className="text-xl sm:text-2xl font-black text-sky-400 font-mono">
              {
                liveResponders.filter((r) => r.status === 'ASSIGNED' || r.status === 'ON_SCENE')
                  .length
              }{' '}
              / {liveResponders.length}
            </span>
          </div>
          <div className="h-8 w-8 rounded-lg bg-sky-500/10 border border-sky-500/30 flex items-center justify-center text-sky-400 text-sm">
            🚤
          </div>
        </div>

        <div className="bg-[#0D1520] border border-[#1A2634] p-3.5 rounded-xl flex items-center justify-between">
          <div>
            <span className="text-[10px] font-mono font-bold uppercase text-slate-400 block">
              Available Beds
            </span>
            <span className="text-xl sm:text-2xl font-black text-emerald-400 font-mono">
              {liveShelters.reduce((sum, s) => sum + (s.available_beds || s.availableBeds || 0), 0)}
            </span>
          </div>
          <div className="h-8 w-8 rounded-lg bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400 text-sm">
            🏕️
          </div>
        </div>

        <div className="col-span-2 sm:col-span-1 bg-[#0D1520] border border-[#1A2634] p-3.5 rounded-xl flex items-center justify-between">
          <div>
            <span className="text-[10px] font-mono font-bold uppercase text-slate-400 block">
              Resolved Cases
            </span>
            <span className="text-xl sm:text-2xl font-black text-slate-300 font-mono">
              {computedMetrics.resolvedCount}
            </span>
          </div>
          <div className="h-8 w-8 rounded-lg bg-slate-800 border border-slate-700 flex items-center justify-center text-slate-400 text-sm">
            ✓
          </div>
        </div>
      </section>

      {/* Main 3-Column Operations Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* LEFT COLUMN: Live Incident Queue & Triage Inspector (4 cols) */}
        <section
          aria-label="Incident Triage Queue"
          className="lg:col-span-4 flex flex-col justify-between bg-[#0D1520] border border-[#1A2634] rounded-2xl p-4 sm:p-5 space-y-4"
        >
          <div>
            {/* Header & Filter Controls */}
            <div className="flex items-center justify-between gap-2 pb-3 border-b border-[#1A2634]">
              <div className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-rose-500 animate-ping"></span>
                <h2 className="text-sm font-bold text-white uppercase tracking-wider font-mono">
                  Live Incident Queue
                </h2>
              </div>
              <span className="text-[11px] font-mono text-cyan-400 font-bold bg-cyan-950/40 px-2 py-0.5 rounded border border-cyan-500/30">
                {filteredIncidents.length} Records
              </span>
            </div>

            {/* Filter Pills */}
            <div className="flex items-center gap-1.5 pt-2 pb-1 overflow-x-auto">
              {[
                { id: 'all', label: 'All' },
                { id: 'critical', label: 'Critical' },
                { id: 'pending', label: 'Pending Triage' },
                { id: 'verified', label: 'Verified' },
                { id: 'resolved', label: 'Resolved' },
              ].map((f) => (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => setActiveIncidentFilter(f.id)}
                  className={`px-2.5 py-1 rounded-lg text-[10px] font-mono font-bold uppercase whitespace-nowrap transition-colors cursor-pointer ${
                    activeIncidentFilter === f.id
                      ? 'bg-cyan-500 text-slate-950 shadow'
                      : 'bg-[#070D14] text-slate-400 hover:text-white border border-[#1A2634]'
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>

            {/* Incident Scroll List */}
            {isLoading ? (
              <div className="py-12 text-center text-xs font-mono text-slate-500">
                Loading live incident records from backend...
              </div>
            ) : error ? (
              <div className="py-8 text-center text-xs font-mono text-rose-400 bg-rose-950/20 border border-rose-500/30 rounded-xl p-3 my-2">
                ⚠️ {error}
              </div>
            ) : filteredIncidents.length === 0 ? (
              <div className="py-12 text-center text-xs font-mono text-slate-500">
                No incidents match filter "{activeIncidentFilter}".
              </div>
            ) : (
              <div className="space-y-2.5 max-h-[380px] overflow-y-auto pr-1 mt-3">
                {filteredIncidents.map((inc) => {
                  const isSelected = selectedIncident?.id === inc.id
                  const isNew = newlyArrivedId === inc.id

                  return (
                    <div
                      key={inc.id}
                      onClick={() => setSelectedIncident(inc)}
                      className={`p-3 rounded-xl border text-left transition-all cursor-pointer relative ${
                        isSelected
                          ? 'bg-[#111C2B] border-cyan-500/70 shadow-lg ring-1 ring-cyan-500/50'
                          : 'bg-[#070D14] border-[#1A2634] hover:border-slate-700'
                      } ${isNew ? 'ring-2 ring-rose-500 animate-pulse' : ''}`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-1.5">
                          <span className="font-mono font-black text-white text-xs">
                            {inc.ticket_id || `SV-${inc.id.slice(-4)}`}
                          </span>
                          {inc.is_sos && (
                            <span className="text-[9px] bg-rose-600 text-white px-1.5 py-0.2 rounded font-black tracking-wider uppercase animate-pulse">
                              SOS
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-1.5">
                          <span
                            className={`text-[9px] font-mono font-bold px-1.5 py-0.2 rounded border ${getSeverityBadgeStyle(
                              inc.severity
                            )}`}
                          >
                            {inc.severity}
                          </span>
                          <span
                            className={`text-[9px] font-mono px-1.5 py-0.2 rounded border ${getStatusBadgeStyle(
                              inc.status
                            )}`}
                          >
                            {inc.status}
                          </span>
                        </div>
                      </div>

                      <p className="text-xs text-slate-300 font-medium line-clamp-1 mt-1.5">
                        {inc.description || 'Disaster hazard report'}
                      </p>

                      <div className="flex items-center justify-between text-[10px] text-slate-400 font-mono mt-2 pt-2 border-t border-[#1A2634]/60">
                        <span>👤 {inc.reporter_name || 'Citizen User'}</span>
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
          </div>

          {/* Selected Incident Detail & Lifecycle Actions */}
          <div className="pt-4 border-t border-[#1A2634]">
            {selectedIncident && (
              <div className="space-y-3 bg-[#070D14] border border-[#1A2634] p-3.5 rounded-xl text-xs">
                <div className="flex items-center justify-between">
                  <span className="font-mono text-cyan-300 font-bold">
                    INSPECTOR: {selectedIncident.ticket_id || selectedIncident.id}
                  </span>
                  <span
                    className={`text-[9px] font-mono px-2 py-0.5 rounded border ${getStatusBadgeStyle(
                      selectedIncident.status
                    )}`}
                  >
                    {selectedIncident.status}
                  </span>
                </div>

                <p className="text-slate-300 leading-relaxed">{selectedIncident.description}</p>

                <div className="grid grid-cols-2 gap-2 text-[10px] font-mono text-slate-400 pt-2 border-t border-[#1A2634]/80">
                  <div>
                    <span className="text-slate-400 block font-bold">COORDINATES</span>
                    <span className="text-slate-200">
                      {selectedIncident.latitude?.toFixed(4)}° N,{' '}
                      {selectedIncident.longitude?.toFixed(4)}° E
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-400 block font-bold">AFFECTED PERSONS</span>
                    <span className="text-rose-300 font-bold">
                      {selectedIncident.affected_count || 1} People
                    </span>
                  </div>
                </div>

                {actionSuccessMessage && (
                  <div className="bg-emerald-950/60 border border-emerald-500/50 text-emerald-300 p-2 rounded-lg text-center font-mono text-[11px] animate-fadeIn">
                    {actionSuccessMessage}
                  </div>
                )}

                {/* State Machine Transition Buttons */}
                <div className="pt-2 flex flex-col gap-2">
                  {selectedIncident.status === 'NEW' && (
                    <button
                      type="button"
                      disabled={isUpdatingStatus}
                      onClick={() => handleTransition('TRIAGE_PENDING', 'Pending AI Triage')}
                      className="w-full py-2 px-3 rounded-lg bg-orange-500 hover:bg-orange-400 text-slate-950 font-bold font-mono text-xs uppercase transition-all shadow cursor-pointer disabled:opacity-50"
                    >
                      {isUpdatingStatus ? 'Processing...' : '▶ Initiate Triage Queue'}
                    </button>
                  )}

                  {selectedIncident.status === 'TRIAGE_PENDING' && (
                    <button
                      type="button"
                      disabled={isUpdatingStatus}
                      onClick={() => handleTransition('VERIFIED', 'Verified Distress')}
                      className="w-full py-2 px-3 rounded-lg bg-sky-500 hover:bg-sky-400 text-slate-950 font-bold font-mono text-xs uppercase transition-all shadow cursor-pointer disabled:opacity-50"
                    >
                      {isUpdatingStatus ? 'Processing...' : '✓ Verify Incident & Ready Dispatch'}
                    </button>
                  )}

                  {selectedIncident.status === 'VERIFIED' && (
                    <div className="space-y-2">
                      <button
                        type="button"
                        disabled={isUpdatingStatus}
                        onClick={() => handleTransition('RESOLVED', 'Safe Rescue & Resolved')}
                        className="w-full py-2 px-3 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold font-mono text-xs uppercase transition-all shadow cursor-pointer disabled:opacity-50"
                      >
                        {isUpdatingStatus ? 'Processing...' : '✓ Confirm Rescue & Resolve Ticket'}
                      </button>
                    </div>
                  )}

                  {!['RESOLVED', 'CANCELLED'].includes(selectedIncident.status) && (
                    <button
                      type="button"
                      disabled={isUpdatingStatus}
                      onClick={() => handleTransition('CANCELLED', 'Cancellation')}
                      className="w-full py-1.5 px-3 rounded-lg bg-slate-800 hover:bg-rose-950/60 text-slate-400 hover:text-rose-300 border border-slate-700 text-[10px] font-mono uppercase transition-all cursor-pointer disabled:opacity-50"
                    >
                      Stand Down / Cancel Incident
                    </button>
                  )}

                  {selectedIncident.status === 'RESOLVED' && (
                    <div className="bg-emerald-950/30 border border-emerald-500/30 p-2.5 rounded-xl text-center text-xs font-mono text-emerald-300">
                      ✓ Incident Safely Resolved & Archived
                    </div>
                  )}

                  {selectedIncident.status === 'CANCELLED' && (
                    <div className="bg-slate-900 border border-slate-700 p-2.5 rounded-xl text-center text-xs font-mono text-slate-400">
                      🛑 Incident Cancelled & Stood Down
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </section>

        {/* CENTER COLUMN: Tactical OpenStreetMap Command Surface (5 cols) */}
        <section
          aria-label="Tactical Command Map"
          className="lg:col-span-5 flex flex-col justify-between bg-[#0D1520] border border-[#1A2634] rounded-2xl p-4 sm:p-5 relative overflow-hidden min-h-[540px]"
        >
          <div>
            {/* Map Header & Layer Toggles */}
            <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
              <div className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-emerald-400 animate-ping"></span>
                <h2 className="text-sm font-bold text-white uppercase tracking-wider font-mono">
                  OpenStreetMap Tactical Surface
                </h2>
              </div>

              <div className="flex items-center gap-1 font-mono text-[10px] flex-wrap">
                <button
                  type="button"
                  onClick={() => setMapLayers((prev) => ({ ...prev, incidents: !prev.incidents }))}
                  className={`px-2 py-0.5 rounded uppercase font-bold transition-colors cursor-pointer ${
                    mapLayers.incidents
                      ? 'bg-rose-500 text-slate-950'
                      : 'bg-[#070D14] text-slate-400 border border-[#1A2634]'
                  }`}
                >
                  Incidents ({incidents.length})
                </button>
                <button
                  type="button"
                  onClick={() =>
                    setMapLayers((prev) => ({ ...prev, responders: !prev.responders }))
                  }
                  className={`px-2 py-0.5 rounded uppercase font-bold transition-colors cursor-pointer ${
                    mapLayers.responders
                      ? 'bg-cyan-500 text-slate-950'
                      : 'bg-[#070D14] text-slate-400 border border-[#1A2634]'
                  }`}
                >
                  Fleet ({responderMapPoints.length})
                </button>
                <button
                  type="button"
                  onClick={() => setMapLayers((prev) => ({ ...prev, shelters: !prev.shelters }))}
                  className={`px-2 py-0.5 rounded uppercase font-bold transition-colors cursor-pointer ${
                    mapLayers.shelters
                      ? 'bg-emerald-500 text-slate-950'
                      : 'bg-[#070D14] text-slate-400 border border-[#1A2634]'
                  }`}
                >
                  Shelters ({shelterMapPoints.length})
                </button>
              </div>
            </div>

            {/* Interactive Leaflet Map Surface */}
            <div className="relative w-full h-[410px] rounded-xl border border-[#172535] overflow-hidden">
              <SalvusLeafletMap
                center={
                  selectedIncident && selectedIncident.latitude
                    ? [selectedIncident.latitude, selectedIncident.longitude]
                    : [22.5726, 88.3639]
                }
                zoom={14}
                incidents={incidents}
                selectedIncidentId={selectedIncident?.id}
                onSelectIncident={(inc) => setSelectedIncident(inc)}
                shelters={shelterMapPoints}
                responders={responderMapPoints}
                showLayers={mapLayers}
                autoFocusSelected={true}
                className="h-full w-full"
              />
            </div>
          </div>

          {/* Map Footer Legend */}
          <div className="mt-3 pt-2.5 border-t border-[#1A2634] flex items-center justify-between text-[10px] font-mono text-slate-400 flex-wrap gap-2">
            <div className="flex items-center gap-3 flex-wrap">
              <span className="flex items-center gap-1">
                <span className="h-2 w-2 rounded-full bg-rose-500 animate-ping"></span> Critical /
                New
              </span>
              <span className="flex items-center gap-1">
                <span className="h-2 w-2 rounded-full bg-sky-400"></span> Verified
              </span>
              <span className="flex items-center gap-1">
                <span className="h-2 w-2 rounded-full bg-emerald-400"></span> Resolved / Shelter
              </span>
              <span className="flex items-center gap-1">
                <span className="h-2 w-2 rounded-full bg-slate-500"></span> Cancelled
              </span>
            </div>
            <span>Sector 12 Hydrographic Overlay · OpenStreetMap</span>
          </div>
        </section>

        {/* RIGHT COLUMN: Fleet Matrix & Shelter Logistics (3 cols) */}
        <section aria-label="Fleet and Shelter Logistics" className="lg:col-span-3 space-y-4">
          {/* Responder Fleet Status */}
          <div className="bg-[#0D1520] border border-[#1A2634] rounded-2xl p-4 sm:p-5 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <h2 className="text-xs font-bold text-white uppercase tracking-wider font-mono">
                  Responder Fleet Matrix
                </h2>
              </div>
              {liveResponders.length > 0 && liveResponders[0].unit_name ? (
                <LiveBadge label="SQLITE FLEET" />
              ) : (
                <SimulatedBadge label="SIMULATED FLEET" />
              )}
            </div>

            {isLoadingFleet ? (
              <div className="py-6 text-center text-xs font-mono text-slate-500">
                Syncing fleet units...
              </div>
            ) : (
              <div className="space-y-2 max-h-[220px] overflow-y-auto pr-1">
                {liveResponders.map((resp) => {
                  const unitName = resp.unit_name || resp.unitName
                  const teamLead = resp.team_lead || resp.lead
                  const radio = resp.radio_channel || resp.radioChannel
                  const vessel = resp.vehicle_type || resp.vesselClass

                  return (
                    <div
                      key={resp.id}
                      className="bg-[#070D14] border border-[#1A2634] p-2.5 rounded-xl text-xs space-y-1"
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-white text-[11px] truncate max-w-[140px]">
                          {unitName}
                        </span>
                        <span
                          className={`text-[9px] font-mono px-1.5 py-0.2 rounded font-bold ${
                            resp.status === 'ASSIGNED'
                              ? 'bg-sky-500/20 text-sky-300'
                              : resp.status === 'ON_SCENE'
                                ? 'bg-emerald-500/20 text-emerald-300'
                                : 'bg-slate-800 text-slate-400'
                          }`}
                        >
                          {resp.status}
                        </span>
                      </div>
                      <p className="text-[10px] text-slate-400 font-mono">
                        {teamLead} · {radio}
                      </p>
                      <p className="text-[10px] text-slate-500 font-mono">Craft: {vessel}</p>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          {/* Shelter Capacity & Logistics */}
          <div className="bg-[#0D1520] border border-[#1A2634] rounded-2xl p-4 sm:p-5 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <h2 className="text-xs font-bold text-white uppercase tracking-wider font-mono">
                  Shelter Supply Hubs
                </h2>
              </div>
              {liveShelters.length > 0 && liveShelters[0].total_beds ? (
                <LiveBadge label="SQLITE SHELTERS" />
              ) : (
                <SimulatedBadge label="SIMULATED CAPACITY" />
              )}
            </div>

            <div className="space-y-2 max-h-[220px] overflow-y-auto pr-1">
              {liveShelters.map((shl) => {
                const avail = shl.available_beds ?? shl.availableBeds ?? 0
                const occ = shl.occupancy_rate || shl.occupancyRate || '0%'
                const supplies = shl.supplies_status || shl.foodWaterSupply || 'Normal'

                return (
                  <div
                    key={shl.id}
                    className="bg-[#070D14] border border-[#1A2634] p-2.5 rounded-xl text-xs space-y-1.5"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-white text-[11px] truncate max-w-[150px]">
                        {shl.name.split(' ')[0]} Hub
                      </span>
                      <span className="font-mono text-[10px] text-emerald-400 font-bold">
                        {avail} beds left
                      </span>
                    </div>

                    <div className="w-full bg-[#0D1520] h-1.5 rounded-full overflow-hidden border border-[#1A2634]">
                      <div
                        className="h-full bg-gradient-to-r from-emerald-500 to-amber-500"
                        style={{ width: occ }}
                      ></div>
                    </div>

                    <div className="flex items-center justify-between text-[9px] text-slate-400 font-mono">
                      <span>Occ: {occ}</span>
                      <span className="truncate max-w-[120px]">Rations: {supplies}</span>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </section>
      </div>
    </div>
  )
}

export default AuthorityCommandCenter
