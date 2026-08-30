import { useState, useMemo, useCallback, useRef, useEffect } from 'react'
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
import { Card } from '../components/ui/Card'
import { Button } from '../components/ui/Button'

export const AuthorityCommandCenter = () => {
  const { hub } = authorityData

  const {
    incidents,
    selectedIncident,
    setSelectedIncident,
    isLoading: isLoadingIncidents,
    error: incidentError,
    dataMode,
    newlyArrivedId,
    changeStatus,
    isUpdatingStatus,
    computedMetrics,
    connectivityStatus,
    toggleDemoMode,
    resetDemoState,
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
  const statusTimeoutRef = useRef(null)

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (statusTimeoutRef.current) clearTimeout(statusTimeoutRef.current)
    }
  }, [])

  const showStatusMessage = useCallback((msg, timeout = 3500) => {
    if (statusTimeoutRef.current) clearTimeout(statusTimeoutRef.current)
    setActionSuccessMessage(msg)
    statusTimeoutRef.current = setTimeout(() => setActionSuccessMessage(null), timeout)
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
    if (!selectedIncident || isUpdatingStatus) return
    const result = await changeStatus(selectedIncident.id, targetStatus)
    if (result.success) {
      showStatusMessage(`✓ Status updated: ${label}`, 3000)
    } else {
      showStatusMessage(`❌ ${result.error || 'Failed to update status'}`, 4500)
      refetchIncidents(true)
    }
  }

  const handleConfirmAssignment = async (responderId) => {
    if (!selectedIncident || isAssigningUnit) return

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
    if (!assigned || isAssigningUnit) return

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
    <div className="space-y-3 pb-8 animate-fadeIn">
      {/* Top Operational Command Header */}
      <AuthorityHeader
        hub={hub}
        dataProvenance={dataMode || dataProvenance}
        connectivityStatus={connectivityStatus}
        onToggleDemoMode={toggleDemoMode}
        onResetDemo={resetDemoState}
      />

      {/* Level 1: Priority Alert Strip (Conditional for Critical threats) */}
      {computedMetrics.critical > 0 && (
        <div className="bg-salvus-critical-bg/50 border border-salvus-critical-border px-3.5 py-1.5 rounded-xl flex items-center justify-between gap-2 text-xs text-salvus-critical animate-pulse shadow-xs">
          <div className="flex items-center gap-2 font-bold">
            <span aria-hidden="true">🚨</span>
            <span>
              IMMEDIATE ATTENTION: {computedMetrics.critical} Critical Threat
              {computedMetrics.critical > 1 ? 's' : ''} Active on Grid
            </span>
          </div>
          <span className="text-[11px] font-medium hidden sm:inline text-salvus-critical/90">
            Triage & Rapid Deployment Urged
          </span>
        </div>
      )}

      {/* 4-KPI Operational Strip */}
      <OperationalMetrics
        computedMetrics={computedMetrics}
        activeRespondersCount={activeRespondersCount}
        totalRespondersCount={liveResponders.length}
        totalBedsAvailable={totalBedsAvailable}
      />

      {/* Concise Situation Intelligence Briefing */}
      <SituationBriefing
        situationSummary={situationSummary}
        liveHazards={liveHazards}
        incidentClusters={incidentClusters}
        computedMetrics={computedMetrics}
        isRefreshingSituation={isRefreshingSituation}
        onRefreshSituation={loadSituationIntelligence}
      />

      {/* 3-Column Command Workspace */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-3.5 items-start">
        {/* Column 1: Action-Oriented Incidents Queue */}
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
        <Card
          aria-label="Command Inspector and Resource Hub"
          padding="sm"
          className="lg:col-span-12 xl:col-span-4 flex flex-col space-y-3 min-h-[580px]"
        >
          {/* Tab Header */}
          <div className="flex items-center justify-between border-b border-salvus-border pb-2">
            <div role="tablist" aria-label="Command panel tabs" className="flex items-center gap-1">
              <button
                type="button"
                role="tab"
                aria-selected={rightPanelTab === 'inspector'}
                aria-controls="panel-inspector"
                onClick={() => setRightPanelTab('inspector')}
                className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                  rightPanelTab === 'inspector'
                    ? 'bg-salvus-text-primary text-salvus-bg shadow-xs'
                    : 'text-salvus-text-secondary hover:text-salvus-text-primary'
                }`}
              >
                Inspector
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={rightPanelTab === 'fleet'}
                aria-controls="panel-fleet"
                onClick={() => setRightPanelTab('fleet')}
                className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                  rightPanelTab === 'fleet'
                    ? 'bg-salvus-text-primary text-salvus-bg shadow-xs'
                    : 'text-salvus-text-secondary hover:text-salvus-text-primary'
                }`}
              >
                Fleet ({liveResponders.length})
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={rightPanelTab === 'shelters'}
                aria-controls="panel-shelters"
                onClick={() => setRightPanelTab('shelters')}
                className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                  rightPanelTab === 'shelters'
                    ? 'bg-salvus-text-primary text-salvus-bg shadow-xs'
                    : 'text-salvus-text-secondary hover:text-salvus-text-primary'
                }`}
              >
                Shelters ({liveShelters.length})
              </button>
            </div>

            <Button
              variant="quiet"
              size="sm"
              onClick={handleSyncAll}
              className="text-xs"
              title="Refresh all operational feeds"
            >
              ↻ Sync
            </Button>
          </div>

          {/* TAB 1: Inspector */}
          {rightPanelTab === 'inspector' && (
            <div id="panel-inspector" role="tabpanel" aria-labelledby="tab-inspector">
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
            </div>
          )}

          {/* TAB 2: Fleet */}
          {rightPanelTab === 'fleet' && (
            <div id="panel-fleet" role="tabpanel" aria-labelledby="tab-fleet">
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
            </div>
          )}

          {/* TAB 3: Shelters */}
          {rightPanelTab === 'shelters' && (
            <div id="panel-shelters" role="tabpanel" aria-labelledby="tab-shelters">
              <ShelterPanel
                liveShelters={liveShelters}
                liveHazards={liveHazards}
                onAdjustBeds={adjustBeds}
              />
            </div>
          )}
        </Card>
      </div>

      {/* Assignment Confirmation Modal */}
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
