export const ResponderPanel = ({
  filteredFleet = [],
  isLoadingFleet = false,
  fleetCapabilityFilter = 'all',
  fleetStatusFilter = 'all',
  selectedResponderDetail = null,
  selectedIncident = null,
  onCapabilityFilterChange,
  onStatusFilterChange,
  onSelectResponderDetail,
  onCloseResponderDetail,
  onSelectCandidateRoute,
  onUpdateResponderStatus,
}) => {
  return (
    <div className="space-y-2.5 flex-1 flex flex-col justify-between overflow-y-auto pr-1">
      <div className="space-y-2">
        <div className="grid grid-cols-2 gap-1.5 text-[10px] font-mono">
          <select
            value={fleetCapabilityFilter}
            onChange={(e) => onCapabilityFilterChange && onCapabilityFilterChange(e.target.value)}
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
            onChange={(e) => onStatusFilterChange && onStatusFilterChange(e.target.value)}
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
                onClick={() => onSelectResponderDetail && onSelectResponderDetail(resp)}
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
              onClick={onCloseResponderDetail}
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
                {selectedResponderDetail.current_load} / {selectedResponderDetail.max_capacity}
              </span>
            </div>
          </div>
          {selectedResponderDetail.assigned_incident_id && (
            <div className="bg-[#121B27] p-1.5 rounded text-[10px] font-mono text-blue-300">
              Assigned to Ticket #{selectedResponderDetail.assigned_incident_id}
            </div>
          )}
          {selectedIncident && (
            <button
              type="button"
              onClick={() =>
                onSelectCandidateRoute && onSelectCandidateRoute(selectedResponderDetail)
              }
              className="w-full py-1.5 px-2 rounded-lg bg-sky-950/80 hover:bg-sky-900 border border-sky-500/40 text-sky-300 text-[10px] font-mono font-bold uppercase transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <span>
                📍 Plot Route to Incident #
                {selectedIncident.ticket_id || selectedIncident.id?.slice(0, 6)}
              </span>
            </button>
          )}
          <div className="grid grid-cols-3 gap-1 pt-1">
            <button
              type="button"
              onClick={() =>
                onUpdateResponderStatus &&
                onUpdateResponderStatus(selectedResponderDetail.id, 'AVAILABLE', null)
              }
              className="py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 text-[9px] font-mono uppercase cursor-pointer"
            >
              Set Available
            </button>
            <button
              type="button"
              onClick={() =>
                onUpdateResponderStatus &&
                onUpdateResponderStatus(selectedResponderDetail.id, 'ON_SCENE')
              }
              className="py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 text-[9px] font-mono uppercase cursor-pointer"
            >
              Set On Scene
            </button>
            <button
              type="button"
              onClick={() =>
                onUpdateResponderStatus &&
                onUpdateResponderStatus(selectedResponderDetail.id, 'OFFLINE')
              }
              className="py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 text-[9px] font-mono uppercase cursor-pointer"
            >
              Set Offline
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

export default ResponderPanel
