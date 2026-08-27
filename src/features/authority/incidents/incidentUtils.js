export const getStatusBadge = (status) => {
  switch (status) {
    case 'NEW':
      return { label: 'New', variant: 'warning', dot: true }
    case 'TRIAGE_PENDING':
      return { label: 'Triage Pending', variant: 'warning', dot: true }
    case 'VERIFIED':
      return { label: 'Verified', variant: 'info', dot: false }
    case 'ASSIGNED':
      return { label: 'Assigned', variant: 'info', dot: true }
    case 'EN_ROUTE':
      return { label: 'En Route', variant: 'info', dot: true }
    case 'NEARBY':
      return { label: 'Nearby (<100m)', variant: 'warning', dot: true }
    case 'ON_SCENE':
      return { label: 'On Scene', variant: 'safe', dot: true }
    case 'RESOLVED':
      return { label: 'Resolved', variant: 'safe', dot: false }
    case 'CANCELLED':
      return { label: 'Cancelled', variant: 'neutral', dot: false }
    default:
      return { label: status, variant: 'neutral', dot: false }
  }
}

export const getSeverityBadge = (severity) => {
  switch (severity) {
    case 'CRITICAL':
      return { label: 'Critical', variant: 'critical', dot: true }
    case 'HIGH':
      return { label: 'High', variant: 'warning', dot: false }
    case 'MEDIUM':
      return { label: 'Medium', variant: 'neutral', dot: false }
    case 'LOW':
      return { label: 'Low', variant: 'neutral', dot: false }
    default:
      return { label: severity, variant: 'neutral', dot: false }
  }
}

export const filterIncidents = (incidents, filterType) => {
  if (!incidents || !Array.isArray(incidents)) return []
  return incidents.filter((inc) => {
    if (filterType === 'immediate') {
      return (
        inc.severity === 'CRITICAL' ||
        inc.is_sos ||
        (inc.status === 'NEW' && inc.severity !== 'LOW')
      )
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
