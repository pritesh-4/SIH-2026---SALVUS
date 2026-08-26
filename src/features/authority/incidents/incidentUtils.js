export const getStatusBadge = (status) => {
  switch (status) {
    case 'NEW':
      return { label: 'NEW', classes: 'bg-amber-950/40 text-amber-300 border-amber-500/40' }
    case 'TRIAGE_PENDING':
      return {
        label: 'TRIAGE PENDING',
        classes: 'bg-amber-950/30 text-amber-400 border-amber-500/30',
      }
    case 'VERIFIED':
      return { label: 'VERIFIED', classes: 'bg-blue-950/40 text-blue-300 border-blue-500/40' }
    case 'ASSIGNED':
      return {
        label: 'ASSIGNED',
        classes: 'bg-sky-950/50 text-sky-300 border-sky-500/40',
      }
    case 'EN_ROUTE':
      return {
        label: 'EN ROUTE',
        classes: 'bg-indigo-950/50 text-indigo-300 border-indigo-500/40 animate-pulse',
      }
    case 'NEARBY':
      return {
        label: 'NEARBY (<100M)',
        classes: 'bg-amber-950/60 text-amber-300 border-amber-500/50 animate-ping',
      }
    case 'ON_SCENE':
      return {
        label: 'ON SCENE',
        classes: 'bg-emerald-950/50 text-emerald-300 border-emerald-500/40',
      }
    case 'RESOLVED':
      return {
        label: 'RESOLVED',
        classes: 'bg-emerald-950/40 text-emerald-400 border-emerald-500/30',
      }
    case 'CANCELLED':
      return { label: 'CANCELLED', classes: 'bg-slate-900 text-slate-400 border-slate-700' }
    default:
      return { label: status, classes: 'bg-slate-900 text-slate-400 border-slate-700' }
  }
}

export const getSeverityBadge = (severity) => {
  switch (severity) {
    case 'CRITICAL':
      return { label: 'CRITICAL', classes: 'bg-rose-950/50 text-rose-300 border-rose-500/50' }
    case 'HIGH':
      return { label: 'HIGH', classes: 'bg-amber-950/40 text-amber-300 border-amber-500/40' }
    case 'MEDIUM':
      return { label: 'MEDIUM', classes: 'bg-slate-900 text-slate-300 border-slate-700' }
    case 'LOW':
      return { label: 'LOW', classes: 'bg-slate-900/60 text-slate-400 border-slate-800' }
    default:
      return { label: severity, classes: 'bg-slate-900 text-slate-400 border-slate-800' }
  }
}

export const filterIncidents = (incidents, filterType) => {
  if (!incidents || !Array.isArray(incidents)) return []
  return incidents.filter((inc) => {
    if (filterType === 'immediate') {
      return inc.severity === 'CRITICAL' || inc.is_sos || inc.status === 'NEW'
    }
    if (filterType === 'review') {
      return ['NEW', 'TRIAGE_PENDING'].includes(inc.status)
    }
    if (filterType === 'response') {
      return ['VERIFIED', 'ASSIGNED', 'EN_ROUTE', 'NEARBY', 'ON_SCENE'].includes(inc.status)
    }
    if (filterType === 'resolved') {
      return ['RESOLVED', 'CANCELLED'].includes(inc.status)
    }
    return true
  })
}

export const calculateDistanceKm = (lat1, lon1, lat2, lon2) => {
  if (!lat1 || !lon1 || !lat2 || !lon2) return 1.2
  const R = 6371
  const dLat = ((lat2 - lat1) * Math.PI) / 180
  const dLon = ((lon2 - lon1) * Math.PI) / 180
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2)
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  return Math.round(R * c * 10) / 10
}
