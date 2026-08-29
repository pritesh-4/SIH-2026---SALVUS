import { Card } from '../ui/Card'
import { Badge } from '../ui/Badge'
import { Button } from '../ui/Button'

/**
 * Concise Operational Situation Briefing (Master Prompt 3 - Step 10)
 *
 * 1-2 sentence executive briefing with compact factual indicators.
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

  const fallbackBriefing = `Active situation monitoring across operational grid. ${
    criticalCount > 0
      ? `${criticalCount} critical incident${criticalCount > 1 ? 's require' : ' requires'} immediate response.`
      : 'All monitored sectors are currently stable.'
  }`

  return (
    <Card padding="sm" className="space-y-2.5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-1.5 border-b border-salvus-border">
        <div className="flex items-center gap-2">
          <Badge variant="info" dot={true}>
            SITUATION BRIEFING
          </Badge>
          <span className="text-xs text-salvus-text-secondary">
            Grounded operational intelligence
          </span>
        </div>

        <div className="flex items-center gap-2 text-xs">
          <Button
            variant="quiet"
            size="sm"
            disabled={isRefreshingSituation}
            onClick={onRefreshSituation}
            className="text-xs text-salvus-text-secondary hover:text-salvus-text-primary"
          >
            {isRefreshingSituation ? 'Refreshing...' : '↻ Refresh Intelligence'}
          </Button>
        </div>
      </div>

      {/* Factual 1-2 Sentence Briefing */}
      <p className="text-xs sm:text-sm text-salvus-text-primary leading-relaxed font-medium">
        {situationSummary?.briefing || fallbackBriefing}
      </p>

      {/* Compact Context Pills */}
      <div className="flex flex-wrap items-center gap-2 pt-0.5">
        <div className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-lg bg-salvus-muted/40 border border-salvus-border text-xs text-salvus-text-secondary font-medium">
          <span aria-hidden="true">⛈️</span>
          <span>{liveHazards.length} Hazards</span>
        </div>

        <div className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-lg bg-salvus-muted/40 border border-salvus-border text-xs text-salvus-text-secondary font-medium">
          <span aria-hidden="true">📍</span>
          <span>{incidentClusters.length} Clusters</span>
        </div>

        <div className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-lg bg-salvus-critical-bg border border-salvus-critical-border text-xs text-salvus-critical font-bold">
          <span aria-hidden="true">🚨</span>
          <span>
            {criticalCount} Critical · {activeCount} Active
          </span>
        </div>

        <div className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-lg bg-salvus-info-bg border border-salvus-info-border text-xs text-salvus-info font-bold">
          <span aria-hidden="true">🚤</span>
          <span>
            {activeRespondersCount}/{totalRespondersCount} Deployed
          </span>
        </div>

        <div className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-lg bg-salvus-safe-bg border border-salvus-safe-border text-xs text-salvus-safe font-bold">
          <span aria-hidden="true">🛡️</span>
          <span>{totalBedsAvailable} Beds</span>
        </div>
      </div>
    </Card>
  )
}

export default SituationBriefing
