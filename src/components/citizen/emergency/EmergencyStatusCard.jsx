export const EmergencyStatusCard = ({
  statusInfo = {},
  severity = 'CRITICAL',
  category = 'Water Rescue / Localized Flood',
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

        <span className="text-xs font-medium text-slate-400">{category}</span>
      </div>

      {/* Hero Title & Description */}
      <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight leading-snug">
        {statusInfo.title}
      </h1>
      <p className="text-sm sm:text-base text-slate-300 mt-2 max-w-2xl leading-relaxed">
        {statusInfo.description}
      </p>

      {/* Multi-step progress bar */}
      <div className="mt-6 pt-6 border-t border-[#1E293B]">
        <div className="flex items-center justify-between text-xs text-slate-400 mb-2">
          <span>Response Progress</span>
          <span className="font-semibold text-white">Step {statusInfo.progressStep || 1} of 6</span>
        </div>
        <div className="w-full bg-[#0B1118] h-2 rounded-full overflow-hidden border border-[#1E293B]/60">
          <div
            className="h-full bg-gradient-to-r from-rose-500 via-amber-400 to-emerald-400 transition-all duration-500 ease-out"
            style={{ width: `${((statusInfo.progressStep || 1) / 6) * 100}%` }}
          ></div>
        </div>
      </div>
    </div>
  )
}
