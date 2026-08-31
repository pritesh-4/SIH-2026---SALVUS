/**
 * Format timestamp or ISO string into human-friendly relative freshness label.
 * e.g. "Just now", "Updated 2m ago", "Observed 14m ago"
 */
export const formatRelativeFreshness = (timestampOrIso, prefix = 'Updated') => {
  if (!timestampOrIso) return `${prefix} recently`

  try {
    const timeMs =
      typeof timestampOrIso === 'number' ? timestampOrIso : new Date(timestampOrIso).getTime()

    if (isNaN(timeMs)) return `${prefix} recently`

    const diffSeconds = Math.max(0, Math.floor((Date.now() - timeMs) / 1000))

    if (diffSeconds < 45) return `${prefix} just now`
    const minutes = Math.floor(diffSeconds / 60)
    if (minutes < 60) return `${prefix} ${minutes}m ago`
    const hours = Math.floor(minutes / 60)
    if (hours < 24) return `${prefix} ${hours}h ago`
    const days = Math.floor(hours / 24)
    return `${prefix} ${days}d ago`
  } catch {
    return `${prefix} recently`
  }
}

/**
 * Check if a timestamp is older than the given threshold (default: 60s).
 */
export const isDataStale = (timestampOrIso, thresholdSeconds = 60) => {
  if (!timestampOrIso) return true

  try {
    const timeMs =
      typeof timestampOrIso === 'number' ? timestampOrIso : new Date(timestampOrIso).getTime()

    if (isNaN(timeMs)) return true

    const diffSeconds = Math.max(0, Math.floor((Date.now() - timeMs) / 1000))
    return diffSeconds > thresholdSeconds
  } catch {
    return true
  }
}

/**
 * Calculate complete freshness status model with UI presentation metadata.
 */
export const getFreshnessStatus = (timestampOrIso, thresholdSeconds = 60) => {
  if (!timestampOrIso) {
    return {
      label: 'Sync Pending',
      relativeText: 'Awaiting sync',
      isStale: true,
      variant: 'neutral',
    }
  }

  const stale = isDataStale(timestampOrIso, thresholdSeconds)
  const relativeText = formatRelativeFreshness(timestampOrIso, 'Synced')

  return {
    label: stale ? 'Stale Data' : 'Live Data',
    relativeText,
    isStale: stale,
    variant: stale ? 'warning' : 'safe',
  }
}

export default formatRelativeFreshness
