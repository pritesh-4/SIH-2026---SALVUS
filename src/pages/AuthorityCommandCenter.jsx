import { useState, useMemo } from 'react'
import { authorityData } from '../data/authority/authorityMock'
import { useAuthorityIncidents } from '../features/authority/useAuthorityIncidents'
import { SalvusLeafletMap } from '../components/common/SalvusLeafletMap'
import { SimulatedBadge, LiveBadge } from '../components/common/SimulatedBadge'

const SHELTER_MAP_POINTS = [
  {
    id: 'shl-1',
    name: 'Salt Lake Stadium Assembly Hub',
    address: 'Gate 3, Salt Lake Stadium Complex',
    lat: 22.568,
    lng: 88.406,
    capacity: '420 beds free (68% occ)',
  },
  {
    id: 'shl-2',
    name: 'Karunamoyee Multi-Purpose Shelter',
    address: 'Karunamoyee Central Terminus Complex',
    lat: 22.5867,
    lng: 88.4178,
    capacity: '180 beds free (74% occ)',
  },
  {
    id: 'shl-3',
    name: 'Sector 5 Youth Hostel Hub',
    address: 'Block EP, Sector V Tech Corridor',
    lat: 22.58,
    lng: 88.435,
    capacity: '95 beds free (85% occ)',
  },
]

const RESPONDER_MAP_POINTS = [
  {
    id: 'resp-1',
    name: 'NDRF Rescue Unit 4 (Capt. Roy)',
    vessel: 'Gemini Z-Craft Inflatable (Assigned)',
    lat: 22.574,
    lng: 88.372,
  },
  {
    id: 'resp-2',
    name: 'SDRF Rapid Response Boat 2',
    vessel: 'Aluminum Hull Flood Craft (On Scene)',
    lat: 22.562,
    lng: 88.385,
  },
]

export const AuthorityCommandCenter = () => {
  const { hub, responders, shelters } = authorityData

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
            <LiveBadge label="POSTGRES / SQLITE LIVE" />
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
            <div className="flex items-center gap-2 mt-0.5">
              <span className="text-xl font-black text-white">
                {computedMetrics.activeIncidents}
              </span>
              <span className="text-[10px] bg-rose-500/20 text-rose-300 border border-rose-500/30 px-1.5 py-0.2 rounded font-mono font-bold">
                {computedMetrics.criticalThreats} Critical
              </span>
            </div>
          </div>
          <span className="text-xl">⚠️</span>
        </div>

        <div className="bg-[#0D1520] border border-[#1A2634] p-3.5 rounded-xl flex items-center justify-between">
          <div>
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] font-mono font-bold uppercase text-slate-400 block">
                Deployed Fleet
              </span>
              <SimulatedBadge label="SIM" />
            </div>
            <div className="flex items-center gap-2 mt-0.5">
              <span className="text-xl font-black text-sky-400">
                {responders.filter((r) => r.status !== 'AVAILABLE').length}/{responders.length}
              </span>
              <span className="text-[10px] text-slate-400 font-mono">Units Active</span>
            </div>
          </div>
          <span className="text-xl">🚤</span>
        </div>

        <div className="bg-[#0D1520] border border-[#1A2634] p-3.5 rounded-xl flex items-center justify-between">
          <div>
            <span className="text-[10px] font-mono font-bold uppercase text-slate-400 block">
              Incidents Resolved
            </span>
            <div className="flex items-center gap-2 mt-0.5">
              <span className="text-xl font-black text-emerald-400">
                {computedMetrics.resolvedCount}
              </span>
              <span className="text-[10px] text-slate-400 font-mono">Closed Tickets</span>
            </div>
          </div>
          <span className="text-xl">👥</span>
        </div>

        <div className="bg-[#0D1520] border border-[#1A2634] p-3.5 rounded-xl flex items-center justify-between">
          <div>
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] font-mono font-bold uppercase text-slate-400 block">
                Shelter Capacity
              </span>
              <SimulatedBadge label="SIM" />
            </div>
            <div className="flex items-center gap-2 mt-0.5">
              <span className="text-xl font-black text-amber-400">
                {shelters.reduce((acc, s) => acc + s.availableBeds, 0)}
              </span>
              <span className="text-[10px] text-slate-400 font-mono">Beds Free</span>
            </div>
          </div>
          <span className="text-xl">🏠</span>
        </div>

        <div className="bg-[#0D1520] border border-[#1A2634] p-3.5 rounded-xl flex items-center justify-between col-span-2 sm:col-span-1">
          <div>
            <span className="text-[10px] font-mono font-bold uppercase text-slate-400 block">
              Realtime Sync
            </span>
            <div className="flex items-center gap-2 mt-0.5">
              <span className="text-xl font-black text-cyan-400">WebSocket</span>
              <span
                className={`text-[10px] font-bold font-mono px-1.5 py-0.2 rounded ${
                  connectivityStatus === 'CONNECTED'
                    ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                    : 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                }`}
              >
                {connectivityStatus}
              </span>
            </div>
          </div>
          <span className="text-xl">⚡</span>
        </div>
      </section>

      {/* Main 3-Column Operational Command Center Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* LEFT COLUMN: Live Incident Ingestion Queue & Detail Inspector (4 cols) */}
        <section aria-label="Incident Triage Queue" className="lg:col-span-4 space-y-4">
          <div className="bg-[#0D1520] border border-[#1A2634] rounded-2xl p-4 sm:p-5 flex flex-col justify-between">
            <div>
              {/* Header & Filter Pills */}
              <div className="flex items-center justify-between gap-2 mb-3">
                <div>
                  <h2 className="text-sm font-bold text-white uppercase tracking-wider font-mono flex items-center gap-2">
                    <span className="h-2 w-2 rounded-full bg-cyan-400 animate-pulse"></span>
                    Live Incident Queue
                  </h2>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <LiveBadge label="REALTIME SYNC" />
                    <span className="text-[10px] text-slate-400">Descending chronological</span>
                  </div>
                </div>

                <div className="flex items-center gap-1 flex-wrap">
                  {[
                    { id: 'all', label: 'All' },
                    { id: 'pending', label: 'Pending' },
                    { id: 'verified', label: 'Verified' },
                    { id: 'critical', label: 'Crit' },
                  ].map((tab) => (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={() => setActiveIncidentFilter(tab.id)}
                      className={`px-2 py-0.5 rounded text-[10px] font-bold font-mono uppercase transition-colors cursor-pointer ${
                        activeIncidentFilter === tab.id
                          ? 'bg-cyan-500 text-slate-950'
                          : 'bg-[#070D14] text-slate-400 border border-[#1A2634] hover:text-white'
                      }`}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Incidents List with Skeletons and Empty States */}
              <div className="space-y-2.5 max-h-[340px] overflow-y-auto pr-1">
                {isLoading && (
                  <div className="space-y-2 py-2">
                    {[1, 2, 3].map((n) => (
                      <div
                        key={n}
                        className="p-3 bg-[#070D14] border border-[#1A2634] rounded-xl animate-pulse space-y-2"
                      >
                        <div className="h-4 bg-slate-800 rounded w-1/3"></div>
                        <div className="h-3 bg-slate-800/60 rounded w-3/4"></div>
                      </div>
                    ))}
                  </div>
                )}

                {error && !isLoading && (
                  <div className="p-3 bg-rose-950/30 border border-rose-500/40 rounded-xl text-xs text-rose-300 flex items-center justify-between">
                    <span>{error}</span>
                    <button
                      type="button"
                      onClick={() => refetch()}
                      className="px-2 py-1 bg-rose-500/20 hover:bg-rose-500/30 rounded font-bold uppercase text-[10px] cursor-pointer"
                    >
                      Retry
                    </button>
                  </div>
                )}

                {!isLoading && filteredIncidents.length === 0 && (
                  <div className="py-10 text-center text-xs text-slate-400 font-mono space-y-2">
                    <p>No incidents matching active filter.</p>
                    {activeIncidentFilter !== 'all' && (
                      <button
                        type="button"
                        onClick={() => setActiveIncidentFilter('all')}
                        className="text-cyan-400 hover:text-cyan-300 underline font-semibold text-[11px] cursor-pointer"
                      >
                        Show all {incidents.length} incidents
                      </button>
                    )}
                  </div>
                )}

                {filteredIncidents.map((inc) => {
                  const isSelected = selectedIncident?.id === inc.id
                  const isNewlyArrived = newlyArrivedId === inc.id

                  return (
                    <div
                      key={inc.id}
                      onClick={() => setSelectedIncident(inc)}
                      className={`p-3 rounded-xl border text-left cursor-pointer transition-all ${
                        isNewlyArrived
                          ? 'bg-cyan-950/40 border-cyan-400 ring-2 ring-cyan-400/50 animate-pulse'
                          : isSelected
                            ? 'bg-[#14202E] border-cyan-500/60 shadow-lg shadow-cyan-950/40 ring-1 ring-cyan-500/40'
                            : 'bg-[#070D14] border-[#1A2634] hover:border-slate-700'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2 mb-1">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span
                            className={`px-1.5 py-0.2 rounded text-[9px] font-bold font-mono uppercase border ${getStatusBadgeStyle(
                              inc.status
                            )}`}
                          >
                            {inc.status}
                          </span>
                          <span
                            className={`px-1.5 py-0.2 rounded text-[9px] font-bold font-mono uppercase border ${getSeverityBadgeStyle(
                              inc.severity
                            )}`}
                          >
                            {inc.severity}
                          </span>
                          <span className="font-mono text-[10px] text-cyan-300 font-bold">
                            #{inc.ticket_id}
                          </span>
                          {inc.is_sos && (
                            <span className="px-1 py-0.2 rounded text-[8px] bg-rose-600 text-white font-mono font-black animate-pulse">
                              SOS
                            </span>
                          )}
                        </div>

                        <span className="text-[10px] font-mono text-slate-400">
                          {inc.created_at
                            ? new Date(inc.created_at).toLocaleTimeString([], {
                                hour: '2-digit',
                                minute: '2-digit',
                              })
                            : 'Live'}
                        </span>
                      </div>

                      <h3 className="text-xs font-bold text-white tracking-tight capitalize">
                        {inc.type.replace('_', ' ')}
                      </h3>
                      <p className="text-[11px] text-slate-300 mt-0.5 line-clamp-1">
                        {inc.description || 'No description provided.'}
                      </p>

                      <div className="mt-2 pt-2 border-t border-[#1A2634] flex items-center justify-between text-[10px] font-mono">
                        <span className="text-slate-400">
                          Affected:{' '}
                          <strong className="text-white">{inc.affected_count || 1}</strong>
                        </span>
                        <span className="text-cyan-400 text-[10px]">
                          {inc.latitude?.toFixed(3)}°N, {inc.longitude?.toFixed(3)}°E
                        </span>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>

            {/* Selected Incident Live Inspector & Lifecycle Actions */}
            {selectedIncident && (
              <div className="mt-4 pt-4 border-t border-[#1A2634] space-y-3 bg-[#070D14] p-3.5 rounded-xl border border-[#1A2634] animate-fadeIn">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-mono font-bold text-cyan-300 uppercase">
                    INCIDENT INSPECTOR · #{selectedIncident.ticket_id}
                  </span>
                  <span
                    className={`text-[9px] font-mono font-bold px-2 py-0.5 rounded border ${getStatusBadgeStyle(
                      selectedIncident.status
                    )}`}
                  >
                    {selectedIncident.status}
                  </span>
                </div>

                <div>
                  <h4 className="text-xs font-bold text-white uppercase tracking-wide">
                    {selectedIncident.type.replace('_', ' ')} ·{' '}
                    <span className="text-rose-400">{selectedIncident.severity}</span>
                  </h4>
                  <p className="text-[11px] text-slate-300 mt-1.5 leading-relaxed bg-[#0D1520] p-2.5 rounded border border-[#1A2634]">
                    {selectedIncident.description || 'No description logged.'}
                  </p>
                </div>

                {/* Reporter & Location Metadata */}
                <div className="grid grid-cols-2 gap-2 text-[10px] text-slate-400 font-mono bg-[#0D1520]/60 p-2 rounded border border-[#1A2634]">
                  <div>
                    <span className="block text-slate-500">REPORTER:</span>
                    <strong className="text-slate-200">
                      {selectedIncident.reporter_name || 'Anonymous'}
                    </strong>
                  </div>
                  <div>
                    <span className="block text-slate-500">AFFECTED:</span>
                    <strong className="text-slate-200">
                      {selectedIncident.affected_count || 1} Persons
                    </strong>
                  </div>
                  <div className="col-span-2">
                    <span className="block text-slate-500">GPS COORDINATES:</span>
                    <strong className="text-cyan-300">
                      {selectedIncident.latitude?.toFixed(4)}° N,{' '}
                      {selectedIncident.longitude?.toFixed(4)}° E
                    </strong>
                  </div>
                </div>

                {/* Live Audit Event Timeline */}
                {selectedIncident.events && selectedIncident.events.length > 0 && (
                  <div className="space-y-1 pt-1">
                    <span className="text-[9px] font-mono font-bold text-slate-400 uppercase block">
                      Audit Event Log ({selectedIncident.events.length})
                    </span>
                    <div className="max-h-24 overflow-y-auto space-y-1 pr-1">
                      {selectedIncident.events.map((evt) => (
                        <div
                          key={evt.id || `${evt.event_type}-${evt.created_at}`}
                          className="flex items-center justify-between text-[9px] font-mono bg-[#0D1520] px-2 py-1 rounded border border-[#1A2634] text-slate-300"
                        >
                          <span className="font-bold text-cyan-400">
                            {evt.event_type} {evt.new_status ? `→ ${evt.new_status}` : ''}
                          </span>
                          <span className="text-slate-500">
                            {evt.actor} · {new Date(evt.created_at).toLocaleTimeString()}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {actionSuccessMessage && (
                  <div className="bg-emerald-950/40 border border-emerald-500/40 p-2 rounded text-[11px] font-mono text-emerald-300 text-center animate-fadeIn">
                    {actionSuccessMessage}
                  </div>
                )}

                {/* Lifecycle State Machine Transition Buttons */}
                <div className="space-y-2 pt-1">
                  {selectedIncident.status === 'NEW' && (
                    <button
                      type="button"
                      disabled={isUpdatingStatus}
                      onClick={() => handleTransition('TRIAGE_PENDING', 'Triage Initiated')}
                      className="w-full py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs tracking-wider uppercase transition-all shadow-md shadow-amber-500/20 cursor-pointer disabled:opacity-50 text-center flex items-center justify-center gap-2"
                    >
                      <span>⚡ BEGIN OPERATIONAL TRIAGE</span>
                    </button>
                  )}

                  {selectedIncident.status === 'TRIAGE_PENDING' && (
                    <button
                      type="button"
                      disabled={isUpdatingStatus}
                      onClick={() => handleTransition('VERIFIED', 'Dispatch Verified')}
                      className="w-full py-2.5 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold text-xs tracking-wider uppercase transition-all shadow-md shadow-cyan-500/20 cursor-pointer disabled:opacity-50 text-center flex items-center justify-center gap-2"
                    >
                      <span>APPROVE & VERIFY DISPATCH</span>
                    </button>
                  )}

                  {selectedIncident.status === 'VERIFIED' && (
                    <button
                      type="button"
                      disabled={isUpdatingStatus}
                      onClick={() => handleTransition('RESOLVED', 'Incident Safely Resolved')}
                      className="w-full py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs tracking-wider uppercase transition-all shadow-md shadow-emerald-950/40 cursor-pointer disabled:opacity-50 text-center flex items-center justify-center gap-2"
                    >
                      <span>✓ RESOLVE & CLOSE INCIDENT</span>
                    </button>
                  )}

                  {/* Cancel Button (available if not in terminal state) */}
                  {!['RESOLVED', 'CANCELLED'].includes(selectedIncident.status) && (
                    <button
                      type="button"
                      disabled={isUpdatingStatus}
                      onClick={() => handleTransition('CANCELLED', 'Incident Cancelled')}
                      className="w-full py-1.5 rounded-lg bg-transparent hover:bg-rose-950/20 text-slate-400 hover:text-rose-300 border border-[#1A2634] hover:border-rose-500/30 text-[10px] font-mono uppercase tracking-wider transition-colors cursor-pointer"
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
                  Fleet ({RESPONDER_MAP_POINTS.length})
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
                  Shelters ({SHELTER_MAP_POINTS.length})
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
                shelters={SHELTER_MAP_POINTS}
                responders={RESPONDER_MAP_POINTS}
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
              <SimulatedBadge label="SIMULATED FLEET" />
            </div>

            <div className="space-y-2 max-h-[220px] overflow-y-auto pr-1">
              {responders.map((resp) => (
                <div
                  key={resp.id}
                  className="bg-[#070D14] border border-[#1A2634] p-2.5 rounded-xl text-xs space-y-1"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-white text-[11px] truncate max-w-[140px]">
                      {resp.unitName}
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
                    {resp.lead} · {resp.radioChannel}
                  </p>
                  {resp.assignedTicket && (
                    <p className="text-[10px] text-cyan-300 font-mono">
                      Target: Ticket #{resp.assignedTicket} (ETA {resp.etaMinutes}m)
                    </p>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Shelter Capacity & Logistics */}
          <div className="bg-[#0D1520] border border-[#1A2634] rounded-2xl p-4 sm:p-5 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <h2 className="text-xs font-bold text-white uppercase tracking-wider font-mono">
                  Shelter Supply Hubs
                </h2>
              </div>
              <SimulatedBadge label="SIMULATED CAPACITY" />
            </div>

            <div className="space-y-2 max-h-[220px] overflow-y-auto pr-1">
              {shelters.map((shl) => (
                <div
                  key={shl.id}
                  className="bg-[#070D14] border border-[#1A2634] p-2.5 rounded-xl text-xs space-y-1.5"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-white text-[11px] truncate max-w-[150px]">
                      {shl.name.split(' ')[0]} Hub
                    </span>
                    <span className="font-mono text-[10px] text-emerald-400 font-bold">
                      {shl.availableBeds} beds left
                    </span>
                  </div>

                  <div className="w-full bg-[#0D1520] h-1.5 rounded-full overflow-hidden border border-[#1A2634]">
                    <div
                      className="h-full bg-gradient-to-r from-emerald-500 to-amber-500"
                      style={{ width: shl.occupancyRate }}
                    ></div>
                  </div>

                  <div className="flex items-center justify-between text-[9px] text-slate-400 font-mono">
                    <span>Occ: {shl.occupancyRate}</span>
                    <span>Rations: {shl.foodWaterSupply}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>
      </div>
    </div>
  )
}

export default AuthorityCommandCenter
