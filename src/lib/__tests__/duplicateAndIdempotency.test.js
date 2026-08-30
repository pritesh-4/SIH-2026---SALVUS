import test from 'node:test'
import assert from 'node:assert/strict'
import {
  EMERGENCY_STATE,
  normalizeToUiState,
  shouldAcceptStatusUpdate,
  getStatusRank,
} from '../stateMachine.js'
import {
  generateIdempotencyKey,
  saveEmergencyCache,
  loadEmergencyCache,
} from '../emergencyCache.js'
import {
  broadcastEmergencyEvent,
  subscribeEmergencyBroadcast,
  EMERGENCY_BROADCAST_EVENTS,
} from '../emergencyBroadcast.js'

// In-memory mock storage for Node environment
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

test('Salvus Pass 3A: Duplicate Action & Idempotency Hardening Suite', async (t) => {
  t.beforeEach(() => {
    localStorage.clear()
  })

  await t.test('1. Double-click & Rapid Triple-Click SOS Debounce / Lock Simulation', () => {
    let submittingState = 'idle'
    let dispatchedCount = 0

    const triggerSos = () => {
      // In-flight guard
      if (submittingState === 'submitting') {
        return false
      }
      submittingState = 'submitting'
      dispatchedCount += 1
      return true
    }

    // 1. First click succeeds and enters submitting
    const click1 = triggerSos()
    assert.equal(click1, true)
    assert.equal(dispatchedCount, 1)

    // 2. Rapid second click is blocked by lock
    const click2 = triggerSos()
    assert.equal(click2, false)
    assert.equal(dispatchedCount, 1)

    // 3. Rapid third click is blocked by lock
    const click3 = triggerSos()
    assert.equal(click3, false)
    assert.equal(dispatchedCount, 1)

    // 4. Reset to idle upon completion
    submittingState = 'idle'
    const legitimateNextClick = triggerSos()
    assert.equal(legitimateNextClick, true)
    assert.equal(dispatchedCount, 2)
  })

  await t.test('2. Client-Generated Idempotency Key Stability Across Retries', () => {
    let pendingIdempotencyKey = null

    const getOrGenerateKey = () => {
      if (!pendingIdempotencyKey) {
        pendingIdempotencyKey = generateIdempotencyKey('sos_cit')
      }
      return pendingIdempotencyKey
    }

    // First attempt generates key
    const key1 = getOrGenerateKey()
    assert.ok(key1.startsWith('sos_cit_'))

    // Retry 1 after timeout uses SAME key
    const key2 = getOrGenerateKey()
    assert.equal(key1, key2, 'Retry MUST reuse the exact same idempotency key')

    // Retry 2 uses SAME key
    const key3 = getOrGenerateKey()
    assert.equal(key1, key3, 'Retry MUST reuse the exact same idempotency key')

    // On successful server completion, key is reset
    pendingIdempotencyKey = null

    // A brand new emergency creates a new unique key
    const keyNewEmergency = getOrGenerateKey()
    assert.notEqual(key1, keyNewEmergency)
  })

  await t.test('3. Duplicate Realtime Event Packet Deduplication', () => {
    const processedEvents = new Set()
    let statusAppliedCount = 0

    const isDuplicateEvent = (evtKey) => {
      if (!evtKey) return false
      if (processedEvents.has(evtKey)) return true
      processedEvents.add(evtKey)
      return false
    }

    const packet = {
      incident_id: 'inc-pass3a-101',
      status: 'NEARBY',
      updated_at: '2026-08-30T10:00:00Z',
    }
    const eventKey = `${packet.incident_id}_status_${packet.status}_${packet.updated_at}`

    // Arrival 1
    if (!isDuplicateEvent(eventKey)) {
      statusAppliedCount += 1
    }
    assert.equal(statusAppliedCount, 1)

    // Duplicate Arrival 2
    if (!isDuplicateEvent(eventKey)) {
      statusAppliedCount += 1
    }
    assert.equal(statusAppliedCount, 1, 'Duplicate realtime packet was ignored')

    // Duplicate Arrival 3
    if (!isDuplicateEvent(eventKey)) {
      statusAppliedCount += 1
    }
    assert.equal(statusAppliedCount, 1, 'Duplicate realtime packet was ignored')
  })

  await t.test('4. Out-of-Order Packet Guard & Terminal Invariants', () => {
    // Current client state is ON_SCENE (rank 7)
    const currentState = EMERGENCY_STATE.ON_SCENE

    // A delayed EN_ROUTE packet arrives
    assert.equal(shouldAcceptStatusUpdate(currentState, 'EN_ROUTE'), false)

    // A delayed ASSIGNED packet arrives
    assert.equal(shouldAcceptStatusUpdate(currentState, 'ASSIGNED'), false)

    // A delayed TRIAGE_PENDING packet arrives
    assert.equal(shouldAcceptStatusUpdate(currentState, 'TRIAGE_PENDING'), false)

    // A forward RESOLVED packet arrives
    assert.equal(shouldAcceptStatusUpdate(currentState, 'RESOLVED'), true)

    // Once in terminal RESOLVED state, no packet can regress it
    assert.equal(shouldAcceptStatusUpdate(EMERGENCY_STATE.RESOLVED, 'ON_SCENE'), false)
    assert.equal(shouldAcceptStatusUpdate(EMERGENCY_STATE.RESOLVED, 'EN_ROUTE'), false)
    assert.equal(shouldAcceptStatusUpdate(EMERGENCY_STATE.RESOLVED, 'CANCELLED'), false)
  })

  await t.test('5. Multi-Tab Concurrent SOS Submission Race Lock', async () => {
    let tabBLocked = false

    const unsubB = subscribeEmergencyBroadcast((msg) => {
      if (msg.type === EMERGENCY_BROADCAST_EVENTS.SOS_IN_FLIGHT) {
        tabBLocked = true
      } else if (msg.type === EMERGENCY_BROADCAST_EVENTS.SOS_COMPLETED) {
        tabBLocked = false
      }
    }, 'tab_B')

    // Tab A begins SOS transmission
    broadcastEmergencyEvent(EMERGENCY_BROADCAST_EVENTS.SOS_IN_FLIGHT, {}, 'tab_A')
    await new Promise((r) => setTimeout(r, 20))
    assert.equal(tabBLocked, true, 'Tab B locked from initiating conflicting submission')

    // Tab A finishes SOS transmission
    broadcastEmergencyEvent(
      EMERGENCY_BROADCAST_EVENTS.SOS_COMPLETED,
      { incidentId: 'inc-tab-pass3a' },
      'tab_A'
    )
    await new Promise((r) => setTimeout(r, 20))
    assert.equal(tabBLocked, false, 'Tab B unlocked after Tab A completes')

    unsubB()
  })

  await t.test('6. Authoritative Rehydration Overwrites Stale Recovery Hint', () => {
    // Stale local hint indicates SOS_ACTIVE
    const staleIncident = {
      id: 'inc-rehydrate-001',
      ticket_id: 'SV-4401',
      status: 'NEW',
    }
    saveEmergencyCache(staleIncident)

    const cached = loadEmergencyCache()
    assert.equal(cached.incidentId, 'inc-rehydrate-001')
    assert.equal(normalizeToUiState(cached.lastKnownStatus), EMERGENCY_STATE.SOS_ACTIVE)

    // Server authoritative payload reports dispatcher already verified and assigned unit
    const serverAuthoritativeIncident = {
      id: 'inc-rehydrate-001',
      ticket_id: 'SV-4401',
      status: 'EN_ROUTE',
    }
    const serverResponder = {
      id: 'resp-101',
      unit_name: 'NDRF Rescue Unit 4',
      status: 'EN_ROUTE',
    }

    // Reconcile
    const serverUiState = normalizeToUiState(serverAuthoritativeIncident.status)
    assert.equal(getStatusRank(serverUiState) > getStatusRank(cached.lastKnownUiState), true)
    saveEmergencyCache(serverAuthoritativeIncident, serverResponder)

    const updated = loadEmergencyCache()
    assert.equal(updated.lastKnownStatus, 'EN_ROUTE')
    assert.equal(updated.cachedResponder.unit_name, 'NDRF Rescue Unit 4')
  })

  await t.test('7. Terminal State Automatically Purges Local Cache', () => {
    const activeIncident = {
      id: 'inc-terminal-002',
      ticket_id: 'SV-4402',
      status: 'ON_SCENE',
    }
    saveEmergencyCache(activeIncident)
    assert.notEqual(loadEmergencyCache(), null)

    // Transition to RESOLVED
    const resolvedIncident = {
      id: 'inc-terminal-002',
      ticket_id: 'SV-4402',
      status: 'RESOLVED',
    }
    saveEmergencyCache(resolvedIncident)

    // Cache must be purged
    assert.equal(loadEmergencyCache(), null)
  })
})
