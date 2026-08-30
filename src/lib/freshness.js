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

    if (diffSeconds < 45) return 'Updated just now'
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

export default formatRelativeFreshness
