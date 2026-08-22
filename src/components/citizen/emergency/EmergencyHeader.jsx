export const EmergencyHeader = ({ incidentId = 'INC-8492', onCancelClick }) => {
  return (
    <header className="w-full border-b border-rose-500/20 bg-[#0B1118]/95 backdrop-blur-md sticky top-0 z-40">
      <div className="max-w-[1440px] mx-auto px-4 sm:px-8 h-16 flex items-center justify-between">
        {/* Brand & Mode */}
        <div className="flex items-center gap-3">
          <span className="text-white font-black text-lg tracking-wider">SALVUS</span>
          <div className="flex items-center gap-1.5 bg-rose-500/10 border border-rose-500/30 px-2.5 py-1 rounded-full">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-rose-500"></span>
            </span>
            <span className="text-[10px] font-extrabold tracking-widest text-rose-400 uppercase">
              EMERGENCY MODE
            </span>
          </div>
        </div>

        {/* Incident ID & Quick Call */}
        <div className="flex items-center gap-3 sm:gap-4">
          <div className="hidden sm:flex items-center gap-2 text-xs bg-[#111A24] border border-[#1E293B] px-3 py-1.5 rounded-lg font-mono text-slate-300">
            <span className="text-slate-500">TICKET:</span>
            <span className="font-bold text-white">#{incidentId}</span>
          </div>

          <a
            href="tel:112"
            className="flex items-center gap-1.5 bg-rose-600/20 hover:bg-rose-600/30 text-rose-300 border border-rose-500/40 text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors"
          >
            <span>📞</span>
            <span>Call 112</span>
          </a>

          {onCancelClick && (
            <button
              type="button"
              onClick={onCancelClick}
              className="text-xs text-slate-400 hover:text-slate-200 border border-[#1E293B] hover:border-slate-600 px-3 py-1.5 rounded-lg transition-colors cursor-pointer"
            >
              Cancel SOS
            </button>
          )}
        </div>
      </div>
    </header>
  )
}
