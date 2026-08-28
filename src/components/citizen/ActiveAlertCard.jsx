import { Card } from '../ui/Card'
import { Badge } from '../ui/Badge'

/**
 * 3-Part Active Warning Card
 * Structure:
 * 1. Severity Badge & Provenance
 * 2. What Happened (headline)
 * 3. Why It Matters (description)
 * 4. What To Do (optional actionable preview)
 * 5. Official Source & Freshness
 */
export const ActiveAlertCard = ({
  variant = 'warning',
  badgeText = 'Weather Warning · Heavy Rain',
  headline = 'Localized waterlogging expected in low-lying areas',
  description = 'Move electrical appliances and essential supplies to elevated levels if water accumulates.',
  whatToDo = null,
  source = 'Official advisory · Meteorological Dept',
  distance = null,
  provenance = null,
}) => {
  const badgeVariant =
    variant === 'critical'
      ? 'critical'
      : variant === 'warning'
        ? 'warning'
        : variant === 'safe'
          ? 'safe'
          : 'info'

  return (
    <Card variant={variant} padding="md" className="transition-all">
      {/* Header: Badge, Provenance & Proximity */}
      <div className="flex items-center justify-between gap-2 mb-2 flex-wrap">
        <div className="flex items-center gap-2">
          <Badge variant={badgeVariant} dot={true}>
            {badgeText}
          </Badge>
          {provenance && (
            <span
              className={`text-[9px] px-1.5 py-0.5 rounded font-bold uppercase border ${
                provenance === 'LIVE'
                  ? 'bg-salvus-safe-bg text-salvus-safe-text border-salvus-safe-border'
                  : provenance === 'SIMULATED'
                    ? 'bg-salvus-warning-bg text-salvus-warning-text border-salvus-warning-border'
                    : 'bg-salvus-muted text-salvus-text-secondary border-salvus-border'
              }`}
            >
              {provenance}
            </span>
          )}
        </div>

        {distance && (
          <span className="text-[11px] text-salvus-text-muted flex items-center gap-1">
            <span>📍</span>
            <span>{distance}</span>
          </span>
        )}
      </div>

      {/* 1. WHAT HAPPENED */}
      <h3 className="text-base sm:text-lg font-bold text-salvus-text-primary tracking-tight">
        {headline}
      </h3>

      {/* 2. WHY IT MATTERS */}
      <p className="text-xs sm:text-sm text-salvus-text-secondary mt-1 leading-relaxed">
        {description}
      </p>

      {/* 3. WHAT TO DO (if present) */}
      {whatToDo && (
        <div className="mt-2.5 bg-salvus-muted/40 border border-salvus-border/70 rounded-lg p-2.5">
          <span className="text-[10px] font-semibold text-salvus-text-muted block mb-0.5">
            WHAT TO DO
          </span>
          <p className="text-xs text-salvus-text-primary font-medium leading-relaxed">{whatToDo}</p>
        </div>
      )}

      {/* Footer: Source & Link */}
      <div className="mt-3 pt-2.5 border-t border-salvus-border flex items-center justify-between text-xs text-salvus-text-muted">
        <span className="truncate max-w-[240px] sm:max-w-sm">{source}</span>
        <span className="text-salvus-info font-semibold text-xs shrink-0 ml-2">
          View all alerts →
        </span>
      </div>
    </Card>
  )
}

export default ActiveAlertCard
