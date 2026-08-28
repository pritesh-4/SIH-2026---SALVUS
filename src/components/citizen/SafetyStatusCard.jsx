import { Card } from '../ui/Card'
import { StatusIndicator } from '../ui/StatusIndicator'

/**
 * High-Clarity Citizen Safety Status Card (Build 03)
 *
 * Answers Question 1: "Am I safe?" in under 1 second.
 * Supports distinct states:
 * - SAFE (No known active hazards detected)
 * - WATCH (Environmental advisory active in basin)
 * - WARNING (Hazard warning in sector)
 * - CRITICAL (Severe threat in immediate area)
 * - NO_DATA (Status unconfirmed / telemetry offline)
 * - LOCATION_REQUIRED (Location access off)
 */
export const SafetyStatusCard = ({
  level = 'SAFE',
  status = null,
  badgeText = null,
  title = "You're currently safe.",
  subtitle = 'No active threats detected in your immediate sector · Monitored live',
  freshnessLabel = 'Updated just now',
  onLocationPrompt = null,
}) => {
  const normLevel = (status || level || 'SAFE').toUpperCase()

  let cardVariant = 'safe'
  let indicatorStatus = 'safe'
  let defaultBadge = 'No Known Active Hazards'

  if (normLevel === 'CRITICAL') {
    cardVariant = 'critical'
    indicatorStatus = 'critical'
    defaultBadge = 'Critical Threat'
  } else if (normLevel === 'WARNING') {
    cardVariant = 'warning'
    indicatorStatus = 'warning'
    defaultBadge = 'Active Warning'
  } else if (normLevel === 'WATCH') {
    cardVariant = 'warning'
    indicatorStatus = 'warning'
    defaultBadge = 'Advisory Watch'
  } else if (normLevel === 'NO_DATA') {
    cardVariant = 'neutral'
    indicatorStatus = 'neutral'
    defaultBadge = 'Status Unconfirmed'
  } else if (normLevel === 'LOCATION_REQUIRED') {
    cardVariant = 'neutral'
    indicatorStatus = 'neutral'
    defaultBadge = 'Location Access Off'
  }

  const finalBadge = badgeText || defaultBadge

  return (
    <Card variant={cardVariant} padding="md" className="transition-all relative overflow-hidden">
      <div className="flex items-center justify-between gap-3 mb-2.5 flex-wrap">
        <StatusIndicator
          status={indicatorStatus}
          label={finalBadge}
          showDot={true}
          showIcon={true}
        />
        <span className="text-[11px] text-salvus-text-muted font-mono">{freshnessLabel}</span>
      </div>

      <h2 className="text-xl sm:text-2xl font-bold text-salvus-text-primary tracking-tight leading-snug">
        {title}
      </h2>

      <p className="text-xs sm:text-sm text-salvus-text-secondary mt-1 font-normal leading-relaxed">
        {subtitle}
      </p>

      {normLevel === 'LOCATION_REQUIRED' && onLocationPrompt && (
        <div className="mt-3 pt-2.5 border-t border-salvus-border flex items-center justify-between">
          <span className="text-xs text-salvus-text-muted">
            Enable GPS or select a sector landmark
          </span>
          <button
            type="button"
            onClick={onLocationPrompt}
            className="text-xs font-bold text-salvus-info hover:underline cursor-pointer"
          >
            Detect Location →
          </button>
        </div>
      )}
    </Card>
  )
}

export default SafetyStatusCard
