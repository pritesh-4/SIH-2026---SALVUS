import { useState, useMemo, useCallback } from 'react'
import { authorityData } from '../data/authority/authorityMock'
import { assignResponder } from '../services/api'
import {
  useAuthorityIncidents,
  useAuthorityFleet,
  useAuthorityShelters,
  useSituationIntelligence,
  useDispatchRecommendation,
  useMovementSimulation,
  useIncidentTriage,
  filterIncidents,
} from '../features/authority'

import { AuthorityHeader } from '../components/authority/AuthorityHeader'
import { OperationalMetrics } from '../components/authority/OperationalMetrics'
import { SituationBriefing } from '../components/authority/SituationBriefing'
import { IncidentQueue } from '../components/authority/IncidentQueue'
import { AuthorityMap } from '../components/authority/AuthorityMap'
import { IncidentInspector } from '../components/authority/IncidentInspector'
import { ResponderPanel } from '../components/authority/ResponderPanel'
import { ShelterPanel } from '../components/authority/ShelterPanel'
import { AssignmentConfirmModal } from '../components/authority/AssignmentConfirmModal'

export const AuthorityCommandCenter = () => {
  const { hub } = authorityData

  // ---------------------------------------------------------------------------
  // 1. Domain Feature Hooks
  // ---------------------------------------------------------------------------
  const {
    incidents,
    selectedIncident,
    setSelectedIncident,
    isLoading: isLoadingIncidents,
    error: incidentError,
    newlyArrivedId,
    changeStatus,
    isUpdatingStatus,
    computedMetrics,
    refetch: refetchIncidents,
  } = useAuthorityIncidents()

  const {
    situationSummary,
    liveHazards,
    incidentClusters,
    isRefreshingSituation,
    dataProvenance,
    loadSituationIntelligence,
  } = useSituationIntelligence()

  const {
    liveResponders,
    setLiveResponders,
    isLoadingFleet,
    fleetCapabilityFilter,
    setFleetCapabilityFilter,
    fleetStatusFilter,
    setFleetStatusFilter,
    selectedResponderDetail,
    setSelectedResponderDetail,
    filteredFleet,
    activeRespondersCount,
    responderMapPoints,
    currentlyAssignedResponder,
    updateStatus: updateResponderStatus,
    advanceLifecycle: advanceResponderLifecycleAction,
    loadFleet,
  } = useAuthorityFleet({
    selectedIncident,
    onIncidentRefetch: refetchIncidents,
  })

  const {
    liveShelters,
    totalBedsAvailable,
    shelterMapPoints,
    candidateShelters,
    adjustBeds,
    loadShelters,
  } = useAuthorityShelters({ selectedIncident })

  const {
    setCandidateList,
    isLoadingCandidates,
    topRecommendedCandidate,
    alternativeCandidates,
    activeTargetResponder,
    activeRoute,
    previewRoute,
    selectCandidateRoute,
    refreshCandidates,
    clearRoute,
  } = useDispatchRecommendation({
    selectedIncident,
    liveResponders,
    currentlyAssignedResponder,
  })

  // ---------------------------------------------------------------------------
  // 2. Local UI State
  // ---------------------------------------------------------------------------
  const [activeIncidentFilter, setActiveIncidentFilter] = useState('all')
  const [rightPanelTab, setRightPanelTab] = useState('inspector')
  const [mapLayers, setMapLayers] = useState({
    incidents: true,
    responders: true,
    shelters: true,
    routes: true,
    hazards: true,
    clusters: true,
  })
  const [actionSuccessMessage, setActionSuccessMessage] = useState(null)
  const [isAssigningUnit, setIsAssigningUnit] = useState(false)
  const [assignConfirmCandidate, setAssignConfirmCandidate] = useState(null)

  const showStatusMessage = useCallback((msg, timeout = 3500) => {
    setActionSuccessMessage(msg)
    setTimeout(() => setActionSuccessMessage(null), timeout)
  }, [])

  const {
    isSimulatingMovement,
    simulationSpeedMultiplier,
    setSimulationSpeedMultiplier,
    toggleMovementSimulation,
    stopMovementSimulation,
  } = useMovementSimulation({
    activeRoute,
    selectedIncident,
    liveResponders,
    onStatusMessage: showStatusMessage,
  })

  const { isVerifyingTriage, isAnalyzingTriage, verifyTriage, adjustTriage, reevaluateTriage } =
    useIncidentTriage({
      onRefetch: refetchIncidents,
      onStatusMessage: showStatusMessage,
    })

  // ---------------------------------------------------------------------------
  // 3. Derived Filtered Incidents
  // ---------------------------------------------------------------------------
  const filteredIncidents = useMemo(
    () => filterIncidents(incidents, activeIncidentFilter),
    [incidents, activeIncidentFilter]
  )

  // ---------------------------------------------------------------------------
  // 4. Action Handlers
  // ---------------------------------------------------------------------------
  const handleSelectIncident = (inc) => {
    setSelectedIncident(inc)
    setRightPanelTab('inspector')
    clearRoute()
    setCandidateList([])
    stopMovementSimulation()
  }

  const handleTransitionStatus = async (targetStatus, label) => {
    if (!selectedIncident) return
    const result = await changeStatus(selectedIncident.id, targetStatus)
    if (result.success) {
      showStatusMessage(`✓ Status updated: ${label}`, 3000)
    }
  }

  const handleConfirmAssignment = async (responderId) => {
    if (!selectedIncident) return

    setIsAssigningUnit(true)
    const result = await assignResponder(responderId, selectedIncident.id, 'ASSIGNED', 'authority')
    setIsAssigningUnit(false)

    if (result.success) {
      setAssignConfirmCandidate(null)
      showStatusMessage(
        `✓ Authoritatively dispatched ${result.data.unit_name} to #${selectedIncident.ticket_id}`,
        3500
      )
      setLiveResponders((prev) =>
        prev.map((r) => (r.id === responderId ? { ...r, ...result.data } : r))
      )
      refetchIncidents(true)
    } else {
      const unitLabel =
        assignConfirmCandidate?.unit_name || assignConfirmCandidate?.unitName || 'Selected unit'
      showStatusMessage(
        `⚠️ ${unitLabel} is no longer available. Updated recommendations are ready.`,
        4500
      )
      refreshCandidates()
      setAssignConfirmCandidate(null)
    }
  }

  const handleAdvanceLifecycle = async (targetStatus) => {
    const assigned = currentlyAssignedResponder
    if (!assigned) return

    const result = await advanceResponderLifecycleAction(assigned.id, targetStatus, 'authority')
    if (result.success) {
      showStatusMessage(`✓ Unit advanced to: ${targetStatus}`, 3000)
      refetchIncidents(true)
    } else {
      showStatusMessage(`❌ ${result.error?.message || 'Lifecycle transition failed'}`, 3000)
    }
  }

  const handleToggleMapLayer = (layerKey) => {
    setMapLayers((prev) => ({ ...prev, [layerKey]: !prev[layerKey] }))
  }

  const handleSyncAll = () => {
    refetchIncidents()
    loadFleet()
    loadShelters()
    loadSituationIntelligence()
  }

  return (
    <div className="space-y-3.5 pb-8">
      {/* Top District Header */}
      <AuthorityHeader hub={hub} dataProvenance={dataProvenance} />

      {/* Metrics Strip */}
      <OperationalMetrics
        computedMetrics={computedMetrics}
        activeRespondersCount={activeRespondersCount}
        totalRespondersCount={liveResponders.length}
        totalBedsAvailable={totalBedsAvailable}
      />

      {/* Situation Intelligence & Grounded AI Briefing Card */}
      <SituationBriefing
        situationSummary={situationSummary}
        liveHazards={liveHazards}
        incidentClusters={incidentClusters}
        computedMetrics={computedMetrics}
        activeRespondersCount={activeRespondersCount}
        totalRespondersCount={liveResponders.length}
        totalBedsAvailable={totalBedsAvailable}
        isRefreshingSituation={isRefreshingSituation}
        onRefreshSituation={loadSituationIntelligence}
      />

      {/* 3-Column Command Workspace */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-3.5 items-start">
        {/* Column 1: Incidents Queue */}
        <IncidentQueue
          incidents={incidents}
          filteredIncidents={filteredIncidents}
          selectedIncident={selectedIncident}
          activeIncidentFilter={activeIncidentFilter}
          onFilterChange={setActiveIncidentFilter}
          onSelectIncident={handleSelectIncident}
          isLoading={isLoadingIncidents}
          error={incidentError}
          newlyArrivedId={newlyArrivedId}
        />

        {/* Column 2: Geospatial Tactical Map */}
        <AuthorityMap
          incidents={incidents}
          responderMapPoints={responderMapPoints}
          shelterMapPoints={shelterMapPoints}
          liveHazards={liveHazards}
          incidentClusters={incidentClusters}
          selectedIncident={selectedIncident}
          activeRoute={activeRoute}
          previewRoute={previewRoute}
          mapLayers={mapLayers}
          onToggleLayer={handleToggleMapLayer}
          onSelectIncident={handleSelectIncident}
          onClearRoute={clearRoute}
        />

        {/* Column 3: Command Inspector & Resource Hub */}
        <section
          aria-label="Command Inspector and Resource Hub"
          className="lg:col-span-12 xl:col-span-4 bg-[#0C121B] border border-[#182332] rounded-xl p-3.5 flex flex-col space-y-3 min-h-[600px]"
        >
          <div className="flex items-center justify-between border-b border-[#182332] pb-2">
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setRightPanelTab('inspector')}
                className={`px-2.5 py-1 rounded text-xs font-mono font-bold uppercase transition-colors cursor-pointer ${
                  rightPanelTab === 'inspector'
                    ? 'bg-slate-700 text-white shadow-sm'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Inspector
              </button>
              <button
                type="button"
                onClick={() => setRightPanelTab('fleet')}
                className={`px-2.5 py-1 rounded text-xs font-mono font-bold uppercase transition-colors cursor-pointer ${
                  rightPanelTab === 'fleet'
                    ? 'bg-slate-700 text-white shadow-sm'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Fleet ({liveResponders.length})
              </button>
              <button
                type="button"
                onClick={() => setRightPanelTab('shelters')}
                className={`px-2.5 py-1 rounded text-xs font-mono font-bold uppercase transition-colors cursor-pointer ${
                  rightPanelTab === 'shelters'
                    ? 'bg-slate-700 text-white shadow-sm'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Shelters ({liveShelters.length})
              </button>
            </div>

            <button
              type="button"
              onClick={handleSyncAll}
              className="text-[10px] font-mono text-slate-400 hover:text-slate-200 cursor-pointer"
              title="Refresh all operational feeds"
            >
              ↻ Sync
            </button>
          </div>

          {/* TAB 1: Inspector */}
          {rightPanelTab === 'inspector' && (
            <IncidentInspector
              selectedIncident={selectedIncident}
              activeRoute={activeRoute}
              activeTargetResponder={activeTargetResponder}
              currentlyAssignedResponder={currentlyAssignedResponder}
              candidateShelters={candidateShelters}
              topRecommendedCandidate={topRecommendedCandidate}
              alternativeCandidates={alternativeCandidates}
              isLoadingCandidates={isLoadingCandidates}
              isAssigningUnit={isAssigningUnit}
              isVerifyingTriage={isVerifyingTriage}
              isAnalyzingTriage={isAnalyzingTriage}
              isUpdatingStatus={isUpdatingStatus}
              isSimulatingMovement={isSimulatingMovement}
              simulationSpeedMultiplier={simulationSpeedMultiplier}
              actionSuccessMessage={actionSuccessMessage}
              onClearRoute={clearRoute}
              onSelectCandidateRoute={selectCandidateRoute}
              onRequestAssign={setAssignConfirmCandidate}
              onRefreshCandidates={refreshCandidates}
              onAdvanceLifecycle={handleAdvanceLifecycle}
              onToggleMovementSimulation={toggleMovementSimulation}
              onSetSimulationSpeed={setSimulationSpeedMultiplier}
              onVerifyTriage={(customData) => verifyTriage(selectedIncident, customData)}
              onAdjustTriage={(adjData) => adjustTriage(selectedIncident, adjData)}
              onReevaluateTriage={() => reevaluateTriage(selectedIncident)}
              onTransitionStatus={handleTransitionStatus}
            />
          )}

          {/* TAB 2: Fleet */}
          {rightPanelTab === 'fleet' && (
            <ResponderPanel
              filteredFleet={filteredFleet}
              isLoadingFleet={isLoadingFleet}
              fleetCapabilityFilter={fleetCapabilityFilter}
              fleetStatusFilter={fleetStatusFilter}
              selectedResponderDetail={selectedResponderDetail}
              selectedIncident={selectedIncident}
              onCapabilityFilterChange={setFleetCapabilityFilter}
              onStatusFilterChange={setFleetStatusFilter}
              onSelectResponderDetail={setSelectedResponderDetail}
              onCloseResponderDetail={() => setSelectedResponderDetail(null)}
              onSelectCandidateRoute={selectCandidateRoute}
              onUpdateResponderStatus={updateResponderStatus}
            />
          )}

          {/* TAB 3: Shelters */}
          {rightPanelTab === 'shelters' && (
            <ShelterPanel
              liveShelters={liveShelters}
              liveHazards={liveHazards}
              onAdjustBeds={adjustBeds}
            />
          )}
        </section>
      </div>

      {/* Consequential Assignment Confirmation Modal */}
      <AssignmentConfirmModal
        isOpen={Boolean(assignConfirmCandidate)}
        candidate={assignConfirmCandidate}
        incident={selectedIncident}
        isAssigning={isAssigningUnit}
        onClose={() => setAssignConfirmCandidate(null)}
        onConfirm={handleConfirmAssignment}
      />
    </div>
  )
}

export default AuthorityCommandCenter
