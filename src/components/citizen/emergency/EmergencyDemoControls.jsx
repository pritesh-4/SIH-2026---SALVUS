import { useState, useEffect } from 'react'

export const EmergencyDemoControls = ({
  currentState,
  onSelectState,
  onNext,
  onPrev,
  onReset,
  isAutoPlaying,
  onToggleAutoPlay,
  simulationSpeed = 1,
  onSpeedChange,
  connectivityStatus = 'CONNECTED',
  onConnectivityChange,
  onTriggerLiveSos,
  incidentTicket,
}) => {
  const [isDemoMode, setIsDemoMode] = useState(() => {
    if (typeof window === 'undefined') return false
    const params = new URLSearchParams(window.location.search)
    return (
      params.get('demo') === 'true' ||
      params.get('dev') === 'true' ||
      localStorage.getItem('salvus_demo_mode') === 'true'
    )
  })

  const [isMinimized, setIsMinimized] = useState(false)

  // Keyboard shortcut listener: Ctrl+Shift+D toggles demo mode
  useEffect(() => {
    const handleKeyDown = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === 'D' || e.key === 'd')) {
        e.preventDefault()
        setIsDemoMode((prev) => {
          const next = !prev
          if (next) {
            localStorage.setItem('salvus_demo_mode', 'true')
          } else {
            localStorage.removeItem('salvus_demo_mode')
          }
          return next
        })
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  if (!isDemoMode) {
    return null
  }

  const states = [
    { key: 'SOS_ACTIVE', label: '1. SOS' },
    { key: 'TRIAGING', label: '2. Triage' },
    { key: 'VERIFIED', label: '3. Verified' },
    { key: 'ASSIGNED', label: '4. Assigned' },
    { key: 'EN_ROUTE', label: '5. En Route' },
    { key: 'NEARBY', label: '6. Nearby' },
    { key: 'ON_SCENE', label: '7. On Scene' },
    { key: 'RESOLVED', label: '8. Resolved' },
  ]

  if (isMinimized) {
    return (
      <aside
        aria-label="Demo Simulator Minimized"
        className="fixed bottom-4 right-4 z-50 animate-fadeIn"
      >
        <button
          type="button"
          onClick={() => setIsMinimized(false)}
          className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-[#080C12]/95 border border-slate-700 shadow-2xl backdrop-blur-md text-slate-300 text-xs font-semibold hover:bg-[#121B27] cursor-pointer"
        >
          <span className="h-2 w-2 rounded-full bg-sky-400"></span>
          <span>Demo dock {incidentTicket ? `(#${incidentTicket})` : ''}</span>
        </button>
      </aside>
    )
  }

  return (
    <aside
      aria-label="Demo Simulator Controls"
      className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 max-w-4xl w-[95%] bg-[#111A24]/95 border border-cyan-500/40 rounded-2xl p-3 shadow-2xl backdrop-blur-md shadow-cyan-950/40 animate-fadeIn"
    >
      <div className="flex flex-wrap items-center justify-between gap-2.5">
        {/* Left Label & Minimize Button */}
        <div className="flex items-center gap-2 shrink-0">
          <span className="h-2 w-2 rounded-full bg-cyan-400 animate-pulse"></span>
          <span className="text-[11px] font-extrabold tracking-wider text-cyan-300 uppercase font-mono">
            Demo Dock {incidentTicket && <span className="text-white">· #{incidentTicket}</span>}
          </span>
          <button
            type="button"
            onClick={() => setIsMinimized(true)}
            className="text-slate-400 hover:text-white text-[10px] px-1.5 py-0.5 rounded bg-[#0B1118] border border-[#1E293B] cursor-pointer"
            title="Minimize Dock"
          >
            _
          </button>
        </div>

        {/* State Pills */}
        <div className="flex items-center gap-1 overflow-x-auto py-1 max-w-full">
          {states.map((s) => (
            <button
              key={s.key}
              type="button"
              onClick={() => onSelectState(s.key)}
              className={`px-2.5 py-1 rounded-lg text-[10px] font-bold tracking-wide uppercase transition-all whitespace-nowrap cursor-pointer ${
                currentState === s.key
                  ? 'bg-cyan-500 text-slate-950 shadow-md shadow-cyan-500/30 ring-2 ring-cyan-300'
                  : 'bg-[#0B1118] text-slate-400 hover:text-white border border-[#1E293B]'
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>

        {/* Right Controls */}
        <div className="flex items-center gap-1.5 ml-auto shrink-0 flex-wrap">
          {onTriggerLiveSos && (
            <button
              type="button"
              onClick={onTriggerLiveSos}
              className="px-2.5 py-1 rounded-lg bg-rose-600 hover:bg-rose-500 text-white font-mono text-[10px] font-bold uppercase tracking-wider transition-colors cursor-pointer shadow-md shadow-rose-950/40"
              title="Broadcast Live SOS to Backend & Authorities Room"
            >
              ⚡ Live SOS
            </button>
          )}

          {/* Connectivity toggle */}
          {onConnectivityChange && (
            <button
              type="button"
              onClick={() =>
                onConnectivityChange(
                  connectivityStatus === 'CONNECTED'
                    ? 'LIMITED_CONNECTION'
                    : connectivityStatus === 'LIMITED_CONNECTION'
                      ? 'OFFLINE'
                      : 'CONNECTED'
                )
              }
              className={`px-2 py-1 rounded-lg border text-[10px] font-mono font-bold cursor-pointer ${
                connectivityStatus === 'CONNECTED'
                  ? 'bg-emerald-950/40 border-emerald-500/40 text-emerald-300'
                  : connectivityStatus === 'LIMITED_CONNECTION'
                    ? 'bg-amber-950/40 border-amber-500/40 text-amber-300'
                    : 'bg-rose-950/40 border-rose-500/40 text-rose-300'
              }`}
              title="Simulate Network Health"
            >
              Net: {connectivityStatus.split('_')[0]}
            </button>
          )}

          {onSpeedChange && (
            <button
              type="button"
              onClick={() =>
                onSpeedChange(simulationSpeed === 1 ? 1.5 : simulationSpeed === 1.5 ? 2 : 1)
              }
              className="px-2 py-1 rounded-lg bg-[#0B1118] border border-[#1E293B] text-cyan-400 hover:text-cyan-200 text-[10px] font-mono font-bold cursor-pointer"
              title="Toggle Simulation Speed"
            >
              {simulationSpeed}x
            </button>
          )}

          <button
            type="button"
            onClick={onToggleAutoPlay}
            className={`px-2.5 py-1 rounded-lg text-[10px] font-bold tracking-wider uppercase transition-colors cursor-pointer ${
              isAutoPlaying
                ? 'bg-amber-500 text-slate-950 animate-pulse shadow-md shadow-amber-500/30'
                : 'bg-[#1E293B] text-slate-300 hover:text-white'
            }`}
          >
            {isAutoPlaying ? '⏸ Auto' : '▶ Sim'}
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
