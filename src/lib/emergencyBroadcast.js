/**
 * SALVUS CROSS-TAB EMERGENCY COORDINATION (PASS 2B)
 *
 * Lightweight browser synchronization across multiple open tabs.
 * Uses BroadcastChannel when supported, with localStorage storage event fallback.
 *
 * CRITICAL RULE:
 * This channel is for real-time notification signals only.
 * Peer tabs MUST rehydrate from authoritative server truth (/api/incidents/active)
 * rather than blindly adopting untrusted peer payloads.
 */

const CHANNEL_NAME = 'salvus_emergency_sync'
const STORAGE_SIGNAL_KEY = 'salvus_emergency_cross_tab_signal'

export const EMERGENCY_BROADCAST_EVENTS = Object.freeze({
  STATE_CHANGED: 'STATE_CHANGED',
  EMERGENCY_CANCELLED: 'EMERGENCY_CANCELLED',
  EMERGENCY_RESOLVED: 'EMERGENCY_RESOLVED',
  SOS_IN_FLIGHT: 'SOS_IN_FLIGHT',
  SOS_COMPLETED: 'SOS_COMPLETED',
  CACHE_PURGED: 'CACHE_PURGED',
})

let senderChannel = null

const getSenderChannel = () => {
  if (senderChannel) return senderChannel
  if (typeof globalThis.BroadcastChannel === 'function') {
    try {
      senderChannel = new globalThis.BroadcastChannel(CHANNEL_NAME)
      if (typeof senderChannel.unref === 'function') {
        senderChannel.unref()
      }
    } catch {
      senderChannel = null
    }
  }
  return senderChannel
}

/**
 * Broadcast an emergency lifecycle event to all peer tabs.
 *
 * @param {string} eventType - One of EMERGENCY_BROADCAST_EVENTS
 * @param {Object} payload - Event metadata (incidentId, status, timestamp, etc.)
 * @param {string|null} customSourceTabId - Optional source tab ID (defaults to current tab)
 */
export const broadcastEmergencyEvent = (eventType, payload = {}, customSourceTabId = null) => {
  const message = {
    type: eventType,
    payload,
    timestamp: Date.now(),
    sourceTabId: customSourceTabId || getTabId(),
  }

  // 1. BroadcastChannel delivery (broadcasts to all other BroadcastChannel instances)
  const channel = getSenderChannel()
  if (channel) {
    try {
      channel.postMessage(message)
    } catch (err) {
      console.warn('[Cross-Tab Sync] BroadcastChannel postMessage failed:', err)
    }
  }

  // 2. Storage event fallback (for browsers/contexts without BroadcastChannel support)
  try {
    if (globalThis.localStorage) {
      globalThis.localStorage.setItem(STORAGE_SIGNAL_KEY, JSON.stringify(message))
    }
  } catch {
    // Ignore storage write errors (e.g. quota exceeded / incognito private mode)
  }
}

/**
 * Subscribe to cross-tab emergency events.
 *
 * @param {Function} handler - Callback invoked with event payload: handler({ type, payload, timestamp, sourceTabId })
 * @param {string|null} customSubscriberTabId - Optional subscriber tab ID (defaults to current tab)
 * @returns {Function} Unsubscribe cleanup function
 */
export const subscribeEmergencyBroadcast = (handler, customSubscriberTabId = null) => {
  if (typeof handler !== 'function') return () => {}

  const currentTabId = customSubscriberTabId || getTabId()
  let subscriberChannel = null

  // 1. Handle BroadcastChannel messages with dedicated receiver instance
  if (typeof globalThis.BroadcastChannel === 'function') {
    try {
      subscriberChannel = new globalThis.BroadcastChannel(CHANNEL_NAME)
      if (typeof subscriberChannel.unref === 'function') {
        subscriberChannel.unref()
      }
      subscriberChannel.onmessage = (event) => {
        if (event?.data && event.data.sourceTabId !== currentTabId) {
          handler(event.data)
        }
      }
    } catch {
      subscriberChannel = null
    }
  }

  // 2. Handle Storage event fallback
  const onStorage = (event) => {
    if (event.key === STORAGE_SIGNAL_KEY && event.newValue) {
      try {
        const parsed = JSON.parse(event.newValue)
        if (parsed && parsed.sourceTabId !== currentTabId) {
          handler(parsed)
        }
      } catch {
        // Ignore JSON parse errors from corrupted storage signals
      }
    }
  }

  if (typeof globalThis.addEventListener === 'function') {
    globalThis.addEventListener('storage', onStorage)
  }

  return () => {
    if (subscriberChannel) {
      subscriberChannel.close()
    }
    if (typeof globalThis.removeEventListener === 'function') {
      globalThis.removeEventListener('storage', onStorage)
    }
  }
}

// Unique tab instance identifier for cross-tab message filtering
let tabIdentifier = null
export const getTabId = () => {
  if (!tabIdentifier) {
    tabIdentifier = `tab_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`
  }
  return tabIdentifier
}
