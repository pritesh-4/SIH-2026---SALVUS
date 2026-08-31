import { Activity, Shield, Users, Home, CloudLightning, RefreshCw } from 'lucide-react'

/**
 * Situational Snapshot Bar (Zone 3)
 *
 * Restrained, high-density horizontal operational overview:
 * - Active Incidents & SOS
 * - Critical Urgency
 * - Fleet Deployed / Available
 * - Civil Evacuation Beds
 * - Regional Hazards & Clusters
 *
 * Visually subordinate to the incident workflow — provides fast orientation
 * without consuming excessive vertical space.
 */
export const SituationalSnapshot = ({
  computedMetrics = { active: 0, critical: 0, resolved: 0, triagePending: 0, activeSos: 0 },
  activeRespondersCount = 0,
  totalRespondersCount = 0,
  totalBedsAvailable = 0,
  liveHazardsCount = 0,
  incidentClustersCount = 0,
  isRefreshing = false,
  onRefresh,
}) => {
  const active = computedMetrics.active ?? 0
  const critical = computedMetrics.critical ?? 0
  const sosCount = computedMetrics.activeSos ?? computedMetrics.sosCount ?? 0
  const resolved = computedMetrics.resolved ?? 0
  const pendingTriage = computedMetrics.triagePending ?? 0
  const availableResponders = Math.max(0, totalRespondersCount - activeRespondersCount)

  return (
    <section
      aria-label="Situational Snapshot Overview"
      className="bg-salvus-surface border border-salvus-border rounded-xl p-2 sm:p-2.5 shadow-xs grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2 text-xs"
    >
      {/* 1. Active Distress Calls */}
      <div className="bg-salvus-muted/30 border border-salvus-border/60 p-2 rounded-lg flex items-center justify-between">
        <div className="min-w-0">
          <span className="text-[10px] font-bold text-salvus-text-muted uppercase tracking-wider block">
            Active Incidents
          </span>
          <div className="flex items-baseline gap-1.5 mt-0.5">
            <span className="text-lg font-extrabold text-salvus-text-primary font-mono">
              {active}
            </span>
            <span className="text-[10px] text-salvus-text-muted">({resolved} resolved)</span>
          </div>
        </div>
        <div className="p-1.5 rounded-md bg-salvus-muted/60 text-salvus-text-secondary shrink-0">
          <Activity className="h-4 w-4" />
        </div>
      </div>

      {/* 2. SOS & Critical Priority */}
      <div
        className={`p-2 rounded-lg border flex items-center justify-between transition-colors ${
          sosCount > 0
            ? 'bg-salvus-critical-bg/40 border-salvus-critical-border'
            : critical > 0
              ? 'bg-amber-950/20 border-amber-500/30'
              : 'bg-salvus-muted/30 border-salvus-border/60'
        }`}
      >
        <div className="min-w-0">
          <span
            className={`text-[10px] font-bold uppercase tracking-wider block ${
              sosCount > 0 ? 'text-salvus-critical' : 'text-salvus-text-muted'
            }`}
          >
            SOS & Critical
          </span>
          <div className="flex items-baseline gap-1.5 mt-0.5">
            <span
              className={`text-lg font-extrabold font-mono ${
                sosCount > 0
                  ? 'text-salvus-critical'
                  : critical > 0
                    ? 'text-salvus-warning'
                    : 'text-salvus-text-primary'
              }`}
            >
              {sosCount > 0 ? `${sosCount} SOS` : critical}
            </span>
            <span className="text-[10px] text-salvus-text-muted truncate">
              {pendingTriage > 0 ? `${pendingTriage} in triage` : 'Triaged'}
            </span>
          </div>
        </div>
        <div
          className={`p-1.5 rounded-md shrink-0 ${
            sosCount > 0
              ? 'bg-salvus-critical text-white'
              : 'bg-salvus-muted/60 text-salvus-text-secondary'
          }`}
        >
          <Shield className="h-4 w-4" />
        </div>
      </div>

      {/* 3. Fleet Deployed */}
      <div className="bg-salvus-muted/30 border border-salvus-border/60 p-2 rounded-lg flex items-center justify-between">
        <div className="min-w-0">
          <span className="text-[10px] font-bold text-salvus-info uppercase tracking-wider block">
            Fleet Deployment
          </span>
          <div className="flex items-baseline gap-1.5 mt-0.5">
            <span className="text-lg font-extrabold text-salvus-info font-mono">
              {activeRespondersCount}
              <span className="text-xs font-normal text-salvus-text-muted">
                /{totalRespondersCount}
              </span>
            </span>
            <span className="text-[10px] text-salvus-text-muted">{availableResponders} ready</span>
          </div>
        </div>
        <div className="p-1.5 rounded-md bg-salvus-info-bg text-salvus-info shrink-0">
          <Users className="h-4 w-4" />
        </div>
      </div>

      {/* 4. Shelter Beds */}
      <div className="bg-salvus-muted/30 border border-salvus-border/60 p-2 rounded-lg flex items-center justify-between">
        <div className="min-w-0">
          <span className="text-[10px] font-bold text-salvus-safe uppercase tracking-wider block">
            Evacuation Beds
          </span>
          <div className="flex items-baseline gap-1.5 mt-0.5">
            <span className="text-lg font-extrabold text-salvus-safe font-mono">
              {totalBedsAvailable}
            </span>
            <span className="text-[10px] text-salvus-text-muted">Free beds</span>
          </div>
        </div>
        <div className="p-1.5 rounded-md bg-salvus-safe-bg text-salvus-safe shrink-0">
          <Home className="h-4 w-4" />
        </div>
      </div>

      {/* 5. Weather Hazards & Multi-Source Intelligence */}
      <div className="col-span-2 sm:col-span-1 bg-salvus-muted/30 border border-salvus-border/60 p-2 rounded-lg flex items-center justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] font-bold text-salvus-text-muted uppercase tracking-wider block">
              Regional Hazards
            </span>
            {onRefresh && (
              <button
                type="button"
                onClick={onRefresh}
                disabled={isRefreshing}
                title="Refresh spatial intelligence"
                className="text-salvus-text-muted hover:text-salvus-text-primary p-0.5 cursor-pointer"
              >
                <RefreshCw
                  className={`h-2.5 w-2.5 ${isRefreshing ? 'animate-spin text-salvus-info' : ''}`}
                />
              </button>
            )}
          </div>
          <div className="flex items-baseline gap-1.5 mt-0.5">
            <span className="text-xs font-bold text-salvus-text-primary font-mono">
              {liveHazardsCount} Alert{liveHazardsCount === 1 ? '' : 's'}
            </span>
            <span className="text-[10px] text-salvus-text-muted">
              · {incidentClustersCount} Cluster{incidentClustersCount === 1 ? '' : 's'}
            </span>
          </div>
        </div>
        <div className="p-1.5 rounded-md bg-salvus-warning-bg text-salvus-warning-text shrink-0">
          <CloudLightning className="h-4 w-4" />
        </div>
      </div>
    </section>
  )
}

export default SituationalSnapshot
