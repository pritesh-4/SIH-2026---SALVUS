export const ResponderPreviewCard = ({
  currentState = 'EN_ROUTE',
  responder = {},
  etaMinutes = 4,
  distanceText = '850 m',
}) => {
  const isAssignedOrBeyond = ['ASSIGNED', 'EN_ROUTE', 'NEARBY', 'ON_SCENE', 'RESOLVED'].includes(
    currentState
  )
  const isNearby = currentState === 'NEARBY'
  const isOnScene = currentState === 'ON_SCENE' || currentState === 'RESOLVED'

  if (!isAssignedOrBeyond) {
    return (
      <div className="bg-[#111A24] border border-[#1E293B] rounded-2xl p-6 flex flex-col justify-center items-center text-center min-h-[260px]">
        <div className="relative flex items-center justify-center h-16 w-16 mb-4">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-30"></span>
          <span className="relative inline-flex rounded-full h-12 w-12 bg-amber-500/10 border border-amber-500/30 items-center justify-center text-amber-400 text-xl font-bold">
            📡
          </span>
        </div>
        <h3 className="text-base font-bold text-white tracking-tight">
          {currentState === 'SOS_ACTIVE'
            ? 'Transmitting Beacon to Dispatch Grid...'
            : currentState === 'TRIAGING'
              ? 'AI Triage Allocating Rescue Craft...'
              : 'Coordinator Finalizing Deployment...'}
        </h3>
        <p className="text-xs text-slate-400 mt-1.5 max-w-sm leading-relaxed">
          Matching nearest active water rescue unit with high-water Zodiac boat capability in Salt
          Lake / Sector 12.
        </p>
        <div className="mt-4 flex items-center gap-2 text-[10px] font-mono text-cyan-400 bg-cyan-950/40 border border-cyan-500/30 px-3 py-1 rounded-full">
          <span>Priority Dispatch Queue: Position 1</span>
        </div>
      </div>
    )
  }

  return (
    <div className="bg-[#111A24] border border-[#1E293B] rounded-2xl p-6 flex flex-col justify-between transition-all duration-300">
      <div>
        {/* Header with Status and ETA / Arrival Badge */}
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold tracking-wider text-slate-400 uppercase">
              ASSIGNED RESCUE TEAM
            </span>
            <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase font-mono bg-sky-950/80 text-sky-300 border border-sky-500/40">
              Status: {currentState}
            </span>
          </div>
          <div
            className={`px-3 py-1 rounded-full text-xs font-extrabold tracking-wider font-mono border ${
              isOnScene
                ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300'
                : isNearby
                  ? 'bg-amber-500/20 border-amber-500/50 text-amber-300 animate-pulse'
                  : 'bg-sky-500/15 border-sky-500/40 text-sky-300'
            }`}
          >
            {isOnScene
              ? 'ARRIVED ON SCENE'
              : isNearby
                ? 'NEARBY (<100m)'
                : `ETA: ${etaMinutes} MIN`}
          </div>
        </div>

        {/* Nearby Proximity Special Alert Callout */}
        {isNearby && (
          <div className="mb-4 bg-amber-950/40 border border-amber-500/50 rounded-xl p-3 text-xs text-amber-200 flex items-start gap-2.5 animate-fadeIn">
            <span className="text-base">🚨</span>
            <div>
              <span className="font-bold block text-amber-300 uppercase tracking-wider text-[11px]">
                RESPONDER IS NEARBY
              </span>
              <p className="text-[11px] text-amber-100/90 mt-0.5">
                Please remain at your reported location unless instructed otherwise. Prepare to
                signal crew.
              </p>
            </div>
          </div>
        )}

        {/* Responder Details */}
        <div className="flex items-start gap-4">
          <div className="h-12 w-12 rounded-xl bg-blue-600/20 border border-blue-500/40 flex items-center justify-center text-blue-300 text-xl font-bold shrink-0">
            🚤
          </div>
          <div>
            <span className="text-[10px] uppercase font-bold text-sky-400 font-mono block">
              Responder
            </span>
            <h3 className="text-lg font-bold text-white tracking-tight">
              {responder.unitName || responder.unit_name || 'NDRF Unit 04'}
            </h3>
            <p className="text-xs text-slate-300 mt-0.5">
              {responder.teamLead || responder.team_lead || responder.lead || 'Capt. A. Roy'} ·{' '}
              <span className="text-slate-400">
                {responder.vehicle || responder.vehicle_type || 'Zodiac Rescue Boat'}
              </span>
            </p>
            <div className="flex flex-wrap items-center gap-2 mt-2">
              <span className="text-[10px] bg-slate-800 text-slate-300 border border-slate-700 px-2 py-0.5 rounded font-semibold">
                {responder.badge || 'WATER RESCUE'}
              </span>
              <span className="text-xs font-mono font-bold text-cyan-400">
                {isOnScene ? 'At your building' : `Dist: ${distanceText}`}
              </span>
            </div>
          </div>
        </div>

        {/* Capability & Comms metadata */}
        <div className="mt-4 pt-4 border-t border-[#1E293B] grid grid-cols-2 gap-2 text-xs">
          <div className="bg-[#0B1118] border border-[#1E293B] p-2.5 rounded-lg">
            <span className="text-[9px] text-slate-400 block uppercase font-mono">
              Radio Channel
            </span>
            <span className="font-mono font-bold text-white text-[11px]">
              {responder.radioChannel || 'VHF Ch. 4'}
            </span>
          </div>
          <div className="bg-[#0B1118] border border-[#1E293B] p-2.5 rounded-lg">
            <span className="text-[9px] text-slate-400 block uppercase font-mono">
              Craft Capacity
            </span>
            <span className="font-mono font-bold text-emerald-400 text-[11px]">
              {responder.capacity || '6 Persons'}
            </span>
          </div>
        </div>
      </div>

      {/* Direct Dispatch Radio Action Footer */}
      <div className="mt-5 pt-3.5 border-t border-[#1E293B] flex items-center justify-between gap-3">
        <span className="text-[11px] text-slate-400">Emergency Dispatch Radio:</span>
        <a
          href="tel:112"
          className="px-3.5 py-2 rounded-lg bg-[#1E293B] hover:bg-[#2A3B4E] text-white text-xs font-bold transition-colors inline-flex items-center gap-1.5 cursor-pointer"
        >
          <span>📞 Radio Link (112)</span>
        </a>
      </div>
    </div>
  )
}
