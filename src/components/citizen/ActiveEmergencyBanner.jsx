import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { fetchIncidentById } from '../../services/api'
import { joinRoom, leaveRoom, subscribeToEvent } from '../../lib/realtime/socket'
import { shouldAcceptStatusUpdate, normalizeToBackendStatus } from '../../lib/stateMachine'
import { loadEmergencyCache } from '../../lib/emergencyCache'
import { Badge } from '../ui/Badge'

export const ActiveEmergencyBanner = () => {
  const navigate = useNavigate()
  const [activeIncidentId, setActiveIncidentId] = useState(() => {
    const cache = loadEmergencyCache()
    return cache?.incidentId || localStorage.getItem('salvus_active_incident_id') || null
  })
  const [incidentData, setIncidentData] = useState(() => {
    const cache = loadEmergencyCache()
    return cache?.cachedIncident || null
  })

  const checkStorage = useCallback(() => {
    const id = localStorage.getItem('salvus_active_incident_id')
    if (id !== activeIncidentId) {
      setActiveIncidentId(id)
    }
  }, [activeIncidentId])

  useEffect(() => {
    window.addEventListener('storage', checkStorage)
    const interval = setInterval(checkStorage, 2000)
    return () => {
      window.removeEventListener('storage', checkStorage)
      clearInterval(interval)
    }
  }, [checkStorage])

  useEffect(() => {
    if (!activeIncidentId) return

    let isMounted = true

    const load = async () => {
      const res = await fetchIncidentById(activeIncidentId)
      if (res.success && res.data && isMounted) {
        setIncidentData(res.data)
      } else if (isMounted) {
        setIncidentData(null)
      }
    }

    load()

    const room = `incident:${activeIncidentId}`
    joinRoom(room)

    const handleStatus = (payload) => {
      if (!isMounted) return
      if (payload.incident_id === activeIncidentId || payload.id === activeIncidentId) {
        const incomingStatus = normalizeToBackendStatus(payload.status)
        setIncidentData((prev) => {
          if (!prev) return null
          if (!shouldAcceptStatusUpdate(prev.status, incomingStatus)) {
            return prev
          }
          return { ...prev, status: incomingStatus }
        })
      }
    }

    const handleAssign = (payload) => {
      if (!isMounted) return
      if (payload.incident_id === activeIncidentId || payload.id === activeIncidentId) {
        const incomingStatus = normalizeToBackendStatus(payload.status || 'ASSIGNED')
        setIncidentData((prev) => {
          if (!prev) return null
          const next = { ...prev }
          if (payload.responder) {
            next.assigned_responder = payload.responder
          }
          if (shouldAcceptStatusUpdate(prev.status, incomingStatus)) {
            next.status = incomingStatus
          }
          return next
        })
      }
    }

    const unsub1 = subscribeToEvent('incident.response_state_changed', handleStatus)
    const unsub2 = subscribeToEvent('assignment.created', handleAssign)
    const unsub3 = subscribeToEvent('assignment.status_changed', handleAssign)

    return () => {
      isMounted = false
      leaveRoom(room)
      unsub1()
      unsub2()
      unsub3()
    }
  }, [activeIncidentId])

  if (!activeIncidentId || !incidentData) return null
  if (incidentData.status === 'CANCELLED') return null

  const isResolved = incidentData.status === 'RESOLVED'
  const isAssigned = ['ASSIGNED', 'EN_ROUTE', 'NEARBY', 'ON_SCENE'].includes(incidentData.status)

  const handleDismiss = (e) => {
    e.stopPropagation()
    localStorage.removeItem('salvus_active_incident_id')
    setActiveIncidentId(null)
    setIncidentData(null)
  }

  const handleNavigate = () => {
    navigate(`/citizen/sos?incidentId=${activeIncidentId}`)
  }

  const getBannerStyle = () => {
    if (isResolved) return 'bg-salvus-safe-bg border-salvus-safe-border text-salvus-safe-text'
    if (isAssigned) return 'bg-salvus-info-bg border-salvus-info-border text-salvus-info-text'
    return 'bg-salvus-critical-bg border-salvus-critical-border text-salvus-critical-text'
  }

  return (
    <div
      role="banner"
      onClick={handleNavigate}
      className={`w-full py-2.5 px-4 sm:px-8 border-b text-xs transition-colors cursor-pointer shadow-xs flex items-center justify-between gap-3 ${getBannerStyle()}`}
    >
      <div className="flex items-center gap-2.5 min-w-0">
        <span className="text-base shrink-0" aria-hidden="true">
          {isResolved ? '✅' : isAssigned ? '🚤' : '🚨'}
        </span>

        <div className="truncate text-xs sm:text-sm">
          <strong className="mr-2 font-bold">
            {isResolved
              ? 'Rescue Complete:'
              : isAssigned
                ? 'Help is on the way:'
                : 'Emergency Request Active:'}
          </strong>
          <span className="opacity-90">
            {isResolved
              ? 'Incident safely resolved by response team.'
              : isAssigned
                ? `${incidentData.assigned_responder?.unit_name || 'Rescue Team'} is on the way`
                : 'Your location is shared with emergency coordinators.'}
          </span>
        </div>
      </div>

      <div className="flex items-center gap-2.5 shrink-0">
        <Badge variant={isResolved ? 'safe' : isAssigned ? 'info' : 'critical'} isMono={true}>
          #{incidentData.ticket_id || 'SOS-ACTIVE'}
        </Badge>

        <span className="font-semibold text-xs underline">View Live Status →</span>

        {isResolved && (
          <button
            type="button"
            onClick={handleDismiss}
            className="hover:opacity-75 text-xs p-1 select-none cursor-pointer"
            title="Dismiss notification"
          >
            ✕
          </button>
        )}
      </div>
    </div>
  )
}

export default ActiveEmergencyBanner
