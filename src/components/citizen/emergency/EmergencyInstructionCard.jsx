export const EmergencyInstructionCard = ({ instructions = [] }) => {
  return (
    <div className="bg-[#111A24] border border-[#1E293B] rounded-2xl p-6 transition-all duration-300">
      <span className="text-xs font-bold tracking-wider text-slate-400 uppercase block mb-3">
        CRITICAL SAFETY GUIDANCE
      </span>
      <div className="space-y-3">
        {instructions.map((inst) => (
          <div
            key={inst.id}
            className="bg-[#0B1118]/80 border border-[#1E293B] rounded-xl p-3.5 flex items-start gap-3"
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
