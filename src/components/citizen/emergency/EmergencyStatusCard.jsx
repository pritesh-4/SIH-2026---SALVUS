export const EmergencyStatusCard = ({
  statusInfo = {},
  severity = 'CRITICAL',
  category = 'Flood / Water Inundation',
}) => {
  const getBadgeStyle = (color) => {
    switch (color) {
      case 'rose':
        return 'bg-rose-500/15 border-rose-500/40 text-rose-400'
      case 'amber':
        return 'bg-amber-500/15 border-amber-500/40 text-amber-400'
      case 'blue':
        return 'bg-blue-500/15 border-blue-500/40 text-blue-400'
      case 'sky':
        return 'bg-sky-500/15 border-sky-500/40 text-sky-400'
      case 'emerald':
        return 'bg-emerald-500/15 border-emerald-500/40 text-emerald-400'
      default:
        return 'bg-slate-800 border-slate-700 text-slate-300'
    }
  }

  const currentStep = statusInfo.progressStep || 1
  const totalSteps = 8
  const progressPercent = Math.min(100, Math.max(10, (currentStep / totalSteps) * 100))

  return (
    <div className="bg-[#111A24] border border-[#1E293B] rounded-2xl p-6 sm:p-8 relative overflow-hidden transition-all duration-300">
      {/* Top Badges */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-2">
          <span
            className={`px-3 py-1 rounded-full text-xs font-bold tracking-wider uppercase border ${getBadgeStyle(
              statusInfo.badgeColor
            )}`}
          >
            {statusInfo.phaseLabel || 'EMERGENCY IN PROGRESS'}
          </span>
          <span className="text-xs bg-rose-950/60 border border-rose-500/40 text-rose-300 font-bold px-2.5 py-0.5 rounded-full">
            {severity}
          </span>
        </div>

        <span className="text-xs font-semibold text-slate-400">{category}</span>
      </div>

      {/* Hero Title & Headline */}
      <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight leading-snug">
        {statusInfo.title}
      </h1>
      <p className="text-sm sm:text-base text-slate-300 mt-2 max-w-2xl leading-relaxed">
        {statusInfo.headline || statusInfo.description}
      </p>

      {/* 3-Part Operational Clarity Grid: System / Responder / User Guidance */}
      <div className="mt-6 pt-6 border-t border-[#1E293B] grid grid-cols-1 sm:grid-cols-3 gap-3.5">
        {/* What the system is doing */}
        <div className="bg-[#0B1118]/90 border border-[#1E293B] rounded-xl p-3.5 flex flex-col justify-between">
          <div>
            <div className="flex items-center gap-1.5 text-cyan-400 text-[10px] font-bold tracking-wider uppercase mb-1">
              <span>⚙️</span>
              <span>SYSTEM ACTION</span>
            </div>
            <p className="text-[11px] text-slate-300 leading-relaxed">
              {statusInfo.systemDoing ||
                'Broadcasting live GPS coordinates & telemetry to emergency grid.'}
            </p>
          </div>
        </div>

        {/* What the responder is doing */}
        <div className="bg-[#0B1118]/90 border border-[#1E293B] rounded-xl p-3.5 flex flex-col justify-between">
          <div>
            <div className="flex items-center gap-1.5 text-sky-400 text-[10px] font-bold tracking-wider uppercase mb-1">
              <span>🚤</span>
              <span>RESPONDER ACTION</span>
            </div>
            <p className="text-[11px] text-slate-300 leading-relaxed">
              {statusInfo.responderDoing ||
                'Alerting nearest emergency units in Salt Lake district.'}
            </p>
          </div>
        </div>

        {/* What the user should do next */}
        <div className="bg-[#0B1118]/90 border border-emerald-500/30 rounded-xl p-3.5 flex flex-col justify-between">
          <div>
            <div className="flex items-center gap-1.5 text-emerald-400 text-[10px] font-bold tracking-wider uppercase mb-1">
              <span>👉</span>
              <span>WHAT YOU SHOULD DO</span>
            </div>
            <p className="text-[11px] text-emerald-200 font-medium leading-relaxed">
              {statusInfo.userNext ||
                'Stay calm. Move to the highest accessible dry ground and keep phone on.'}
            </p>
          </div>
        </div>
      </div>

      {/* Multi-step progress bar */}
      <div className="mt-6 pt-5 border-t border-[#1E293B]">
        <div className="flex items-center justify-between text-xs text-slate-400 mb-2">
          <span>Incident Progression</span>
          <span className="font-semibold text-white">
            Step {currentStep} of {totalSteps}
          </span>
        </div>
        <div className="w-full bg-[#0B1118] h-2.5 rounded-full overflow-hidden border border-[#1E293B]">
          <div
            className="h-full bg-gradient-to-r from-rose-500 via-amber-400 to-emerald-400 transition-all duration-700 ease-out"
            style={{ width: `${progressPercent}%` }}
          ></div>
        </div>
      </div>
    </div>
  )
}
