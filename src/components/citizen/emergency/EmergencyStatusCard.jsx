import { Card } from '../../ui/Card'
import { Badge } from '../../ui/Badge'
import { StatusIndicator } from '../../ui/StatusIndicator'

/**
 * Reassuring Citizen Emergency Status Card (Master Prompt 2 - Step 5 & 6)
 *
 * Focuses the entire experience:
 * - EMERGENCY ACTIVE indicator
 * - Location status
 * - Response status
 * - What you should do right now
 * - Calm response progress
 */
export const EmergencyStatusCard = ({
  statusInfo = {},
  severity = 'CRITICAL',
  category = 'Flash Flood Emergency',
  onCancelClick = null,
}) => {
  const currentStep = statusInfo.progressStep || 1
  const totalSteps = 8
  const progressPercent = Math.min(100, Math.max(12, (currentStep / totalSteps) * 100))

  return (
    <Card
      variant="critical"
      padding="lg"
      className="transition-all relative overflow-hidden shadow-lg border-2 border-salvus-critical-border"
    >
      {/* Top Badges */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-2">
          <StatusIndicator
            status="critical"
            label={statusInfo.phaseLabel || 'EMERGENCY ACTIVE'}
            showDot={true}
            showIcon={true}
            isPulse={true}
            size="md"
          />
          <Badge variant="critical">{severity}</Badge>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-salvus-text-secondary">{category}</span>
          {onCancelClick && (
            <button
              type="button"
              onClick={onCancelClick}
              className="text-[11px] text-salvus-text-muted hover:text-salvus-critical font-medium px-2 py-1 rounded hover:bg-salvus-muted/40 transition-colors cursor-pointer"
            >
              Cancel Request
            </button>
          )}
        </div>
      </div>

      {/* Hero Title & Reassuring Headline */}
      <h1 className="text-2xl sm:text-3xl font-extrabold text-salvus-text-primary tracking-tight leading-snug">
        {statusInfo.title || 'Your emergency request was received.'}
      </h1>

      <p className="text-sm sm:text-base text-salvus-text-secondary mt-2 max-w-2xl leading-relaxed font-normal">
        {statusInfo.headline ||
          statusInfo.description ||
          'Emergency coordinators have your location and help is on the way.'}
      </p>

      {/* 3-Part Calm Clarity Grid */}
      <div className="mt-6 pt-6 border-t border-salvus-border grid grid-cols-1 sm:grid-cols-3 gap-3.5">
        {/* 1. Location Status */}
        <div className="bg-salvus-muted/40 border border-salvus-border rounded-xl p-3.5 flex flex-col justify-between">
          <div>
            <div className="flex items-center gap-1.5 text-salvus-info text-xs font-bold mb-1">
              <span aria-hidden="true">📍</span>
              <span>LOCATION STATUS</span>
            </div>
            <p className="text-xs text-salvus-text-secondary leading-relaxed font-normal">
              {statusInfo.systemDoing ||
                'Your location is shared with emergency dispatch coordinators.'}
            </p>
          </div>
        </div>

        {/* 2. Response Status */}
        <div className="bg-salvus-muted/40 border border-salvus-border rounded-xl p-3.5 flex flex-col justify-between">
          <div>
            <div className="flex items-center gap-1.5 text-salvus-warning text-xs font-bold mb-1">
              <span aria-hidden="true">🚤</span>
              <span>RESPONSE STATUS</span>
            </div>
            <p className="text-xs text-salvus-text-secondary leading-relaxed font-normal">
              {statusInfo.responderDoing ||
                'Rescue coordinators are dispatching the nearest response team.'}
            </p>
          </div>
        </div>

        {/* 3. Next Action / User Guidance */}
        <div className="bg-salvus-safe-bg border border-salvus-safe-border rounded-xl p-3.5 flex flex-col justify-between">
          <div>
            <div className="flex items-center gap-1.5 text-salvus-safe-text text-xs font-bold mb-1">
              <span aria-hidden="true">👉</span>
              <span>WHAT YOU SHOULD DO</span>
            </div>
            <p className="text-xs text-salvus-safe-text font-medium leading-relaxed">
              {statusInfo.userNext ||
                'Stay where you are if it is safe to do so. Keep your phone accessible.'}
            </p>
          </div>
        </div>
      </div>

      {/* Calm Progress Bar */}
      <div className="mt-6 pt-5 border-t border-salvus-border">
        <div className="flex items-center justify-between text-xs text-salvus-text-secondary mb-2">
          <span className="font-medium">Response Progress</span>
          <span className="font-semibold text-salvus-text-primary">
            Step {currentStep} of {totalSteps}
          </span>
        </div>
        <div className="w-full bg-salvus-muted h-2 rounded-full overflow-hidden border border-salvus-border">
          <div
            className="h-full bg-salvus-critical transition-all duration-700 ease-out"
            style={{ width: `${progressPercent}%` }}
          />
        </div>
      </div>
    </Card>
  )
}

export default EmergencyStatusCard
