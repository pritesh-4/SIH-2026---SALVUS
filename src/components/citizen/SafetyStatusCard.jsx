import { Card } from '../ui/Card'
import { StatusIndicator } from '../ui/StatusIndicator'

/**
 * High-Clarity Citizen Safety Status Card
 * Answers Question 1: "Am I safe?" in under 1 second.
 */
export const SafetyStatusCard = ({
  status = 'safe',
  badgeText = 'Safe',
  title = "You're currently safe.",
  subtitle = 'No severe threats detected in your immediate area · Monitored live',
}) => {
  return (
    <Card variant="safe" padding="md" className="transition-all">
      <div className="flex items-center justify-between gap-3 mb-2.5">
        <StatusIndicator status={status} label={badgeText} showDot={true} showIcon={true} />
        <span className="text-[11px] text-salvus-text-muted">Updated live</span>
      </div>
      <h2 className="text-xl sm:text-2xl font-bold text-salvus-text-primary tracking-tight leading-snug">
        {title}
      </h2>
      <p className="text-xs sm:text-sm text-salvus-text-secondary mt-1 font-normal leading-relaxed">
        {subtitle}
      </p>
    </Card>
  )
}
