import { Card } from '../ui/Card'
import { Badge } from '../ui/Badge'

/**
 * 4-Metric Primary Operational KPI Row (Master Prompt 3 - Step 4)
 *
 * Maximum 4 primary metrics for immediate cognitive grasp:
 * 1. Critical Threats (Priority)
 * 2. Active Incidents (Total active)
 * 3. Response Units Deployed (Fleet capacity)
 * 4. Available Shelter Beds (Civil refuge)
 */
export const OperationalMetrics = ({
  computedMetrics = { active: 0, critical: 0, resolved: 0 },
  activeRespondersCount = 0,
  totalRespondersCount = 0,
  totalBedsAvailable = 0,
}) => {
  const critical = computedMetrics.critical ?? computedMetrics.criticalThreats ?? 0
  const active = computedMetrics.active ?? computedMetrics.activeIncidents ?? 0
  const resolved = computedMetrics.resolved ?? computedMetrics.resolvedCount ?? 0

  return (
    <section aria-label="Operational Metrics" className="grid grid-cols-2 sm:grid-cols-4 gap-3">
      {/* 1. Critical Threats */}
      <Card variant="critical" padding="sm" className="flex flex-col justify-between shadow-xs">
        <div className="flex items-center justify-between gap-1 mb-1">
          <span className="text-xs font-bold text-salvus-critical uppercase tracking-wide">
            Critical Threats
          </span>
          <Badge variant="critical" size="sm" dot={true}>
            Priority
          </Badge>
        </div>
        <span className="text-2xl sm:text-3xl font-extrabold text-salvus-critical font-mono">
          {critical}
        </span>
      </Card>

      {/* 2. Active Incidents */}
      <Card padding="sm" className="flex flex-col justify-between shadow-xs">
        <div className="flex items-center justify-between gap-1 mb-1">
          <span className="text-xs font-bold text-salvus-text-primary uppercase tracking-wide">
            Active Incidents
          </span>
          <span className="text-[11px] text-salvus-text-muted">{resolved} resolved</span>
        </div>
        <span className="text-2xl sm:text-3xl font-extrabold text-salvus-text-primary font-mono">
          {active}
        </span>
      </Card>

      {/* 3. Fleet Deployed */}
      <Card variant="info" padding="sm" className="flex flex-col justify-between shadow-xs">
        <div className="flex items-center justify-between gap-1 mb-1">
          <span className="text-xs font-bold text-salvus-info uppercase tracking-wide">
            Fleet Deployed
          </span>
          <span className="text-[11px] text-salvus-info/80">{totalRespondersCount} total</span>
        </div>
        <span className="text-2xl sm:text-3xl font-extrabold text-salvus-info font-mono">
          {activeRespondersCount}{' '}
          <span className="text-xs font-normal text-salvus-text-muted">
            / {totalRespondersCount}
          </span>
        </span>
      </Card>

      {/* 4. Shelter Capacity */}
      <Card variant="safe" padding="sm" className="flex flex-col justify-between shadow-xs">
        <div className="flex items-center justify-between gap-1 mb-1">
          <span className="text-xs font-bold text-salvus-safe uppercase tracking-wide">
            Available Beds
          </span>
          <Badge variant="safe" size="sm">
            Stable
          </Badge>
        </div>
        <span className="text-2xl sm:text-3xl font-extrabold text-salvus-safe font-mono">
          {totalBedsAvailable}
        </span>
      </Card>
    </section>
  )
}

export default OperationalMetrics
