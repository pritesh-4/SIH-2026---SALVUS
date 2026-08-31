import { useState, useMemo, useCallback, useRef, useEffect } from 'react'
import { assignResponder, reassignResponder, reconcileAssignmentState } from '../services/api'
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
import { AttentionBar } from '../components/authority/AttentionBar'
import { SituationalSnapshot } from '../components/authority/SituationalSnapshot'
import { IncidentQueue } from '../components/authority/IncidentQueue'
import { AuthorityMap } from '../components/authority/AuthorityMap'
import { IncidentInspector } from '../components/authority/IncidentInspector'
import { SupportingOperations } from '../components/authority/SupportingOperations'
import { ActivityFeed } from '../components/authority/ActivityFeed'
import { AssignmentConfirmModal } from '../components/authority/AssignmentConfirmModal'
import ErrorBoundary from '../components/common/ErrorBoundary'
import DevDiagnosticsPanel from '../components/common/DevDiagnosticsPanel'
import { Card } from '../components/ui/Card'

export const AuthorityCommandCenter = () => {
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
    fleetDataMode,
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
    shelterDataMode,
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
    recommendationShift,
    dismissRecommendationShift,
  } = useDispatchRecommendation({
    selectedIncident,
    liveResponders,
    currentlyAssignedResponder,
  })

  // ---------------------------------------------------------------------------
  // 2. Local UI State
  // ---------------------------------------------------------------------------
  const [activeIncidentFilter, setActiveIncidentFilter] = useState('all')
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
  const [reassignModalCandidate, setReassignModalCandidate] = useState(null)
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
      // Reconcile ambiguous outcome (e.g. timeout / network drop where backend assignment may have succeeded)
      if (result.error?.code === 'TIMEOUT' || result.error?.retryable) {
        const reconciliation = await reconcileAssignmentState(selectedIncident.id, responderId)
        if (reconciliation.reconciled && reconciliation.assignment) {
          setAssignConfirmCandidate(null)
          showStatusMessage(
            `✓ Dispatched (Reconciled from server) #${selectedIncident.ticket_id}`,
            3500
          )
          refetchIncidents(true)
          loadFleet()
          return
        }
      }

      const unitLabel =
        assignConfirmCandidate?.unit_name || assignConfirmCandidate?.unitName || 'Selected unit'
      showStatusMessage(
        `⚠️ ${unitLabel} dispatch could not be completed: ${result.error?.message || 'Unit unavailable'}`,
        4500
      )
      refreshCandidates()
      setAssignConfirmCandidate(null)
    }
  }

  const handleConfirmReassignment = async (responderId, reason) => {
    if (!selectedIncident || isAssigningUnit) return

    setIsAssigningUnit(true)
    const result = await reassignResponder(
      responderId,
      selectedIncident.id,
      reason || 'Operational reassignment due to updated transit and capability assessment'
    )
    setIsAssigningUnit(false)

    if (result.success) {
      setReassignModalCandidate(null)
      dismissRecommendationShift?.()
      showStatusMessage(
        `✓ Dynamically reassigned #${selectedIncident.ticket_id} to ${result.data.unit_name}`,
        3500
      )
      setLiveResponders((prev) =>
        prev.map((r) => {
          if (r.id === responderId) {
            return {
              ...r,
              ...result.data,
              status: 'ASSIGNED',
              assigned_incident_id: selectedIncident.id,
            }
          }
          if (r.assigned_incident_id === selectedIncident.id) {
            return { ...r, status: 'AVAILABLE', assigned_incident_id: null }
          }
          return r
        })
      )
      refetchIncidents(true)
      refreshCandidates()
    } else {
      // Reconcile ambiguous outcome
      if (result.error?.code === 'TIMEOUT' || result.error?.retryable) {
        const reconciliation = await reconcileAssignmentState(selectedIncident.id, responderId)
        if (reconciliation.reconciled && reconciliation.assignment) {
          setReassignModalCandidate(null)
          dismissRecommendationShift?.()
          showStatusMessage(
            `✓ Reassigned (Reconciled from server) #${selectedIncident.ticket_id}`,
            3500
          )
          refetchIncidents(true)
          loadFleet()
          return
        }
      }

      showStatusMessage(`❌ ${result.error?.message || 'Reassignment failed'}`, 4500)
      refreshCandidates()
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

  // ---------------------------------------------------------------------------
  // 6. Unified Data Provenance
  // ---------------------------------------------------------------------------
  const unifiedProvenance = useMemo(() => {
    const modes = [dataMode, fleetDataMode, shelterDataMode, dataProvenance]
    const isAllSimulated = modes.every((m) => m === 'SIMULATED')
    if (isAllSimulated) return 'SIMULATED'

    const isAllLive = modes.every((m) => m === 'LIVE')
    if (isAllLive) return 'LIVE'

    const isAllUnavailable = modes.every((m) => m === 'UNAVAILABLE')
    if (isAllUnavailable) return 'UNAVAILABLE'

    const isAnyStale = modes.some((m) => m === 'STALE')
    const isAnyUnavailable = modes.some((m) => m === 'UNAVAILABLE')
    const isAnyPartial = modes.some((m) => m === 'PARTIAL')

    if (isAnyStale) return 'STALE'
    if (isAnyUnavailable || isAnyPartial) return 'PARTIAL'
    return dataMode || 'LIVE'
  }, [dataMode, fleetDataMode, shelterDataMode, dataProvenance])

  const domainProvenance = useMemo(
    () => ({
      Incidents: dataMode,
      Fleet: fleetDataMode,
      Shelters: shelterDataMode,
      Situation: dataProvenance,
    }),
    [dataMode, fleetDataMode, shelterDataMode, dataProvenance]
  )

  // ---------------------------------------------------------------------------
  // 7. Grounded Realtime Activity Log Stream
  // ---------------------------------------------------------------------------
  const recentEvents = useMemo(() => {
    const allEvents = []
    incidents.forEach((inc) => {
      if (Array.isArray(inc.events) && inc.events.length > 0) {
        inc.events.forEach((evt) => {
          allEvents.push({
            ...evt,
            ticket_id: inc.ticket_id || (inc.id ? `SV-${inc.id.slice(-4)}` : 'INC'),
            timestamp: evt.created_at || evt.timestamp || inc.created_at,
          })
        })
      } else {
        allEvents.push({
          id: `evt-${inc.id}-created`,
          type: inc.is_sos ? 'SOS_CREATED' : 'NEW',
          ticket_id: inc.ticket_id || (inc.id ? `SV-${inc.id.slice(-4)}` : 'INC'),
          message:
            inc.description ||
            (inc.is_sos ? 'Emergency SOS Beacon active on grid' : 'Distress report filed'),
          timestamp: inc.created_at,
        })
      }
    })
    return allEvents
      .sort((a, b) => new Date(b.timestamp || 0) - new Date(a.timestamp || 0))
      .slice(0, 15)
  }, [incidents])

  return (
    <div className="space-y-3 pb-8 animate-fadeIn max-w-[1720px] mx-auto">
      {/* ZONE 1 — COMMAND HEADER */}
      <AuthorityHeader
        dataProvenance={unifiedProvenance}
        connectivityStatus={connectivityStatus}
        domainProvenance={domainProvenance}
        onToggleDemoMode={async (enable) => {
          await toggleDemoMode(enable)
          loadFleet()
          loadShelters()
          loadSituationIntelligence()
        }}
        onResetDemo={resetDemoState}
      />

      {/* ZONE 2 — ATTENTION BAR */}
      <AttentionBar
        criticalCount={computedMetrics.critical}
        sosCount={computedMetrics.activeSos}
        triagePendingCount={computedMetrics.triagePending}
        activeFilter={activeIncidentFilter}
        onFilterChange={setActiveIncidentFilter}
      />

      {/* ZONE 3 — SITUATIONAL SNAPSHOT */}
      <SituationalSnapshot
        computedMetrics={computedMetrics}
        activeRespondersCount={activeRespondersCount}
        totalRespondersCount={liveResponders.length}
        totalBedsAvailable={totalBedsAvailable}
        liveHazardsCount={liveHazards.length}
        incidentClustersCount={incidentClusters.length}
        isRefreshing={isRefreshingSituation}
        onRefresh={loadSituationIntelligence}
      />

      {/* ZONE 4 — PRIMARY COMMAND WORKSPACE (3-COLUMN TRIAD) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 items-start">
        {/* Column 1: Action-Oriented Incidents Prioritization Queue */}
        <div className="lg:col-span-4 xl:col-span-3">
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
        </div>

        {/* Column 2: Geospatial Tactical Operating Surface */}
        <div className="lg:col-span-8 xl:col-span-5 flex flex-col space-y-2">
          <ErrorBoundary componentName="Tactical Geospatial Map" variant="card">
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
          </ErrorBoundary>
        </div>

        {/* Column 3: Incident Decision & Action Inspector */}
        <Card
          aria-label="Command Decision Inspector"
          padding="sm"
          className="lg:col-span-12 xl:col-span-4 flex flex-col h-[580px] sm:h-[620px] shadow-xs"
        >
          <ErrorBoundary componentName="Incident Inspector" variant="card">
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
              recommendationShift={recommendationShift}
              onDismissRecommendationShift={dismissRecommendationShift}
              onReviewReassign={(candidate) => setReassignModalCandidate(candidate)}
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
          </ErrorBoundary>
        </Card>
      </div>

      {/* ZONE 5 — SUPPORTING OPERATIONS (FLEET, SHELTERS, HAZARDS, BRIEFING) */}
      <SupportingOperations
        filteredFleet={filteredFleet}
        liveResponders={liveResponders}
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
        liveShelters={liveShelters}
        liveHazards={liveHazards}
        incidentClusters={incidentClusters}
        onAdjustBeds={adjustBeds}
        situationSummary={situationSummary}
        computedMetrics={computedMetrics}
        isRefreshingSituation={isRefreshingSituation}
        onRefreshSituation={loadSituationIntelligence}
        onSyncAll={handleSyncAll}
      />

      {/* ZONE 6 — LIVE OPERATIONAL EVENT ACTIVITY STREAM */}
      <ActivityFeed events={recentEvents} />

      {/* Assignment Confirmation Safeguard Modal */}
      <AssignmentConfirmModal
        isOpen={Boolean(assignConfirmCandidate)}
        candidate={assignConfirmCandidate}
        incident={selectedIncident}
        isAssigning={isAssigningUnit}
        onClose={() => setAssignConfirmCandidate(null)}
        onConfirm={handleConfirmAssignment}
      />

      {/* Dynamic Reassignment Safeguard Modal */}
      <AssignmentConfirmModal
        isOpen={Boolean(reassignModalCandidate)}
        candidate={reassignModalCandidate}
        incident={selectedIncident}
        isAssigning={isAssigningUnit}
        isReassign={true}
        previousResponder={currentlyAssignedResponder}
        reassignmentReason={recommendationShift?.reason}
        onClose={() => setReassignModalCandidate(null)}
        onConfirm={handleConfirmReassignment}
      />

      {/* System Diagnostics & Observability Drawer */}
      <DevDiagnosticsPanel
        incidentId={selectedIncident?.id}
        ticketId={selectedIncident?.ticket_id}
        aiProvenance={selectedIncident?.ai_triage?.source_label || domainProvenance?.ai_triage}
        onForceResync={handleSyncAll}
      />
    </div>
  )
}

export default AuthorityCommandCenter
