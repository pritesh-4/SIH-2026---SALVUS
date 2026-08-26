import { useState, useEffect, useCallback, useMemo } from 'react'
import {
  fetchIncidents,
  updateIncidentStatus,
  fetchRoleToken,
  getAuthToken,
} from '../../../services/api'
import { authorityData } from '../../../data/authority/authorityMock'
import {
  joinRoom,
  leaveRoom,
  subscribeToEvent,
  onSocketStatusChange,
} from '../../../lib/realtime/socket'

const STATUS_RANKS = {
  NEW: 1,
  TRIAGE_PENDING: 2,
  VERIFIED: 3,
  RESOLVED: 4,
  CANCELLED: 4,
}

const normalizeIncident = (inc) => ({
  id: inc.id || `INC-${Math.random().toString(36).substr(2, 6)}`,
  ticket_id: inc.ticket_id || inc.citizenTicket || `SV-${(inc.id || '').slice(-4)}`,
  type: inc.type || inc.category || 'Flash Flood',
  severity: inc.severity || 'MEDIUM',
  status: inc.status === 'AWAITING_DISPATCH' ? 'NEW' : inc.status || 'NEW',
  description:
    inc.description ||
    inc.aiTriage?.priorityReasoning ||
    inc.category ||
    'Disaster hazard report filed.',
  location_name: inc.location_name || inc.location || 'Sector 12, Salt Lake',
  latitude: typeof inc.latitude === 'number' ? inc.latitude : 22.5726,
  longitude: typeof inc.longitude === 'number' ? inc.longitude : 88.3639,
  affected_count: inc.affected_count || inc.affectedCount || 1,
  is_sos: inc.is_sos !== undefined ? Boolean(inc.is_sos) : inc.severity === 'CRITICAL',
  reporter_name: inc.reporter_name || inc.reporter?.name || 'Citizen User',
  reporter_phone: inc.reporter_phone || inc.reporter?.phone || null,
  ai_triage: inc.ai_triage || inc.aiTriage || null,
  created_at: inc.created_at || new Date().toISOString(),
  updated_at: inc.updated_at || new Date().toISOString(),
  events: inc.events || [],
})

export const useAuthorityIncidents = () => {
  const [incidents, setIncidents] = useState([])
  const [selectedIncidentId, setSelectedIncidentId] = useState(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState(null)
  const [connectivityStatus, setConnectivityStatus] = useState('CONNECTED')
  const [newlyArrivedId, setNewlyArrivedId] = useState(null)
  const [isUpdatingStatus, setIsUpdatingStatus] = useState(false)

  // -------------------------------------------------------------------------
  // 1. Initial & Refresh Incidents Fetch
  // -------------------------------------------------------------------------
  const refetch = useCallback(async (silent = false) => {
    if (!silent) setIsLoading(true)
    setError(null)
    const result = await fetchIncidents()

    if (result.success && result.data && result.data.length > 0) {
      const normalized = result.data.map(normalizeIncident)
      setIncidents(normalized)
      setSelectedIncidentId((prev) => prev || normalized[0].id)
    } else {
      // Offline / fallback to initial mock dataset if backend is empty or unreachable
      const fallback = (authorityData.incidents || []).map(normalizeIncident)
      setIncidents(fallback)
      if (fallback.length > 0) {
        setSelectedIncidentId((prev) => prev || fallback[0].id)
      }
      if (!result.success && !silent) {
        setError(result.error?.message || 'Using local operational grid cache')
      }
    }
    if (!silent) setIsLoading(false)
  }, [])

  useEffect(() => {
    let isMounted = true

    const initAuthority = async () => {
      if (!getAuthToken()) {
        await fetchRoleToken('AUTHORITY', 'Dispatcher Mukherjee')
      }
      const result = await fetchIncidents()
      if (!isMounted) return
      if (result.success && result.data && result.data.length > 0) {
        const normalized = result.data.map(normalizeIncident)
        setIncidents(normalized)
        setSelectedIncidentId((prev) => prev || normalized[0].id)
      } else {
        const fallback = (authorityData.incidents || []).map(normalizeIncident)
        setIncidents(fallback)
        if (fallback.length > 0) {
          setSelectedIncidentId((prev) => prev || fallback[0].id)
        }
      }
      setIsLoading(false)
    }

    initAuthority()

    return () => {
      isMounted = false
    }
  }, [])

  // -------------------------------------------------------------------------
  // 2. Realtime Socket.IO Ingestion with Out-of-Order Guards
  // -------------------------------------------------------------------------
  useEffect(() => {
    // Join the authorities room
    joinRoom('authorities')

    // Listen for new incidents created by citizens
    const unsubscribeNew = subscribeToEvent('incident.created', (payload) => {
      setIncidents((prev) => {
        const incidentId = payload.id || payload.incident_id
        const exists = prev.some((inc) => inc.id === incidentId)
        if (exists) return prev

        const newIncident = {
          id: incidentId,
          ticket_id: payload.ticket_id || `SV-${Date.now().toString().slice(-4)}`,
          type: payload.type || 'flood',
          severity: payload.severity || 'MEDIUM',
          description: payload.description || '',
          reporter_name: payload.reporter_name || 'Citizen User',
          reporter_phone: payload.reporter_phone || null,
          latitude: payload.latitude || 22.5726,
          longitude: payload.longitude || 88.3639,
          affected_count: payload.affected_count || 1,
          is_sos: Boolean(payload.is_sos),
          status: payload.status || 'NEW',
          created_at: payload.created_at || new Date().toISOString(),
          updated_at: payload.updated_at || new Date().toISOString(),
          events: payload.events || [
            {
              id: 'initial',
              incident_id: incidentId,
              event_type: 'CREATED',
              actor: 'citizen',
              created_at: payload.created_at || new Date().toISOString(),
            },
          ],
        }

        // Highlight new incident
        setNewlyArrivedId(incidentId)
        setTimeout(() => {
          setNewlyArrivedId((cur) => (cur === incidentId ? null : cur))
        }, 4000)

        return [newIncident, ...prev]
      })
    })

    // Listen for remote status transitions with out-of-order protection
    const handleResponseStateChange = (payload) => {
      const incId = payload.id || payload.incident_id
      const targetStatus = payload.status

      setIncidents((prev) =>
        prev.map((inc) => {
          if (inc.id === incId) {
            const currentRank = STATUS_RANKS[inc.status] || 0
            const incomingRank = STATUS_RANKS[targetStatus] || 0

            // Event ordering protection: do not regress status if an older packet arrives late
            if (incomingRank < currentRank && inc.status !== 'CANCELLED') {
              return inc
            }

            const updatedEvents = payload.events || [
              ...(inc.events || []),
              {
                id: `evt-${Date.now()}`,
                incident_id: incId,
                event_type: 'STATUS_CHANGE',
                previous_status: inc.status,
                new_status: targetStatus,
                actor: 'authority',
                created_at: payload.updated_at || new Date().toISOString(),
              },
            ]

            return {
              ...inc,
              status: targetStatus,
              updated_at: payload.updated_at || new Date().toISOString(),
              events: updatedEvents,
            }
          }
          return inc
        })
      )
    }

    const unsubscribeStatus = subscribeToEvent(
      'incident.response_state_changed',
      handleResponseStateChange
    )

    const handleAssignmentEvent = (payload) => {
      const incId = payload.incident_id || payload.id
      if (!incId) return
      const targetStatus = payload.status || 'ASSIGNED'
      setIncidents((prev) =>
        prev.map((inc) => {
          if (inc.id === incId) {
            return {
              ...inc,
              status: targetStatus,
              updated_at: new Date().toISOString(),
            }
          }
          return inc
        })
      )
    }

    const unsubscribeAssignCreated = subscribeToEvent('assignment.created', handleAssignmentEvent)
    const unsubscribeAssignStatus = subscribeToEvent(
      'assignment.status_changed',
      handleAssignmentEvent
    )

    // Listen for AI triage update and verification broadcasts
    const unsubscribeTriage = subscribeToEvent('incident.triage_updated', (payload) => {
      const incId = payload.incident_id || payload.id
      setIncidents((prev) =>
        prev.map((inc) =>
          inc.id === incId
            ? {
                ...inc,
                ai_triage: payload.assessment,
              }
            : inc
        )
      )
    })

    const unsubscribeTriageVerified = subscribeToEvent('incident.triage_verified', (payload) => {
      const incId = payload.incident_id || payload.id
      if (payload.incident) {
        setIncidents((prev) =>
          prev.map((inc) => (inc.id === incId ? normalizeIncident(payload.incident) : inc))
        )
      } else {
        refetch(true)
      }
    })

    // Listen for socket connection status and refresh on reconnect
    const unsubscribeConn = onSocketStatusChange((status) => {
      setConnectivityStatus(status)
      if (status === 'CONNECTED') {
        refetch(true) // Silent refresh to catch any updates during disconnect gap
      }
    })

    return () => {
      leaveRoom('authorities')
      unsubscribeNew()
      unsubscribeStatus()
      unsubscribeAssignCreated()
      unsubscribeAssignStatus()
      unsubscribeTriage()
      unsubscribeTriageVerified()
      unsubscribeConn()
    }
  }, [refetch])

  // -------------------------------------------------------------------------
  // 3. Computed Selected Incident
  // -------------------------------------------------------------------------
  const selectedIncident = useMemo(() => {
    if (!selectedIncidentId) return incidents[0] || null
    return incidents.find((inc) => inc.id === selectedIncidentId) || incidents[0] || null
  }, [incidents, selectedIncidentId])

  // -------------------------------------------------------------------------
  // 4. Status Transition Handler
  // -------------------------------------------------------------------------
  const changeStatus = useCallback(
    async (incidentId, newStatus) => {
      if (isUpdatingStatus) return { success: false }

      setIsUpdatingStatus(true)
      const result = await updateIncidentStatus(incidentId, newStatus, 'authority')
      setIsUpdatingStatus(false)

      if (result.success && result.data) {
        setIncidents((prev) =>
          prev.map((inc) => (inc.id === incidentId ? { ...inc, ...result.data } : inc))
        )
        return { success: true, incident: result.data }
      } else {
        return {
          success: false,
          error: result.error?.message || 'Failed to update status',
        }
      }
    },
    [isUpdatingStatus]
  )

  // Computed live metrics from real incidents
  const computedMetrics = useMemo(() => {
    const active = incidents.filter((inc) => !['RESOLVED', 'CANCELLED'].includes(inc.status))
    const critical = active.filter((inc) => inc.severity === 'CRITICAL')
    const resolved = incidents.filter((inc) => inc.status === 'RESOLVED')

    return {
      active: active.length,
      critical: critical.length,
      resolved: resolved.length,
      activeIncidents: active.length,
      criticalThreats: critical.length,
      resolvedCount: resolved.length,
      totalCount: incidents.length,
    }
  }, [incidents])

  return {
    incidents,
    selectedIncident,
    setSelectedIncident: (inc) => setSelectedIncidentId(inc?.id || null),
    setSelectedIncidentId,
    isLoading,
    error,
    connectivityStatus,
    newlyArrivedId,
    changeStatus,
    isUpdatingStatus,
    computedMetrics,
    refetch,
  }
}
