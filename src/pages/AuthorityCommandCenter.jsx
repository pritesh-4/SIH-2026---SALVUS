import { useState } from 'react'
import { authorityData } from '../data/authority/authorityMock'

export const AuthorityCommandCenter = () => {
  const { hub, metrics, incidents, responders, shelters } = authorityData

  const [selectedIncident, setSelectedIncident] = useState(incidents[0])
  const [selectedMapMarker, setSelectedMapMarker] = useState(null)
  const [activeIncidentFilter, setActiveIncidentFilter] = useState('all')
  const [mapLayer, setMapLayer] = useState('all')
  const [dispatchSuccess, setDispatchSuccess] = useState(false)

  const filteredIncidents = incidents.filter((inc) => {
    if (activeIncidentFilter === 'critical') return inc.severity === 'CRITICAL'
    if (activeIncidentFilter === 'pending') return inc.status === 'AWAITING_DISPATCH'
    return true
  })

  const handleApproveDispatch = (incidentId) => {
    setDispatchSuccess(true)
    if (selectedIncident && selectedIncident.id === incidentId) {
      setSelectedIncident((prev) => ({ ...prev, status: 'DISPATCHED' }))
    }
    setTimeout(() => setDispatchSuccess(false), 3000)
  }

  return (
    <div className="space-y-5 animate-fadeIn">
      {/* Operations Center Header Subtitle */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 bg-[#0D1520] border border-[#1A2634] px-4 py-2.5 rounded-xl text-xs">
        <div className="flex items-center gap-2">
          <span className="font-mono text-cyan-300 font-bold">{hub.name}</span>
          <span className="text-slate-600">|</span>
          <span className="text-slate-400 font-mono text-[11px]">{hub.sector}</span>
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
              <span className="text-xl font-black text-white">{metrics.activeIncidents}</span>
              <span className="text-[10px] bg-rose-500/20 text-rose-300 border border-rose-500/30 px-1.5 py-0.2 rounded font-mono font-bold">
                {metrics.criticalThreats} Critical
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
                {metrics.unitsDeployed}/{metrics.totalFleet}
              </span>
              <span className="text-[10px] text-slate-400 font-mono">Units Active</span>
            </div>
          </div>
          <span className="text-xl">🚤</span>
        </div>

        <div className="bg-[#0D1520] border border-[#1A2634] p-3.5 rounded-xl flex items-center justify-between">
          <div>
            <span className="text-[10px] font-mono font-bold uppercase text-slate-400 block">
              Citizens Evacuated
            </span>
            <div className="flex items-center gap-2 mt-0.5">
              <span className="text-xl font-black text-emerald-400">
                {metrics.citizensEvacuated}
              </span>
              <span className="text-[10px] text-slate-400 font-mono">Accounted For</span>
            </div>
          </div>
          <span className="text-xl">👥</span>
        </div>

        <div className="bg-[#0D1520] border border-[#1A2634] p-3.5 rounded-xl flex items-center justify-between">
          <div>
            <span className="text-[10px] font-mono font-bold uppercase text-slate-400 block">
              Shelter Occupancy
            </span>
            <div className="flex items-center gap-2 mt-0.5">
              <span className="text-xl font-black text-amber-400">
                {metrics.shelterOccupancyRate}
              </span>
              <span className="text-[10px] text-slate-400 font-mono">Capacity</span>
            </div>
          </div>
          <span className="text-xl">🏠</span>
        </div>

        <div className="bg-[#0D1520] border border-[#1A2634] p-3.5 rounded-xl flex items-center justify-between col-span-2 sm:col-span-1">
          <div>
            <span className="text-[10px] font-mono font-bold uppercase text-slate-400 block">
              AI Triage Score
            </span>
            <div className="flex items-center gap-2 mt-0.5">
              <span className="text-xl font-black text-cyan-400">{metrics.aiTriageAccuracy}</span>
              <span className="text-[10px] text-emerald-400 font-bold font-mono">Verified</span>
            </div>
          </div>
          <span className="text-xl">⚡</span>
        </div>
      </section>

      {/* Main 3-Column Operational Command Center Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* LEFT COLUMN: Incident Queue & AI Triage Stream (4 cols) */}
        <section aria-label="Incident Triage Queue" className="lg:col-span-4 space-y-4">
          <div className="bg-[#0D1520] border border-[#1A2634] rounded-2xl p-4 sm:p-5 flex flex-col h-full justify-between">
            <div>
              {/* Header & Filter Pills */}
              <div className="flex items-center justify-between gap-2 mb-3">
                <div>
                  <h2 className="text-sm font-bold text-white uppercase tracking-wider font-mono">
                    Incident Ingestion Queue
                  </h2>
                  <span className="text-[10px] text-slate-400">
                    Sorted by live AI Urgency Index
                  </span>
                </div>

                <div className="flex items-center gap-1">
                  {[
                    { id: 'all', label: 'All' },
                    { id: 'critical', label: 'Critical' },
                    { id: 'pending', label: 'Pending' },
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
              <div className="space-y-2.5 max-h-[320px] overflow-y-auto pr-1">
                {filteredIncidents.map((inc) => {
                  const isSelected = selectedIncident?.id === inc.id
                  const isCritical = inc.severity === 'CRITICAL'

                  return (
                    <div
                      key={inc.id}
                      onClick={() => {
                        setSelectedIncident(inc)
                        setSelectedMapMarker({ type: 'incident', data: inc })
                      }}
                      className={`p-3 rounded-xl border text-left cursor-pointer transition-all ${
                        isSelected
                          ? 'bg-[#14202E] border-cyan-500/60 shadow-lg shadow-cyan-950/40 ring-1 ring-cyan-500/40'
                          : 'bg-[#070D14] border-[#1A2634] hover:border-slate-700'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2 mb-1">
                        <div className="flex items-center gap-2">
                          <span
                            className={`px-2 py-0.2 rounded text-[9px] font-bold font-mono uppercase ${
                              isCritical
                                ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40'
                                : 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                            }`}
                          >
                            {inc.tier}
                          </span>
                          <span className="font-mono text-[10px] text-cyan-300 font-bold">
                            #{inc.citizenTicket}
                          </span>
                        </div>

                        <span className="text-[10px] font-mono text-slate-400">
                          {inc.reportedTime}
                        </span>
                      </div>

                      <h3 className="text-xs font-bold text-white tracking-tight">
                        {inc.category}
                      </h3>
                      <p className="text-[11px] text-slate-400 mt-0.5 truncate">{inc.location}</p>

                      <div className="mt-2 pt-2 border-t border-[#1A2634] flex items-center justify-between text-[10px] font-mono">
                        <span className="text-slate-400">
                          Urgency: <strong className="text-rose-400">{inc.urgencyScore}/10</strong>
                        </span>
                        <span
                          className={`font-bold ${
                            inc.status === 'AWAITING_DISPATCH'
                              ? 'text-amber-400 animate-pulse'
                              : 'text-sky-400'
                          }`}
                        >
                          {inc.status.replace('_', ' ')}
                        </span>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>

            {/* Selected Incident AI Triage Inspector */}
            {selectedIncident && (
              <div className="mt-4 pt-4 border-t border-[#1A2634] space-y-3 bg-[#070D14] p-3.5 rounded-xl border border-[#1A2634]">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-mono font-bold text-cyan-300 uppercase">
                    AI DISPATCH RECOMMENDATION
                  </span>
                  <span className="text-[10px] font-mono text-slate-400">
                    Conf:{' '}
                    <strong className="text-emerald-400">
                      {selectedIncident.aiTriage.confidence}
                    </strong>
                  </span>
                </div>

                <div>
                  <h4 className="text-xs font-bold text-white">
                    {selectedIncident.aiTriage.recommendedUnit}
                  </h4>
                  <p className="text-[10px] text-slate-400 mt-0.5 font-mono">
                    Craft:{' '}
                    <strong className="text-sky-300">
                      {selectedIncident.aiTriage.recommendedCraft}
                    </strong>{' '}
                    · Water Depth: {selectedIncident.aiTriage.depthEstimate}
                  </p>
                  <p className="text-[11px] text-slate-300 mt-1.5 leading-relaxed bg-[#0D1520] p-2.5 rounded border border-[#1A2634]">
                    {selectedIncident.aiTriage.priorityReasoning}
                  </p>
                </div>

                {/* Reporter Metadata */}
                <div className="flex items-center justify-between text-[10px] text-slate-400 pt-1 font-mono">
                  <span>Reporter: {selectedIncident.reporter.name}</span>
                  {selectedIncident.reporter.medicalNotes && (
                    <span className="text-rose-300 font-bold">
                      ⚠️ {selectedIncident.reporter.medicalNotes}
                    </span>
                  )}
                </div>

                {/* Dispatch Trigger Button */}
                <button
                  type="button"
                  onClick={() => handleApproveDispatch(selectedIncident.id)}
                  className="w-full py-2.5 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold text-xs tracking-wider uppercase transition-all shadow-md shadow-cyan-500/20 cursor-pointer text-center flex items-center justify-center gap-2"
                >
                  <span>
                    {dispatchSuccess ? '✓ DISPATCH AUTHORIZED' : 'APPROVE & DISPATCH UNIT'}
                  </span>
                </button>
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

              <div className="flex items-center gap-1 font-mono text-[10px]">
                {[
                  { id: 'all', label: 'All Layers' },
                  { id: 'incidents', label: 'Incidents' },
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

              {/* Map Markers: Incidents */}
              {(mapLayer === 'all' || mapLayer === 'incidents') &&
                incidents.map((inc) => (
                  <button
                    key={inc.id}
                    type="button"
                    onClick={() => {
                      setSelectedIncident(inc)
                      setSelectedMapMarker({ type: 'incident', data: inc })
                    }}
                    style={{
                      left: `${inc.pos.x}%`,
                      top: `${inc.pos.y}%`,
                      transform: 'translate(-50%, -50%)',
                    }}
                    className="absolute z-20 flex flex-col items-center cursor-pointer group"
                  >
                    <span className="relative flex h-6 w-6 items-center justify-center">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-500 opacity-60"></span>
                      <span className="relative inline-flex rounded-full h-3.5 w-3.5 bg-rose-600 border border-white shadow-[0_0_10px_#EF4444]"></span>
                    </span>
                    <span className="mt-0.5 text-[9px] font-mono font-bold bg-[#070D14]/90 text-rose-300 px-1 py-0.2 rounded border border-rose-500/30">
                      {inc.citizenTicket}
                    </span>
                  </button>
                ))}

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
                    {selectedMapMarker.data.name ||
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

          {/* Map Footer Legend */}
          <div className="mt-3 pt-2.5 border-t border-[#1A2634] flex items-center justify-between text-[10px] font-mono text-slate-400 flex-wrap gap-2">
            <div className="flex items-center gap-3">
              <span className="flex items-center gap-1">
                <span className="h-2 w-2 rounded-full bg-rose-500"></span> Incidents
              </span>
              <span className="flex items-center gap-1">
                <span className="h-2 w-2 rounded-full bg-sky-400"></span> Responders
              </span>
              <span className="flex items-center gap-1">
                <span className="h-2 w-2 rounded-full bg-emerald-400"></span> Shelters
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
