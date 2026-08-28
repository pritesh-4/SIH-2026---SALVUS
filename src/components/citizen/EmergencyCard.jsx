import { Card } from '../ui/Card'
import { Button } from '../ui/Button'
import { Badge } from '../ui/Badge'

/**
 * Unmistakable Emergency SOS Card (Master Prompt 2 - Step 3)
 *
 * Structure:
 * EMERGENCY
 * Need immediate help?
 * Shares your current location with response coordinators.
 * [ SEND SOS ]
 */
export const EmergencyCard = ({
  badgeText = 'EMERGENCY',
  title = 'Need immediate help?',
  description = 'Shares your current location with response coordinators.',
  buttonText = 'SEND SOS',
  onSosClick,
}) => {
  return (
    <Card
      variant="critical"
      padding="lg"
      className="transition-all relative overflow-hidden focus-within:ring-2 focus-within:ring-salvus-critical"
    >
      <div className="flex items-center gap-2 mb-2">
        <Badge variant="critical" dot={true}>
          {badgeText}
        </Badge>
      </div>

      <h2 className="text-xl sm:text-2xl font-extrabold text-salvus-text-primary tracking-tight leading-snug">
        {title}
      </h2>

      <p className="text-xs sm:text-sm text-salvus-text-secondary mt-1.5 max-w-xl leading-relaxed font-normal">
        {description}
      </p>

      <div className="mt-5 flex flex-col sm:flex-row sm:items-center gap-3">
        <Button
          variant="critical"
          size="lg"
          onClick={onSosClick}
          leftIcon={
            <span className="text-xl" aria-hidden="true">
              🚨
            </span>
          }
          className="font-extrabold tracking-wider text-sm sm:text-base py-3.5 px-8 min-h-[52px] w-full sm:w-auto shadow-md active:scale-[0.98] transition-transform cursor-pointer"
        >
          {buttonText}
        </Button>
        <span className="text-xs text-salvus-text-muted">
          Press to alert emergency response coordinators
        </span>
      </div>
    </Card>
  )
}

export default EmergencyCard
