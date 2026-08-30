import { calculateDistanceKm } from '../../features/authority/incidents/incidentUtils'
import { Badge } from '../ui/Badge'
import { Button } from '../ui/Button'

/**
 * Secondary Shelter Management Panel (Master Prompt 3 - Step 13)
 *
 * Organized evacuation hub overview:
 * - Real-time bed capacity and occupancy percentage
 * - Hazard proximity awareness
 * - Quick intake/release bed capacity adjustments
 */
export const ShelterPanel = ({ liveShelters = [], liveHazards = [], onAdjustBeds }) => {
  return (
    <div className="space-y-3 flex-1 overflow-y-auto pr-1">
      <div className="flex items-center justify-between pb-1 text-xs text-salvus-text-muted font-bold uppercase tracking-wider">
        <span>EVACUATION HUBS</span>
        <span>BED CAPACITY</span>
      </div>

      {liveShelters.length === 0 ? (
        <div className="py-16 text-center text-xs text-salvus-text-muted">
          No active evacuation shelters on grid.
        </div>
      ) : (
        liveShelters.map((shl) => {
          const avail = shl.available_beds ?? 0
          const total = shl.total_beds || 1
          const occPct = Math.round(((total - avail) / total) * 100)
          const occ = shl.occupancy_rate || `${occPct}%`
          const supplies = shl.supplies_status || 'Adequate'

          const isNearHazard = liveHazards.some((hz) => {
            if (hz.severity !== 'CRITICAL' && hz.severity !== 'WARNING') return false
            const d = calculateDistanceKm(shl.latitude, shl.longitude, hz.latitude, hz.longitude)
            return d !== null && d <= Math.max(0.6, (hz.affected_radius_km || 2.0) * 0.5)
          })

          return (
            <div
              key={shl.id}
              className={`p-3 rounded-xl text-xs space-y-2 border transition-colors ${
                isNearHazard
                  ? 'bg-salvus-critical-bg/40 border-salvus-critical-border'
                  : 'bg-salvus-muted/30 border-salvus-border hover:border-salvus-border-strong hover:bg-salvus-surface-hover'
              }`}
            >
              <div className="flex items-center justify-between">
                <strong className="text-salvus-text-primary text-xs truncate max-w-[160px] font-bold">
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
                <span className="text-salvus-safe font-bold font-mono">{avail} beds free</span>
                <span className="text-salvus-text-muted font-mono text-[11px]">Total: {total}</span>
              </div>

              <div className="w-full bg-salvus-muted h-2 rounded-full overflow-hidden border border-salvus-border">
                <div
                  className={`h-full transition-all duration-300 ${shl.status === 'NEAR_CAPACITY' ? 'bg-salvus-warning' : 'bg-salvus-safe'}`}
                  style={{ width: occ }}
                />
              </div>

              <div className="flex items-center justify-between text-[11px] text-salvus-text-secondary">
                <span className="font-mono">Occupancy: {occ}</span>
                <span className="truncate max-w-[130px]">Supplies: {supplies}</span>
              </div>

              <div className="flex items-center justify-between pt-2 border-t border-salvus-border text-xs">
                <span className="text-salvus-text-muted font-medium">Quick Adjust:</span>
                <div className="flex items-center gap-1.5">
                  <Button
                    variant="quiet"
                    size="sm"
                    onClick={() => onAdjustBeds?.(shl.id, avail, -25)}
                    className="text-xs text-salvus-text-secondary hover:text-salvus-text-primary"
                  >
                    +25 Intake
                  </Button>
                  <Button
                    variant="quiet"
                    size="sm"
                    onClick={() => onAdjustBeds?.(shl.id, avail, 25)}
                    className="text-xs text-salvus-text-secondary hover:text-salvus-text-primary"
                  >
                    -25 Released
                  </Button>
                </div>
              </div>
            </div>
          )
        })
      )}
    </div>
  )
}

export default ShelterPanel
