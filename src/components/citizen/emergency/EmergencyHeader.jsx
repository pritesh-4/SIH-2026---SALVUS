export const EmergencyHeader = ({
  incidentId = 'SV-2048',
  phaseLabel = 'BEACON ACTIVE',
  badgeColor = 'rose',
  onCancelClick,
}) => {
  const getBadgePill = () => {
    switch (badgeColor) {
      case 'rose':
        return 'bg-rose-500/10 border-rose-500/30 text-rose-400'
      case 'amber':
        return 'bg-amber-500/10 border-amber-500/30 text-amber-400'
      case 'blue':
      case 'sky':
        return 'bg-sky-500/10 border-sky-500/30 text-sky-400'
      case 'emerald':
        return 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
      default:
        return 'bg-slate-800 border-slate-700 text-slate-300'
    }
  }

  return (
    <header className="w-full border-b border-rose-500/20 bg-[#0B1118]/95 backdrop-blur-md sticky top-0 z-40">
      <div className="max-w-[1440px] mx-auto px-4 sm:px-8 h-16 flex items-center justify-between">
        {/* Brand & Mode Indicator */}
        <div className="flex items-center gap-3">
          <span className="text-white font-black text-lg tracking-wider">SALVUS</span>
          <div
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-[10px] font-extrabold tracking-widest uppercase ${getBadgePill()}`}
          >
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-current opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-current"></span>
            </span>
            <span>{phaseLabel || 'EMERGENCY ACTIVE'}</span>
          </div>
        </div>

        {/* Incident ID & Action Group */}
        <div className="flex items-center gap-2 sm:gap-4">
          <div className="hidden sm:flex items-center gap-2 text-xs bg-[#111A24] border border-[#1E293B] px-3 py-1.5 rounded-lg font-mono text-slate-300">
            <span className="text-slate-500">INCIDENT:</span>
            <span className="font-bold text-white">#{incidentId}</span>
          </div>

          <a
            href="tel:112"
            className="flex items-center gap-1.5 bg-rose-600/20 hover:bg-rose-600/30 text-rose-300 border border-rose-500/40 text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors"
            title="Dial national emergency dispatcher"
          >
            <span>📞</span>
            <span className="hidden xs:inline">Call</span>
            <span>112</span>
          </a>

          {onCancelClick && (
            <button
              type="button"
              onClick={onCancelClick}
              className="text-xs text-slate-400 hover:text-rose-300 border border-[#1E293B] hover:border-rose-500/40 px-3 py-1.5 rounded-lg transition-colors cursor-pointer"
            >
              Cancel SOS
            </button>
          )}
        </div>
      </div>
    </header>
  )
}
