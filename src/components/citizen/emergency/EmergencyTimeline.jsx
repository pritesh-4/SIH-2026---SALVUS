import { Card } from '../../ui/Card'
import { Badge } from '../../ui/Badge'
import { STATE_ORDER } from '../../../features/citizen/emergency/useEmergencyState'

/**
 * Reassuring Emergency Progression Timeline
 */
export const EmergencyTimeline = ({ timelineSteps = [], currentState = 'SOS_ACTIVE' }) => {
  const currentIdx = STATE_ORDER.indexOf(currentState)

  return (
    <Card padding="md" className="transition-all">
      <div className="flex items-center justify-between gap-2 mb-4">
        <h3 className="text-sm font-bold text-salvus-text-primary uppercase tracking-wider">
          Response Timeline
        </h3>
        <Badge variant="neutral" isMono={true}>
          Live Log
        </Badge>
      </div>

      <div className="space-y-4 relative before:absolute before:left-3 before:top-2 before:bottom-2 before:w-0.5 before:bg-salvus-border">
        {timelineSteps.map((step, idx) => {
          const isCompleted = idx < currentIdx
          const isCurrent = idx === currentIdx

          return (
            <div key={step.id} className="relative flex items-start gap-3.5 pl-1">
              {/* Timeline marker */}
              <div
                className={`h-4.5 w-4.5 rounded-full flex items-center justify-center text-[10px] font-bold z-10 shrink-0 mt-0.5 transition-colors ${
                  isCompleted
                    ? 'bg-salvus-safe text-white'
                    : isCurrent
                      ? 'bg-salvus-warning text-salvus-bg ring-2 ring-salvus-warning/30'
                      : 'bg-salvus-muted text-salvus-text-muted'
                }`}
              >
                {isCompleted ? '✓' : idx + 1}
              </div>

              {/* Step info */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <h4
                    className={`text-xs font-bold ${
                      isCurrent
                        ? 'text-salvus-text-primary'
                        : isCompleted
                          ? 'text-salvus-text-primary'
                          : 'text-salvus-text-muted font-normal'
                    }`}
                  >
                    {step.label}
                  </h4>
                  {isCurrent && (
                    <Badge variant="warning" size="sm">
                      Current
                    </Badge>
                  )}
                  {isCompleted && (
                    <span className="text-[11px] text-salvus-safe font-semibold shrink-0">
                      Done
                    </span>
                  )}
                </div>
                <p className="text-xs text-salvus-text-secondary mt-0.5 leading-relaxed">
                  {step.description}
                </p>
              </div>
            </div>
          )
        })}
      </div>
    </Card>
  )
}
