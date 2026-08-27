import { Card } from '../ui/Card'
import { Badge } from '../ui/Badge'

/**
 * 3-Part Active Warning Card
 * Answers Question 2: "What is happening?" & Question 3: "What should I do?"
 */
export const ActiveAlertCard = ({
  badgeText = 'Weather Warning · Heavy Rain',
  headline = 'Localized waterlogging expected in low-lying areas',
  description = 'Move electrical appliances and essential supplies to elevated levels if water accumulates.',
  source = 'Official advisory · Meteorological Dept',
}) => {
  return (
    <Card variant="warning" padding="md" className="transition-all">
      <div className="flex items-center justify-between gap-3 mb-2">
        <Badge variant="warning" dot={true}>
          {badgeText}
        </Badge>
        <span className="text-[11px] text-salvus-text-muted hidden sm:inline">
          Tap to view advisories
        </span>
      </div>

      <h3 className="text-base sm:text-lg font-bold text-salvus-text-primary tracking-tight">
        {headline}
      </h3>

      <p className="text-xs sm:text-sm text-salvus-text-secondary mt-1 leading-relaxed">
        {description}
      </p>

      <div className="mt-3 pt-2.5 border-t border-salvus-border flex items-center justify-between text-xs text-salvus-text-muted">
        <span className="truncate">{source}</span>
        <span className="text-salvus-info font-semibold text-xs shrink-0 ml-2">
          Read advisory →
        </span>
      </div>
    </Card>
  )
}
