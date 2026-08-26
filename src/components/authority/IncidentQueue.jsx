import { getSeverityBadge, getStatusBadge } from '../../features/authority/incidents/incidentUtils'

const INCIDENT_FILTERS = [
  { id: 'all', label: 'All' },
  { id: 'immediate', label: 'Immediate' },
  { id: 'review', label: 'Review' },
  { id: 'response', label: 'Response' },
  { id: 'resolved', label: 'Resolved' },
]

export const IncidentQueue = ({
  incidents = [],
  filteredIncidents = [],
  selectedIncident = null,
  activeIncidentFilter = 'all',
  onFilterChange,
  onSelectIncident,
  isLoading = false,
  error = null,
  newlyArrivedId = null,
}) => {
  return (
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
        {INCIDENT_FILTERS.map((f) => (
          <button
            key={f.id}
            type="button"
            onClick={() => onFilterChange && onFilterChange(f.id)}
            className={`px-2 py-1 rounded text-[10px] font-mono font-medium uppercase whitespace-nowrap transition-colors cursor-pointer ${
              activeIncidentFilter === f.id
                ? 'bg-slate-700 text-white font-semibold'
                : 'bg-[#080C12] text-slate-400 border border-[#182332]'
            }`}
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
                onClick={() => onSelectIncident && onSelectIncident(inc)}
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
                <p className="text-[11px] text-slate-400 line-clamp-1 mt-1.5">{inc.description}</p>
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
  )
}

export default IncidentQueue
