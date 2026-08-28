import { Card } from '../ui/Card'
import { Badge } from '../ui/Badge'

/**
 * 4-Metric Primary Operational KPI Row
 * Part 5: Maximum ~4 primary metrics for immediate cognitive grasp.
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
      <Card variant="critical" padding="sm" className="flex flex-col justify-between">
        <div className="flex items-center justify-between gap-1 mb-1">
          <span className="text-xs font-bold text-salvus-critical">Critical Threats</span>
          <Badge variant="critical" size="sm" dot={true}>
            Priority
          </Badge>
        </div>
        <span className="text-2xl font-extrabold text-salvus-critical">{critical}</span>
      </Card>

      {/* 2. Active Incidents */}
      <Card padding="sm" className="flex flex-col justify-between">
        <div className="flex items-center justify-between gap-1 mb-1">
          <span className="text-xs font-semibold text-salvus-text-secondary">Active Incidents</span>
          <span className="text-[11px] text-salvus-text-muted">{resolved} resolved</span>
        </div>
        <span className="text-2xl font-extrabold text-salvus-text-primary">{active}</span>
      </Card>

      {/* 3. Fleet Deployed */}
      <Card variant="info" padding="sm" className="flex flex-col justify-between">
        <div className="flex items-center justify-between gap-1 mb-1">
          <span className="text-xs font-semibold text-salvus-info">Fleet Deployed</span>
          <span className="text-[11px] text-salvus-info/80">{totalRespondersCount} total</span>
        </div>
        <span className="text-2xl font-extrabold text-salvus-info">
          {activeRespondersCount}{' '}
          <span className="text-xs font-normal text-salvus-text-muted">
            / {totalRespondersCount}
          </span>
        </span>
      </Card>

      {/* 4. Shelter Capacity */}
      <Card variant="safe" padding="sm" className="flex flex-col justify-between">
        <div className="flex items-center justify-between gap-1 mb-1">
          <span className="text-xs font-semibold text-salvus-safe">Available Beds</span>
          <Badge variant="safe" size="sm">
            Stable
          </Badge>
        </div>
        <span className="text-2xl font-extrabold text-salvus-safe">{totalBedsAvailable}</span>
      </Card>
    </section>
  )
}

export default OperationalMetrics
