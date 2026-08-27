import { Card } from '../ui/Card'
import { Badge } from '../ui/Badge'
import { Button } from '../ui/Button'

/**
 * Recommended Safe Place Card
 * Answers Question 4: "Where should I go?"
 */
export const ShelterPreviewCard = ({
  badgeText = 'Recommended Safe Place',
  name = 'Salt Lake Stadium Assembly Hub',
  distance = '350m · 4 min walk',
  capacity = '420 beds available',
  amenities = 'Medical Aid · Clean Water · Backup Power',
  actionText = 'Get Safe Route',
  onActionClick,
}) => {
  return (
    <Card padding="md" className="flex flex-col justify-between transition-all">
      <div>
        <div className="flex items-center gap-1.5 mb-2">
          <Badge variant="safe" dot={true}>
            {badgeText}
          </Badge>
        </div>

        <h3 className="text-base sm:text-lg font-bold text-salvus-text-primary tracking-tight leading-snug">
          {name}
        </h3>

        <p className="text-xs sm:text-sm text-salvus-text-secondary mt-1 font-medium">
          {distance} · <span className="text-salvus-safe font-semibold">{capacity}</span>
        </p>

        {amenities && (
          <p className="text-xs text-salvus-text-muted mt-2 flex items-center gap-1.5">
            <span className="text-salvus-safe font-bold">✓</span> {amenities}
          </p>
        )}
      </div>

      <div className="mt-4 pt-3 border-t border-salvus-border">
        <Button
          variant="secondary"
          size="sm"
          fullWidth={true}
          onClick={onActionClick}
          rightIcon={<span aria-hidden="true">→</span>}
          className="font-semibold text-xs"
        >
          {actionText}
        </Button>
      </div>
    </Card>
  )
}

export default ShelterPreviewCard
