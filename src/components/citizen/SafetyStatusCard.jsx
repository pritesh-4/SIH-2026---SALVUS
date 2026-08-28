import { Card } from '../ui/Card'
import { StatusIndicator } from '../ui/StatusIndicator'

/**
 * Citizen Safety Status Card (Master Prompt 2 - Step 1 & 2)
 *
 * Primary question answered in under 1 second: "AM I SAFE?"
 * Plain, reassuring language without operational jargon.
 */
export const SafetyStatusCard = ({
  level = 'SAFE',
  status = null,
  badgeText = null,
  title = "You're currently safe.",
  subtitle = 'No known active hazards near you.',
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
    defaultBadge = 'Critical Hazard Active'
  } else if (normLevel === 'WARNING') {
    cardVariant = 'warning'
    indicatorStatus = 'warning'
    defaultBadge = 'Active Hazard Advisory'
  } else if (normLevel === 'WATCH') {
    cardVariant = 'warning'
    indicatorStatus = 'warning'
    defaultBadge = 'Hazard Watch'
  } else if (normLevel === 'NO_DATA') {
    cardVariant = 'neutral'
    indicatorStatus = 'neutral'
    defaultBadge = 'Live Data Reconnecting'
  } else if (normLevel === 'LOCATION_REQUIRED') {
    cardVariant = 'neutral'
    indicatorStatus = 'neutral'
    defaultBadge = 'Location Access Off'
  }

  const finalBadge = badgeText || defaultBadge

  return (
    <Card variant={cardVariant} padding="lg" className="transition-all relative overflow-hidden">
      <div className="flex items-center justify-between gap-3 mb-3 flex-wrap">
        <StatusIndicator
          status={indicatorStatus}
          label={finalBadge}
          showDot={true}
          showIcon={true}
          size="md"
        />
        <span className="text-[11px] text-salvus-text-muted font-mono">{freshnessLabel}</span>
      </div>

      <h1 className="text-2xl sm:text-3xl font-extrabold text-salvus-text-primary tracking-tight leading-snug">
        {title}
      </h1>

      <p className="text-sm sm:text-base text-salvus-text-secondary mt-1.5 font-normal leading-relaxed max-w-2xl">
        {subtitle}
      </p>

      {normLevel === 'LOCATION_REQUIRED' && onLocationPrompt && (
        <div className="mt-4 pt-3 border-t border-salvus-border flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <span className="text-xs text-salvus-text-muted">
            Turn on location to verify conditions for your area.
          </span>
          <button
            type="button"
            onClick={onLocationPrompt}
            className="text-xs font-bold text-salvus-info hover:underline cursor-pointer inline-flex items-center gap-1 self-start sm:self-auto min-h-[36px]"
          >
            <span>📍 Detect GPS Location →</span>
          </button>
        </div>
      )}
    </Card>
  )
}

export default SafetyStatusCard
