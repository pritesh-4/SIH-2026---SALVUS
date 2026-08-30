import test from 'node:test'
import assert from 'node:assert/strict'
import { EMERGENCY_STATE, validateTransition, shouldAcceptStatusUpdate } from '../stateMachine.js'
import { loadEmergencyCache, saveEmergencyCache } from '../emergencyCache.js'
import { RouteManager } from '../../services/routingService.js'

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

test('Adversarial QA - Out-of-order realtime packet rejection', () => {
  // Incident has reached ON_SCENE (rank 5)
  const currentStatus = 'ON_SCENE'

  // Delayed packet with EN_ROUTE (rank 3) arrives
  const delayedEnRoute = shouldAcceptStatusUpdate(currentStatus, 'EN_ROUTE')
  assert.equal(delayedEnRoute, false, 'Stale lower-ranked status packet must be rejected')

  // Delayed packet with ASSIGNED (rank 2) arrives
  const delayedAssigned = shouldAcceptStatusUpdate(currentStatus, 'ASSIGNED')
  assert.equal(delayedAssigned, false, 'Stale ASSIGNED packet must be rejected')

  // Terminal state RESOLVED (rank 6)
  const delayedOnSceneWhenResolved = shouldAcceptStatusUpdate('RESOLVED', 'ON_SCENE')
  assert.equal(delayedOnSceneWhenResolved, false, 'Terminal state RESOLVED cannot be regressed')

  const delayedCancelWhenResolved = shouldAcceptStatusUpdate('RESOLVED', 'CANCELLED')
  assert.equal(
    delayedCancelWhenResolved,
    false,
    'Terminal state RESOLVED cannot be overwritten by CANCELLED'
  )
})

test('Adversarial QA - Duplicate event packet idempotence', () => {
  // Same status arrives twice (e.g. repeated broadcast)
  assert.equal(shouldAcceptStatusUpdate('EN_ROUTE', 'EN_ROUTE'), true)
  assert.equal(shouldAcceptStatusUpdate('NEARBY', 'NEARBY'), true)
})

test('Adversarial QA - Cancellation invariant against terminal states', () => {
  // Cannot cancel if already RESOLVED
  assert.equal(validateTransition(EMERGENCY_STATE.RESOLVED, EMERGENCY_STATE.CANCELLED), false)
  assert.equal(validateTransition(EMERGENCY_STATE.CANCELLED, EMERGENCY_STATE.CANCELLED), false)

  // Can cancel from any active non-terminal state
  assert.equal(validateTransition(EMERGENCY_STATE.SOS_ACTIVE, EMERGENCY_STATE.CANCELLED), true)
  assert.equal(validateTransition(EMERGENCY_STATE.TRIAGING, EMERGENCY_STATE.CANCELLED), true)
  assert.equal(validateTransition(EMERGENCY_STATE.ASSIGNED, EMERGENCY_STATE.CANCELLED), true)
  assert.equal(validateTransition(EMERGENCY_STATE.EN_ROUTE, EMERGENCY_STATE.CANCELLED), true)
  assert.equal(validateTransition(EMERGENCY_STATE.NEARBY, EMERGENCY_STATE.CANCELLED), true)
  assert.equal(validateTransition(EMERGENCY_STATE.ON_SCENE, EMERGENCY_STATE.CANCELLED), true)
})

test('Adversarial QA - Cache resilience with corrupted / malformed local data', () => {
  localStorage.clear()

  // Malformed JSON in storage
  localStorage.setItem('salvus_emergency_cache', 'MALFORMED_NON_JSON_DATA')
  const loadedMalformed = loadEmergencyCache()
  assert.equal(loadedMalformed, null, 'Malformed cache must safely return null without throwing')

  // Missing or corrupted fields in storage
  localStorage.setItem('salvus_emergency_cache', JSON.stringify({ version: 'invalid' }))
  const loadedInvalid = loadEmergencyCache()
  assert.equal(loadedInvalid, null, 'Cache missing incidentId must return null')

  // Valid cache
  saveEmergencyCache({ id: 'inc-adversarial-1', ticket_id: 'SV-7777', status: 'EN_ROUTE' })
  const loadedValid = loadEmergencyCache()
  assert.notEqual(loadedValid, null)
  assert.equal(loadedValid.incidentId, 'inc-adversarial-1')
  assert.equal(loadedValid.ticketId, 'SV-7777')
  assert.equal(loadedValid.source, 'LAST_KNOWN_CACHE')
})

test('Adversarial QA - RouteManager aborts in-flight request when newer coordinates arrive', async () => {
  const manager = new RouteManager()

  // Start request 1 (simulating slower network)
  const req1Promise = manager.calculateRoute(22.57, 88.36, 22.58, 88.37)

  // Immediately start request 2 with significantly updated coordinates (faster update)
  const req2Promise = manager.calculateRoute(22.6, 88.4, 22.58, 88.37)

  const [, res2] = await Promise.all([req1Promise, req2Promise])

  assert.equal(manager.currentSeq, 2, 'Sequence counter must have advanced to 2')
  assert.notEqual(res2, null, 'Latest route request must produce a valid result')
})
