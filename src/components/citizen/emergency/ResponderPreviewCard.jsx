export const ResponderPreviewCard = ({
  currentState = 'EN_ROUTE',
  responder = {},
  etaMinutes = 4,
}) => {
  const isAssignedOrBeyond = ['ASSIGNED', 'EN_ROUTE', 'ON_SCENE', 'RESOLVED'].includes(currentState)

  if (!isAssignedOrBeyond) {
    return (
      <div className="bg-[#111A24] border border-[#1E293B] rounded-2xl p-6 flex flex-col justify-center items-center text-center min-h-[220px]">
        <div className="relative flex items-center justify-center h-16 w-16 mb-4">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-30"></span>
          <span className="relative inline-flex rounded-full h-12 w-12 bg-amber-500/10 border border-amber-500/30 items-center justify-center text-amber-400 text-xl font-bold">
            📡
          </span>
        </div>
        <h3 className="text-base font-bold text-white tracking-tight">
          {currentState === 'SOS_ACTIVE'
            ? 'Transmitting to Dispatch Grid...'
            : 'AI Triage Allocating Unit...'}
        </h3>
        <p className="text-xs text-slate-400 mt-1 max-w-sm">
          Matching nearest active rescue unit with inflatable boat capability in Salt Lake / Sector
          12.
        </p>
      </div>
    )
  }

  return (
    <div className="bg-[#111A24] border border-[#1E293B] rounded-2xl p-6 flex flex-col justify-between transition-all duration-300">
      <div>
        {/* Header with ETA */}
        <div className="flex items-center justify-between gap-3 mb-4">
          <span className="text-xs font-bold tracking-wider text-slate-400 uppercase">
            ASSIGNED RESPONDER
          </span>
          <div className="bg-sky-500/15 border border-sky-500/40 text-sky-300 px-3 py-1 rounded-full text-xs font-extrabold tracking-wider font-mono">
            {currentState === 'ON_SCENE' || currentState === 'RESOLVED'
              ? 'ARRIVED ON SCENE'
              : `ETA: ${etaMinutes} MINS`}
          </div>
        </div>

        {/* Responder Details */}
        <div className="flex items-start gap-4">
          <div className="h-12 w-12 rounded-xl bg-blue-600/20 border border-blue-500/40 flex items-center justify-center text-blue-300 text-xl font-bold shrink-0">
            🚤
          </div>
          <div>
            <h3 className="text-lg font-bold text-white tracking-tight">{responder.unitName}</h3>
            <p className="text-xs text-slate-300 mt-0.5">
              {responder.teamLead} · <span className="text-slate-400">{responder.vehicle}</span>
            </p>
            <div className="flex items-center gap-2 mt-2">
              <span className="text-[10px] bg-slate-800 text-slate-300 border border-slate-700 px-2 py-0.5 rounded font-semibold">
                {responder.badge}
              </span>
              <span className="text-xs text-slate-400">
                {currentState === 'ON_SCENE' ? 'Within 30m' : `approx. ${responder.distance}`}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Action footer */}
      <div className="mt-6 pt-4 border-t border-[#1E293B] flex items-center justify-between gap-3">
        <span className="text-xs text-slate-400 font-medium">Direct Radio/Dispatch:</span>
        <a
          href="tel:112"
          className="px-4 py-2 rounded-lg bg-[#1E293B] hover:bg-[#2A3B4E] text-white text-xs font-bold transition-colors inline-flex items-center gap-1.5"
        >
          <span>📞 Contact Dispatch</span>
        </a>
      </div>
    </div>
  )
}
