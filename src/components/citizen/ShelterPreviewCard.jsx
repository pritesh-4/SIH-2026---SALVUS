import { Card } from '../ui/Card'
import { Badge } from '../ui/Badge'
import { Button } from '../ui/Button'

/**
 * Recommended Safe Place Card (Master Prompt 2 - Step 8)
 *
 * Primary question answered: "WHERE SHOULD I GO?"
 * Displays:
 * - RECOMMENDED SAFE PLACE badge
 * - Name
 * - Distance & Travel time
 * - Verified capacity
 * - Important facilities (Medical Aid, Clean Water, etc.)
 * - Primary Action: [ GET SAFE ROUTE ]
 */
export const ShelterPreviewCard = ({
  badgeText = 'RECOMMENDED SAFE PLACE',
  name = 'Salt Lake Stadium Emergency Assembly Hub',
  distance = '350m',
  travelTime = '~4 min walk',
  capacity = '420 beds available',
  amenities = 'Medical Aid · Clean Water · Backup Power',
  actionText = 'Get Safe Route',
  onActionClick,
}) => {
  return (
    <Card
      padding="md"
      className="flex flex-col justify-between transition-all hover:border-salvus-border-strong focus-within:ring-2 focus-within:ring-salvus-safe"
    >
      <div>
        <div className="flex items-center gap-1.5 mb-2.5">
          <Badge variant="safe" dot={true}>
            {badgeText}
          </Badge>
        </div>

        <h2 className="text-base sm:text-lg font-bold text-salvus-text-primary tracking-tight leading-snug">
          {name}
        </h2>

        <div className="flex items-center gap-2 text-xs sm:text-sm text-salvus-text-secondary mt-1.5 font-medium flex-wrap">
          <span className="font-semibold text-salvus-text-primary">{distance}</span>
          <span>·</span>
          <span>{travelTime}</span>
          {capacity && (
            <>
              <span>·</span>
              <span className="text-salvus-safe font-bold">{capacity}</span>
            </>
          )}
        </div>

        {amenities && (
          <div className="mt-3 p-2.5 rounded-xl bg-salvus-muted/40 border border-salvus-border text-xs text-salvus-text-secondary">
            <span className="text-[10px] font-bold uppercase tracking-wider text-salvus-text-muted block mb-0.5">
              Available Facilities
            </span>
            <p className="text-salvus-text-primary font-medium">{amenities}</p>
          </div>
        )}
      </div>

      <div className="mt-4 pt-3 border-t border-salvus-border">
        <Button
          variant="safe"
          size="md"
          fullWidth={true}
          onClick={onActionClick}
          rightIcon={<span aria-hidden="true">→</span>}
          className="font-bold text-xs sm:text-sm min-h-[44px] cursor-pointer"
        >
          {actionText}
        </Button>
      </div>
    </Card>
  )
}

export default ShelterPreviewCard
