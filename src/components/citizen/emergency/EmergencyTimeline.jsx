import { STATE_ORDER } from '../../../features/citizen/emergency/useEmergencyState'

export const EmergencyTimeline = ({ timelineSteps = [], currentState = 'SOS_ACTIVE' }) => {
  const currentIdx = STATE_ORDER.indexOf(currentState)

  return (
    <div className="bg-[#111A24] border border-[#1E293B] rounded-2xl p-5 sm:p-6 transition-all duration-300">
      <div className="flex items-center justify-between mb-4">
        <span className="text-xs font-bold tracking-wider text-slate-400 uppercase block">
          LIVE INCIDENT TIMELINE
        </span>
        <span className="text-[10px] font-mono text-cyan-400 bg-cyan-950/40 border border-cyan-500/30 px-2 py-0.5 rounded-full">
          Salvus Dispatch Audit Log
        </span>
      </div>

      <div className="space-y-3.5 relative before:absolute before:left-3 before:top-2 before:bottom-2 before:w-0.5 before:bg-[#1E293B]">
        {timelineSteps.map((step, idx) => {
          const isCompleted = idx < currentIdx
          const isCurrent = idx === currentIdx

          return (
            <div key={step.id} className="relative flex items-start gap-3.5 pl-1.5">
              {/* Timeline marker icon */}
              <div
                className={`h-4 w-4 rounded-full flex items-center justify-center text-[9px] font-bold z-10 shrink-0 mt-0.5 transition-all duration-300 ${
                  isCompleted
                    ? 'bg-emerald-500 text-white shadow-[0_0_8px_rgba(16,185,129,0.5)]'
                    : isCurrent
                      ? 'bg-amber-400 text-slate-950 ring-4 ring-amber-400/25 animate-pulse'
                      : 'bg-[#1E293B] text-slate-500'
                }`}
              >
                {isCompleted ? '✓' : idx + 1}
              </div>

              {/* Step info */}
              <div className="flex-1">
                <div className="flex items-center justify-between gap-2">
                  <h4
                    className={`text-xs font-bold transition-colors ${
                      isCurrent
                        ? 'text-white'
                        : isCompleted
                          ? 'text-slate-200'
                          : 'text-slate-500 font-normal'
                    }`}
                  >
                    {step.label}
                  </h4>
                  {isCurrent && (
                    <span className="text-[9px] bg-amber-500/20 text-amber-300 border border-amber-500/30 px-2 py-0.2 rounded-full font-bold uppercase shrink-0">
                      CURRENT
                    </span>
                  )}
                  {isCompleted && (
                    <span className="text-[10px] text-emerald-400 font-semibold shrink-0">
                      Done
                    </span>
                  )}
                </div>
                <p className="text-[11px] text-slate-400 mt-0.5">{step.description}</p>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
