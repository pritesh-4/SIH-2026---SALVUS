import test from 'node:test'
import assert from 'node:assert/strict'
import {
  INCIDENT_STATUS,
  EMERGENCY_STATE,
  STATUS_TO_STATE,
  STATE_TO_STATUS,
  STATE_ORDER,
  STATUS_RANKS,
  normalizeToUiState,
  normalizeToBackendStatus,
  isTerminalState,
  getStatusRank,
  validateTransition,
  shouldAcceptStatusUpdate,
  getNextState,
  getPreviousState,
  getAllowedNextStates,
  deriveTimelineSteps,
} from './stateMachine.js'

test('State Machine - Vocabulary & Mapping Consistency', () => {
  assert.equal(STATUS_TO_STATE[INCIDENT_STATUS.NEW], EMERGENCY_STATE.SOS_ACTIVE)
  assert.equal(STATUS_TO_STATE[INCIDENT_STATUS.TRIAGE_PENDING], EMERGENCY_STATE.TRIAGING)
  assert.equal(STATUS_TO_STATE[INCIDENT_STATUS.VERIFIED], EMERGENCY_STATE.VERIFIED)
  assert.equal(STATUS_TO_STATE[INCIDENT_STATUS.ASSIGNED], EMERGENCY_STATE.ASSIGNED)
  assert.equal(STATUS_TO_STATE[INCIDENT_STATUS.EN_ROUTE], EMERGENCY_STATE.EN_ROUTE)
  assert.equal(STATUS_TO_STATE[INCIDENT_STATUS.NEARBY], EMERGENCY_STATE.NEARBY)
  assert.equal(STATUS_TO_STATE[INCIDENT_STATUS.ON_SCENE], EMERGENCY_STATE.ON_SCENE)
  assert.equal(STATUS_TO_STATE[INCIDENT_STATUS.RESOLVED], EMERGENCY_STATE.RESOLVED)
  assert.equal(STATUS_TO_STATE[INCIDENT_STATUS.CANCELLED], EMERGENCY_STATE.CANCELLED)

  // Verify reverse mapping
  assert.equal(STATE_TO_STATUS[EMERGENCY_STATE.SOS_ACTIVE], INCIDENT_STATUS.NEW)
  assert.equal(STATE_TO_STATUS[EMERGENCY_STATE.TRIAGING], INCIDENT_STATUS.TRIAGE_PENDING)
  assert.equal(STATE_TO_STATUS[EMERGENCY_STATE.RESOLVED], INCIDENT_STATUS.RESOLVED)
  assert.equal(STATE_TO_STATUS[EMERGENCY_STATE.CANCELLED], INCIDENT_STATUS.CANCELLED)

  // Verify linear ordering array
  assert.equal(STATE_ORDER.length, 8)
  assert.equal(STATE_ORDER[0], EMERGENCY_STATE.SOS_ACTIVE)
  assert.equal(STATE_ORDER[7], EMERGENCY_STATE.RESOLVED)
})

test('State Machine - Normalization Helpers', () => {
  assert.equal(normalizeToUiState('NEW'), 'SOS_ACTIVE')
  assert.equal(normalizeToUiState('TRIAGE_PENDING'), 'TRIAGING')
  assert.equal(normalizeToUiState('SOS_ACTIVE'), 'SOS_ACTIVE')
  assert.equal(normalizeToUiState('RESOLVED'), 'RESOLVED')
  assert.equal(normalizeToUiState('CANCELLED'), 'CANCELLED')
  assert.equal(normalizeToUiState('UNKNOWN_XYZ'), null)

  assert.equal(normalizeToBackendStatus('SOS_ACTIVE'), 'NEW')
  assert.equal(normalizeToBackendStatus('TRIAGING'), 'TRIAGE_PENDING')
  assert.equal(normalizeToBackendStatus('NEW'), 'NEW')
  assert.equal(normalizeToBackendStatus('ASSIGNED'), 'ASSIGNED')
  assert.equal(normalizeToBackendStatus('UNKNOWN_XYZ'), null)
})

test('State Machine - Valid Forward Transitions', () => {
  // Strict linear progression
  assert.equal(validateTransition('SOS_ACTIVE', 'TRIAGING'), true)
  assert.equal(validateTransition('TRIAGING', 'VERIFIED'), true)
  assert.equal(validateTransition('VERIFIED', 'ASSIGNED'), true)
  assert.equal(validateTransition('ASSIGNED', 'EN_ROUTE'), true)
  assert.equal(validateTransition('EN_ROUTE', 'NEARBY'), true)
  assert.equal(validateTransition('EN_ROUTE', 'ON_SCENE'), true)
  assert.equal(validateTransition('NEARBY', 'ON_SCENE'), true)
  assert.equal(validateTransition('ON_SCENE', 'RESOLVED'), true)
  assert.equal(validateTransition('VERIFIED', 'RESOLVED'), true)
})

test('State Machine - Cancellation from Non-Terminal States', () => {
  const nonTerminalStates = [
    'SOS_ACTIVE',
    'TRIAGING',
    'VERIFIED',
    'ASSIGNED',
    'EN_ROUTE',
    'NEARBY',
    'ON_SCENE',
  ]
  for (const s of nonTerminalStates) {
    assert.equal(validateTransition(s, 'CANCELLED'), true)
  }

  // Cannot cancel terminal states
  assert.equal(validateTransition('RESOLVED', 'CANCELLED'), false)
  assert.equal(validateTransition('CANCELLED', 'CANCELLED'), false)
})

test('State Machine - Invalid & Impossible Transitions Rejection', () => {
  // Backward transitions must fail
  assert.equal(validateTransition('ON_SCENE', 'EN_ROUTE'), false)
  assert.equal(validateTransition('EN_ROUTE', 'ASSIGNED'), false)
  assert.equal(validateTransition('ASSIGNED', 'SOS_ACTIVE'), false)
  assert.equal(validateTransition('NEARBY', 'TRIAGING'), false)

  // Skipping required steps from initial status must fail
  assert.equal(validateTransition('SOS_ACTIVE', 'VERIFIED'), false)
  assert.equal(validateTransition('SOS_ACTIVE', 'ASSIGNED'), false)
  assert.equal(validateTransition('TRIAGING', 'ASSIGNED'), false)

  // Transitions from terminal states must fail
  assert.equal(validateTransition('RESOLVED', 'EN_ROUTE'), false)
  assert.equal(validateTransition('RESOLVED', 'SOS_ACTIVE'), false)
  assert.equal(validateTransition('RESOLVED', 'ASSIGNED'), false)
  assert.equal(validateTransition('CANCELLED', 'ASSIGNED'), false)
  assert.equal(validateTransition('CANCELLED', 'SOS_ACTIVE'), false)
  assert.equal(validateTransition('CANCELLED', 'RESOLVED'), false)

  // Invalid state names
  assert.equal(validateTransition('UNKNOWN', 'ASSIGNED'), false)
  assert.equal(validateTransition('SOS_ACTIVE', 'NON_EXISTENT'), false)
})

test('State Machine - Terminal State Identification', () => {
  assert.equal(isTerminalState('RESOLVED'), true)
  assert.equal(isTerminalState('CANCELLED'), true)
  assert.equal(isTerminalState(INCIDENT_STATUS.RESOLVED), true)
  assert.equal(isTerminalState(INCIDENT_STATUS.CANCELLED), true)

  assert.equal(isTerminalState('SOS_ACTIVE'), false)
  assert.equal(isTerminalState('ASSIGNED'), false)
  assert.equal(isTerminalState('ON_SCENE'), false)
  assert.equal(isTerminalState(null), false)
})

test('State Machine - Numeric Ranks & Out-of-Order Packet Guard', () => {
  assert.equal(STATUS_RANKS.NEW, 1)
  assert.ok(getStatusRank('NEW') < getStatusRank('TRIAGE_PENDING'))
  assert.ok(getStatusRank('TRIAGE_PENDING') < getStatusRank('VERIFIED'))
  assert.ok(getStatusRank('VERIFIED') < getStatusRank('ASSIGNED'))
  assert.ok(getStatusRank('ASSIGNED') < getStatusRank('EN_ROUTE'))
  assert.ok(getStatusRank('EN_ROUTE') < getStatusRank('NEARBY'))
  assert.ok(getStatusRank('NEARBY') < getStatusRank('ON_SCENE'))
  assert.ok(getStatusRank('ON_SCENE') < getStatusRank('RESOLVED'))

  // Packet guard
  assert.equal(shouldAcceptStatusUpdate('NEW', 'ASSIGNED'), true)
  assert.equal(shouldAcceptStatusUpdate('ASSIGNED', 'EN_ROUTE'), true)
  assert.equal(shouldAcceptStatusUpdate('ON_SCENE', 'ASSIGNED'), false) // Stale packet
  assert.equal(shouldAcceptStatusUpdate('EN_ROUTE', 'NEW'), false) // Stale packet
  assert.equal(shouldAcceptStatusUpdate('RESOLVED', 'ASSIGNED'), false) // Terminal lock
  assert.equal(shouldAcceptStatusUpdate('CANCELLED', 'EN_ROUTE'), false) // Terminal lock
  assert.equal(shouldAcceptStatusUpdate('EN_ROUTE', 'CANCELLED'), true) // Terminal update accepted
})

test('State Machine - Next and Previous State Navigation & Allowed Targets', () => {
  assert.equal(getNextState('SOS_ACTIVE'), 'TRIAGING')
  assert.equal(getNextState('TRIAGING'), 'VERIFIED')
  assert.equal(getNextState('ON_SCENE'), 'RESOLVED')
  assert.equal(getNextState('RESOLVED'), null)
  assert.equal(getNextState('CANCELLED'), null)

  assert.equal(getPreviousState('ON_SCENE'), 'NEARBY')
  assert.equal(getPreviousState('NEARBY'), 'EN_ROUTE')
  assert.equal(getPreviousState('SOS_ACTIVE'), null)
  assert.equal(getPreviousState('RESOLVED'), null)

  const allowedFromSos = getAllowedNextStates('SOS_ACTIVE')
  assert.ok(allowedFromSos.includes('TRIAGING'))
  assert.ok(allowedFromSos.includes('CANCELLED'))

  const allowedFromResolved = getAllowedNextStates('RESOLVED')
  assert.equal(allowedFromResolved.length, 0)
})

test('State Machine - Timeline Derivation from Incident State + Events', () => {
  const events = [
    {
      id: 'evt-1',
      event_type: 'CREATED',
      actor: 'citizen',
      created_at: '2026-08-30T10:00:00.000Z',
    },
    {
      id: 'evt-2',
      event_type: 'STATUS_CHANGE',
      previous_status: 'NEW',
      new_status: 'TRIAGE_PENDING',
      actor: 'ai_triage',
      created_at: '2026-08-30T10:01:00.000Z',
    },
    {
      id: 'evt-3',
      event_type: 'assignment.created',
      new_status: 'ASSIGNED',
      actor: 'authority_01',
      created_at: '2026-08-30T10:03:00.000Z',
    },
  ]

  const timeline = deriveTimelineSteps('ASSIGNED', events, '2026-08-30T10:00:00.000Z')
  assert.equal(timeline.length, 8)

  // Step 1: SOS_ACTIVE should be completed with timestamp
  assert.equal(timeline[0].id, 'SOS_ACTIVE')
  assert.equal(timeline[0].status, 'completed')
  assert.equal(timeline[0].timestamp, '2026-08-30T10:00:00.000Z')

  // Step 2: TRIAGING should be completed
  assert.equal(timeline[1].id, 'TRIAGING')
  assert.equal(timeline[1].status, 'completed')

  // Step 4: ASSIGNED should be current
  assert.equal(timeline[3].id, 'ASSIGNED')
  assert.equal(timeline[3].status, 'current')
  assert.equal(timeline[3].timestamp, '2026-08-30T10:03:00.000Z')

  // Step 5: EN_ROUTE should be upcoming
  assert.equal(timeline[4].id, 'EN_ROUTE')
  assert.equal(timeline[4].status, 'upcoming')
})

test('State Machine - Timeline Derivation for Cancelled Incident', () => {
  const events = [
    {
      id: 'evt-1',
      event_type: 'CREATED',
      actor: 'citizen',
      created_at: '2026-08-30T10:00:00.000Z',
    },
  ]

  const timeline = deriveTimelineSteps('CANCELLED', events, '2026-08-30T10:00:00.000Z')
  assert.equal(timeline[0].status, 'completed')
  assert.equal(timeline[1].status, 'cancelled')
  assert.equal(timeline[2].status, 'cancelled')
})
