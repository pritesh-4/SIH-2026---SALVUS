import { Card } from '../ui/Card'
import { Badge } from '../ui/Badge'
import { Button } from '../ui/Button'

/**
 * Report a Hazard Card
 * Simple community hazard contribution card.
 */
export const ReportIncidentCard = ({
  badgeText = 'Community Safety',
  title = 'Report a Hazard',
  subtitle = 'Help alert neighbors to flooded roads, fallen lines, or blocked pathways.',
  actionText = 'Report a Hazard',
  onActionClick,
}) => {
  return (
    <Card padding="md" className="flex flex-col justify-between transition-all">
      <div>
        <div className="flex items-center gap-1.5 mb-2">
          <Badge variant="neutral" dot={true}>
            {badgeText}
          </Badge>
        </div>

        <h3 className="text-base sm:text-lg font-bold text-salvus-text-primary tracking-tight leading-snug">
          {title}
        </h3>

        <p className="text-xs sm:text-sm text-salvus-text-secondary mt-1 leading-relaxed">
          {subtitle}
        </p>
      </div>

      <div className="mt-4 pt-3 border-t border-salvus-border">
        <Button
          variant="secondary"
          size="sm"
          fullWidth={true}
          onClick={onActionClick}
          leftIcon={<span aria-hidden="true">📍</span>}
          className="font-semibold text-xs"
        >
          {actionText}
        </Button>
      </div>
    </Card>
  )
}
