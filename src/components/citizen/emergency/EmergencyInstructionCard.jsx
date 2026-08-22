export const EmergencyInstructionCard = ({ instructions = [] }) => {
  return (
    <div className="bg-[#111A24] border border-[#1E293B] rounded-2xl p-5 sm:p-6 transition-all duration-300">
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs font-bold tracking-wider text-slate-400 uppercase block">
          CRITICAL LIFE-SAFETY GUIDANCE
        </span>
        <span className="text-[10px] text-rose-400 font-bold uppercase tracking-wider bg-rose-950/40 border border-rose-500/30 px-2 py-0.5 rounded-full">
          Standard Protocol
        </span>
      </div>

      <div className="space-y-2.5">
        {instructions.map((inst) => (
          <div
            key={inst.id}
            className="bg-[#0B1118]/80 border border-[#1E293B] rounded-xl p-3.5 flex items-start gap-3 transition-colors hover:border-slate-700"
          >
            <span className="h-5 w-5 rounded-full bg-rose-500/20 text-rose-300 font-bold text-xs flex items-center justify-center shrink-0 mt-0.5">
              {inst.id}
            </span>
            <div>
              <h4 className="text-xs font-bold text-slate-200">{inst.title}</h4>
              <p className="text-[11px] text-slate-400 mt-0.5 leading-relaxed">{inst.text}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
