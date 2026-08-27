import { calculateDistanceKm } from '../../features/authority/incidents/incidentUtils'
import { Badge } from '../ui/Badge'
import { Button } from '../ui/Button'

/**
 * Secondary Shelter Management Panel
 * Part 11: Organized secondary resource list.
 */
export const ShelterPanel = ({ liveShelters = [], liveHazards = [], onAdjustBeds }) => {
  return (
    <div className="space-y-3 flex-1 overflow-y-auto pr-1">
      <div className="flex items-center justify-between pb-1 text-xs text-salvus-text-muted font-semibold">
        <span>EVACUATION HUBS</span>
        <span>BED CAPACITY</span>
      </div>

      {liveShelters.map((shl) => {
        const avail = shl.available_beds ?? 0
        const total = shl.total_beds || 1
        const occPct = Math.round(((total - avail) / total) * 100)
        const occ = shl.occupancy_rate || `${occPct}%`
        const supplies = shl.supplies_status || 'Adequate'

        const isNearHazard = liveHazards.some((hz) => {
          if (hz.severity !== 'CRITICAL' && hz.severity !== 'WARNING') return false
          const d = calculateDistanceKm(shl.latitude, shl.longitude, hz.latitude, hz.longitude)
          return d <= Math.max(0.6, (hz.affected_radius_km || 2.0) * 0.5)
        })

        return (
          <div
            key={shl.id}
            className={`p-3 rounded-xl text-xs space-y-2 border transition-colors ${
              isNearHazard
                ? 'bg-salvus-critical-bg border-salvus-critical-border'
                : 'bg-salvus-muted/30 border-salvus-border hover:border-salvus-border-strong'
            }`}
          >
            <div className="flex items-center justify-between">
              <strong className="text-salvus-text-primary text-xs truncate max-w-[160px]">
                {shl.name}
              </strong>
              <div className="flex items-center gap-1.5">
                {isNearHazard && (
                  <Badge variant="critical" size="sm" dot={true}>
                    Hazard Near
                  </Badge>
                )}
                <Badge
                  variant={
                    shl.status === 'OPEN'
                      ? 'safe'
                      : shl.status === 'NEAR_CAPACITY'
                        ? 'warning'
                        : 'critical'
                  }
                  size="sm"
                >
                  {shl.status}
                </Badge>
              </div>
            </div>

            <div className="flex items-center justify-between text-xs">
              <span className="text-salvus-safe font-bold">{avail} beds free</span>
              <span className="text-salvus-text-muted">Total: {total}</span>
            </div>

            <div className="w-full bg-salvus-muted h-2 rounded-full overflow-hidden border border-salvus-border">
              <div
                className={`h-full ${shl.status === 'NEAR_CAPACITY' ? 'bg-salvus-warning' : 'bg-salvus-safe'}`}
                style={{ width: occ }}
              />
            </div>

            <div className="flex items-center justify-between text-[11px] text-salvus-text-secondary">
              <span>Occupancy: {occ}</span>
              <span className="truncate max-w-[130px]">Supplies: {supplies}</span>
            </div>

            <div className="flex items-center justify-between pt-2 border-t border-salvus-border text-xs">
              <span className="text-salvus-text-muted">Quick Adjust:</span>
              <div className="flex items-center gap-1.5">
                <Button
                  variant="quiet"
                  size="sm"
                  onClick={() => onAdjustBeds?.(shl.id, avail, -25)}
                  className="text-xs"
                >
                  +25 Intake
                </Button>
                <Button
                  variant="quiet"
                  size="sm"
                  onClick={() => onAdjustBeds?.(shl.id, avail, 25)}
                  className="text-xs"
                >
                  -25 Released
                </Button>
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}

export default ShelterPanel
