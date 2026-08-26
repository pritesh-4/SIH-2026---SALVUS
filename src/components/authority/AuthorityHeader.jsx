export const AuthorityHeader = ({ hub, dataProvenance = 'LIVE' }) => {
  if (!hub) return null

  return (
    <header className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 bg-[#0C121B] border border-[#182332] rounded-xl px-4 py-3">
      <div>
        <div className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse"></span>
          <span className="font-mono text-xs font-bold text-slate-200 tracking-wider uppercase">
            {hub.name} · SECTOR 12 GRID
          </span>
          <span className="text-[10px] font-mono text-slate-400 bg-slate-800 px-1.5 py-0.5 rounded border border-slate-700">
            {dataProvenance}
          </span>
        </div>
        <p className="text-xs text-slate-400 mt-0.5">
          Operational Intelligence & Deterministic Dispatch Allocation Surface
        </p>
      </div>

      <div className="flex items-center gap-3 font-mono text-xs">
        <div className="flex items-center gap-1.5 bg-[#080C12] border border-[#182332] px-2.5 py-1 rounded-lg text-slate-300">
          <span className="text-slate-500">DISPATCHER:</span>
          <span className="font-bold text-slate-200">{hub.activeDispatcher}</span>
        </div>
        <div className="flex items-center gap-1.5 bg-[#080C12] border border-[#182332] px-2.5 py-1 rounded-lg text-sky-400 font-bold">
          <span>VHF:</span>
          <span>{hub.radioChannel}</span>
        </div>
      </div>
    </header>
  )
}

export default AuthorityHeader
