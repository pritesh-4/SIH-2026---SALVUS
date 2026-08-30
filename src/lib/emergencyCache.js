/**
 * Salvus Emergency Cache & Resilient Hydration Layer
 *
 * Establishes the authoritative server-first hierarchy:
 * SERVER      = Authoritative Truth
 * LOCAL CACHE = Recovery Hint / Last-Known State Only
 *
 * Guarantees safe recovery across browser refresh, tab restore, background resume,
 * and transient network disconnects without creating duplicate incidents.
 */

import { isTerminalState, normalizeToUiState } from './stateMachine.js'

export const EMERGENCY_CACHE_KEY = 'salvus_emergency_cache'
export const LEGACY_INCIDENT_ID_KEY = 'salvus_active_incident_id'
export const STALE_THRESHOLD_SECONDS = 20

/**
 * Generate a cryptographically stable client-side idempotency key for emergency actions.
 * @param {string} prefix
 * @returns {string} Stable idempotency key
 */
export const generateIdempotencyKey = (prefix = 'sos') => {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return `${prefix}_${crypto.randomUUID()}`
  }
  const timestamp = Date.now().toString(36)
  const randomPart = Math.random().toString(36).substring(2, 10)
  return `${prefix}_${timestamp}_${randomPart}`
}

const getStorage = () => {
  if (typeof window !== 'undefined' && window.localStorage) return window.localStorage
  if (typeof globalThis !== 'undefined' && globalThis.localStorage) return globalThis.localStorage
  return null
}

/**
 * Persist emergency state snapshot with metadata to localStorage.
 *
 * @param {Object} incident - Live incident record
 * @param {Object|null} responder - Assigned responder record
 * @param {Object|null} userLocation - Citizen location model
 */
export const saveEmergencyCache = (incident, responder = null, userLocation = null) => {
  const storage = getStorage()
  if (!storage) return
  if (!incident || !incident.id) return

  const uiState = normalizeToUiState(incident.status)

  // If incident is terminal, purge active emergency cache to prevent zombie restores
  if (isTerminalState(uiState) || isTerminalState(incident.status)) {
    clearEmergencyCache()
    return
  }

  const now = new Date().toISOString()
  const payload = {
    incidentId: incident.id,
    ticketId: incident.ticket_id || `SV-${incident.id.slice(-4)}`,
    lastKnownStatus: incident.status,
    lastKnownUiState: uiState,
    lastSyncedAt: now,
    cachedIncident: incident,
    cachedResponder: responder,
    cachedUserLocation: userLocation,
    source: 'LAST_KNOWN_CACHE',
    version: 1,
  }

  try {
    storage.setItem(EMERGENCY_CACHE_KEY, JSON.stringify(payload))
    storage.setItem(LEGACY_INCIDENT_ID_KEY, incident.id)
  } catch (err) {
    console.warn('[EmergencyCache] Failed to write cache to localStorage:', err)
  }
}

/**
 * Load recovery hint from localStorage.
 *
 * @returns {Object|null} Cached emergency recovery hint or null
 */
export const loadEmergencyCache = () => {
  const storage = getStorage()
  if (!storage) return null

  try {
    const raw = storage.getItem(EMERGENCY_CACHE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw)
      if (parsed && parsed.incidentId) {
        return parsed
      }
    }

    // Fallback recovery check from legacy single ID
    const legacyId = storage.getItem(LEGACY_INCIDENT_ID_KEY)
    if (legacyId) {
      return {
        incidentId: legacyId,
        ticketId: `SV-${legacyId.slice(-4)}`,
        lastKnownStatus: 'NEW',
        lastKnownUiState: 'SOS_ACTIVE',
        lastSyncedAt: null,
        cachedIncident: null,
        cachedResponder: null,
        source: 'LEGACY_ID_HINT',
        version: 1,
      }
    }
  } catch (err) {
    console.warn('[EmergencyCache] Failed to read cache from localStorage:', err)
  }

  return null
}

/**
 * Clear all emergency recovery cache records.
 */
export const clearEmergencyCache = () => {
  const storage = getStorage()
  if (!storage) return
  try {
    storage.removeItem(EMERGENCY_CACHE_KEY)
    storage.removeItem(LEGACY_INCIDENT_ID_KEY)
  } catch (err) {
    console.warn('[EmergencyCache] Failed to clear cache:', err)
  }
}

/**
 * Check if the cached emergency data is older than the staleness threshold.
 *
 * @param {Object|null} cache - Cache object
 * @param {number} thresholdSeconds - Age threshold in seconds
 * @returns {boolean} True if cache needs revalidation against backend
 */
export const isCacheStale = (cache, thresholdSeconds = STALE_THRESHOLD_SECONDS) => {
  if (!cache || !cache.lastSyncedAt) return true
  const lastSyncTime = new Date(cache.lastSyncedAt).getTime()
  const now = Date.now()
  return now - lastSyncTime > thresholdSeconds * 1000
}

/**
 * Format last synchronization timestamp into reassuring human text.
 *
 * @param {string|null} isoString - Last sync timestamp in ISO format
 * @returns {string} Human formatted sync text
 */
export const formatSyncFreshness = (isoString) => {
  if (!isoString) return 'Not yet synchronized'

  try {
    const syncTime = new Date(isoString)
    const diffSec = Math.floor((Date.now() - syncTime.getTime()) / 1000)

    if (diffSec < 5) return 'Just now'
    if (diffSec < 60) return `${diffSec}s ago`
    const mins = Math.floor(diffSec / 60)
    if (mins < 60) return `${mins}m ago`

    return syncTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  } catch {
    return 'Recently'
  }
}
