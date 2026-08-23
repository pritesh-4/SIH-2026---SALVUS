/**
 * Visual Data Provenance Badges
 *
 * Explicitly distinguishes simulated background data (mock fleet, mock shelter supply, mock weather)
 * from genuine live database records and real citizen SOS submissions.
 */

export const SimulatedBadge = ({ label = 'SIMULATED DATA', className = '' }) => {
  return (
    <span
      className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-mono font-bold uppercase tracking-wider bg-purple-950/50 border border-purple-500/40 text-purple-300 shadow-sm ${className}`}
      title="This dataset is simulated for demonstration and operational context."
    >
      <span className="h-1.5 w-1.5 rounded-full bg-purple-400"></span>
      <span>{label}</span>
    </span>
  )
}

export const LiveBadge = ({ label = 'LIVE DB', className = '' }) => {
  return (
    <span
      className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-mono font-bold uppercase tracking-wider bg-emerald-950/50 border border-emerald-500/40 text-emerald-300 shadow-sm ${className}`}
      title="This record is stored in the live Salvus database and synced over WebSockets."
    >
      <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
      <span>{label}</span>
    </span>
  )
}
