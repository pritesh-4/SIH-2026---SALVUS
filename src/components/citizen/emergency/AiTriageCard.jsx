import { Card } from '../../ui/Card'
import { Badge } from '../../ui/Badge'
import { StatusIndicator } from '../../ui/StatusIndicator'

/**
 * Reassuring Emergency Assessment Card (Master Prompt 2 - Step 5 & 6)
 */
export const AiTriageCard = ({ currentState = 'TRIAGING', aiTriage = {} }) => {
  const isTriaging = currentState === 'TRIAGING'
  const isPostTriage = [
    'VERIFIED',
    'ASSIGNED',
    'EN_ROUTE',
    'NEARBY',
    'ON_SCENE',
    'RESOLVED',
  ].includes(currentState)

  const steps = aiTriage.analysisSteps || [
    { id: 'signal', label: 'Location Shared', status: 'verified' },
    { id: 'hazard', label: 'Hazard Assessed', status: 'verified' },
    { id: 'priority', label: 'Priority Assigned', status: 'verified' },
    { id: 'craft', label: 'Response Team Selected', status: 'verified' },
  ]

  return (
    <Card padding="md" className="transition-all">
      {/* Top Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-bold text-salvus-text-primary uppercase tracking-wider">
            Emergency Assessment
          </h2>
          <Badge variant="neutral" isMono={true}>
            Coordinator Verified
          </Badge>
        </div>

        <StatusIndicator
          status={isPostTriage ? 'safe' : isTriaging ? 'warning' : 'neutral'}
          label={isPostTriage ? 'Assessment Complete' : isTriaging ? 'Reviewing...' : 'Queued'}
          showDot={true}
          size="sm"
        />
      </div>

      {/* Criteria Progress */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 mb-4">
        {steps.map((step, idx) => {
          const isDone = isPostTriage || (isTriaging && idx < 3)
          const isCurrent = isTriaging && idx === 3

          return (
            <div
              key={step.id}
              className={`p-2.5 rounded-xl border text-xs transition-all ${
                isDone
                  ? 'bg-salvus-safe-bg border-salvus-safe-border text-salvus-safe-text'
                  : isCurrent
                    ? 'bg-salvus-warning-bg border-salvus-warning-border text-salvus-warning-text'
                    : 'bg-salvus-muted/40 border-salvus-border text-salvus-text-muted'
              }`}
            >
              <div className="flex items-center justify-between mb-1">
                <span className="font-bold text-[10px] opacity-75">0{idx + 1}</span>
                <span>{isDone ? '✓' : isCurrent ? '•' : '○'}</span>
              </div>
              <p className="font-medium text-xs line-clamp-1">{step.label}</p>
            </div>
          )
        })}
      </div>

      {/* Summary Box */}
      <div className="bg-salvus-muted/40 border border-salvus-border rounded-xl p-3.5 space-y-2 text-xs">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pb-2 border-b border-salvus-border">
          <div>
            <span className="text-salvus-text-muted block text-[11px]">Hazard Type</span>
            <span className="font-bold text-salvus-text-primary mt-0.5 block">
              {aiTriage.hazardType || 'Flash Flood Inundation'}
            </span>
          </div>
          <div>
            <span className="text-salvus-text-muted block text-[11px]">Severity Priority</span>
            <span className="font-bold text-salvus-critical mt-0.5 block">
              {aiTriage.severityClassification || 'Priority 1 (Urgent)'}
            </span>
          </div>
          <div>
            <span className="text-salvus-text-muted block text-[11px]">Assigned Craft</span>
            <span className="font-bold text-salvus-info mt-0.5 block">
              {aiTriage.requiredCapability || 'Zodiac Rescue Boat'}
            </span>
          </div>
        </div>

        {/* Human Coordinator Note */}
        <p className="text-xs text-salvus-text-secondary leading-relaxed pt-1">
          <strong className="text-salvus-text-primary">Dispatch Coordinator: </strong>
          {aiTriage.humanVerification?.coordinator
            ? `Approved by Dispatcher ${aiTriage.humanVerification.coordinator} (${aiTriage.humanVerification.station})`
            : 'Central Command dispatcher has confirmed and dispatched nearest rescue units.'}
        </p>
      </div>
    </Card>
  )
}

export default AiTriageCard
