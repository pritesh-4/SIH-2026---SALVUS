import { Card } from '../../ui/Card'
import { Badge } from '../../ui/Badge'
import { StatusIndicator } from '../../ui/StatusIndicator'

/**
 * Reassuring Responder Profile & Live ETA Card
 */
export const ResponderPreviewCard = ({
  currentState = 'EN_ROUTE',
  responder = {},
  etaMinutes = 4,
  distanceText = '850 m',
}) => {
  const isAssignedOrBeyond = ['ASSIGNED', 'EN_ROUTE', 'NEARBY', 'ON_SCENE', 'RESOLVED'].includes(
    currentState
  )
  const isNearby = currentState === 'NEARBY'
  const isOnScene = currentState === 'ON_SCENE' || currentState === 'RESOLVED'

  if (!isAssignedOrBeyond) {
    return (
      <Card
        padding="lg"
        className="flex flex-col justify-center items-center text-center min-h-[240px]"
      >
        <div className="h-12 w-12 rounded-2xl bg-salvus-warning-bg border border-salvus-warning-border flex items-center justify-center text-xl mb-3">
          📡
        </div>
        <h3 className="text-base font-bold text-salvus-text-primary tracking-tight">
          {currentState === 'SOS_ACTIVE'
            ? 'Notifying Emergency Coordinators...'
            : 'Matching Nearest Rescue Team...'}
        </h3>
        <p className="text-xs sm:text-sm text-salvus-text-secondary mt-1 max-w-sm leading-relaxed">
          Alerting active emergency rescue teams and specialized units in your operational area.
        </p>
        <div className="mt-4">
          <Badge variant="warning" dot={true}>
            Priority Dispatch: Active
          </Badge>
        </div>
      </Card>
    )
  }

  return (
    <Card padding="md" className="flex flex-col justify-between transition-all">
      <div>
        {/* Header with Status and ETA */}
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold tracking-wider text-salvus-text-secondary uppercase">
              Assigned Rescue Team
            </span>
          </div>

          <StatusIndicator
            status={isOnScene ? 'safe' : isNearby ? 'warning' : 'info'}
            label={
              isOnScene
                ? 'Arrived on Scene'
                : isNearby
                  ? 'Nearby (<100m)'
                  : `ETA: ~${etaMinutes} mins`
            }
            showDot={true}
            showIcon={true}
          />
        </div>

        {/* Nearby Urgent Guidance */}
        {isNearby && (
          <div className="mb-4 bg-salvus-warning-bg border border-salvus-warning-border rounded-xl p-3.5 text-xs text-salvus-warning-text flex items-start gap-2.5 animate-fadeIn">
            <span className="text-base" aria-hidden="true">
              🚨
            </span>
            <div>
              <span className="font-bold block uppercase tracking-wider text-[11px]">
                Rescue Team is on Your Street
              </span>
              <p className="text-xs opacity-90 mt-0.5 leading-relaxed">
                Turn on your phone flashlight, wave a bright cloth, or whistle to signal responders.
              </p>
            </div>
          </div>
        )}

        {/* Responder Details */}
        <div className="flex items-start gap-3.5">
          <div className="h-12 w-12 rounded-xl bg-salvus-info-bg border border-salvus-info-border flex items-center justify-center text-xl shrink-0">
            🚤
          </div>
          <div>
            <h3 className="text-base sm:text-lg font-bold text-salvus-text-primary tracking-tight">
              {responder.unitName || responder.unit_name || 'NDRF Unit 04'}
            </h3>
            <p className="text-xs text-salvus-text-secondary mt-0.5">
              Lead: {responder.teamLead || responder.team_lead || responder.lead || 'Capt. A. Roy'}{' '}
              · <span>{responder.vehicle || responder.vehicle_type || 'Zodiac Rescue Boat'}</span>
            </p>
            <div className="flex flex-wrap items-center gap-2 mt-2">
              <Badge variant="neutral">{responder.badge || 'Water Rescue'}</Badge>
              <span className="text-xs font-semibold text-salvus-info">
                {isOnScene ? 'At your location' : `Distance: ${distanceText}`}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Direct Contact Action Footer */}
      <div className="mt-5 pt-3.5 border-t border-salvus-border flex items-center justify-between gap-3">
        <span className="text-xs text-salvus-text-muted">Emergency Dispatch Line:</span>
        <a
          href="tel:112"
          className="px-3.5 py-1.5 rounded-lg bg-salvus-surface-elevated hover:bg-salvus-surface-hover border border-salvus-border text-salvus-text-primary text-xs font-bold transition-colors inline-flex items-center gap-1.5 cursor-pointer min-h-[36px]"
        >
          <span>📞 Call 112</span>
        </a>
      </div>
    </Card>
  )
}
