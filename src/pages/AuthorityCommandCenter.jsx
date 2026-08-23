import { useState, useMemo } from 'react'
import { authorityData } from '../data/authority/authorityMock'
import { useAuthorityIncidents } from '../features/authority/useAuthorityIncidents'

// Convert GPS coordinates to radar canvas percentages
const mapGpsToRadar = (lat, lng) => {
  const latMin = 22.53
  const latMax = 22.61
  const lngMin = 88.33
  const lngMax = 88.47

  const safeLat = Number(lat) || 22.5726
  const safeLng = Number(lng) || 88.3639

  const x = Math.min(90, Math.max(10, ((safeLng - lngMin) / (lngMax - lngMin)) * 100))
  const y = Math.min(90, Math.max(10, (1 - (safeLat - latMin) / (latMax - latMin)) * 100))

  return { x, y }
}

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
  } = useAuthorityIncidents()

  const [selectedMapMarker, setSelectedMapMarker] = useState(null)
  const [activeIncidentFilter, setActiveIncidentFilter] = useState('all')
  const [mapLayer, setMapLayer] = useState('all')
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
      {/* Realtime Connectivity Alert Banner (if offline/reconnecting) */}
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
          <span className="text-[10px] font-mono text-amber-300 uppercase">Auto-reconnecting</span>
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
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400"></span>
            {incidents.length} Records in Database
          </span>
        </div>
        <div className="flex items-center gap-2 font-mono text-[11px] text-amber-300">
          <span>🌧️ {hub.weatherCondition}</span>
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
            <span className="text-[10px] font-mono font-bold uppercase text-slate-400 block">
              Deployed Fleet
            </span>
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
            <span className="text-[10px] font-mono font-bold uppercase text-slate-400 block">
              Shelter Available
            </span>
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
                  <span className="text-[10px] text-slate-400">
                    Realtime ingestion from Salvus pipeline
                  </span>
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

              {/* Incidents List */}
              <div className="space-y-2.5 max-h-[340px] overflow-y-auto pr-1">
                {isLoading && (
                  <div className="py-8 text-center text-xs text-slate-400 font-mono">
                    <span className="animate-pulse">Loading active incident grid...</span>
                  </div>
                )}

                {error && !isLoading && (
                  <div className="p-3 bg-rose-950/30 border border-rose-500/40 rounded-xl text-xs text-rose-300">
                    {error}
                  </div>
                )}

                {!isLoading && filteredIncidents.length === 0 && (
                  <div className="py-8 text-center text-xs text-slate-500 font-mono">
                    No incidents matching active filter.
                  </div>
                )}

                {filteredIncidents.map((inc) => {
                  const isSelected = selectedIncident?.id === inc.id
                  const isNewlyArrived = newlyArrivedId === inc.id

                  return (
                    <div
                      key={inc.id}
                      onClick={() => {
                        setSelectedIncident(inc)
                        setSelectedMapMarker({ type: 'incident', data: inc })
                      }}
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

        {/* CENTER COLUMN: Tactical Operational Command Map (5 cols) */}
        <section
          aria-label="Tactical Command Map"
          className="lg:col-span-5 flex flex-col justify-between bg-[#0D1520] border border-[#1A2634] rounded-2xl p-4 sm:p-5 relative overflow-hidden min-h-[520px]"
        >
          <div>
            {/* Map Header & Layer Filters */}
            <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
              <div className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-emerald-400 animate-ping"></span>
                <h2 className="text-sm font-bold text-white uppercase tracking-wider font-mono">
                  Tactical Operational Grid
                </h2>
              </div>

              <div className="flex items-center gap-1 font-mono text-[10px] flex-wrap">
                {[
                  { id: 'all', label: 'All' },
                  { id: 'incidents', label: `Incidents (${incidents.length})` },
                  { id: 'responders', label: 'Fleet' },
                  { id: 'shelters', label: 'Shelters' },
                ].map((l) => (
                  <button
                    key={l.id}
                    type="button"
                    onClick={() => setMapLayer(l.id)}
                    className={`px-2 py-0.5 rounded uppercase font-bold transition-colors cursor-pointer ${
                      mapLayer === l.id
                        ? 'bg-cyan-500 text-slate-950'
                        : 'bg-[#070D14] text-slate-400 border border-[#1A2634] hover:text-white'
                    }`}
                  >
                    {l.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Tactical Vector Viewport */}
            <div className="relative w-full h-[370px] rounded-xl bg-[#070D14] border border-[#172535] overflow-hidden">
              {/* Radar Grid Lines */}
              <div className="absolute inset-0 flex flex-col justify-between py-6 px-4 pointer-events-none opacity-20">
                <div className="w-full h-px bg-cyan-500/50"></div>
                <div className="w-full h-px bg-cyan-500/50"></div>
                <div className="w-full h-px bg-cyan-500/50"></div>
                <div className="w-full h-px bg-cyan-500/50"></div>
              </div>
              <div className="absolute inset-0 flex justify-between px-8 pointer-events-none opacity-20">
                <div className="h-full w-px bg-cyan-500/50"></div>
                <div className="h-full w-px bg-cyan-500/50"></div>
                <div className="h-full w-px bg-cyan-500/50"></div>
              </div>

              {/* Concentric Radar Rings */}
              <div className="absolute left-[50%] top-[50%] -translate-x-1/2 -translate-y-1/2 w-[340px] h-[340px] rounded-full border border-cyan-500/15 pointer-events-none"></div>
              <div className="absolute left-[50%] top-[50%] -translate-x-1/2 -translate-y-1/2 w-[220px] h-[220px] rounded-full border border-cyan-500/20 pointer-events-none"></div>

              {/* Flood Inundation Hydro-Contour Zone */}
              <div className="absolute left-[54%] top-[48%] -translate-x-1/2 -translate-y-1/2 w-[360px] h-[240px] rounded-full bg-blue-950/30 border border-cyan-500/30 blur-[1px] pointer-events-none"></div>

              {/* Real Map Markers: Database Incidents */}
              {(mapLayer === 'all' || mapLayer === 'incidents') &&
                incidents.map((inc) => {
                  const pos = mapGpsToRadar(inc.latitude, inc.longitude)
                  const isSelected = selectedIncident?.id === inc.id
                  const isResolved = inc.status === 'RESOLVED'
                  const isCancelled = inc.status === 'CANCELLED'
                  const isVerified = inc.status === 'VERIFIED'
                  const isCritical = inc.severity === 'CRITICAL'

                  return (
                    <button
                      key={inc.id}
                      type="button"
                      onClick={() => {
                        setSelectedIncident(inc)
                        setSelectedMapMarker({ type: 'incident', data: inc })
                      }}
                      style={{
                        left: `${pos.x}%`,
                        top: `${pos.y}%`,
                        transform: 'translate(-50%, -50%)',
                      }}
                      className={`absolute z-20 flex flex-col items-center cursor-pointer transition-all duration-300 ${
                        isSelected ? 'scale-125 z-30' : 'hover:scale-110'
                      }`}
                    >
                      <span className="relative flex h-6 w-6 items-center justify-center">
                        {!isResolved && !isCancelled && (
                          <span
                            className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-60 ${
                              isCritical
                                ? 'bg-rose-500'
                                : isVerified
                                  ? 'bg-sky-400'
                                  : 'bg-amber-400'
                            }`}
                          ></span>
                        )}
                        <span
                          className={`relative inline-flex rounded-full h-3.5 w-3.5 border border-white shadow-md ${
                            isResolved
                              ? 'bg-emerald-500 shadow-emerald-500/50'
                              : isCancelled
                                ? 'bg-slate-600 shadow-slate-600/50'
                                : isVerified
                                  ? 'bg-sky-500 shadow-sky-500/50'
                                  : isCritical
                                    ? 'bg-rose-600 shadow-[0_0_10px_#EF4444]'
                                    : 'bg-amber-500 shadow-amber-500/50'
                          }`}
                        ></span>
                      </span>
                      <span
                        className={`mt-0.5 text-[8px] font-mono font-bold px-1 py-0.2 rounded border ${
                          isSelected
                            ? 'bg-cyan-500 text-slate-950 border-cyan-400'
                            : isResolved
                              ? 'bg-[#070D14]/90 text-emerald-300 border-emerald-500/30'
                              : isCancelled
                                ? 'bg-[#070D14]/90 text-slate-400 border-slate-700'
                                : isVerified
                                  ? 'bg-[#070D14]/90 text-sky-300 border-sky-500/30'
                                  : 'bg-[#070D14]/90 text-rose-300 border-rose-500/30'
                        }`}
                      >
                        {inc.ticket_id}
                      </span>
                    </button>
                  )
                })}

              {/* Map Markers: Responders */}
              {(mapLayer === 'all' || mapLayer === 'responders') &&
                responders.map((resp) => (
                  <button
                    key={resp.id}
                    type="button"
                    onClick={() => setSelectedMapMarker({ type: 'responder', data: resp })}
                    style={{
                      left: `${resp.coordinates.x}%`,
                      top: `${resp.coordinates.y}%`,
                      transform: 'translate(-50%, -50%)',
                    }}
                    className="absolute z-20 flex flex-col items-center cursor-pointer group"
                  >
                    <div className="h-6 w-6 rounded-lg bg-sky-600 border border-sky-300 text-white flex items-center justify-center text-[10px] shadow-lg shadow-sky-950/60 ring-2 ring-sky-400/30">
                      🚤
                    </div>
                    <span className="mt-0.5 text-[8px] font-mono font-bold bg-[#070D14]/90 text-sky-300 px-1 rounded border border-sky-500/30">
                      {resp.unitName.split(' ')[0]}
                    </span>
                  </button>
                ))}

              {/* Map Markers: Shelters */}
              {(mapLayer === 'all' || mapLayer === 'shelters') &&
                shelters.map((shl) => (
                  <button
                    key={shl.id}
                    type="button"
                    onClick={() => setSelectedMapMarker({ type: 'shelter', data: shl })}
                    style={{
                      left: `${shl.pos.x}%`,
                      top: `${shl.pos.y}%`,
                      transform: 'translate(-50%, -50%)',
                    }}
                    className="absolute z-20 flex flex-col items-center cursor-pointer group"
                  >
                    <div className="h-6 w-6 rounded-lg bg-emerald-600 border border-emerald-300 text-white flex items-center justify-center text-[10px] shadow-lg shadow-emerald-950/60">
                      🏠
                    </div>
                    <span className="mt-0.5 text-[8px] font-mono font-bold bg-[#070D14]/90 text-emerald-300 px-1 rounded border border-emerald-500/30">
                      {shl.name.split(' ')[0]}
                    </span>
                  </button>
                ))}
            </div>

            {/* Selected Map Marker Telemetry Strip */}
            {selectedMapMarker && (
              <div className="mt-2 bg-[#070D14] border border-cyan-500/40 p-2.5 rounded-xl flex items-center justify-between text-xs animate-fadeIn">
                <div className="flex items-center gap-2">
                  <span className="text-cyan-400 font-bold font-mono uppercase text-[10px]">
                    Inspecting {selectedMapMarker.type}:
                  </span>
                  <span className="text-white font-bold">
                    {selectedMapMarker.data.ticket_id
                      ? `#${selectedMapMarker.data.ticket_id} (${selectedMapMarker.data.type})`
                      : selectedMapMarker.data.name ||
                        selectedMapMarker.data.category ||
                        selectedMapMarker.data.unitName}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedMapMarker(null)}
                  className="text-slate-400 hover:text-white text-xs px-1 font-mono cursor-pointer"
                >
                  ✕
                </button>
              </div>
            )}
          </div>

          {/* Map Footer Legend with lifecycle distinction */}
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
            <span>Sector 12 Hydrographic Overlay</span>
          </div>
        </section>

        {/* RIGHT COLUMN: Fleet Matrix & Shelter Logistics (3 cols) */}
        <section aria-label="Fleet and Shelter Logistics" className="lg:col-span-3 space-y-4">
          {/* Responder Fleet Status */}
          <div className="bg-[#0D1520] border border-[#1A2634] rounded-2xl p-4 sm:p-5 space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-xs font-bold text-white uppercase tracking-wider font-mono">
                Responder Fleet Matrix
              </h2>
              <span className="text-[10px] font-mono text-cyan-400">{responders.length} Units</span>
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
              <h2 className="text-xs font-bold text-white uppercase tracking-wider font-mono">
                Shelter Supply Hubs
              </h2>
              <span className="text-[10px] font-mono text-emerald-400">Live Logistics</span>
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
