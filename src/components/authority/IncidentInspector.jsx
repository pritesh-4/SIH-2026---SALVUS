import { AiTriageAssessmentCard } from './AiTriageAssessmentCard'
import { DispatchRecommendationPanel } from './DispatchRecommendationPanel'
import { getSeverityBadge, getStatusBadge } from '../../features/authority/incidents/incidentUtils'

export const IncidentInspector = ({
  selectedIncident = null,
  activeRoute = null,
  activeTargetResponder = null,
  currentlyAssignedResponder = null,
  candidateShelters = [],
  topRecommendedCandidate = null,
  alternativeCandidates = [],
  isLoadingCandidates = false,
  isAssigningUnit = false,
  isVerifyingTriage = false,
  isAnalyzingTriage = false,
  isUpdatingStatus = false,
  isSimulatingMovement = false,
  simulationSpeedMultiplier = 1,
  actionSuccessMessage = null,
  onClearRoute,
  onSelectCandidateRoute,
  onRequestAssign,
  onRefreshCandidates,
  onAdvanceLifecycle,
  onToggleMovementSimulation,
  onSetSimulationSpeed,
  onVerifyTriage,
  onAdjustTriage,
  onReevaluateTriage,
  onTransitionStatus,
}) => {
  if (!selectedIncident) {
    return (
      <div className="py-16 text-center text-xs font-mono text-slate-500">
        Select an incident from the queue or tactical map to inspect candidates and routing vectors.
      </div>
    )
  }

  const sevBadge = getSeverityBadge(selectedIncident.severity)
  const statBadge = getStatusBadge(selectedIncident.status)

  return (
    <div className="space-y-3 flex-1 flex flex-col justify-between">
      <div className="space-y-3 text-xs">
        {/* Header */}
        <div className="flex items-center justify-between pb-2 border-b border-[#182332]">
          <div>
            <span className="text-[10px] font-mono text-slate-400 block">INCIDENT ID</span>
            <span className="font-mono text-sm font-bold text-slate-100">
              {selectedIncident.ticket_id || selectedIncident.id}
            </span>
          </div>
          <div className="flex items-center gap-1">
            <span
              className={`text-[9px] font-mono px-1.5 py-0.5 rounded border ${sevBadge.classes}`}
            >
              {selectedIncident.severity}
            </span>
            <span
              className={`text-[9px] font-mono px-1.5 py-0.5 rounded border ${statBadge.classes}`}
            >
              {selectedIncident.status}
            </span>
          </div>
        </div>

        {/* Summary */}
        <div className="bg-[#080C12] border border-[#182332] p-2.5 rounded-lg space-y-1">
          <span className="text-[10px] font-mono font-semibold text-slate-400 block uppercase">
            Incident Summary
          </span>
          <p className="text-slate-200 leading-relaxed text-[11px]">
            {selectedIncident.description}
          </p>
        </div>

        {/* Location & Affected */}
        <div className="grid grid-cols-2 gap-2 text-[10px] font-mono">
          <div className="bg-[#080C12] border border-[#182332] p-2 rounded-lg">
            <span className="text-slate-400 block font-medium">LOCATION</span>
            <span className="text-slate-200 font-semibold truncate block">
              {selectedIncident.location_name || 'Sector 12, Kolkata'}
            </span>
            <span className="text-slate-500 text-[9px] block">
              {selectedIncident.latitude?.toFixed(4)}°N, {selectedIncident.longitude?.toFixed(4)}°E
            </span>
          </div>
          <div className="bg-[#080C12] border border-[#182332] p-2 rounded-lg">
            <span className="text-slate-400 block font-medium">AFFECTED</span>
            <span className="text-slate-100 font-bold text-xs block">
              {selectedIncident.affected_count || 1} Persons
            </span>
            <span className="text-slate-400 text-[9px] block">
              Reporter: {selectedIncident.reporter_name || 'Citizen'}
            </span>
          </div>
        </div>

        {/* AI INCIDENT TRIAGE & DECISION SUPPORT CARD */}
        <AiTriageAssessmentCard
          incident={selectedIncident}
          onVerify={onVerifyTriage}
          onAdjust={onAdjustTriage}
          onReevaluate={onReevaluateTriage}
          isVerifying={isVerifyingTriage}
          isAnalyzing={isAnalyzingTriage}
        />

        {/* RESTRAINED TACTICAL PATHWAY (RESPONDER -> ROUTE -> INCIDENT) */}
        {activeRoute && activeTargetResponder && (
          <div className="bg-[#080E17] border border-[#162230] p-2.5 rounded-lg space-y-1.5 font-mono text-[10px]">
            <div className="text-[9px] uppercase tracking-wider text-slate-400 font-bold flex items-center justify-between pb-1 border-b border-[#141C28]">
              <span className="flex items-center gap-1.5">
                <span className="h-1.5 w-1.5 rounded-full bg-sky-400"></span>
                Tactical Dispatch Pathway
              </span>
              <div className="flex items-center gap-1.5">
                <span className="text-sky-400/90 text-[8px] bg-sky-950/60 px-1.5 py-0.2 rounded border border-sky-500/30">
                  {activeRoute.isFallback ? 'Vector Fallback' : 'OSRM Validated'}
                </span>
                <button
                  type="button"
                  onClick={onClearRoute}
                  className="text-slate-400 hover:text-slate-200 text-[8px] font-mono uppercase bg-slate-800 hover:bg-slate-700 px-1.5 py-0.2 rounded border border-slate-700 cursor-pointer"
                  title="Clear route visualization"
                >
                  ✕ Clear
                </button>
              </div>
            </div>

            {/* 1. Responder */}
            <div className="flex items-center gap-2 text-slate-200">
              <span className="h-1.5 w-1.5 rounded-full bg-blue-400 shrink-0"></span>
              <span className="text-slate-400 shrink-0">RESPONDER:</span>
              <span className="font-bold text-slate-100 truncate">
                {activeTargetResponder.unit_name || activeTargetResponder.unitName}
              </span>
              <span className="text-[9px] text-slate-500 truncate">
                ({activeTargetResponder.vehicle_type || activeTargetResponder.capability || 'Unit'})
              </span>
            </div>

            {/* 2. Route */}
            <div className="flex items-center gap-2 pl-3 text-sky-300 py-0.5 border-l border-sky-500/30 ml-0.5 my-0.5">
              <span className="text-[9px] text-slate-400">↓ ROUTE:</span>
              <span className="font-bold">{activeRoute.distanceKm} km</span>
              <span className="text-slate-500">·</span>
              <span className="font-bold">{activeRoute.etaFormatted} ETA</span>
            </div>

            {/* 3. Incident */}
            <div className="flex items-center gap-2 text-slate-200">
              <span className="h-1.5 w-1.5 rounded-full bg-rose-400 shrink-0"></span>
              <span className="text-slate-400 shrink-0">INCIDENT:</span>
              <span className="font-bold text-slate-100">
                {selectedIncident.ticket_id || `#${(selectedIncident.id || '').slice(-4)}`}
              </span>
              <span className="text-[9px] text-slate-400 truncate max-w-[130px]">
                ({selectedIncident.location_name || 'Target Grid'})
              </span>
            </div>
          </div>
        )}

        {/* EXPLAINABLE ALLOCATION SECTION OR ACTIVE MISSION */}
        {currentlyAssignedResponder ? (
          /* Active Mission Display */
          <div className="bg-[#0A131F] border border-sky-500/40 p-3 rounded-xl space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-mono font-bold text-sky-300 uppercase tracking-wider flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-sky-400 animate-ping"></span>
                Active Dispatched Unit
              </span>
              <span className="text-[9px] font-mono bg-sky-950 text-sky-300 border border-sky-500/50 px-2 py-0.5 rounded font-bold uppercase">
                {currentlyAssignedResponder.status}
              </span>
            </div>

            <div className="bg-[#060D15] p-2.5 rounded-lg border border-[#182332] space-y-1">
              <div className="flex items-center justify-between">
                <span className="font-bold text-slate-100 text-xs">
                  {currentlyAssignedResponder.unit_name}
                </span>
                <span className="text-[10px] font-mono text-slate-400">
                  {currentlyAssignedResponder.radio_channel}
                </span>
              </div>
              <p className="text-[10px] text-slate-400 font-mono">
                Lead: {currentlyAssignedResponder.team_lead} · Craft:{' '}
                {currentlyAssignedResponder.vehicle_type}
              </p>
              <div className="flex items-center justify-between text-[10px] font-mono text-sky-300 pt-1 border-t border-[#182332]">
                <span>Distance: {activeRoute?.distanceKm || '1.2'} km</span>
                <span>ETA: {activeRoute?.etaFormatted || '4 min'}</span>
              </div>
            </div>

            {/* Journey Progression Buttons */}
            <div className="space-y-1.5 pt-1">
              <span className="text-[10px] font-mono text-slate-400 block font-semibold uppercase">
                Operational Journey Lifecycle
              </span>
              <div className="grid grid-cols-4 gap-1 text-[9px] font-mono font-bold">
                <button
                  type="button"
                  onClick={() => onAdvanceLifecycle && onAdvanceLifecycle('EN_ROUTE')}
                  className={`py-1.5 rounded border transition-colors cursor-pointer ${
                    currentlyAssignedResponder.status === 'EN_ROUTE'
                      ? 'bg-sky-600 text-white border-sky-400'
                      : 'bg-slate-800 hover:bg-slate-700 text-slate-300 border-slate-700'
                  }`}
                >
                  EN ROUTE
                </button>
                <button
                  type="button"
                  onClick={() => onAdvanceLifecycle && onAdvanceLifecycle('NEARBY')}
                  className={`py-1.5 rounded border transition-colors cursor-pointer ${
                    currentlyAssignedResponder.status === 'NEARBY'
                      ? 'bg-amber-600 text-white border-amber-400'
                      : 'bg-slate-800 hover:bg-slate-700 text-slate-300 border-slate-700'
                  }`}
                >
                  NEARBY
                </button>
                <button
                  type="button"
                  onClick={() => onAdvanceLifecycle && onAdvanceLifecycle('ON_SCENE')}
                  className={`py-1.5 rounded border transition-colors cursor-pointer ${
                    currentlyAssignedResponder.status === 'ON_SCENE'
                      ? 'bg-indigo-600 text-white border-indigo-400'
                      : 'bg-slate-800 hover:bg-slate-700 text-slate-300 border-slate-700'
                  }`}
                >
                  ON SCENE
                </button>
                <button
                  type="button"
                  onClick={() => onAdvanceLifecycle && onAdvanceLifecycle('AVAILABLE')}
                  className="py-1.5 rounded border bg-emerald-700 hover:bg-emerald-600 text-white border-emerald-500 transition-colors cursor-pointer"
                >
                  RESOLVE
                </button>
              </div>

              {/* GPS Movement Simulation Controls */}
              <div className="mt-2 bg-[#060D15] p-2 rounded-lg border border-[#182332] flex items-center justify-between text-[10px] font-mono">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={onToggleMovementSimulation}
                    className={`px-2.5 py-1 rounded font-bold uppercase transition-colors cursor-pointer ${
                      isSimulatingMovement
                        ? 'bg-rose-600 hover:bg-rose-500 text-white'
                        : 'bg-blue-600 hover:bg-blue-500 text-white'
                    }`}
                  >
                    {isSimulatingMovement ? '⏸ Pause GPS' : '▶ Simulate GPS Telemetry'}
                  </button>
                  {isSimulatingMovement && (
                    <span className="h-2 w-2 rounded-full bg-emerald-400 animate-ping"></span>
                  )}
                </div>

                <div className="flex items-center gap-1 text-slate-400">
                  <span>Speed:</span>
                  {[1, 2, 5].map((speed) => (
                    <button
                      key={speed}
                      type="button"
                      onClick={() => onSetSimulationSpeed && onSetSimulationSpeed(speed)}
                      className={`px-1.5 py-0.5 rounded text-[9px] font-mono font-bold cursor-pointer ${
                        simulationSpeedMultiplier === speed
                          ? 'bg-slate-700 text-white'
                          : 'bg-slate-900 text-slate-500 border border-slate-800'
                      }`}
                    >
                      {speed}x
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        ) : (
          /* Explainable Recommendation & Alternatives */
          <DispatchRecommendationPanel
            incident={selectedIncident}
            topCandidate={topRecommendedCandidate}
            alternatives={alternativeCandidates}
            activeRoute={activeRoute}
            isLoading={isLoadingCandidates}
            onSelectRoute={onSelectCandidateRoute}
            onRequestAssign={onRequestAssign}
            onRefreshCandidates={onRefreshCandidates}
            isAssigning={isAssigningUnit}
          />
        )}

        {/* Shelters */}
        <div className="bg-[#080C12] border border-[#182332] p-2.5 rounded-lg space-y-1.5">
          <span className="text-[10px] font-mono font-bold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400"></span>
            Evacuation Shelter Reception
          </span>
          <div className="space-y-1.5">
            {candidateShelters.map((shl) => (
              <div
                key={shl.id}
                className="bg-[#060A0E] border border-[#182332] p-2 rounded-lg flex items-center justify-between text-[10px]"
              >
                <div>
                  <span className="font-semibold text-slate-200 block truncate max-w-[180px]">
                    {shl.name}
                  </span>
                  <span className="text-[9px] text-slate-400 block mt-0.5">
                    {shl.distanceKm} km · ~{shl.walkMin} min walk
                  </span>
                </div>
                <div className="text-right">
                  <span className="font-bold text-emerald-400 block font-mono">
                    {shl.available_beds ?? 0} beds free
                  </span>
                  <span className="text-[9px] text-slate-500 font-mono">
                    {shl.occupancy_rate} occ
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {actionSuccessMessage && (
          <div className="bg-emerald-950/40 border border-emerald-500/40 text-emerald-300 p-2 rounded-lg text-center font-mono text-[11px] animate-fadeIn">
            {actionSuccessMessage}
          </div>
        )}
      </div>

      {/* Action Decision Toolbar */}
      <div className="pt-2 border-t border-[#182332] space-y-1.5">
        {selectedIncident.status === 'NEW' && (
          <button
            type="button"
            disabled={isUpdatingStatus}
            onClick={() =>
              onTransitionStatus && onTransitionStatus('TRIAGE_PENDING', 'Pending AI Triage')
            }
            className="w-full py-2 px-3 rounded-lg bg-amber-600 hover:bg-amber-500 text-slate-950 font-bold font-mono text-xs uppercase transition-colors cursor-pointer disabled:opacity-50"
          >
            {isUpdatingStatus ? 'Processing...' : '▶ Initiate Triage Queue'}
          </button>
        )}

        {selectedIncident.status === 'TRIAGE_PENDING' && (
          <button
            type="button"
            disabled={isUpdatingStatus}
            onClick={() =>
              onTransitionStatus && onTransitionStatus('VERIFIED', 'Verified Distress')
            }
            className="w-full py-2 px-3 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-bold font-mono text-xs uppercase transition-colors cursor-pointer disabled:opacity-50"
          >
            {isUpdatingStatus ? 'Processing...' : '✓ Verify Distress'}
          </button>
        )}

        {selectedIncident.status === 'VERIFIED' && (
          <button
            type="button"
            disabled={isUpdatingStatus}
            onClick={() =>
              onTransitionStatus && onTransitionStatus('RESOLVED', 'Safe Rescue & Resolved')
            }
            className="w-full py-2 px-3 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold font-mono text-xs uppercase transition-colors cursor-pointer disabled:opacity-50"
          >
            {isUpdatingStatus ? 'Processing...' : '✓ Confirm Rescue & Resolve'}
          </button>
        )}

        {!['RESOLVED', 'CANCELLED'].includes(selectedIncident.status) && (
          <button
            type="button"
            disabled={isUpdatingStatus}
            onClick={() => onTransitionStatus && onTransitionStatus('CANCELLED', 'Cancellation')}
            className="w-full py-1.5 px-3 rounded-lg bg-slate-800/80 hover:bg-slate-700 text-slate-400 hover:text-slate-200 border border-slate-700 text-[10px] font-mono uppercase transition-colors cursor-pointer disabled:opacity-50"
          >
            Stand Down / Cancel Ticket
          </button>
        )}

        {selectedIncident.status === 'RESOLVED' && (
          <div className="bg-emerald-950/20 border border-emerald-500/20 p-2 rounded-lg text-center text-xs font-mono text-emerald-300">
            ✓ Incident Safely Resolved & Archived
          </div>
        )}

        {selectedIncident.status === 'CANCELLED' && (
          <div className="bg-slate-900 border border-slate-800 p-2 rounded-lg text-center text-xs font-mono text-slate-400">
            🛑 Incident Cancelled & Stood Down
          </div>
        )}
      </div>
    </div>
  )
}

export default IncidentInspector
