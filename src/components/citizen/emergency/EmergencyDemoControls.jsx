export const EmergencyDemoControls = ({
  currentState,
  onSelectState,
  onNext,
  onPrev,
  onReset,
  isAutoPlaying,
  onToggleAutoPlay,
}) => {
  const states = [
    { key: 'SOS_ACTIVE', label: '1. SOS' },
    { key: 'TRIAGING', label: '2. Triage' },
    { key: 'ASSIGNED', label: '3. Assigned' },
    { key: 'EN_ROUTE', label: '4. En Route' },
    { key: 'ON_SCENE', label: '5. On Scene' },
    { key: 'RESOLVED', label: '6. Resolved' },
  ]

  return (
    <aside
      aria-label="Demo Simulator Controls"
      className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 max-w-2xl w-[94%] bg-[#111A24]/95 border border-cyan-500/40 rounded-2xl p-3 shadow-2xl backdrop-blur-md shadow-cyan-950/40"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        {/* Left Label */}
        <div className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full bg-cyan-400 animate-pulse"></span>
          <span className="text-[11px] font-extrabold tracking-wider text-cyan-300 uppercase">
            Demo Simulator
          </span>
        </div>

        {/* State Pills */}
        <div className="flex items-center gap-1 overflow-x-auto py-1">
          {states.map((s) => (
            <button
              key={s.key}
              type="button"
              onClick={() => onSelectState(s.key)}
              className={`px-2.5 py-1 rounded-lg text-[10px] font-bold tracking-wide uppercase transition-all whitespace-nowrap cursor-pointer ${
                currentState === s.key
                  ? 'bg-cyan-500 text-slate-950 shadow-md shadow-cyan-500/30'
                  : 'bg-[#0B1118] text-slate-400 hover:text-white border border-[#1E293B]'
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>

        {/* Right Controls */}
        <div className="flex items-center gap-1.5 ml-auto">
          <button
            type="button"
            onClick={onToggleAutoPlay}
            className={`px-2.5 py-1 rounded-lg text-[10px] font-bold tracking-wider uppercase transition-colors cursor-pointer ${
              isAutoPlaying
                ? 'bg-amber-500 text-slate-950 animate-pulse'
                : 'bg-[#1E293B] text-slate-300 hover:text-white'
            }`}
          >
            {isAutoPlaying ? '⏸ Auto-Playing' : '▶ Auto Simulate'}
          </button>
          <button
            type="button"
            onClick={onPrev}
            className="px-2 py-1 rounded-lg bg-[#0B1118] border border-[#1E293B] text-slate-300 hover:text-white text-[10px] font-bold cursor-pointer"
            title="Previous Stage"
          >
            ←
          </button>
          <button
            type="button"
            onClick={onNext}
            className="px-2 py-1 rounded-lg bg-[#0B1118] border border-[#1E293B] text-slate-300 hover:text-white text-[10px] font-bold cursor-pointer"
            title="Next Stage"
          >
            →
          </button>
          <button
            type="button"
            onClick={onReset}
            className="px-2 py-1 rounded-lg bg-[#0B1118] border border-rose-500/30 text-rose-300 hover:text-rose-200 text-[10px] font-bold cursor-pointer"
            title="Reset Flow"
          >
            ↺
          </button>
        </div>
      </div>
    </aside>
  )
}
