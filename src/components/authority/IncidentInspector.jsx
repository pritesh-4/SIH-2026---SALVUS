import { useState } from 'react'
import { AiTriageAssessmentCard } from './AiTriageAssessmentCard'
import { DispatchRecommendationPanel } from './DispatchRecommendationPanel'
import { EvidenceLightboxModal } from './EvidenceLightboxModal'
import { getSeverityBadge, getStatusBadge } from '../../features/authority/incidents/incidentUtils'
import { formatFileSize } from '../../lib/attachmentUtils'
import { Card } from '../ui/Card'
import { Badge } from '../ui/Badge'
import { Button } from '../ui/Button'

/**
 * Focused Incident Inspector (Master Prompt 3 - Steps 7 & 14)
 *
 * The selected incident becomes the focal operational narrative:
 * - What happened & people affected
 * - Location & raw coordinates
 * - AI decision support assessment
 * - Recommended response unit or active dispatched unit controls
 * - Nearby evacuation shelter availability
 * - Next action decision toolbar
 */
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
  recommendationShift = null,
  onDismissRecommendationShift,
  onReviewReassign,
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
  const [isLightboxOpen, setIsLightboxOpen] = useState(false)
  const [selectedPhotoIndex, setSelectedPhotoIndex] = useState(0)

  if (!selectedIncident) {
    return (
      <div className="py-24 text-center text-xs text-salvus-text-muted space-y-2">
        <span className="text-3xl block" aria-hidden="true">
          📍
        </span>
        <p className="font-semibold text-salvus-text-primary text-sm">
          Select an incident to inspect
        </p>
        <p className="max-w-xs mx-auto text-salvus-text-secondary leading-relaxed">
          Choose an item from the incident queue or click a marker on the tactical map to begin
          dispatch operations.
        </p>
      </div>
    )
  }

  const sev = getSeverityBadge(selectedIncident.severity)
  const stat = getStatusBadge(selectedIncident.status)

  const handleOpenPhoto = (index) => {
    setSelectedPhotoIndex(index)
    setIsLightboxOpen(true)
  }

  return (
    <div className="space-y-3 flex-1 flex flex-col justify-between">
      <div className="space-y-3 text-xs">
        {/* Header */}
        <div className="flex items-center justify-between pb-2 border-b border-salvus-border">
          <div>
            <span className="text-[10px] text-salvus-text-muted uppercase block font-semibold">
              Incident Ticket
            </span>
            <span className="text-base font-extrabold text-salvus-text-primary font-mono tracking-tight">
              #{selectedIncident.ticket_id || selectedIncident.id}
            </span>
          </div>

          <div className="flex items-center gap-1.5">
            <Badge variant={sev.variant} dot={sev.dot} size="sm">
              {sev.label}
            </Badge>
            <Badge variant={stat.variant} size="sm">
              {stat.label}
            </Badge>
          </div>
        </div>

        {/* Summary */}
        <div className="bg-salvus-muted/40 border border-salvus-border p-3 rounded-xl space-y-1">
          <span className="text-[10px] font-bold text-salvus-text-muted uppercase tracking-wider block">
            What Happened
          </span>
          <p className="text-salvus-text-primary leading-relaxed text-xs font-medium">
            {selectedIncident.description}
          </p>
        </div>

        {/* Location & Affected Count */}
        <div className="grid grid-cols-2 gap-2 text-xs">
          <div className="bg-salvus-muted/30 border border-salvus-border p-2.5 rounded-xl">
            <span className="text-[10px] text-salvus-text-muted uppercase font-semibold block">
              Location
            </span>
            <strong className="text-salvus-text-primary truncate block mt-0.5 font-semibold">
              {selectedIncident.location_name ||
                (typeof selectedIncident.latitude === 'number' &&
                typeof selectedIncident.longitude === 'number'
                  ? `${selectedIncident.latitude.toFixed(4)}°N, ${selectedIncident.longitude.toFixed(4)}°E`
                  : 'Location Not Specified')}
            </strong>
            <span className="text-salvus-text-muted text-[11px] block mt-0.5 font-mono">
              {selectedIncident.latitude?.toFixed(4)}°N, {selectedIncident.longitude?.toFixed(4)}°E
            </span>
          </div>

          <div className="bg-salvus-muted/30 border border-salvus-border p-2.5 rounded-xl">
            <span className="text-[10px] text-salvus-text-muted uppercase font-semibold block">
              People Affected
            </span>
            <strong className="text-salvus-text-primary text-sm block mt-0.5 font-mono font-bold">
              {selectedIncident.affected_count || 1} Persons
            </strong>
            <span className="text-salvus-text-muted text-[11px] block mt-0.5 truncate">
              Reporter: {selectedIncident.reporter_name || 'Citizen'}
            </span>
          </div>
        </div>

        {/* Incident Evidence Photos (If Available) */}
        {selectedIncident.attachments && selectedIncident.attachments.length > 0 && (
          <div className="bg-salvus-muted/40 border border-salvus-border p-3 rounded-xl space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold text-salvus-text-muted uppercase tracking-wider block flex items-center gap-1.5">
                <span aria-hidden="true">📷</span>
                <span>Photo Evidence ({selectedIncident.attachments.length})</span>
              </span>
              <Badge variant="warning" size="sm">
                Citizen-provided
              </Badge>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {selectedIncident.attachments.map((att, idx) => (
                <button
                  key={att.id}
                  type="button"
                  onClick={() => handleOpenPhoto(idx)}
                  className="group bg-salvus-surface border border-salvus-border hover:border-salvus-text-primary p-2 rounded-lg flex items-center gap-2.5 transition-all text-xs cursor-pointer overflow-hidden shadow-2xs text-left w-full"
                  title={`Inspect full evidence photo: ${att.original_filename}`}
                >
                  <img
                    src={att.thumbnail_url || att.url}
                    alt={att.original_filename}
                    className="w-10 h-10 rounded-md object-cover border border-salvus-border shrink-0 group-hover:scale-105 transition-transform"
                  />
                  <div className="min-w-0 flex-1">
                    <strong className="text-salvus-text-primary font-semibold block truncate group-hover:text-salvus-info transition-colors text-[11px]">
                      {att.original_filename}
                    </strong>
                    <span className="text-salvus-text-muted text-[10px] block font-mono">
                      {formatFileSize(att.size_bytes)} · Click to inspect
                    </span>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* AI Triage & Assessment Card */}
        <AiTriageAssessmentCard
          incident={selectedIncident}
          onVerify={onVerifyTriage}
          onAdjust={onAdjustTriage}
          onReevaluate={onReevaluateTriage}
          isVerifying={isVerifyingTriage}
          isAnalyzing={isAnalyzingTriage}
        />

        {/* Tactical Pathway Indicator */}
        {activeRoute && activeTargetResponder && (
          <div className="bg-salvus-info-bg border border-salvus-info-border p-2.5 rounded-xl space-y-1.5 text-xs text-salvus-info-text animate-fadeIn">
            <div className="flex items-center justify-between pb-1 border-b border-salvus-info-border/50">
              <span className="font-bold text-[11px] flex items-center gap-1.5">
                <span>📍</span>
                <span>Tactical Route Corridor Active</span>
              </span>
              <button
                type="button"
                onClick={onClearRoute}
                className="text-salvus-info-text hover:underline text-xs cursor-pointer font-semibold"
              >
                Clear
              </button>
            </div>

            <div className="flex items-center justify-between font-medium">
              <span>
                Unit:{' '}
                <strong>{activeTargetResponder.unit_name || activeTargetResponder.unitName}</strong>
              </span>
              <span className="font-mono">
                Dist: <strong>{activeRoute.distanceKm} km</strong>
              </span>
              <span className="font-mono">
                ETA: <strong>{activeRoute.etaFormatted}</strong>
              </span>
            </div>
          </div>
        )}

        {/* Assigned Unit OR Recommended Unit */}
        {/* Dynamic Recommendation Shift Notification (Pass 4C) */}
        {currentlyAssignedResponder && recommendationShift && (
          <DispatchRecommendationPanel
            incident={selectedIncident}
            topCandidate={recommendationShift.newCandidate}
            alternatives={alternativeCandidates}
            activeRoute={activeRoute}
            isLoading={isLoadingCandidates}
            recommendationShift={recommendationShift}
            onDismissRecommendationShift={onDismissRecommendationShift}
            onReviewReassign={onReviewReassign}
            onSelectRoute={onSelectCandidateRoute}
            onRequestAssign={onRequestAssign}
            onRefreshCandidates={onRefreshCandidates}
            isAssigning={isAssigningUnit}
          />
        )}

        {currentlyAssignedResponder ? (
          /* Active Dispatched Unit View */
          <Card variant="info" padding="sm" className="space-y-2.5 shadow-2xs">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase text-salvus-info flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-salvus-info animate-ping"></span>
                Dispatched Unit Active
              </span>
              <Badge variant="info" size="sm">
                {currentlyAssignedResponder.status}
              </Badge>
            </div>

            <div className="bg-salvus-surface p-2.5 rounded-lg border border-salvus-border space-y-1">
              <div className="flex items-center justify-between">
                <strong className="text-salvus-text-primary text-xs font-bold">
                  {currentlyAssignedResponder.unit_name}
                </strong>
                <span className="text-xs text-salvus-text-muted font-mono font-medium">
                  VHF: {currentlyAssignedResponder.radio_channel || 'Ch. 04'}
                </span>
              </div>
              <p className="text-xs text-salvus-text-secondary">
                Lead: {currentlyAssignedResponder.team_lead} · Craft:{' '}
                {currentlyAssignedResponder.vehicle_type}
              </p>
              <div className="flex items-center justify-between text-xs text-salvus-info pt-1 border-t border-salvus-border font-semibold font-mono">
                <span>Distance: {activeRoute?.distanceKm || '1.2'} km</span>
                <span>ETA: {activeRoute?.etaFormatted || '4 min'}</span>
              </div>
            </div>

            {/* Lifecycle Transition Buttons */}
            <div className="space-y-1.5 pt-1">
              <span className="text-[11px] text-salvus-text-muted block font-semibold uppercase">
                Advance Unit Lifecycle
              </span>
              <div className="grid grid-cols-4 gap-1 text-xs">
                <button
                  type="button"
                  onClick={() => onAdvanceLifecycle?.('EN_ROUTE')}
                  className={`py-1.5 rounded-lg border transition-colors cursor-pointer text-xs font-semibold ${
                    currentlyAssignedResponder.status === 'EN_ROUTE'
                      ? 'bg-salvus-info text-white border-transparent shadow-xs'
                      : 'bg-salvus-surface border-salvus-border text-salvus-text-secondary hover:text-salvus-text-primary'
                  }`}
                >
                  En Route
                </button>
                <button
                  type="button"
                  onClick={() => onAdvanceLifecycle?.('NEARBY')}
                  className={`py-1.5 rounded-lg border transition-colors cursor-pointer text-xs font-semibold ${
                    currentlyAssignedResponder.status === 'NEARBY'
                      ? 'bg-salvus-warning text-salvus-bg border-transparent shadow-xs'
                      : 'bg-salvus-surface border-salvus-border text-salvus-text-secondary hover:text-salvus-text-primary'
                  }`}
                >
                  Nearby
                </button>
                <button
                  type="button"
                  onClick={() => onAdvanceLifecycle?.('ON_SCENE')}
                  className={`py-1.5 rounded-lg border transition-colors cursor-pointer text-xs font-semibold ${
                    currentlyAssignedResponder.status === 'ON_SCENE'
                      ? 'bg-salvus-safe text-white border-transparent shadow-xs'
                      : 'bg-salvus-surface border-salvus-border text-salvus-text-secondary hover:text-salvus-text-primary'
                  }`}
                >
                  On Scene
                </button>
                <button
                  type="button"
                  onClick={() => onAdvanceLifecycle?.('AVAILABLE')}
                  className="py-1.5 rounded-lg bg-salvus-safe hover:opacity-90 text-white font-bold transition-colors cursor-pointer text-xs shadow-xs"
                >
                  Resolve
                </button>
              </div>

              {/* Movement Simulation Controls */}
              <div className="mt-2 bg-salvus-surface p-2 rounded-lg border border-salvus-border flex items-center justify-between text-xs">
                <div className="flex items-center gap-2">
                  <Button
                    variant={isSimulatingMovement ? 'critical' : 'secondary'}
                    size="sm"
                    onClick={onToggleMovementSimulation}
                    className="text-xs font-medium"
                  >
                    {isSimulatingMovement ? '⏸ Pause GPS' : '▶ Simulate GPS'}
                  </Button>
                </div>

                <div className="flex items-center gap-1 text-salvus-text-secondary">
                  <span>Speed:</span>
                  {[1, 2, 5].map((speed) => (
                    <button
                      key={speed}
                      type="button"
                      onClick={() => onSetSimulationSpeed?.(speed)}
                      className={`px-1.5 py-0.5 rounded text-xs font-bold cursor-pointer transition-colors ${
                        simulationSpeedMultiplier === speed
                          ? 'bg-salvus-text-primary text-salvus-bg'
                          : 'bg-salvus-muted text-salvus-text-muted hover:text-salvus-text-primary'
                      }`}
                    >
                      {speed}x
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </Card>
        ) : (
          /* Recommended Response Panel */
          <DispatchRecommendationPanel
            incident={selectedIncident}
            topCandidate={topRecommendedCandidate}
            alternatives={alternativeCandidates}
            activeRoute={activeRoute}
            isLoading={isLoadingCandidates}
            recommendationShift={recommendationShift}
            onDismissRecommendationShift={onDismissRecommendationShift}
            onReviewReassign={onReviewReassign}
            onSelectRoute={onSelectCandidateRoute}
            onRequestAssign={onRequestAssign}
            onRefreshCandidates={onRefreshCandidates}
            isAssigning={isAssigningUnit}
          />
        )}

        {/* Candidate Shelters */}
        <div className="bg-salvus-muted/30 border border-salvus-border p-2.5 rounded-xl space-y-1.5">
          <span className="text-[11px] font-bold text-salvus-text-primary uppercase tracking-wider block">
            Nearby Evacuation Shelters
          </span>
          <div className="space-y-1.5">
            {candidateShelters.slice(0, 2).map((shl) => (
              <div
                key={shl.id}
                className="bg-salvus-surface border border-salvus-border p-2 rounded-lg flex items-center justify-between text-xs"
              >
                <div>
                  <strong className="text-salvus-text-primary block truncate max-w-[180px] font-medium">
                    {shl.name}
                  </strong>
                  <span className="text-[11px] text-salvus-text-muted block">
                    {shl.distanceKm} km · ~{shl.walkMin} min walk
                  </span>
                </div>
                <div className="text-right">
                  <span className="font-bold text-salvus-safe block font-mono">
                    {shl.available_beds ?? 0} beds free
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {actionSuccessMessage && (
          <div className="bg-salvus-safe-bg border border-salvus-safe-border text-salvus-safe-text p-2 rounded-xl text-center text-xs font-medium animate-fadeIn">
            {actionSuccessMessage}
          </div>
        )}
      </div>

      {/* Action Decision Toolbar */}
      <div className="pt-2 border-t border-salvus-border space-y-1.5">
        {selectedIncident.status === 'NEW' && (
          <Button
            variant="warning"
            size="md"
            fullWidth={true}
            disabled={isUpdatingStatus}
            onClick={() => onTransitionStatus?.('TRIAGE_PENDING', 'Pending AI Triage')}
            className="font-bold text-xs shadow-xs"
          >
            {isUpdatingStatus ? 'Processing...' : '▶ Initiate Triage Queue'}
          </Button>
        )}

        {selectedIncident.status === 'TRIAGE_PENDING' && (
          <Button
            variant="primary"
            size="md"
            fullWidth={true}
            disabled={isUpdatingStatus}
            onClick={() => onTransitionStatus?.('VERIFIED', 'Verified Distress')}
            className="font-bold text-xs shadow-xs"
          >
            {isUpdatingStatus ? 'Processing...' : '✓ Verify Distress Call'}
          </Button>
        )}

        {selectedIncident.status === 'VERIFIED' && (
          <Button
            variant="safe"
            size="md"
            fullWidth={true}
            disabled={isUpdatingStatus}
            onClick={() => onTransitionStatus?.('RESOLVED', 'Safe Rescue & Resolved')}
            className="font-bold text-xs shadow-xs"
          >
            {isUpdatingStatus ? 'Processing...' : '✓ Confirm Rescue & Resolve'}
          </Button>
        )}

        {!['RESOLVED', 'CANCELLED'].includes(selectedIncident.status) && (
          <Button
            variant="quiet"
            size="sm"
            fullWidth={true}
            disabled={isUpdatingStatus}
            onClick={() => onTransitionStatus?.('CANCELLED', 'Cancellation')}
            className="text-xs text-salvus-text-muted hover:text-salvus-critical font-medium"
          >
            Stand Down / Cancel Incident
          </Button>
        )}

        {selectedIncident.status === 'RESOLVED' && (
          <div className="bg-salvus-safe-bg border border-salvus-safe-border p-2 rounded-xl text-center text-xs text-salvus-safe-text font-semibold">
            ✓ Incident Safely Resolved & Archived
          </div>
        )}

        {selectedIncident.status === 'CANCELLED' && (
          <div className="bg-salvus-muted border border-salvus-border p-2 rounded-xl text-center text-xs text-salvus-text-muted font-semibold">
            🛑 Incident Cancelled & Stood Down
          </div>
        )}
      </div>

      {/* Operational Evidence Lightbox & Review Modal */}
      <EvidenceLightboxModal
        isOpen={isLightboxOpen}
        onClose={() => setIsLightboxOpen(false)}
        incident={selectedIncident}
        attachments={selectedIncident.attachments || []}
        initialIndex={selectedPhotoIndex}
      />
    </div>
  )
}

export default IncidentInspector
