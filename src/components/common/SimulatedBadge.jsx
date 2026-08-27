/**
 * Visual Data Provenance Badges
 *
 * Explicitly distinguishes simulated background data (mock fleet, mock shelter supply, mock weather)
 * from genuine live database records and real citizen SOS submissions.
 */

export const SimulatedBadge = ({ label = 'SIMULATED DATA', className = '' }) => {
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[10px] font-mono font-medium uppercase tracking-wider bg-salvus-muted border border-salvus-border text-salvus-text-secondary ${className}`}
      title="This dataset is simulated for demonstration and operational context."
    >
      <span className="h-1.5 w-1.5 rounded-full bg-salvus-text-muted"></span>
      <span>{label}</span>
    </span>
  )
}

export const LiveBadge = ({ label = 'LIVE DB', className = '' }) => {
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[10px] font-mono font-medium uppercase tracking-wider bg-salvus-safe-bg border border-salvus-safe-border text-salvus-safe-text ${className}`}
      title="This record is stored in the live Salvus database and synced over WebSockets."
    >
      <span className="h-1.5 w-1.5 rounded-full bg-salvus-safe"></span>
      <span>{label}</span>
    </span>
  )
}
