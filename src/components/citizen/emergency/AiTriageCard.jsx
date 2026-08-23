import { SimulatedBadge } from '../../common/SimulatedBadge'

export const AiTriageCard = ({ currentState = 'TRIAGING', aiTriage = {} }) => {
  const isTriaging = currentState === 'TRIAGING'
  const isPostTriage = [
    'VERIFIED',
    'ASSIGNED',
    'EN_ROUTE',
    'NEARBY',
    'ON_SCENE',
    'RESOLVED',
  ].includes(currentState)

  const steps = aiTriage.analysisSteps || [
    { id: 'signal', label: 'GPS Telemetry & Spatial Mesh', status: 'verified' },
    { id: 'hazard', label: 'Satellite Flood Hydro-Model', status: 'verified' },
    { id: 'priority', label: 'Life-Safety Risk & Urgency Index', status: 'verified' },
    { id: 'craft', label: 'Resource Matching & Route Feasibility', status: 'verified' },
  ]

  return (
    <div className="bg-[#111A24] border border-[#1E293B] rounded-2xl p-5 sm:p-6 transition-all duration-300">
      {/* Top Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-2">
          <div className="h-7 w-7 rounded-lg bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center text-cyan-400 text-xs">
            ⚡
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-bold text-white tracking-tight">
                Operational Intelligence Triage
              </h3>
              <SimulatedBadge label="SIMULATED MODEL" />
            </div>
            <p className="text-[10px] text-slate-400 uppercase tracking-wider font-mono">
              Salvus Incident Evaluation Engine
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {isTriaging ? (
            <span className="flex items-center gap-1.5 bg-amber-500/15 border border-amber-500/30 text-amber-300 text-[10px] font-bold px-2.5 py-1 rounded-full uppercase tracking-wider">
              <span className="h-1.5 w-1.5 rounded-full bg-amber-400 animate-ping"></span>
              Analyzing Distress Telemetry
            </span>
          ) : isPostTriage ? (
            <span className="flex items-center gap-1.5 bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-[10px] font-bold px-2.5 py-1 rounded-full uppercase tracking-wider">
              <span>✓</span>
              Triage Assessment Complete
            </span>
          ) : (
            <span className="bg-slate-800 text-slate-400 border border-slate-700 text-[10px] font-semibold px-2 py-0.5 rounded-full">
              Queued for Triage
            </span>
          )}
        </div>
      </div>

      {/* Analysis Criteria Progress Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 mb-4">
        {steps.map((step, idx) => {
          const isDone = isPostTriage || (isTriaging && idx < 3)
          const isCurrent = isTriaging && idx === 3

          return (
            <div
              key={step.id}
              className={`p-2.5 rounded-xl border text-[11px] transition-all ${
                isDone
                  ? 'bg-[#0B1118] border-emerald-500/30 text-slate-200'
                  : isCurrent
                    ? 'bg-amber-950/20 border-amber-500/40 text-amber-200 animate-pulse'
                    : 'bg-[#0B1118]/60 border-[#1E293B] text-slate-500'
              }`}
            >
              <div className="flex items-center justify-between mb-1">
                <span className="font-mono text-[9px] text-slate-400 font-bold">0{idx + 1}</span>
                {isDone ? (
                  <span className="text-emerald-400 text-[10px] font-bold">✓</span>
                ) : isCurrent ? (
                  <span className="h-1.5 w-1.5 rounded-full bg-amber-400 animate-ping"></span>
                ) : (
                  <span className="text-slate-600 text-[10px]">○</span>
                )}
              </div>
              <p className="font-medium leading-tight line-clamp-2 text-[10px]">{step.label}</p>
            </div>
          )
        })}
      </div>

      {/* Triage Output Breakdown Box */}
      <div className="bg-[#0B1118] border border-[#1E293B] rounded-xl p-4 space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pb-3 border-b border-[#1E293B]">
          <div>
            <span className="text-[10px] font-mono uppercase text-slate-400 block font-semibold">
              Hazard Classification
            </span>
            <span className="text-xs font-bold text-white mt-0.5 block">
              {aiTriage.hazardType || 'Flash Flood & Surge Inundation'}
            </span>
          </div>
          <div>
            <span className="text-[10px] font-mono uppercase text-slate-400 block font-semibold">
              Estimated Severity
            </span>
            <div className="flex items-center gap-1.5 mt-0.5">
              <span className="text-xs font-bold text-rose-400">
                {aiTriage.severityClassification || 'Critical (Tier 4)'}
              </span>
              <span className="text-[9px] bg-rose-500/20 text-rose-300 px-1.5 py-0.2 rounded font-mono font-bold">
                {aiTriage.aiConfidence || '94%'} conf.
              </span>
            </div>
          </div>
          <div>
            <span className="text-[10px] font-mono uppercase text-slate-400 block font-semibold">
              Allocated Craft Class
            </span>
            <span className="text-xs font-bold text-sky-400 mt-0.5 block">
              {aiTriage.requiredCapability || 'Zodiac Rescue Boat'}
            </span>
          </div>
        </div>

        {/* Human in the loop verification stamp */}
        <div className="flex items-start sm:items-center justify-between gap-3 pt-1 flex-col sm:flex-row">
          <div className="flex items-center gap-2 text-xs">
            <span className="h-2 w-2 rounded-full bg-cyan-400"></span>
            <span className="text-slate-300 text-[11px]">
              <strong className="text-white">Human Coordinator Verification: </strong>
              {aiTriage.humanVerification?.coordinator
                ? `Approved by Dispatcher ${aiTriage.humanVerification.coordinator} (${aiTriage.humanVerification.station})`
                : 'Salvus Central Hub human dispatcher authorized life-safety dispatch.'}
            </span>
          </div>

          <span className="text-[10px] text-slate-400 font-mono italic shrink-0">
            Life-Safety Verified
          </span>
        </div>
      </div>
    </div>
  )
}
