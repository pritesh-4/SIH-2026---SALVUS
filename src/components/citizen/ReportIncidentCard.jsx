import { Card } from '../ui/Card'
import { Badge } from '../ui/Badge'
import { Button } from '../ui/Button'

/**
 * Community Hazard Reporting Card (Master Prompt 2 - Step 11)
 *
 * Supportive secondary action for community safety.
 */
export const ReportIncidentCard = ({
  badgeText = 'COMMUNITY SAFETY',
  title = 'Report a Local Hazard',
  subtitle = 'Alert neighbors and coordinators to flooded roads, downed power lines, or blocked routes.',
  actionText = 'Report a Hazard',
  onActionClick,
}) => {
  return (
    <Card
      padding="md"
      className="flex flex-col justify-between transition-all hover:border-salvus-border-strong focus-within:ring-2 focus-within:ring-salvus-info"
    >
      <div>
        <div className="flex items-center gap-1.5 mb-2.5">
          <Badge variant="neutral" dot={true}>
            {badgeText}
          </Badge>
        </div>

        <h2 className="text-base sm:text-lg font-bold text-salvus-text-primary tracking-tight leading-snug">
          {title}
        </h2>

        <p className="text-xs sm:text-sm text-salvus-text-secondary mt-1 leading-relaxed font-normal">
          {subtitle}
        </p>
      </div>

      <div className="mt-4 pt-3 border-t border-salvus-border">
        <Button
          variant="secondary"
          size="md"
          fullWidth={true}
          onClick={onActionClick}
          leftIcon={<span aria-hidden="true">📍</span>}
          className="font-bold text-xs sm:text-sm min-h-[44px] cursor-pointer"
        >
          {actionText}
        </Button>
      </div>
    </Card>
  )
}

export default ReportIncidentCard
