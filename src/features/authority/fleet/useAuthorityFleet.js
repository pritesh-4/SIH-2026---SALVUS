import { useState, useEffect, useCallback, useMemo } from 'react'
import {
  fetchResponders,
  updateResponderStatus as apiUpdateResponderStatus,
  advanceResponderLifecycle as apiAdvanceResponderLifecycle,
} from '../../../services/api'
import { authorityData } from '../../../data/authority/authorityMock'
import { subscribeToEvent } from '../../../lib/realtime/socket'
import { isDemoModeActive } from '../incidents/useAuthorityIncidents'

export const useAuthorityFleet = ({ selectedIncident = null, onIncidentRefetch = null } = {}) => {
  const [liveResponders, setLiveResponders] = useState([])
  const [isLoadingFleet, setIsLoadingFleet] = useState(true)
  const [fleetCapabilityFilter, setFleetCapabilityFilter] = useState('all')
  const [fleetStatusFilter, setFleetStatusFilter] = useState('all')
  const [selectedResponderDetail, setSelectedResponderDetail] = useState(null)

  // ---------------------------------------------------------------------------
  // 1. Initial Load & Refresh (Enforce Server Truth)
  // ---------------------------------------------------------------------------
  const loadFleet = useCallback(async () => {
    setIsLoadingFleet(true)
    const isDemo = isDemoModeActive()
    const result = await fetchResponders()
    if (result.success && Array.isArray(result.data)) {
      setLiveResponders(result.data)
    } else if (isDemo) {
      setLiveResponders(authorityData.responders || [])
    } else {
      setLiveResponders([])
    }
    setIsLoadingFleet(false)
  }, [])

  useEffect(() => {
    let isMounted = true

    const init = async () => {
      await loadFleet()
    }
    if (isMounted) {
      init()
    }

    const handleResponderStatus = (updatedResp) => {
      setLiveResponders((prev) =>
        prev.map((r) => (r.id === updatedResp.id ? { ...r, ...updatedResp } : r))
      )
      setSelectedResponderDetail((prev) =>
        prev && prev.id === updatedResp.id ? { ...prev, ...updatedResp } : prev
      )
    }

    const handleResponderLocation = (updatedResp) => {
      setLiveResponders((prev) =>
        prev.map((r) => (r.id === updatedResp.id ? { ...r, ...updatedResp } : r))
      )
      setSelectedResponderDetail((prev) =>
        prev && prev.id === updatedResp.id ? { ...prev, ...updatedResp } : prev
      )
    }

    const handleAssignment = (payload) => {
      if (payload.responder) {
        setLiveResponders((prev) =>
          prev.map((r) => (r.id === payload.responder.id ? { ...r, ...payload.responder } : r))
        )
      }
      if (onIncidentRefetch) {
        onIncidentRefetch(true)
      }
    }

    const unsub1 = subscribeToEvent('responder.status_changed', handleResponderStatus)
    const unsub2 = subscribeToEvent('responder.location_updated', handleResponderLocation)
    const unsub3 = subscribeToEvent('assignment.created', handleAssignment)
    const unsub4 = subscribeToEvent('assignment.status_changed', handleAssignment)

    return () => {
      isMounted = false
      unsub1()
      unsub2()
      unsub3()
      unsub4()
    }
  }, [loadFleet, onIncidentRefetch])

  // ---------------------------------------------------------------------------
  // 2. Computed Values
  // ---------------------------------------------------------------------------
  const filteredFleet = useMemo(() => {
    return liveResponders.filter((r) => {
      if (fleetCapabilityFilter !== 'all' && r.capability !== fleetCapabilityFilter) return false
      if (fleetStatusFilter !== 'all' && r.status !== fleetStatusFilter) return false
      return true
    })
  }, [liveResponders, fleetCapabilityFilter, fleetStatusFilter])

  const activeRespondersCount = useMemo(
    () =>
      liveResponders.filter((r) =>
        ['ASSIGNED', 'EN_ROUTE', 'NEARBY', 'ON_SCENE'].includes(r.status)
      ).length,
    [liveResponders]
  )

  const responderMapPoints = useMemo(() => {
    return liveResponders.map((r) => ({
      id: r.id,
      name: `${r.unit_name || r.unitName || 'NDRF Unit'} (${r.team_lead || r.lead || 'Team'})`,
      vessel: `${r.vehicle_type || r.vehicle || 'Rescue Vehicle'} · ${r.status || 'AVAILABLE'}`,
      lat: r.latitude || 22.574,
      lng: r.longitude || 88.372,
    }))
  }, [liveResponders])

  const currentlyAssignedResponder = useMemo(() => {
    if (!selectedIncident) return null
    return liveResponders.find((r) => r.assigned_incident_id === selectedIncident.id) || null
  }, [selectedIncident, liveResponders])

  // ---------------------------------------------------------------------------
  // 3. Actions
  // ---------------------------------------------------------------------------
  const updateStatus = useCallback(
    async (responderId, status, assignedIncidentId = null) => {
      const result = await apiUpdateResponderStatus(responderId, status, assignedIncidentId)
      if (result.success && result.data) {
        setLiveResponders((prev) =>
          prev.map((r) => (r.id === responderId ? { ...r, ...result.data } : r))
        )
        setSelectedResponderDetail((prev) =>
          prev && prev.id === responderId ? { ...prev, ...result.data } : prev
        )
      } else {
        await loadFleet()
      }
      return result
    },
    [loadFleet]
  )

  const advanceLifecycle = useCallback(async (responderId, targetStatus, actor = 'authority') => {
    const result = await apiAdvanceResponderLifecycle(responderId, targetStatus, actor)
    if (result.success && result.data) {
      setLiveResponders((prev) =>
        prev.map((r) => (r.id === responderId ? { ...r, ...result.data } : r))
      )
      setSelectedResponderDetail((prev) =>
        prev && prev.id === responderId ? { ...prev, ...result.data } : prev
      )
    }
    return result
  }, [])

  return {
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
    updateStatus,
    advanceLifecycle,
    loadFleet,
  }
}
