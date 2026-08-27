import { useMemo } from 'react'
import { Card } from '../ui/Card'
import { Badge } from '../ui/Badge'
import { getSeverityBadge, getStatusBadge } from '../../features/authority/incidents/incidentUtils'

const INCIDENT_FILTERS = [
  { id: 'all', label: 'All' },
  { id: 'immediate', label: 'Immediate' },
  { id: 'review', label: 'Review' },
  { id: 'response', label: 'Response' },
  { id: 'resolved', label: 'Resolved' },
]

/**
 * Action-Oriented Operational Incident Queue
 * Part 6: Sorts by urgency and groups by operational phase.
 */
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
  // Sort by operational urgency
  const sortedIncidents = useMemo(() => {
    return [...filteredIncidents].sort((a, b) => {
      // 1. Severity weight
      const sevWeight = { CRITICAL: 4, HIGH: 3, MEDIUM: 2, LOW: 1 }
      const aSev = sevWeight[a.severity] || 0
      const bSev = sevWeight[b.severity] || 0
      if (aSev !== bSev) return bSev - aSev

      // 2. Unassigned / SOS priority
      if (a.is_sos && !b.is_sos) return -1
      if (!a.is_sos && b.is_sos) return 1

      // 3. Status priority
      const statusWeight = {
        NEW: 4,
        TRIAGE_PENDING: 3,
        VERIFIED: 2,
        ASSIGNED: 1,
        EN_ROUTE: 1,
        NEARBY: 1,
        ON_SCENE: 1,
        RESOLVED: 0,
        CANCELLED: 0,
      }
      const aStat = statusWeight[a.status] ?? 1
      const bStat = statusWeight[b.status] ?? 1
      if (aStat !== bStat) return bStat - aStat

      // 4. Affected count
      return (b.affected_count || 1) - (a.affected_count || 1)
    })
  }, [filteredIncidents])

  return (
    <Card
      aria-label="Incident Triage Queue"
      padding="sm"
      className="lg:col-span-4 xl:col-span-3 flex flex-col space-y-3 min-h-[580px]"
    >
      {/* Queue Header */}
      <div className="flex items-center justify-between pb-2 border-b border-salvus-border">
        <div className="flex items-center gap-2">
          <h2 className="text-xs font-bold text-salvus-text-primary uppercase tracking-wider">
            Incident Queue
          </h2>
          <Badge variant="neutral" isMono={true} size="sm">
            {filteredIncidents.length}
          </Badge>
        </div>
      </div>

      {/* Action Filters */}
      <div className="flex items-center gap-1 overflow-x-auto pb-1 no-scrollbar">
        {INCIDENT_FILTERS.map((f) => (
          <button
            key={f.id}
            type="button"
            onClick={() => onFilterChange?.(f.id)}
            className={`px-2.5 py-1 rounded-lg text-xs font-medium whitespace-nowrap transition-colors cursor-pointer ${
              activeIncidentFilter === f.id
                ? 'bg-salvus-text-primary text-salvus-bg font-semibold shadow-xs'
                : 'bg-salvus-muted/40 text-salvus-text-secondary border border-salvus-border hover:text-salvus-text-primary'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Content Feed */}
      {isLoading ? (
        <div className="py-16 text-center text-xs text-salvus-text-muted">
          Updating incident feed...
        </div>
      ) : error && incidents.length === 0 ? (
        <div className="py-6 text-center text-xs text-salvus-warning bg-salvus-warning-bg border border-salvus-warning-border rounded-xl p-3">
          ⚠️ {error}
        </div>
      ) : sortedIncidents.length === 0 ? (
        <div className="py-16 text-center text-xs text-salvus-text-muted">
          No incidents matching filter.
        </div>
      ) : (
        <div className="space-y-2 max-h-[540px] overflow-y-auto pr-1">
          {sortedIncidents.map((inc) => {
            const isSelected = selectedIncident?.id === inc.id
            const isNew = newlyArrivedId === inc.id
            const sev = getSeverityBadge(inc.severity)
            const stat = getStatusBadge(inc.status)

            return (
              <div
                key={inc.id}
                onClick={() => onSelectIncident?.(inc)}
                className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
                  isSelected
                    ? 'bg-salvus-surface-elevated border-salvus-text-primary ring-1 ring-salvus-text-primary shadow-xs'
                    : 'bg-salvus-muted/30 border-salvus-border hover:border-salvus-border-strong hover:bg-salvus-surface-hover'
                } ${isNew ? 'ring-2 ring-salvus-critical' : ''}`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-bold text-salvus-text-primary text-xs font-mono">
                    #{inc.ticket_id || `SV-${(inc.id || '').slice(-4)}`}
                  </span>

                  <div className="flex items-center gap-1.5">
                    <Badge variant={sev.variant} dot={sev.dot} size="sm">
                      {sev.label}
                    </Badge>
                    <Badge variant={stat.variant} size="sm">
                      {stat.label}
                    </Badge>
                  </div>
                </div>

                <p className="text-xs text-salvus-text-secondary line-clamp-1 mt-1 font-medium">
                  {inc.description}
                </p>

                <div className="flex items-center justify-between text-xs text-salvus-text-muted mt-2 pt-1.5 border-t border-salvus-border">
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
    </Card>
  )
}

export default IncidentQueue
