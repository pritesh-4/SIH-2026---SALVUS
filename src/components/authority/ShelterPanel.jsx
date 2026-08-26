import { calculateDistanceKm } from '../../features/authority/incidents/incidentUtils'

export const ShelterPanel = ({ liveShelters = [], liveHazards = [], onAdjustBeds }) => {
  return (
    <div className="space-y-2 flex-1 overflow-y-auto pr-1">
      <div className="flex items-center justify-between pb-1 text-[10px] font-mono text-slate-400">
        <span>EVACUATION HUBS</span>
        <span>CAPACITY</span>
      </div>

      {liveShelters.map((shl) => {
        const avail = shl.available_beds ?? 0
        const total = shl.total_beds || 1
        const occ = shl.occupancy_rate || `${Math.round(((total - avail) / total) * 100)}%`
        const supplies = shl.supplies_status || 'Adequate'

        const isNearHazard = liveHazards.some((hz) => {
          if (hz.severity !== 'CRITICAL' && hz.severity !== 'WARNING') return false
          const d = calculateDistanceKm(shl.latitude, shl.longitude, hz.latitude, hz.longitude)
          return d <= Math.max(0.6, (hz.affected_radius_km || 2.0) * 0.5)
        })

        return (
          <div
            key={shl.id}
            className={`p-2.5 rounded-lg text-xs space-y-2 border transition-colors ${
              isNearHazard
                ? 'bg-[#14080A] border-rose-500/40 hover:border-rose-500'
                : 'bg-[#080C12] border-[#182332] hover:border-[#27384C]'
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="font-semibold text-slate-200 text-[11px] truncate max-w-[150px]">
                {shl.name}
              </span>
              <div className="flex items-center gap-1">
                {isNearHazard && (
                  <span className="text-[8px] font-mono px-1.5 py-0.2 rounded font-bold bg-rose-950 text-rose-300 border border-rose-500/40 animate-pulse">
                    ⚠️ HAZARD PROXIMITY
                  </span>
                )}
                <span
                  className={`text-[9px] font-mono px-1.5 py-0.2 rounded font-bold border ${
                    shl.status === 'OPEN'
                      ? 'bg-emerald-950/40 text-emerald-300 border-emerald-500/30'
                      : shl.status === 'NEAR_CAPACITY'
                        ? 'bg-amber-950/40 text-amber-300 border-amber-500/30'
                        : 'bg-rose-950/40 text-rose-300 border-rose-500/30'
                  }`}
                >
                  {shl.status}
                </span>
              </div>
            </div>
            <div className="flex items-center justify-between text-[10px] font-mono">
              <span className="text-emerald-400 font-bold">{avail} beds available</span>
              <span className="text-slate-400">Total: {total}</span>
            </div>
            <div className="w-full bg-[#121B27] h-1.5 rounded-full overflow-hidden border border-[#182332]">
              <div
                className={`h-full ${shl.status === 'NEAR_CAPACITY' ? 'bg-amber-500' : 'bg-emerald-500'}`}
                style={{ width: occ }}
              ></div>
            </div>
            <div className="flex items-center justify-between text-[9px] text-slate-400 font-mono">
              <span>Occupancy: {occ}</span>
              <span className="truncate max-w-[130px]">Rations: {supplies}</span>
            </div>
            <div className="flex items-center justify-between pt-1 border-t border-[#182332] text-[9px] font-mono">
              <span className="text-slate-500">Quick Intake:</span>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => onAdjustBeds && onAdjustBeds(shl.id, avail, -25)}
                  className="px-1.5 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 cursor-pointer"
                >
                  +25 Occupants
                </button>
                <button
                  type="button"
                  onClick={() => onAdjustBeds && onAdjustBeds(shl.id, avail, 25)}
                  className="px-1.5 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 cursor-pointer"
                >
                  -25 Released
                </button>
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}

export default ShelterPanel
