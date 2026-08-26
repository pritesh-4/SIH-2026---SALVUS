import { Sparkles } from 'lucide-react'

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
  const standbyCount = Math.max(0, totalRespondersCount - activeRespondersCount)

  const fallbackBriefing = `District Command reports ${activeCount} active incidents across ${
    incidentClusters.length || 1
  } operational cluster(s). ${criticalCount} critical incident(s) require prioritized response. Fleet readiness: ${activeRespondersCount} deployed, ${standbyCount} standby. Evacuation reception capacity remains stable with ${totalBedsAvailable} verified beds available.`

  return (
    <section
      aria-label="Situation Intelligence & Grounded AI Briefing"
      className="bg-gradient-to-r from-[#0C121B] via-[#0E1624] to-[#0C121B] border border-blue-500/20 rounded-xl p-3.5 sm:p-4 shadow-lg space-y-2.5"
    >
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2 border-b border-[#182332]">
        <div className="flex items-center gap-2">
          <span className="p-1 rounded-md bg-blue-500/20 text-sky-300 border border-blue-500/30">
            <Sparkles className="w-4 h-4" />
          </span>
          <div>
            <span className="text-xs font-bold text-slate-100 tracking-tight block">
              SITUATION INTELLIGENCE & AI OPERATIONAL BRIEFING
            </span>
            <span className="text-[10px] font-mono text-slate-400">
              Grounded factual synthesis across incidents, clusters, fleet, and environmental feeds
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2 font-mono text-[10px]">
          <span className="px-2 py-0.5 rounded bg-[#080C12] border border-[#182332] text-slate-400">
            {situationSummary?.provider || 'salvus-grounded-intelligence'}
          </span>
          <button
            type="button"
            disabled={isRefreshingSituation}
            onClick={onRefreshSituation}
            className="px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 font-semibold cursor-pointer transition-colors disabled:opacity-50"
          >
            {isRefreshingSituation ? 'Refreshing...' : '↻ Refresh Intelligence'}
          </button>
        </div>
      </div>

      {/* Factual Briefing Text */}
      <p className="text-xs sm:text-sm text-slate-200 leading-relaxed font-normal">
        {situationSummary?.briefing || fallbackBriefing}
      </p>

      {/* Context Statistics & Key Priorities */}
      <div className="flex flex-wrap items-center gap-2 pt-1">
        <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-[#080C12] border border-[#182332] text-[10px] font-mono text-slate-300">
          <span className="text-amber-400">⛈️</span>
          <span>{liveHazards.length} Active Hazard Zone(s)</span>
        </div>
        <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-[#080C12] border border-[#182332] text-[10px] font-mono text-slate-300">
          <span className="text-sky-400">📍</span>
          <span>{incidentClusters.length} Incident Cluster(s)</span>
        </div>

        {situationSummary?.key_priorities &&
          situationSummary.key_priorities.map((pri, idx) => (
            <div
              key={idx}
              className="flex items-center gap-1 px-2.5 py-1 rounded-md bg-blue-950/40 border border-blue-500/30 text-[10px] font-mono text-sky-200"
            >
              <span className="text-blue-400">⚡</span>
              <span className="truncate max-w-[260px] sm:max-w-md">{pri}</span>
            </div>
          ))}
      </div>
    </section>
  )
}

export default SituationBriefing
