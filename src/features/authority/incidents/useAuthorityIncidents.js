import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import {
  fetchIncidents,
  updateIncidentStatus,
  seedDevIncidents,
  resetDevDatabase,
} from '../../../services/api.js'
import { authorityData } from '../../../data/authority/authorityMock.js'
import {
  joinRoom,
  leaveRoom,
  subscribeToEvent,
  onSocketStatusChange,
} from '../../../lib/realtime/socket.js'
import { shouldAcceptStatusUpdate, normalizeToBackendStatus } from '../../../lib/stateMachine.js'

export const isDemoModeActive = () => {
  if (typeof window === 'undefined') return false
  return (
    window.location.search.includes('demo=true') ||
    localStorage.getItem('salvus_demo_mode') === 'true'
  )
}

export const normalizeIncident = (inc) => {
  if (!inc) return null
  const id = inc.id || inc.ticket_id || 'INC-PENDING'
  const ticket_id =
    inc.ticket_id ||
    inc.citizenTicket ||
    (id && id !== 'INC-PENDING' ? (id.startsWith('SV-') ? id : `SV-${id.slice(-4)}`) : 'SV-PENDING')

  const hasValidLat = typeof inc.latitude === 'number' && !isNaN(inc.latitude)
  const hasValidLon = typeof inc.longitude === 'number' && !isNaN(inc.longitude)
  const latitude = hasValidLat ? inc.latitude : null
  const longitude = hasValidLon ? inc.longitude : null

  const affected_count =
    typeof inc.affected_count === 'number'
      ? inc.affected_count
      : typeof inc.affectedCount === 'number'
        ? inc.affectedCount
        : null

  return {
    id,
    ticket_id,
    type: inc.type || inc.category || 'flood',
    severity: (inc.severity || 'MEDIUM').toUpperCase(),
    status: inc.status === 'AWAITING_DISPATCH' ? 'NEW' : inc.status || 'NEW',
    description:
      inc.description ||
      inc.ai_triage?.priority_reasoning ||
      inc.ai_triage?.priorityReasoning ||
      inc.aiTriage?.priorityReasoning ||
      inc.category ||
      'Disaster hazard report filed.',
    location_name:
      inc.location_name ||
      inc.location ||
      (latitude !== null && longitude !== null
        ? `${latitude.toFixed(4)}°N, ${longitude.toFixed(4)}°E`
        : null),
    latitude,
    longitude,
    affected_count,
    is_sos: inc.is_sos != null ? Boolean(inc.is_sos) : false,
    reporter_name: inc.reporter_name || inc.reporter?.name || null,
    reporter_phone: inc.reporter_phone || inc.reporter?.phone || null,
    ai_triage: inc.ai_triage || inc.aiTriage || null,
    ai_state: inc.ai_state || (inc.ai_triage ? 'AVAILABLE' : 'WAITING'),
    assignment: inc.assignment || null,
    attachments: Array.isArray(inc.attachments) ? inc.attachments : [],
    created_at: inc.created_at || null,
    updated_at: inc.updated_at || inc.created_at || null,
    events: Array.isArray(inc.events) ? inc.events : [],
  }
}

export const useAuthorityIncidents = () => {
  const [incidents, setIncidents] = useState([])
  const [selectedIncidentId, setSelectedIncidentId] = useState(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState(null)
  const [connectivityStatus, setConnectivityStatus] = useState('CONNECTED')
  const [dataMode, setDataMode] = useState(() => (isDemoModeActive() ? 'SIMULATED' : 'LIVE'))
  const [lastSynchronizedAt, setLastSynchronizedAt] = useState(null)
  const [newlyArrivedId, setNewlyArrivedId] = useState(null)
  const [isUpdatingStatus, setIsUpdatingStatus] = useState(false)
  const arrivalTimerRef = useRef(null)

  // -------------------------------------------------------------------------
  // 1. Initial & Refresh Incidents Fetch (Enforce Server Truth)
  // -------------------------------------------------------------------------
  const refetch = useCallback(async (silent = false) => {
    if (!silent) setIsLoading(true)
    setError(null)
    const isDemo = isDemoModeActive()
    const result = await fetchIncidents()

    if (result.success && Array.isArray(result.data)) {
      const normalized = result.data.map(normalizeIncident).filter(Boolean)
      setIncidents(normalized)
      setSelectedIncidentId((prev) => {
        if (prev && normalized.some((i) => i.id === prev)) return prev
        return normalized[0]?.id || null
      })
      setDataMode(isDemo ? 'SIMULATED' : 'LIVE')
      setLastSynchronizedAt(new Date().toISOString())
    } else if (isDemo) {
      // Explicit Simulated Demo Scenario Fallback
      const fallback = (authorityData.incidents || []).map(normalizeIncident).filter(Boolean)
      setIncidents(fallback)
      setSelectedIncidentId((prev) => {
        if (prev && fallback.some((i) => i.id === prev)) return prev
        return fallback[0]?.id || null
      })
      setDataMode('SIMULATED')
      setLastSynchronizedAt(new Date().toISOString())
    } else {
      // LIVE mode with API failure: retain previously valid data as STALE if available, else UNAVAILABLE
      setDataMode((prevMode) => (prevMode === 'LIVE' ? 'STALE' : 'UNAVAILABLE'))
      if (!silent) {
        setError(result.error?.message || 'Operational incident feed unavailable.')
      }
    }
    if (!silent) setIsLoading(false)
  }, [])

  useEffect(() => {
    let isMounted = true

    const initAuthority = async () => {
      const isDemo = isDemoModeActive()
      const result = await fetchIncidents()
      if (!isMounted) return

      if (result.success && Array.isArray(result.data)) {
        const normalized = result.data.map(normalizeIncident).filter(Boolean)
        setIncidents(normalized)
        setSelectedIncidentId((prev) => {
          if (prev && normalized.some((i) => i.id === prev)) return prev
          return normalized[0]?.id || null
        })
        setDataMode(isDemo ? 'SIMULATED' : 'LIVE')
        setLastSynchronizedAt(new Date().toISOString())
      } else if (isDemo) {
        const fallback = (authorityData.incidents || []).map(normalizeIncident).filter(Boolean)
        setIncidents(fallback)
        setSelectedIncidentId((prev) => {
          if (prev && fallback.some((i) => i.id === prev)) return prev
          return fallback[0]?.id || null
        })
        setDataMode('SIMULATED')
        setLastSynchronizedAt(new Date().toISOString())
      } else {
        setIncidents([])
        setSelectedIncidentId(null)
        setDataMode('UNAVAILABLE')
        setError(result.error?.message || 'Operational incident feed unavailable.')
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
      if (!payload) return
      setIncidents((prev) => {
        const incidentId = payload.id || payload.incident_id
        if (!incidentId) return prev
        const exists = prev.some((inc) => inc.id === incidentId)
        if (exists) return prev

        const newIncident = normalizeIncident({
          ...payload,
          id: incidentId,
        })

        // Highlight new incident with non-distracting visual pulse
        setNewlyArrivedId(incidentId)
        if (arrivalTimerRef.current) clearTimeout(arrivalTimerRef.current)
        arrivalTimerRef.current = setTimeout(() => {
          setNewlyArrivedId((cur) => (cur === incidentId ? null : cur))
        }, 4000)

        // If no incident was selected yet, select the newly arrived distress call
        setSelectedIncidentId((cur) => cur || incidentId)

        return [newIncident, ...prev]
      })
    })

    // Listen for remote status transitions with out-of-order protection
    const handleResponseStateChange = (payload) => {
      if (!payload) return
      const incId = payload.id || payload.incident_id
      if (!incId) return
      const targetStatus = normalizeToBackendStatus(payload.status)

      setIncidents((prev) =>
        prev.map((inc) => {
          if (inc.id === incId) {
            // Event ordering protection: do not regress status if an older packet arrives late
            if (!shouldAcceptStatusUpdate(inc.status, targetStatus)) {
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
                actor: payload.actor || 'authority',
                created_at: payload.updated_at || new Date().toISOString(),
              },
            ]

            return {
              ...inc,
              status: targetStatus,
              assignment: payload.assignment || inc.assignment,
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
      if (!payload) return
      const incId = payload.incident_id || payload.id
      if (!incId) return
      const targetStatus = normalizeToBackendStatus(payload.status || 'ASSIGNED')
      setIncidents((prev) =>
        prev.map((inc) => {
          if (inc.id === incId) {
            if (!shouldAcceptStatusUpdate(inc.status, targetStatus)) {
              return inc
            }
            return {
              ...inc,
              status: targetStatus,
              assignment: payload.assignment || payload.responder || inc.assignment,
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
      if (!payload) return
      const incId = payload.incident_id || payload.id
      if (!incId) return
      setIncidents((prev) =>
        prev.map((inc) =>
          inc.id === incId
            ? {
                ...inc,
                ai_triage: payload.assessment || payload.ai_triage,
                ai_state: payload.ai_state || 'AVAILABLE',
              }
            : inc
        )
      )
    })

    const unsubscribeTriageVerified = subscribeToEvent('incident.triage_verified', (payload) => {
      if (!payload) return
      const incId = payload.incident_id || payload.id
      if (!incId) return
      if (payload.incident) {
        setIncidents((prev) =>
          prev.map((inc) => (inc.id === incId ? normalizeIncident(payload.incident) : inc))
        )
      } else {
        refetch(true)
      }
    })

    // Listen for photo attachment upload events
    const unsubscribeAttachment = subscribeToEvent('attachment.uploaded', (payload) => {
      if (!payload) return
      const incId = payload.incident_id
      if (!incId || !payload.attachment) return
      setIncidents((prev) =>
        prev.map((inc) => {
          if (inc.id === incId) {
            const existing = inc.attachments || []
            if (existing.some((a) => a.id === payload.attachment.id)) return inc
            return {
              ...inc,
              attachments: [payload.attachment, ...existing],
            }
          }
          return inc
        })
      )
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
      unsubscribeAttachment()
      unsubscribeConn()
      if (arrivalTimerRef.current) {
        clearTimeout(arrivalTimerRef.current)
      }
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
        const normalized = normalizeIncident(result.data)
        setIncidents((prev) =>
          prev.map((inc) => (inc.id === incidentId ? { ...inc, ...normalized } : inc))
        )
        return { success: true, incident: normalized }
      } else {
        return {
          success: false,
          error: result.error?.message || 'Failed to update status',
        }
      }
    },
    [isUpdatingStatus]
  )

  // -------------------------------------------------------------------------
  // 5. Explicit Demo Mode Switch & Seeding
  // -------------------------------------------------------------------------
  const toggleDemoMode = useCallback(
    async (enableDemo) => {
      setIsLoading(true)
      if (enableDemo) {
        localStorage.setItem('salvus_demo_mode', 'true')
        setDataMode('SIMULATED')
        await seedDevIncidents()
      } else {
        localStorage.removeItem('salvus_demo_mode')
        setDataMode('LIVE')
      }
      await refetch()
      setIsLoading(false)
    },
    [refetch]
  )

  const resetDemoState = useCallback(async () => {
    setIsLoading(true)
    await resetDevDatabase()
    await refetch()
    setIsLoading(false)
  }, [refetch])

  // Computed live metrics from real incidents
  const computedMetrics = useMemo(() => {
    const active = incidents.filter((inc) => !['RESOLVED', 'CANCELLED'].includes(inc.status))
    const activeSos = active.filter((inc) => Boolean(inc.is_sos))
    const critical = active.filter((inc) => inc.severity === 'CRITICAL')
    const resolved = incidents.filter((inc) => inc.status === 'RESOLVED')
    const triagePending = active.filter((inc) =>
      ['NEW', 'TRIAGE_PENDING', 'AWAITING_DISPATCH'].includes(inc.status)
    )

    return {
      active: active.length,
      sosCount: activeSos.length,
      activeSos: activeSos.length,
      critical: critical.length,
      resolved: resolved.length,
      triagePending: triagePending.length,
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
    dataMode,
    connectivityStatus,
    lastSynchronizedAt,
    newlyArrivedId,
    changeStatus,
    isUpdatingStatus,
    computedMetrics,
    toggleDemoMode,
    resetDemoState,
    refetch,
  }
}

export default useAuthorityIncidents
