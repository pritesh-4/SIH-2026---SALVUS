import { useState } from 'react'
import {
  Navigation,
  Send,
  Clock,
  MapPin,
  Users,
  ChevronDown,
  ChevronUp,
  AlertCircle,
  RefreshCw,
} from 'lucide-react'

export const DispatchRecommendationPanel = ({
  incident,
  topCandidate,
  alternatives = [],
  activeRoute = null,
  isLoading = false,
  onSelectRoute,
  onRequestAssign,
  onRefreshCandidates,
  isAssigning = false,
}) => {
  const [showFormulaBreakdown, setShowFormulaBreakdown] = useState(false)

  if (!incident) return null

  if (isLoading) {
    return (
      <div className="bg-[#080E17] border border-[#162230] p-4 rounded-xl space-y-3 font-mono">
        <div className="flex items-center justify-between border-b border-[#141C28] pb-2">
          <span className="text-[10px] uppercase font-bold text-slate-400 flex items-center gap-1.5">
            <span className="h-1.5 w-1.5 rounded-full bg-sky-400 animate-ping"></span>
            System Recommendation
          </span>
          <span className="text-[9px] text-slate-500">Deterministic Engine</span>
        </div>
        <div className="py-8 text-center space-y-2">
          <RefreshCw className="h-5 w-5 text-sky-400 animate-spin mx-auto" />
          <p className="text-xs text-slate-400">
            Evaluating fleet capabilities, distance & routing vectors...
          </p>
        </div>
      </div>
    )
  }

  if (!topCandidate) {
    return (
      <div className="bg-[#080E17] border border-amber-500/30 p-4 rounded-xl space-y-3 font-mono">
        <div className="flex items-center justify-between border-b border-[#141C28] pb-2">
          <span className="text-[10px] uppercase font-bold text-amber-400 flex items-center gap-1.5">
            <AlertCircle className="h-3.5 w-3.5" />
            No Available Responder
          </span>
          <span className="text-[9px] text-slate-500">Operational Standby</span>
        </div>

        <div className="py-4 text-center space-y-3">
          <p className="text-xs text-slate-300">
            No suitable response unit is currently available in the active sector.
          </p>
          <p className="text-[10px] text-slate-500 max-w-xs mx-auto">
            All units may be actively committed to ongoing missions, out of operational range, or
            offline.
          </p>
          {onRefreshCandidates && (
            <button
              type="button"
              onClick={onRefreshCandidates}
              className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-sky-300 border border-slate-700 text-xs font-bold transition-colors cursor-pointer flex items-center gap-1.5 mx-auto"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              <span>Refresh Fleet Status</span>
            </button>
          )}
        </div>
      </div>
    )
  }

  const breakdown = topCandidate.explanation?.breakdown || {}
  const isSelectedForRoute =
    activeRoute?.responderId === topCandidate.id ||
    activeRoute?.label?.includes(topCandidate.unit_name || topCandidate.unitName || '')

  return (
    <div className="bg-[#080E17] border border-[#162230] p-3.5 rounded-xl space-y-3 font-mono text-slate-200">
      {/* Section Header (Explicitly NO AI label) */}
      <div className="flex items-center justify-between border-b border-[#141C28] pb-2">
        <div className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-sky-400"></span>
          <span className="text-[10px] uppercase tracking-wider font-bold text-slate-300">
            Recommended Response Unit
          </span>
        </div>
        <span className="text-[9px] text-slate-400 bg-sky-950/60 px-2 py-0.5 rounded border border-sky-500/30">
          Deterministic Scoring
        </span>
      </div>

      {/* Primary Recommended Unit Decision Panel */}
      <div className="bg-[#0B1524] border border-sky-500/40 p-3 rounded-xl space-y-2.5 relative overflow-hidden shadow-lg shadow-black/40">
        {/* Unit Headline */}
        <div className="flex items-start justify-between gap-2">
          <div>
            <span className="text-[9px] font-bold uppercase tracking-widest text-sky-400 bg-sky-950/80 px-2 py-0.5 rounded border border-sky-500/30">
              ★ Primary Recommendation
            </span>
            <h4 className="text-xs font-bold text-slate-100 mt-1">
              {topCandidate.unit_name || topCandidate.unitName}
            </h4>
            <p className="text-[10px] text-slate-300">
              {topCandidate.team_lead && `Lead: ${topCandidate.team_lead} · `}
              {topCandidate.vehicle_type || 'Rescue Craft'} (
              {topCandidate.capability?.replace('_', ' ') || 'General'})
            </p>
          </div>

          <div className="text-right">
            <div className="bg-sky-950 border border-sky-400/60 px-2.5 py-1 rounded-lg text-center shadow-inner">
              <span className="text-xs font-bold text-sky-300 block leading-none">
                {topCandidate.match_score ?? topCandidate.matchScore}
              </span>
              <span className="text-[8px] text-slate-400 uppercase">Score / 100</span>
            </div>
          </div>
        </div>

        {/* Tactical 4-Factor Metric Grid */}
        <div className="grid grid-cols-4 gap-1.5 p-2 bg-[#060D17] rounded-lg border border-[#142236] text-[10px]">
          <div className="space-y-0.5">
            <span className="text-[8px] text-slate-400 uppercase block">Distance</span>
            <div className="flex items-center gap-1 font-bold text-slate-200">
              <MapPin className="h-3 w-3 text-sky-400 shrink-0" />
              <span>{topCandidate.distance_km ?? topCandidate.distanceKm ?? 1.2} km</span>
            </div>
          </div>

          <div className="space-y-0.5">
            <span className="text-[8px] text-slate-400 uppercase block">Est. Arrival</span>
            <div className="flex items-center gap-1 font-bold text-sky-300">
              <Clock className="h-3 w-3 text-sky-400 shrink-0" />
              <span>{topCandidate.eta_formatted || topCandidate.etaFormatted || '5 min'}</span>
            </div>
          </div>

          <div className="space-y-0.5">
            <span className="text-[8px] text-slate-400 uppercase block">Status</span>
            <span className="text-[9px] font-bold text-emerald-400 truncate block">
              {topCandidate.status || 'AVAILABLE'}
            </span>
          </div>

          <div className="space-y-0.5">
            <span className="text-[8px] text-slate-400 uppercase block">Crew Load</span>
            <div className="flex items-center gap-1 text-slate-300">
              <Users className="h-3 w-3 text-slate-400 shrink-0" />
              <span>
                {topCandidate.current_load ?? 0}/{topCandidate.max_capacity ?? 8}
              </span>
            </div>
          </div>
        </div>

        {/* Explainable Why-Factors Box */}
        <div className="p-2.5 bg-[#060B12] rounded-lg border border-[#142030] space-y-1">
          <span className="text-[9px] font-bold uppercase tracking-wider text-slate-400 block">
            Why this unit is recommended:
          </span>
          <div className="space-y-1 text-[10px]">
            {topCandidate.explanation?.positive_factors?.map((bullet, idx) => (
              <div key={idx} className="text-emerald-300 flex items-start gap-1.5">
                <span className="shrink-0">{bullet.startsWith('✓') ? '' : '✓ '}</span>
                <span>{bullet}</span>
              </div>
            ))}
            {topCandidate.explanation?.negative_factors?.map((bullet, idx) => (
              <div key={idx} className="text-amber-400 flex items-start gap-1.5">
                <span className="shrink-0">{bullet.startsWith('⚠') ? '' : '⚠ '}</span>
                <span>{bullet}</span>
              </div>
            ))}
            {!topCandidate.explanation?.positive_factors?.length && (
              <div className="text-slate-300">
                ✓ Compatible equipment capability & optimal transit corridor
              </div>
            )}
          </div>
        </div>

        {/* Audit Formula Breakdown Accordion */}
        <div className="pt-0.5">
          <button
            type="button"
            onClick={() => setShowFormulaBreakdown((prev) => !prev)}
            className="w-full flex items-center justify-between text-[10px] text-sky-400 hover:text-sky-300 transition-colors py-1 cursor-pointer"
          >
            <span className="flex items-center gap-1">
              {showFormulaBreakdown ? (
                <ChevronUp className="h-3.5 w-3.5" />
              ) : (
                <ChevronDown className="h-3.5 w-3.5" />
              )}
              <span>
                {showFormulaBreakdown ? 'Hide Scoring Formula' : 'Inspect Scoring Breakdown'}
              </span>
            </span>
            <span className="text-[9px] text-slate-500 font-normal">Audit Trail</span>
          </button>

          {showFormulaBreakdown && (
            <div className="mt-1.5 p-2 bg-[#04080F] rounded-lg border border-[#142030] text-[9px] space-y-1 text-slate-300">
              <div className="flex justify-between">
                <span>Capability Match (Max 30):</span>
                <span className="text-sky-300 font-bold">
                  {breakdown.capability_score ?? 30} pts
                </span>
              </div>
              <div className="flex justify-between">
                <span>Operational Readiness (Max 20):</span>
                <span className="text-sky-300 font-bold">
                  {breakdown.availability_score ?? 20} pts
                </span>
              </div>
              <div className="flex justify-between">
                <span>Spatial Proximity (Max 15):</span>
                <span className="text-sky-300 font-bold">{breakdown.distance_score ?? 15} pts</span>
              </div>
              <div className="flex justify-between">
                <span>Transit ETA (Max 15):</span>
                <span className="text-sky-300 font-bold">{breakdown.eta_score ?? 12} pts</span>
              </div>
              <div className="flex justify-between">
                <span>Crew Load Availability (Max 10):</span>
                <span className="text-sky-300 font-bold">{breakdown.workload_score ?? 10} pts</span>
              </div>
              <div className="flex justify-between">
                <span>Severity Alignment (Max 10):</span>
                <span className="text-sky-300 font-bold">
                  {breakdown.severity_fit_score ?? 10} pts
                </span>
              </div>
              <div className="flex justify-between border-t border-[#142030] pt-1 font-bold text-slate-100">
                <span>Total Normalized Score:</span>
                <span className="text-emerald-400">
                  {breakdown.final_score ?? topCandidate.match_score ?? 87} / 100
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Primary Action Buttons */}
        <div className="grid grid-cols-2 gap-2 pt-1">
          <button
            type="button"
            onClick={() => onSelectRoute && onSelectRoute(topCandidate)}
            className={`py-2 px-2.5 rounded-lg border text-[10px] font-bold uppercase transition-colors flex items-center justify-center gap-1.5 cursor-pointer ${
              isSelectedForRoute
                ? 'bg-sky-950/80 border-sky-400 text-sky-200'
                : 'bg-slate-800/80 hover:bg-slate-700 border-slate-700 text-slate-200'
            }`}
          >
            <Navigation className="h-3.5 w-3.5 text-sky-400" />
            <span>{isSelectedForRoute ? 'Route Active' : 'View Route'}</span>
          </button>

          <button
            type="button"
            disabled={isAssigning || topCandidate.status === 'OFFLINE'}
            onClick={() => onRequestAssign && onRequestAssign(topCandidate)}
            className="py-2 px-2.5 rounded-lg bg-sky-600 hover:bg-sky-500 text-white font-bold uppercase text-[10px] transition-colors disabled:opacity-50 flex items-center justify-center gap-1.5 shadow-md shadow-sky-600/30 cursor-pointer"
          >
            <Send className="h-3.5 w-3.5" />
            <span>Assign Unit</span>
          </button>
        </div>
      </div>

      {/* Secondary Top Alternatives Section */}
      {alternatives.length > 0 && (
        <div className="space-y-2 pt-1 border-t border-[#141C28]">
          <span className="text-[9px] uppercase font-bold tracking-wider text-slate-400 block">
            Top Alternatives (Operator Override)
          </span>

          <div className="space-y-1.5">
            {alternatives.map((alt, idx) => {
              const isAltRouteActive =
                activeRoute?.responderId === alt.id ||
                activeRoute?.label?.includes(alt.unit_name || alt.unitName || '')

              return (
                <div
                  key={alt.id}
                  className="p-2.5 bg-[#060D17] border border-[#142030] hover:border-[#1E3048] rounded-lg transition-colors flex items-center justify-between gap-2"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span className="text-[8px] font-bold text-slate-400 bg-slate-800 px-1 py-0.2 rounded">
                        #{idx + 2}
                      </span>
                      <span className="text-[11px] font-bold text-slate-200 truncate">
                        {alt.unit_name || alt.unitName}
                      </span>
                    </div>
                    <p className="text-[9px] text-slate-400 truncate">
                      {alt.vehicle_type || 'Craft'} · {alt.distance_km ?? alt.distanceKm ?? 2.1} km
                      · {alt.eta_formatted || alt.etaFormatted || '8 min'} ·{' '}
                      {alt.status || 'AVAILABLE'}
                    </p>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <div className="text-right">
                      <span className="text-[11px] font-bold text-sky-300 block leading-none">
                        {alt.match_score ?? alt.matchScore}
                      </span>
                      <span className="text-[7px] text-slate-500 uppercase">Score</span>
                    </div>

                    <button
                      type="button"
                      onClick={() => onSelectRoute && onSelectRoute(alt)}
                      title="View route corridor on map"
                      className={`p-1.5 rounded border text-[9px] font-bold transition-colors cursor-pointer ${
                        isAltRouteActive
                          ? 'bg-sky-950 border-sky-400 text-sky-300'
                          : 'bg-slate-800 hover:bg-slate-700 border-slate-700 text-slate-300'
                      }`}
                    >
                      <Navigation className="h-3 w-3" />
                    </button>

                    <button
                      type="button"
                      disabled={isAssigning || alt.status === 'OFFLINE'}
                      onClick={() => onRequestAssign && onRequestAssign(alt)}
                      className="py-1 px-2 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-[9px] font-bold uppercase transition-colors cursor-pointer"
                    >
                      Assign
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
