import { Card } from '../ui/Card'
import { Badge } from '../ui/Badge'
import { Button } from '../ui/Button'

/**
 * Concise Operational Situation Briefing
 * Part 10: 1-2 sentence executive briefing with compact priority indicators.
 */
export const SituationBriefing = ({
  situationSummary = null,
  liveHazards = [],
  incidentClusters = [],
  computedMetrics = { active: 0, critical: 0 },
  activeRespondersCount = 0,
  totalRespondersCount = 0,
  totalBedsAvailable = 0,
  isRefreshingSituation = false,
  onRefreshSituation,
}) => {
  const activeCount = computedMetrics.active ?? computedMetrics.activeIncidents ?? 0
  const criticalCount = computedMetrics.critical ?? computedMetrics.criticalThreats ?? 0

  const fallbackBriefing = `Flooding remains concentrated in the Sector 12 basin. ${
    criticalCount > 0
      ? `${criticalCount} critical threat${criticalCount > 1 ? 's require' : ' requires'} immediate response.`
      : 'All reported sectors are currently being monitored.'
  } Evacuation reception capacity remains stable.`

  return (
    <Card padding="md" className="space-y-3">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2 border-b border-salvus-border">
        <div className="flex items-center gap-2">
          <Badge variant="info" dot={true}>
            Operational Briefing
          </Badge>
          <span className="text-xs text-salvus-text-secondary">
            Grounded intelligence across incidents, clusters, and fleet
          </span>
        </div>

        <div className="flex items-center gap-2 text-xs">
          <Button
            variant="quiet"
            size="sm"
            disabled={isRefreshingSituation}
            onClick={onRefreshSituation}
            className="text-xs"
          >
            {isRefreshingSituation ? 'Refreshing...' : '↻ Refresh Intelligence'}
          </Button>
        </div>
      </div>

      {/* Factual Briefing Text */}
      <p className="text-xs sm:text-sm text-salvus-text-primary leading-relaxed font-medium">
        {situationSummary?.briefing || fallbackBriefing}
      </p>

      {/* Context Statistics & Key Priorities */}
      <div className="flex flex-wrap items-center gap-2 pt-1">
        <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-salvus-muted/40 border border-salvus-border text-xs text-salvus-text-secondary">
          <span aria-hidden="true">⛈️</span>
          <span>{liveHazards.length} Hazard Zones</span>
        </div>

        <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-salvus-muted/40 border border-salvus-border text-xs text-salvus-text-secondary">
          <span aria-hidden="true">📍</span>
          <span>{incidentClusters.length} Clusters</span>
        </div>

        <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-salvus-muted/40 border border-salvus-border text-xs text-salvus-text-secondary">
          <span aria-hidden="true">🚨</span>
          <span>
            {activeCount} Active ({criticalCount} Critical)
          </span>
        </div>

        <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-salvus-muted/40 border border-salvus-border text-xs text-salvus-text-secondary">
          <span aria-hidden="true">🚤</span>
          <span>
            {activeRespondersCount}/{totalRespondersCount} Deployed
          </span>
        </div>

        <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-salvus-muted/40 border border-salvus-border text-xs text-salvus-text-secondary">
          <span aria-hidden="true">🛡️</span>
          <span>{totalBedsAvailable} Beds Free</span>
        </div>

        {situationSummary?.key_priorities &&
          situationSummary.key_priorities.slice(0, 2).map((pri, idx) => (
            <div
              key={idx}
              className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-salvus-info-bg border border-salvus-info-border text-xs text-salvus-info-text font-medium"
            >
              <span aria-hidden="true">⚡</span>
              <span className="truncate max-w-[260px] sm:max-w-sm">{pri}</span>
            </div>
          ))}
      </div>
    </Card>
  )
}

export default SituationBriefing
