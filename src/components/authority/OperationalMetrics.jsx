export const OperationalMetrics = ({
  computedMetrics = { active: 0, critical: 0, resolved: 0 },
  activeRespondersCount = 0,
  totalRespondersCount = 0,
  totalBedsAvailable = 0,
}) => {
  return (
    <section
      aria-label="District Operational Metrics"
      className="grid grid-cols-2 sm:grid-cols-5 gap-2.5"
    >
      <div className="bg-[#0C121B] border border-[#182332] rounded-xl p-3">
        <span className="text-[10px] font-mono text-slate-400 block uppercase">
          Active Incidents
        </span>
        <span className="text-xl font-bold font-mono text-slate-100">
          {computedMetrics.active ?? computedMetrics.activeIncidents ?? 0}
        </span>
      </div>
      <div className="bg-[#0C121B] border border-[#182332] rounded-xl p-3">
        <span className="text-[10px] font-mono text-rose-400 block uppercase">
          Critical Threats
        </span>
        <span className="text-xl font-bold font-mono text-rose-400">
          {computedMetrics.critical ?? computedMetrics.criticalThreats ?? 0}
        </span>
      </div>
      <div className="bg-[#0C121B] border border-[#182332] rounded-xl p-3">
        <span className="text-[10px] font-mono text-sky-400 block uppercase">Fleet Deployed</span>
        <span className="text-xl font-bold font-mono text-sky-300">
          {activeRespondersCount} / {totalRespondersCount}
        </span>
      </div>
      <div className="bg-[#0C121B] border border-[#182332] rounded-xl p-3">
        <span className="text-[10px] font-mono text-emerald-400 block uppercase">
          Available Beds
        </span>
        <span className="text-xl font-bold font-mono text-emerald-300">{totalBedsAvailable}</span>
      </div>
      <div className="bg-[#0C121B] border border-[#182332] rounded-xl p-3 col-span-2 sm:col-span-1">
        <span className="text-[10px] font-mono text-slate-400 block uppercase">Resolved Cases</span>
        <span className="text-xl font-bold font-mono text-emerald-400">
          {computedMetrics.resolved ?? computedMetrics.resolvedCount ?? 0}
        </span>
      </div>
    </section>
  )
}

export default OperationalMetrics
