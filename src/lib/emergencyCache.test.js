import test from 'node:test'
import assert from 'node:assert/strict'
import {
  EMERGENCY_CACHE_KEY,
  LEGACY_INCIDENT_ID_KEY,
  generateIdempotencyKey,
  saveEmergencyCache,
  loadEmergencyCache,
  clearEmergencyCache,
  isCacheStale,
  formatSyncFreshness,
} from './emergencyCache.js'

// Simple mock storage for Node environment
class MockLocalStorage {
  constructor() {
    this.store = {}
  }
  getItem(key) {
    return this.store[key] || null
  }
  setItem(key, value) {
    this.store[key] = String(value)
  }
  removeItem(key) {
    delete this.store[key]
  }
  clear() {
    this.store = {}
  }
}

globalThis.localStorage = new MockLocalStorage()

test('Emergency Cache - generateIdempotencyKey creates unique keys', () => {
  const key1 = generateIdempotencyKey('sos')
  const key2 = generateIdempotencyKey('sos')

  assert.ok(key1.startsWith('sos_'))
  assert.ok(key2.startsWith('sos_'))
  assert.notEqual(key1, key2)
})

test('Emergency Cache - save and load active emergency with metadata', () => {
  localStorage.clear()

  const incident = {
    id: 'inc-12345',
    ticket_id: 'SV-9999',
    status: 'EN_ROUTE',
    type: 'flood',
    severity: 'CRITICAL',
  }
  const responder = {
    id: 'resp-1',
    unit_name: 'NDRF Unit 4',
  }

  saveEmergencyCache(incident, responder)

  const loaded = loadEmergencyCache()
  assert.ok(loaded)
  assert.equal(loaded.incidentId, 'inc-12345')
  assert.equal(loaded.ticketId, 'SV-9999')
  assert.equal(loaded.lastKnownStatus, 'EN_ROUTE')
  assert.equal(loaded.lastKnownUiState, 'EN_ROUTE')
  assert.equal(loaded.source, 'LAST_KNOWN_CACHE')
  assert.ok(loaded.lastSyncedAt)
  assert.equal(loaded.cachedResponder.unit_name, 'NDRF Unit 4')

  // Verify legacy storage key was also set
  assert.equal(localStorage.getItem(LEGACY_INCIDENT_ID_KEY), 'inc-12345')
})

test('Emergency Cache - terminal state automatically purges active cache', () => {
  localStorage.clear()

  const incidentResolved = {
    id: 'inc-12345',
    ticket_id: 'SV-9999',
    status: 'RESOLVED',
  }

  saveEmergencyCache(incidentResolved)

  const loaded = loadEmergencyCache()
  assert.equal(loaded, null)
  assert.equal(localStorage.getItem(EMERGENCY_CACHE_KEY), null)
  assert.equal(localStorage.getItem(LEGACY_INCIDENT_ID_KEY), null)

  // Explicit clearEmergencyCache test
  localStorage.setItem(EMERGENCY_CACHE_KEY, JSON.stringify({ incidentId: '123' }))
  clearEmergencyCache()
  assert.equal(localStorage.getItem(EMERGENCY_CACHE_KEY), null)
})

test('Emergency Cache - isCacheStale correctly checks time threshold', () => {
  const freshCache = {
    lastSyncedAt: new Date(Date.now() - 5000).toISOString(), // 5 seconds ago
  }
  assert.equal(isCacheStale(freshCache, 20), false)

  const staleCache = {
    lastSyncedAt: new Date(Date.now() - 35000).toISOString(), // 35 seconds ago
  }
  assert.equal(isCacheStale(staleCache, 20), true)

  assert.equal(isCacheStale(null), true)
  assert.equal(isCacheStale({}), true)
})

test('Emergency Cache - formatSyncFreshness text output', () => {
  const justNow = new Date(Date.now() - 2000).toISOString()
  assert.equal(formatSyncFreshness(justNow), 'Just now')

  const secAgo = new Date(Date.now() - 30000).toISOString()
  assert.equal(formatSyncFreshness(secAgo), '30s ago')

  const minAgo = new Date(Date.now() - 125000).toISOString()
  assert.equal(formatSyncFreshness(minAgo), '2m ago')

  assert.equal(formatSyncFreshness(null), 'Not yet synchronized')
})
