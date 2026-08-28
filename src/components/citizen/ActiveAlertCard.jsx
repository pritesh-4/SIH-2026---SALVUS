import { Card } from '../ui/Card'
import { Badge } from '../ui/Badge'

/**
 * 3-Part Active Warning Card (Master Prompt 2 - Step 9 & 10)
 *
 * Structure:
 * 1. Severity & Distance Badge
 * 2. WHAT HAPPENED? (headline)
 * 3. WHY DOES IT MATTER HERE? (description)
 * 4. WHAT TO DO (direct actionable advice)
 * 5. Official Source & Timestamp (secondary)
 */
export const ActiveAlertCard = ({
  variant = 'warning',
  badgeText = 'Weather Warning · Heavy Rain',
  headline = 'Localized waterlogging expected in low-lying areas',
  description = 'Heavy rainfall is increasing flood risk near your location.',
  whatToDo = 'Move electrical appliances and supplies to elevated floors. Avoid flooded roads.',
  source = 'Meteorological Department & Civil Defense',
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
    <Card
      variant={variant}
      padding="md"
      className="transition-all hover:border-salvus-border-strong focus-within:ring-2 focus-within:ring-salvus-info"
    >
      {/* Header: Badge, Provenance & Proximity */}
      <div className="flex items-center justify-between gap-2 mb-2.5 flex-wrap">
        <div className="flex items-center gap-2">
          <Badge variant={badgeVariant} dot={true}>
            {badgeText}
          </Badge>
          {provenance && (
            <span
              className={`text-[10px] px-1.5 py-0.5 rounded font-mono font-bold uppercase border ${
                provenance === 'LIVE'
                  ? 'bg-emerald-950/70 text-emerald-300 border-emerald-500/40'
                  : provenance === 'SIMULATED'
                    ? 'bg-amber-950/70 text-amber-300 border-amber-500/40'
                    : 'bg-salvus-muted text-salvus-text-secondary border-salvus-border'
              }`}
            >
              {provenance}
            </span>
          )}
        </div>

        {distance && (
          <span className="text-xs text-salvus-text-muted flex items-center gap-1 font-medium">
            <span>📍</span>
            <span>{distance}</span>
          </span>
        )}
      </div>

      {/* 1. WHAT HAPPENED */}
      <h2 className="text-base sm:text-lg font-bold text-salvus-text-primary tracking-tight">
        {headline}
      </h2>

      {/* 2. WHY DOES IT MATTER HERE */}
      <p className="text-xs sm:text-sm text-salvus-text-secondary mt-1 leading-relaxed font-normal">
        {description}
      </p>

      {/* 3. WHAT TO DO */}
      {whatToDo && (
        <div className="mt-3 bg-salvus-muted/40 border border-salvus-border rounded-xl p-3">
          <span className="text-[10px] font-bold uppercase tracking-wider text-salvus-text-muted block mb-1">
            WHAT TO DO
          </span>
          <p className="text-xs text-salvus-text-primary font-medium leading-relaxed">{whatToDo}</p>
        </div>
      )}

      {/* Footer: Source & Link */}
      <div className="mt-3 pt-2.5 border-t border-salvus-border flex flex-col sm:flex-row sm:items-center justify-between gap-1.5 text-xs text-salvus-text-muted">
        <span className="truncate max-w-[280px] sm:max-w-sm">Source: {source}</span>
        <span className="text-salvus-info font-semibold text-xs shrink-0 self-start sm:self-auto">
          View full alert details →
        </span>
      </div>
    </Card>
  )
}

export default ActiveAlertCard
