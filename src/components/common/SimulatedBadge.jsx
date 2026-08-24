/**
 * Visual Data Provenance Badges
 *
 * Explicitly distinguishes simulated background data (mock fleet, mock shelter supply, mock weather)
 * from genuine live database records and real citizen SOS submissions.
 */

export const SimulatedBadge = ({ label = 'SIMULATED DATA', className = '' }) => {
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[10px] font-mono font-medium uppercase tracking-wider bg-slate-800/80 border border-slate-700/70 text-slate-300 ${className}`}
      title="This dataset is simulated for demonstration and operational context."
    >
      <span className="h-1.5 w-1.5 rounded-full bg-slate-400"></span>
      <span>{label}</span>
    </span>
  )
}

export const LiveBadge = ({ label = 'LIVE DB', className = '' }) => {
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[10px] font-mono font-medium uppercase tracking-wider bg-emerald-950/40 border border-emerald-500/30 text-emerald-300 ${className}`}
      title="This record is stored in the live Salvus database and synced over WebSockets."
    >
      <span className="h-1.5 w-1.5 rounded-full bg-emerald-400"></span>
      <span>{label}</span>
    </span>
  )
}
