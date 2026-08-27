import { Card } from '../../ui/Card'
import { Badge } from '../../ui/Badge'
import { StatusIndicator } from '../../ui/StatusIndicator'

/**
 * Reassuring Citizen Emergency Status Card
 * Answers Question 1: "Am I safe?" & Question 3: "What should I do?" during active distress.
 */
export const EmergencyStatusCard = ({
  statusInfo = {},
  severity = 'CRITICAL',
  category = 'Flash Flood / Distress Beacon',
}) => {
  const currentStep = statusInfo.progressStep || 1
  const totalSteps = 6
  const progressPercent = Math.min(100, Math.max(15, (currentStep / totalSteps) * 100))

  return (
    <Card variant="critical" padding="lg" className="transition-all">
      {/* Top Badges */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-2">
          <StatusIndicator
            status="critical"
            label={statusInfo.phaseLabel || 'Help Request Active'}
            showDot={true}
            showIcon={true}
            isPulse={true}
          />
          <Badge variant="critical">{severity}</Badge>
        </div>

        <span className="text-xs font-semibold text-salvus-text-secondary">{category}</span>
      </div>

      {/* Hero Title & Reassuring Headline */}
      <h1 className="text-2xl sm:text-3xl font-extrabold text-salvus-text-primary tracking-tight leading-snug">
        {statusInfo.title || 'Help Request Received'}
      </h1>

      <p className="text-sm sm:text-base text-salvus-text-secondary mt-2 max-w-2xl leading-relaxed">
        {statusInfo.headline ||
          statusInfo.description ||
          'Emergency coordinators have been notified of your location.'}
      </p>

      {/* 3-Part Calm Clarity Grid */}
      <div className="mt-6 pt-6 border-t border-salvus-border grid grid-cols-1 sm:grid-cols-3 gap-3.5">
        {/* 1. System Status */}
        <div className="bg-salvus-muted/40 border border-salvus-border rounded-xl p-3.5 flex flex-col justify-between">
          <div>
            <div className="flex items-center gap-1.5 text-salvus-info text-xs font-bold mb-1">
              <span aria-hidden="true">📡</span>
              <span>LOCATION STATUS</span>
            </div>
            <p className="text-xs text-salvus-text-secondary leading-relaxed">
              {statusInfo.systemDoing ||
                'Your live GPS location is being shared with rescue units.'}
            </p>
          </div>
        </div>

        {/* 2. Responder Status */}
        <div className="bg-salvus-muted/40 border border-salvus-border rounded-xl p-3.5 flex flex-col justify-between">
          <div>
            <div className="flex items-center gap-1.5 text-salvus-warning text-xs font-bold mb-1">
              <span aria-hidden="true">🚤</span>
              <span>RESPONDER STATUS</span>
            </div>
            <p className="text-xs text-salvus-text-secondary leading-relaxed">
              {statusInfo.responderDoing ||
                'Coordinating nearest emergency rescue team to your area.'}
            </p>
          </div>
        </div>

        {/* 3. User Guidance */}
        <div className="bg-salvus-safe-bg border border-salvus-safe-border rounded-xl p-3.5 flex flex-col justify-between">
          <div>
            <div className="flex items-center gap-1.5 text-salvus-safe-text text-xs font-bold mb-1">
              <span aria-hidden="true">👉</span>
              <span>WHAT YOU SHOULD DO</span>
            </div>
            <p className="text-xs text-salvus-safe-text font-medium leading-relaxed">
              {statusInfo.userNext || 'Stay where you are if safe. Keep your phone on and in hand.'}
            </p>
          </div>
        </div>
      </div>

      {/* Calm Progress Bar */}
      <div className="mt-6 pt-5 border-t border-salvus-border">
        <div className="flex items-center justify-between text-xs text-salvus-text-secondary mb-2">
          <span>Response Progress</span>
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
