import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { AlertTriangle, ChevronRight, ShieldCheck, CheckCircle2 } from 'lucide-react'
import { fetchIncidentById } from '../../services/api'
import { joinRoom, leaveRoom, subscribeToEvent } from '../../lib/realtime/socket'

export const ActiveEmergencyBanner = () => {
  const navigate = useNavigate()
  const [activeIncidentId, setActiveIncidentId] = useState(() => {
    return localStorage.getItem('salvus_active_incident_id')
  })
  const [incidentData, setIncidentData] = useState(null)

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
        if (payload.status === 'RESOLVED' || payload.status === 'CANCELLED') {
          setIncidentData((p) => (p ? { ...p, status: payload.status } : null))
        } else {
          setIncidentData((p) => (p ? { ...p, status: payload.status } : null))
        }
      }
    }

    const handleAssign = (payload) => {
      if (!isMounted) return
      if (payload.incident_id === activeIncidentId || payload.id === activeIncidentId) {
        if (payload.responder) {
          setIncidentData((p) => (p ? { ...p, assigned_responder: payload.responder } : p))
        }
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

  return (
    <div
      role="banner"
      onClick={handleNavigate}
      className={`w-full py-2.5 px-4 sm:px-8 border-b text-xs font-mono transition-all cursor-pointer shadow-lg flex items-center justify-between gap-3 ${
        isResolved
          ? 'bg-emerald-950/90 border-emerald-500/40 text-emerald-200 hover:bg-emerald-900/90'
          : isAssigned
            ? 'bg-sky-950/95 border-sky-500/50 text-sky-200 hover:bg-sky-900/95 animate-pulse'
            : 'bg-rose-950/95 border-rose-500/50 text-rose-200 hover:bg-rose-900/95'
      }`}
    >
      <div className="flex items-center gap-2.5 truncate">
        {isResolved ? (
          <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />
        ) : isAssigned ? (
          <ShieldCheck className="h-4 w-4 text-sky-400 shrink-0 animate-bounce" />
        ) : (
          <AlertTriangle className="h-4 w-4 text-rose-400 shrink-0 animate-ping" />
        )}

        <div className="truncate">
          <span className="font-bold uppercase tracking-wider mr-2">
            {isResolved
              ? '✓ RESCUE COMPLETE:'
              : isAssigned
                ? '⚡ HELP IS ON THE WAY:'
                : '🚨 ACTIVE SOS BEACON:'}
          </span>
          <span className="text-slate-200">
            {isResolved
              ? 'Incident safely resolved by response team.'
              : isAssigned
                ? `${incidentData.assigned_responder?.unit_name || 'Response Unit'} dispatched (${incidentData.status.replace('_', ' ')})`
                : 'Salvus Command coordinator is reviewing your beacon.'}
          </span>
        </div>
      </div>

      <div className="flex items-center gap-2 shrink-0">
        <span className="hidden sm:inline font-bold uppercase text-[10px] bg-black/40 px-2 py-0.5 rounded border border-white/10">
          Ticket #{incidentData.ticket_id || 'SV-ACTIVE'}
        </span>
        <button
          type="button"
          onClick={handleNavigate}
          className="flex items-center gap-1 font-bold text-white bg-white/10 hover:bg-white/20 px-2.5 py-1 rounded text-[11px] transition-colors"
        >
          <span>Track Live</span>
          <ChevronRight className="h-3.5 w-3.5" />
        </button>
        {isResolved && (
          <button
            type="button"
            onClick={handleDismiss}
            className="text-slate-400 hover:text-white text-[11px] px-1.5 py-0.5"
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
