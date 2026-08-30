import { Card } from '../ui/Card'
import { Badge } from '../ui/Badge'
import { Button } from '../ui/Button'

/**
 * Concise Grounded Operational Situation Briefing
 *
 * Provides a 1-sentence factual intelligence summary without repeating
 * the primary KPI metric counters.
 */
export const SituationBriefing = ({
  situationSummary = null,
  liveHazards = [],
  incidentClusters = [],
  computedMetrics = { active: 0, critical: 0 },
  isRefreshingSituation = false,
  onRefreshSituation,
}) => {
  const activeCount = computedMetrics.active ?? computedMetrics.activeIncidents ?? 0
  const criticalCount = computedMetrics.critical ?? computedMetrics.criticalThreats ?? 0

  const fallbackBriefing =
    criticalCount > 0
      ? `High-priority response active: ${criticalCount} critical threat${
          criticalCount > 1 ? 's require' : ' requires'
        } immediate dispatch across ${activeCount} active incident${activeCount > 1 ? 's' : ''}.`
      : activeCount > 0
        ? `Routine disaster response active across ${activeCount} reported incident${
            activeCount > 1 ? 's' : ''
          }. Monitored sectors operational.`
        : 'All regional sectors operational. Zero active distress beacons on grid.'

  const briefingText = situationSummary?.briefing || fallbackBriefing

  return (
    <Card
      padding="sm"
      className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 bg-salvus-surface shadow-xs border-salvus-border"
    >
      <div className="flex items-center gap-2.5 min-w-0 flex-1">
        <Badge variant="info" dot={true} size="sm" className="shrink-0">
          SITUATION BRIEFING
        </Badge>
        <p className="text-xs text-salvus-text-primary font-medium truncate leading-relaxed">
          {briefingText}
        </p>
      </div>

      <div className="flex items-center gap-2 text-xs shrink-0 self-end sm:self-center">
        {liveHazards.length > 0 && (
          <span className="text-[11px] font-mono text-salvus-text-muted bg-salvus-muted/40 px-2 py-0.5 rounded-lg border border-salvus-border">
            ⛈️ {liveHazards.length} Hazards
          </span>
        )}
        {incidentClusters.length > 0 && (
          <span className="text-[11px] font-mono text-salvus-text-muted bg-salvus-muted/40 px-2 py-0.5 rounded-lg border border-salvus-border">
            📍 {incidentClusters.length} Clusters
          </span>
        )}
        <Button
          variant="quiet"
          size="sm"
          disabled={isRefreshingSituation}
          onClick={onRefreshSituation}
          className="text-xs py-0.5 px-2 text-salvus-text-secondary hover:text-salvus-text-primary"
        >
          {isRefreshingSituation ? 'Refreshing...' : '↻ Refresh Intelligence'}
        </Button>
      </div>
    </Card>
  )
}

export default SituationBriefing
