import { AlertTriangle, ArrowRight } from 'lucide-react'
import { Badge } from '../ui/Badge'
import { Button } from '../ui/Button'

/**
 * Action-Oriented Attention Bar (Zone 2)
 *
 * Answers immediately: "What requires attention RIGHT NOW?"
 * - If critical threats / active SOS exist: surfaces urgent count and quick filter action
 * - If calm / all clear: provides calm assurance that response policy is nominal
 */
export const AttentionBar = ({
  criticalCount = 0,
  sosCount = 0,
  triagePendingCount = 0,
  activeFilter = 'all',
  onFilterChange,
}) => {
  const hasUrgentAttention = criticalCount > 0 || sosCount > 0 || triagePendingCount > 0

  if (!hasUrgentAttention) {
    return (
      <div
        role="region"
        aria-label="Operational Attention Status"
        className="bg-salvus-surface-elevated/70 border border-salvus-border/80 px-3.5 py-2 rounded-xl flex items-center justify-between gap-3 text-xs text-salvus-text-secondary shadow-2xs"
      >
        <div className="flex items-center gap-2 min-w-0">
          <div className="h-2 w-2 rounded-full bg-salvus-safe shrink-0 animate-pulse" />
          <span className="font-semibold text-salvus-text-primary truncate">
            All active incidents are currently within operational response policy.
          </span>
          <span className="text-salvus-text-muted hidden md:inline text-[11px]">
            · Zero unassigned SOS distress calls on grid
          </span>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <Badge variant="safe" size="sm">
            Nominal Grid Status
          </Badge>
        </div>
      </div>
    )
  }

  return (
    <div
      role="region"
      aria-label="Critical Attention Alert"
      className="bg-salvus-critical-bg/40 border border-salvus-critical-border px-3.5 py-2 rounded-xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2.5 text-xs text-salvus-critical shadow-xs animate-fadeIn"
    >
      <div className="flex items-center gap-2.5 min-w-0">
        <div className="p-1 rounded-md bg-salvus-critical text-white shrink-0">
          <AlertTriangle className="h-3.5 w-3.5" />
        </div>
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-extrabold uppercase tracking-wider text-[11px]">
              CRITICAL ATTENTION REQUIRED:
            </span>
            <span className="font-semibold text-salvus-text-primary">
              {criticalCount > 0 &&
                `${criticalCount} Critical Threat${criticalCount > 1 ? 's' : ''}`}
              {criticalCount > 0 && (sosCount > 0 || triagePendingCount > 0) && ' · '}
              {sosCount > 0 && `${sosCount} Active SOS`}
              {sosCount > 0 && triagePendingCount > 0 && ' · '}
              {triagePendingCount > 0 && `${triagePendingCount} Awaiting Triage`}
            </span>
          </div>
          <p className="text-[11px] text-salvus-critical/90 font-medium truncate hidden md:block">
            Immediate dispatcher triage and unit allocation recommended for life-safety response.
          </p>
        </div>
      </div>

      <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
        {onFilterChange && activeFilter !== 'immediate' && (
          <Button
            variant="critical"
            size="sm"
            onClick={() => onFilterChange('immediate')}
            rightIcon={<ArrowRight className="h-3 w-3" />}
            className="text-[11px] py-1 font-bold shadow-xs cursor-pointer"
          >
            Filter Immediate Queue
          </Button>
        )}
      </div>
    </div>
  )
}

export default AttentionBar
