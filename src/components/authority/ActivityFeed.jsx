import { Activity, Clock } from 'lucide-react'
import { Badge } from '../ui/Badge'

/**
 * Operational Activity Feed (Zone 6)
 *
 * Realtime operational event stream:
 * - Realtime status transitions (NEW -> VERIFIED -> ASSIGNED -> EN_ROUTE -> ON_SCENE -> RESOLVED)
 * - Incident arrivals & SOS beacon logs
 * - Unit dispatch and reassignments
 *
 * Grounded in authentic events only.
 */
export const ActivityFeed = ({ events = [] }) => {
  if (!events || events.length === 0) {
    return null
  }

  const formatEventTime = (isoOrDate) => {
    if (!isoOrDate) return 'Live'
    try {
      const d = new Date(isoOrDate)
      return d.toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      })
    } catch {
      return 'Live'
    }
  }

  const getEventBadge = (type) => {
    switch (type) {
      case 'SOS_CREATED':
      case 'CRITICAL':
        return { variant: 'critical', label: 'SOS' }
      case 'ASSIGNED':
      case 'DISPATCH':
        return { variant: 'info', label: 'DISPATCH' }
      case 'VERIFIED':
        return { variant: 'safe', label: 'VERIFIED' }
      case 'RESOLVED':
        return { variant: 'safe', label: 'RESOLVED' }
      case 'CANCELLED':
        return { variant: 'neutral', label: 'CANCELLED' }
      default:
        return { variant: 'neutral', label: type || 'EVENT' }
    }
  }

  return (
    <div
      aria-label="Realtime Operational Event Log"
      className="bg-salvus-surface border border-salvus-border rounded-xl p-3 shadow-xs space-y-2 text-xs"
    >
      <div className="flex items-center justify-between pb-1.5 border-b border-salvus-border">
        <div className="flex items-center gap-1.5 font-bold text-salvus-text-primary uppercase tracking-wider text-[11px]">
          <Activity className="h-3.5 w-3.5 text-salvus-info" />
          <span>Operational Event Stream</span>
        </div>
        <span className="text-[10px] text-salvus-text-muted font-mono">{events.length} logged</span>
      </div>

      <div className="space-y-1.5 max-h-36 overflow-y-auto pr-1">
        {events.slice(0, 10).map((evt, idx) => {
          const badge = getEventBadge(evt.type || evt.event_type)
          return (
            <div
              key={evt.id || idx}
              className="flex items-center justify-between gap-2 p-1.5 bg-salvus-muted/20 border border-salvus-border/50 rounded-lg text-[11px]"
            >
              <div className="flex items-center gap-2 min-w-0">
                <span className="text-salvus-text-muted font-mono text-[10px] shrink-0 flex items-center gap-0.5">
                  <Clock className="h-2.5 w-2.5" />
                  {formatEventTime(evt.timestamp || evt.created_at)}
                </span>
                <Badge variant={badge.variant} size="sm" isMono={true}>
                  {badge.label}
                </Badge>
                <span className="text-salvus-text-primary font-medium truncate">
                  {evt.message || evt.description || `Event #${evt.id}`}
                </span>
              </div>

              {evt.ticket_id && (
                <span className="font-mono font-bold text-salvus-text-muted text-[10px] shrink-0">
                  #{evt.ticket_id}
                </span>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

export default ActivityFeed
