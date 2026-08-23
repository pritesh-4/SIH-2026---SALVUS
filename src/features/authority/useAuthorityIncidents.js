import { useState, useEffect, useCallback, useMemo } from 'react'
import { fetchIncidents, updateIncidentStatus } from '../../services/api'
import {
  joinRoom,
  leaveRoom,
  subscribeToEvent,
  onSocketStatusChange,
} from '../../lib/realtime/socket'

const STATUS_RANKS = {
  NEW: 1,
  TRIAGE_PENDING: 2,
  VERIFIED: 3,
  RESOLVED: 4,
  CANCELLED: 4,
}

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

    if (result.success) {
      setIncidents(result.data || [])
      if (result.data && result.data.length > 0) {
        setSelectedIncidentId((prev) => prev || result.data[0].id)
      }
    } else {
      if (!silent) {
        setError(result.error?.message || 'Failed to fetch incident queue from backend')
      }
    }
    if (!silent) setIsLoading(false)
  }, [])

  useEffect(() => {
    let isMounted = true

    fetchIncidents().then((result) => {
      if (!isMounted) return
      if (result.success) {
        setIncidents(result.data || [])
        if (result.data && result.data.length > 0) {
          setSelectedIncidentId((prev) => prev || result.data[0].id)
        }
      } else {
        setError(result.error?.message || 'Failed to fetch incident queue from backend')
      }
      setIsLoading(false)
    })

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
    const unsubscribeNew = subscribeToEvent('incident:new', (payload) => {
      console.log('[Authority Realtime] New incident received:', payload.ticket_id || payload.id)

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
    const unsubscribeStatus = subscribeToEvent('incident:status_changed', (payload) => {
      const incId = payload.id || payload.incident_id
      const targetStatus = payload.status

      console.log(
        `[Authority Realtime] Incident status changed: ${payload.ticket_id || incId} -> ${targetStatus}`
      )

      setIncidents((prev) =>
        prev.map((inc) => {
          if (inc.id === incId) {
            const currentRank = STATUS_RANKS[inc.status] || 0
            const incomingRank = STATUS_RANKS[targetStatus] || 0

            // Event ordering protection: do not regress status if an older packet arrives late
            if (incomingRank < currentRank && inc.status !== 'CANCELLED') {
              console.warn(
                `[Authority Guard] Out-of-order event rejected: ${targetStatus} (rank ${incomingRank}) < current ${inc.status} (rank ${currentRank})`
              )
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
