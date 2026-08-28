import { useState } from 'react'
import { Card } from '../ui/Card'
import { Button } from '../ui/Button'
import { Badge } from '../ui/Badge'

/**
 * Unmistakable Emergency SOS Card
 * Answers Question 5: "How do I get help?" with one clear, prominent action.
 */
export const EmergencyCard = ({
  badgeText = 'Emergency',
  title = 'Need immediate help?',
  description = 'Shares your location with emergency coordinators and requests nearest rescue units.',
  buttonText = 'SEND SOS',
  onSosClick,
}) => {
  const [isConnecting, setIsConnecting] = useState(false)

  const handleSos = () => {
    setIsConnecting(true)
    setTimeout(() => setIsConnecting(false), 800)
    onSosClick?.()
  }

  return (
    <Card variant="critical" padding="md" className="transition-all">
      <div className="flex items-center gap-2 mb-2">
        <Badge variant="critical" dot={true}>
          {badgeText}
        </Badge>
      </div>

      <h2 className="text-xl sm:text-2xl font-extrabold text-salvus-text-primary tracking-tight leading-snug">
        {title}
      </h2>

      <p className="text-xs sm:text-sm text-salvus-text-secondary mt-1.5 max-w-2xl leading-relaxed font-normal">
        {description}
      </p>

      <div className="mt-5 flex flex-col sm:flex-row sm:items-center gap-3">
        <Button
          variant="critical"
          size="lg"
          onClick={handleSos}
          loading={isConnecting}
          leftIcon={
            <span className="text-lg" aria-hidden="true">
              🚨
            </span>
          }
          className="font-bold tracking-wide min-w-[200px]"
        >
          {isConnecting ? 'Connecting...' : buttonText}
        </Button>
        <span className="text-xs text-salvus-text-muted">Press to request urgent assistance</span>
      </div>
    </Card>
  )
}
