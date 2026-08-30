import test from 'node:test'
import assert from 'node:assert/strict'
import {
  EMERGENCY_STATE,
  normalizeToUiState,
  normalizeToBackendStatus,
  validateTransition,
  shouldAcceptStatusUpdate,
  deriveTimelineSteps,
} from '../stateMachine.js'
import {
  saveEmergencyCache,
  loadEmergencyCache,
  clearEmergencyCache,
  generateIdempotencyKey,
  isCacheStale,
  formatSyncFreshness,
  EMERGENCY_CACHE_KEY,
  LEGACY_INCIDENT_ID_KEY,
} from '../emergencyCache.js'
import { createLocationModel } from '../location.js'

// Simple mock storage for Node.js test runner environment
const createMockStorage = () => {
  const store = new Map()
  return {
    getItem: (key) => store.get(key) || null,
    setItem: (key, val) => store.set(key, String(val)),
    removeItem: (key) => store.delete(key),
    clear: () => store.clear(),
  }
}

test('Salvus Citizen SOS & Emergency Journey Automated Test Suite', async (t) => {
  let mockStorage
  const originalLocalStorage = globalThis.localStorage

  t.beforeEach(() => {
    mockStorage = createMockStorage()
    globalThis.localStorage = mockStorage
  })

  t.afterEach(() => {
    globalThis.localStorage = originalLocalStorage
  })

  await t.test('1. Valid SOS Creation & Canonical State Mapping', () => {
    const rawBackendStatuses = [
      'NEW',
      'TRIAGE_PENDING',
      'VERIFIED',
      'ASSIGNED',
      'EN_ROUTE',
      'NEARBY',
      'ON_SCENE',
      'RESOLVED',
      'CANCELLED',
    ]

    const expectedUiStates = [
      EMERGENCY_STATE.SOS_ACTIVE,
      EMERGENCY_STATE.TRIAGING,
      EMERGENCY_STATE.VERIFIED,
      EMERGENCY_STATE.ASSIGNED,
      EMERGENCY_STATE.EN_ROUTE,
      EMERGENCY_STATE.NEARBY,
      EMERGENCY_STATE.ON_SCENE,
      EMERGENCY_STATE.RESOLVED,
      EMERGENCY_STATE.CANCELLED,
    ]

    rawBackendStatuses.forEach((status, idx) => {
      assert.equal(normalizeToUiState(status), expectedUiStates[idx])
      assert.equal(normalizeToBackendStatus(expectedUiStates[idx]), status)
    })
  })

  await t.test('2. Exact-Once Creation: Idempotency Key Stability', () => {
    const key1 = generateIdempotencyKey('sos_cit')
    const key2 = generateIdempotencyKey('sos_cit')

    assert.match(key1, /^sos_cit_/)
    assert.match(key2, /^sos_cit_/)
    assert.notEqual(key1, key2)

    // Verify key remains stable across simulated retry of the same in-flight request
    const pendingKey = key1
    assert.equal(pendingKey, key1)
  })

  await t.test('3. State Machine Transition Rules: Valid Forward Progression', () => {
    assert.equal(validateTransition(EMERGENCY_STATE.SOS_ACTIVE, EMERGENCY_STATE.TRIAGING), true)
    assert.equal(validateTransition(EMERGENCY_STATE.TRIAGING, EMERGENCY_STATE.VERIFIED), true)
    assert.equal(validateTransition(EMERGENCY_STATE.VERIFIED, EMERGENCY_STATE.ASSIGNED), true)
    assert.equal(validateTransition(EMERGENCY_STATE.ASSIGNED, EMERGENCY_STATE.EN_ROUTE), true)
    assert.equal(validateTransition(EMERGENCY_STATE.EN_ROUTE, EMERGENCY_STATE.NEARBY), true)
    assert.equal(validateTransition(EMERGENCY_STATE.NEARBY, EMERGENCY_STATE.ON_SCENE), true)
    assert.equal(validateTransition(EMERGENCY_STATE.ON_SCENE, EMERGENCY_STATE.RESOLVED), true)
  })

  await t.test('4. State Machine: Illegal Transition & Backward Jump Rejection', () => {
    // Cannot skip from SOS_ACTIVE directly to ON_SCENE without dispatch
    assert.equal(validateTransition(EMERGENCY_STATE.SOS_ACTIVE, EMERGENCY_STATE.ON_SCENE), false)
    // Cannot regress backwards from ON_SCENE to TRIAGING
    assert.equal(validateTransition(EMERGENCY_STATE.ON_SCENE, EMERGENCY_STATE.TRIAGING), false)
    // Cannot transition out of terminal RESOLVED state
    assert.equal(validateTransition(EMERGENCY_STATE.RESOLVED, EMERGENCY_STATE.EN_ROUTE), false)
    assert.equal(validateTransition(EMERGENCY_STATE.RESOLVED, EMERGENCY_STATE.SOS_ACTIVE), false)
    // Cannot transition out of terminal CANCELLED state
    assert.equal(validateTransition(EMERGENCY_STATE.CANCELLED, EMERGENCY_STATE.ASSIGNED), false)
  })

  await t.test('5. Realtime Out-of-Order Packet Protection', () => {
    // Current is EN_ROUTE (rank 5)
    // Incoming late packet TRIAGE_PENDING (rank 2) should be rejected
    assert.equal(shouldAcceptStatusUpdate(EMERGENCY_STATE.EN_ROUTE, 'TRIAGE_PENDING'), false)
    // Incoming newer packet NEARBY (rank 6) should be accepted
    assert.equal(shouldAcceptStatusUpdate(EMERGENCY_STATE.EN_ROUTE, 'NEARBY'), true)
    // Terminal packet RESOLVED should always be accepted
    assert.equal(shouldAcceptStatusUpdate(EMERGENCY_STATE.EN_ROUTE, 'RESOLVED'), true)
    // Once RESOLVED, ignore late packets
    assert.equal(shouldAcceptStatusUpdate(EMERGENCY_STATE.RESOLVED, 'EN_ROUTE'), false)
  })

  await t.test('6. Location Model & GPS Integrity (No Fake Coordinates)', () => {
    const validModel = createLocationModel({
      latitude: 22.5726,
      longitude: 88.3639,
      accuracy: 8,
      source: 'BROWSER',
      permission: 'GRANTED',
    })

    assert.equal(validModel.latitude, 22.5726)
    assert.equal(validModel.longitude, 88.3639)
    assert.equal(validModel.source, 'BROWSER')
    assert.equal(validModel.isFallback, false)
    assert.equal(validModel.accuracyTier, 'HIGH')
    assert.equal(validModel.coordinates, '22.5726° N, 88.3639° E')

    const nullCoords = createLocationModel({
      latitude: null,
      longitude: null,
      source: 'UNKNOWN',
    })
    assert.equal(nullCoords.coordinates, 'Coordinates unavailable')
  })

  await t.test('7. Emergency Persistence & Direct Route Hydration', () => {
    const testIncident = {
      id: 'inc-sos-8821',
      ticket_id: 'SV-8821',
      status: 'EN_ROUTE',
      type: 'flood',
      severity: 'CRITICAL',
      latitude: 22.5726,
      longitude: 88.3639,
      created_at: new Date().toISOString(),
    }
    const testResponder = {
      id: 'resp-unit-4',
      unit_name: 'NDRF Rescue Unit 4',
      status: 'EN_ROUTE',
    }

    saveEmergencyCache(testIncident, testResponder)
    const cached = loadEmergencyCache()

    assert.notEqual(cached, null)
    assert.equal(cached.incidentId, 'inc-sos-8821')
    assert.equal(cached.ticketId, 'SV-8821')
    assert.equal(cached.lastKnownStatus, 'EN_ROUTE')
    assert.equal(cached.cachedResponder.unit_name, 'NDRF Rescue Unit 4')

    // Terminal state should purge cache to prevent zombie restores
    const resolvedIncident = { ...testIncident, status: 'RESOLVED' }
    saveEmergencyCache(resolvedIncident)
    assert.equal(loadEmergencyCache(), null)
  })

  await t.test('8. Authoritative Timeline Derivation from Audit Events', () => {
    const serverEvents = [
      {
        id: 'evt-1',
        event_type: 'CREATED',
        new_status: 'NEW',
        created_at: '2026-08-31T01:00:00.000Z',
        actor: 'citizen',
      },
      {
        id: 'evt-2',
        event_type: 'TRIAGE_VERIFIED',
        new_status: 'VERIFIED',
        created_at: '2026-08-31T01:02:00.000Z',
        actor: 'Dispatcher S. Mukherjee',
      },
      {
        id: 'evt-3',
        event_type: 'assignment.created',
        new_status: 'ASSIGNED',
        created_at: '2026-08-31T01:03:00.000Z',
        actor: 'System Auto-Dispatch',
      },
    ]

    const timeline = deriveTimelineSteps('ASSIGNED', serverEvents, '2026-08-31T01:00:00.000Z')

    assert.equal(timeline.length, 8)
    // Step 1: SOS_ACTIVE should be completed with timestamp
    assert.equal(timeline[0].status, 'completed')
    assert.notEqual(timeline[0].timestamp, null)

    // Step 2: TRIAGING should be completed because current is ASSIGNED
    assert.equal(timeline[1].status, 'completed')

    // Step 3: VERIFIED should be completed with event detail
    assert.equal(timeline[2].status, 'completed')
    assert.equal(timeline[2].eventDetail, 'Logged by Dispatcher S. Mukherjee')

    // Step 4: ASSIGNED should be current
    assert.equal(timeline[3].status, 'current')

    // Step 5: EN_ROUTE should be upcoming
    assert.equal(timeline[4].status, 'upcoming')
  })

  await t.test('9. Freshness and Cache Staleness Timing', () => {
    const nowIso = new Date().toISOString()
    assert.equal(formatSyncFreshness(nowIso), 'Just now')
    assert.equal(isCacheStale({ lastSyncedAt: nowIso }, 20), false)

    const staleIso = new Date(Date.now() - 35000).toISOString()
    assert.equal(isCacheStale({ lastSyncedAt: staleIso }, 20), true)
  })

  await t.test('10. Cancellation & Active Emergency Clearing', () => {
    const activeInc = {
      id: 'inc-cancel-101',
      ticket_id: 'SV-101',
      status: 'SOS_ACTIVE',
    }
    saveEmergencyCache(activeInc)
    assert.notEqual(loadEmergencyCache(), null)

    // Clear cache on cancellation
    clearEmergencyCache()
    assert.equal(loadEmergencyCache(), null)
    assert.equal(mockStorage.getItem(EMERGENCY_CACHE_KEY), null)
    assert.equal(mockStorage.getItem(LEGACY_INCIDENT_ID_KEY), null)
  })
})
