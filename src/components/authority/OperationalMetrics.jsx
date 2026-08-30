import { Card } from '../ui/Card'
import { Badge } from '../ui/Badge'

/**
 * 4-Metric Primary Operational KPI Row
 *
 * Maximum 4 primary metrics for immediate cognitive grasp:
 * 1. Critical Threats (Priority SOS & Critical)
 * 2. Active Incidents (Total unresolved distress calls)
 * 3. Fleet Deployed (Active units / Total fleet)
 * 4. Shelter Capacity (Available beds on grid)
 */
export const OperationalMetrics = ({
  computedMetrics = { active: 0, critical: 0, resolved: 0, triagePending: 0 },
  activeRespondersCount = 0,
  totalRespondersCount = 0,
  totalBedsAvailable = 0,
}) => {
  const critical = computedMetrics.critical ?? computedMetrics.criticalThreats ?? 0
  const active = computedMetrics.active ?? computedMetrics.activeIncidents ?? 0
  const resolved = computedMetrics.resolved ?? computedMetrics.resolvedCount ?? 0
  const pendingTriage = computedMetrics.triagePending ?? 0

  return (
    <section aria-label="Operational Metrics" className="grid grid-cols-2 lg:grid-cols-4 gap-2.5">
      {/* 1. Critical Threats */}
      <Card
        variant={critical > 0 ? 'critical' : 'neutral'}
        padding="sm"
        className={`flex flex-col justify-between shadow-xs transition-colors ${
          critical > 0 ? 'bg-salvus-critical-bg/25 border-salvus-critical-border' : ''
        }`}
      >
        <div className="flex items-center justify-between gap-1 mb-0.5">
          <span className="text-[11px] font-bold text-salvus-critical uppercase tracking-wider">
            Critical Threats
          </span>
          <Badge variant={critical > 0 ? 'critical' : 'neutral'} size="sm" dot={critical > 0}>
            {critical > 0 ? 'Priority' : 'Nominal'}
          </Badge>
        </div>
        <div className="flex items-baseline justify-between mt-1">
          <span className="text-2xl sm:text-3xl font-extrabold text-salvus-critical font-mono">
            {critical}
          </span>
          <span className="text-[11px] text-salvus-text-muted">
            {pendingTriage > 0 ? `${pendingTriage} awaiting triage` : 'Triage up to date'}
          </span>
        </div>
      </Card>

      {/* 2. Active Incidents */}
      <Card padding="sm" className="flex flex-col justify-between shadow-xs">
        <div className="flex items-center justify-between gap-1 mb-0.5">
          <span className="text-[11px] font-bold text-salvus-text-primary uppercase tracking-wider">
            Active Incidents
          </span>
          <Badge variant={active > 0 ? 'warning' : 'safe'} size="sm">
            {active > 0 ? 'Active' : 'Clear'}
          </Badge>
        </div>
        <div className="flex items-baseline justify-between mt-1">
          <span className="text-2xl sm:text-3xl font-extrabold text-salvus-text-primary font-mono">
            {active}
          </span>
          <span className="text-[11px] text-salvus-text-muted">{resolved} resolved</span>
        </div>
      </Card>

      {/* 3. Fleet Deployed */}
      <Card variant="info" padding="sm" className="flex flex-col justify-between shadow-xs">
        <div className="flex items-center justify-between gap-1 mb-0.5">
          <span className="text-[11px] font-bold text-salvus-info uppercase tracking-wider">
            Fleet Deployed
          </span>
          <span className="text-[11px] text-salvus-info/90 font-semibold font-mono">
            {totalRespondersCount} Total Units
          </span>
        </div>
        <div className="flex items-baseline justify-between mt-1">
          <span className="text-2xl sm:text-3xl font-extrabold text-salvus-info font-mono">
            {activeRespondersCount}{' '}
            <span className="text-sm font-normal text-salvus-text-muted">
              / {totalRespondersCount}
            </span>
          </span>
          <span className="text-[11px] text-salvus-text-muted">
            {Math.max(0, totalRespondersCount - activeRespondersCount)} available
          </span>
        </div>
      </Card>

      {/* 4. Shelter Capacity */}
      <Card variant="safe" padding="sm" className="flex flex-col justify-between shadow-xs">
        <div className="flex items-center justify-between gap-1 mb-0.5">
          <span className="text-[11px] font-bold text-salvus-safe uppercase tracking-wider">
            Available Beds
          </span>
          <Badge variant="safe" size="sm">
            {totalBedsAvailable > 50 ? 'Stable' : 'Limited'}
          </Badge>
        </div>
        <div className="flex items-baseline justify-between mt-1">
          <span className="text-2xl sm:text-3xl font-extrabold text-salvus-safe font-mono">
            {totalBedsAvailable}
          </span>
          <span className="text-[11px] text-salvus-text-muted">Civil Evacuation</span>
        </div>
      </Card>
    </section>
  )
}

export default OperationalMetrics
