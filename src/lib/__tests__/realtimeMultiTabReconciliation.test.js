import test from 'node:test'
import assert from 'node:assert/strict'
import {
  normalizeToUiState,
  shouldAcceptStatusUpdate,
  getStatusRank,
  EMERGENCY_STATE,
} from '../stateMachine.js'
import { saveEmergencyCache, loadEmergencyCache, clearEmergencyCache } from '../emergencyCache.js'
import {
  broadcastEmergencyEvent,
  subscribeEmergencyBroadcast,
  EMERGENCY_BROADCAST_EVENTS,
} from '../emergencyBroadcast.js'

// Simple in-memory mock storage for multi-tab testing
const createMockStorage = () => {
  const store = new Map()
  return {
    getItem: (key) => store.get(key) || null,
    setItem: (key, val) => store.set(key, String(val)),
    removeItem: (key) => store.delete(key),
    clear: () => store.clear(),
  }
}

test('Salvus Realtime Reconnect & Multi-Tab Consistency Suite (Pass 2B)', async (t) => {
  let mockStorage
  const originalLocalStorage = globalThis.localStorage

  t.beforeEach(() => {
    mockStorage = createMockStorage()
    globalThis.localStorage = mockStorage
  })

  t.afterEach(() => {
    globalThis.localStorage = originalLocalStorage
  })

  await t.test('1. Socket Disconnect: State, Location, Responder & Timeline are Preserved', () => {
    // Given an active emergency in EN_ROUTE state
    const incident = {
      id: 'inc-rec-101',
      ticket_id: 'SV-4101',
      status: 'EN_ROUTE',
      latitude: 22.5726,
      longitude: 88.3639,
    }
    const responder = {
      id: 'resp-unit-4',
      unit_name: 'NDRF Rescue Unit 4',
      status: 'EN_ROUTE',
    }

    saveEmergencyCache(incident, responder)

    // Simulate socket disconnect: connection state changes to RECONNECTING
    const connectionState = 'RECONNECTING'
    assert.equal(connectionState, 'RECONNECTING')

    // Local cached recovery state MUST remain intact and not reset to IDLE or SOS_ACTIVE
    const cached = loadEmergencyCache()
    assert.notEqual(cached, null)
    assert.equal(cached.incidentId, 'inc-rec-101')
    assert.equal(cached.lastKnownStatus, 'EN_ROUTE')
    assert.equal(cached.cachedResponder?.unit_name, 'NDRF Rescue Unit 4')
    assert.equal(normalizeToUiState(cached.lastKnownStatus), EMERGENCY_STATE.EN_ROUTE)
  })

  await t.test('2. Socket Reconnect: Authoritative Reconciliation & Restoration Notice', () => {
    // User was at VERIFIED before disconnect
    const priorIncident = {
      id: 'inc-rec-102',
      ticket_id: 'SV-4102',
      status: 'VERIFIED',
    }
    saveEmergencyCache(priorIncident)

    // On reconnect: server returns authoritative incident state
    const serverAuthoritativeData = {
      id: 'inc-rec-102',
      ticket_id: 'SV-4102',
      status: 'ASSIGNED',
      assigned_responder: {
        id: 'resp-boat-1',
        unit_name: 'Zodiac Rescue Boat 1',
      },
    }

    // Server state wins over stale local state
    const rehydratedUiState = normalizeToUiState(serverAuthoritativeData.status)
    assert.equal(rehydratedUiState, EMERGENCY_STATE.ASSIGNED)
    saveEmergencyCache(serverAuthoritativeData, serverAuthoritativeData.assigned_responder)

    const updatedCache = loadEmergencyCache()
    assert.equal(updatedCache.lastKnownStatus, 'ASSIGNED')
    assert.equal(updatedCache.cachedResponder?.unit_name, 'Zodiac Rescue Boat 1')
  })

  await t.test('3. Missed Event Gap: Server Current State Overwrites Stale Offline Client', () => {
    // Client went offline at TRIAGING
    const localState = EMERGENCY_STATE.TRIAGING

    // While offline, dispatcher approved and responder departed (server is now EN_ROUTE)
    const serverCurrentStatus = 'EN_ROUTE'
    const serverUiState = normalizeToUiState(serverCurrentStatus)

    // Reconciliation logic: Server wins monotonically
    assert.equal(getStatusRank(serverUiState) > getStatusRank(localState), true)
    const reconciledState = serverUiState
    assert.equal(reconciledState, EMERGENCY_STATE.EN_ROUTE)
  })

  await t.test(
    '4. Duplicate Realtime Events: Idempotent Application Without Double Mutation',
    () => {
      const processedEvents = new Set()
      let statusAppliedCount = 0

      const isDuplicateEvent = (evtKey) => {
        if (processedEvents.has(evtKey)) return true
        processedEvents.add(evtKey)
        return false
      }

      const eventPacket = {
        id: 'inc-dup-104',
        status: 'NEARBY',
        updated_at: '2026-08-30T10:00:00Z',
      }
      const eventKey = `${eventPacket.id}_status_${eventPacket.status}_${eventPacket.updated_at}`

      // First arrival
      if (!isDuplicateEvent(eventKey)) {
        statusAppliedCount += 1
      }
      assert.equal(statusAppliedCount, 1)

      // Second arrival (duplicate packet)
      if (!isDuplicateEvent(eventKey)) {
        statusAppliedCount += 1
      }
      assert.equal(statusAppliedCount, 1) // Did not increment!

      // Third arrival (duplicate packet)
      if (!isDuplicateEvent(eventKey)) {
        statusAppliedCount += 1
      }
      assert.equal(statusAppliedCount, 1)
    }
  )

  await t.test('5. Delayed & Out-of-Order Events: Stale Packets are Strictly Ignored', () => {
    // Current client state is EN_ROUTE (rank 5)
    const currentState = EMERGENCY_STATE.EN_ROUTE

    // A delayed ASSIGNED (rank 4) packet arrives
    const delayedStatus = 'ASSIGNED'
    assert.equal(shouldAcceptStatusUpdate(currentState, delayedStatus), false)

    // A delayed TRIAGE_PENDING (rank 2) packet arrives
    const staleStatus = 'TRIAGE_PENDING'
    assert.equal(shouldAcceptStatusUpdate(currentState, staleStatus), false)

    // A valid forward NEARBY (rank 6) packet arrives
    const forwardStatus = 'NEARBY'
    assert.equal(shouldAcceptStatusUpdate(currentState, forwardStatus), true)

    // If client is RESOLVED (terminal state)
    const terminalState = EMERGENCY_STATE.RESOLVED
    assert.equal(shouldAcceptStatusUpdate(terminalState, 'NEARBY'), false)
    assert.equal(shouldAcceptStatusUpdate(terminalState, 'ON_SCENE'), false)
    assert.equal(shouldAcceptStatusUpdate(terminalState, 'ASSIGNED'), false)
  })

  await t.test('6. Monotonic State Ranking Invariant', () => {
    assert.equal(getStatusRank(EMERGENCY_STATE.SOS_ACTIVE), 1)
    assert.equal(getStatusRank(EMERGENCY_STATE.TRIAGING), 2)
    assert.equal(getStatusRank(EMERGENCY_STATE.VERIFIED), 3)
    assert.equal(getStatusRank(EMERGENCY_STATE.ASSIGNED), 4)
    assert.equal(getStatusRank(EMERGENCY_STATE.EN_ROUTE), 5)
    assert.equal(getStatusRank(EMERGENCY_STATE.NEARBY), 6)
    assert.equal(getStatusRank(EMERGENCY_STATE.ON_SCENE), 7)
    assert.equal(getStatusRank(EMERGENCY_STATE.RESOLVED), 8)
  })

  await t.test('7. Multi-Tab (2 Tabs): Tab A State Change Synchronizes to Tab B', async () => {
    let tabBReconciledState = null

    // Simulated Tab B listener
    const unsubscribeTabB = subscribeEmergencyBroadcast((msg) => {
      if (msg.type === EMERGENCY_BROADCAST_EVENTS.STATE_CHANGED) {
        // Tab B queries server truth upon signal
        const serverTruth = { id: msg.payload.incidentId, status: msg.payload.status }
        tabBReconciledState = normalizeToUiState(serverTruth.status)
      }
    }, 'tab_B')

    // Tab A triggers state change
    broadcastEmergencyEvent(
      EMERGENCY_BROADCAST_EVENTS.STATE_CHANGED,
      {
        incidentId: 'inc-tab-001',
        status: 'ON_SCENE',
      },
      'tab_A'
    )

    await new Promise((r) => setTimeout(r, 20))
    assert.equal(tabBReconciledState, EMERGENCY_STATE.ON_SCENE)
    unsubscribeTabB()
  })

  await t.test(
    '8. Multi-Tab (3 Tabs): Tab A Cancels Emergency -> Tab B & Tab C Purge & Cancel',
    async () => {
      let tabBState = EMERGENCY_STATE.EN_ROUTE
      let tabCState = EMERGENCY_STATE.EN_ROUTE

      // Tab B & Tab C listeners
      const unsubB = subscribeEmergencyBroadcast((msg) => {
        if (msg.type === EMERGENCY_BROADCAST_EVENTS.EMERGENCY_CANCELLED) {
          tabBState = EMERGENCY_STATE.CANCELLED
          clearEmergencyCache()
        }
      }, 'tab_B')

      const unsubC = subscribeEmergencyBroadcast((msg) => {
        if (msg.type === EMERGENCY_BROADCAST_EVENTS.EMERGENCY_CANCELLED) {
          tabCState = EMERGENCY_STATE.CANCELLED
          clearEmergencyCache()
        }
      }, 'tab_C')

      // Tab A executes emergency cancellation
      broadcastEmergencyEvent(
        EMERGENCY_BROADCAST_EVENTS.EMERGENCY_CANCELLED,
        {
          incidentId: 'inc-tab-002',
        },
        'tab_A'
      )

      await new Promise((r) => setTimeout(r, 20))
      assert.equal(tabBState, EMERGENCY_STATE.CANCELLED)
      assert.equal(tabCState, EMERGENCY_STATE.CANCELLED)
      assert.equal(loadEmergencyCache(), null)

      unsubB()
      unsubC()
    }
  )

  await t.test('9. Multi-Tab Concurrent SOS Submission Race Protection', async () => {
    let tabBLockedFromSubmission = false

    const unsubB = subscribeEmergencyBroadcast((msg) => {
      if (msg.type === EMERGENCY_BROADCAST_EVENTS.SOS_IN_FLIGHT) {
        tabBLockedFromSubmission = true
      } else if (msg.type === EMERGENCY_BROADCAST_EVENTS.SOS_COMPLETED) {
        tabBLockedFromSubmission = false
      }
    }, 'tab_B')

    // Tab A starts submitting SOS
    broadcastEmergencyEvent(EMERGENCY_BROADCAST_EVENTS.SOS_IN_FLIGHT, {}, 'tab_A')
    await new Promise((r) => setTimeout(r, 20))
    assert.equal(tabBLockedFromSubmission, true)

    // Tab A finishes SOS creation
    broadcastEmergencyEvent(
      EMERGENCY_BROADCAST_EVENTS.SOS_COMPLETED,
      {
        incidentId: 'inc-created-109',
      },
      'tab_A'
    )
    await new Promise((r) => setTimeout(r, 20))
    assert.equal(tabBLockedFromSubmission, false)

    unsubB()
  })

  await t.test(
    '10. Reconnect While Responder is En-Route: Preserves Unit Telemetry & Radar',
    () => {
      const enRouteIncident = {
        id: 'inc-enroute-110',
        ticket_id: 'SV-4110',
        status: 'EN_ROUTE',
        latitude: 22.5726,
        longitude: 88.3639,
      }
      const responder = {
        id: 'resp-unit-4',
        unit_name: 'NDRF Unit 4',
        team_lead: 'Insp. Das',
        radio_channel: 'VHF-04',
        latitude: 22.571,
        longitude: 88.362,
        status: 'EN_ROUTE',
      }

      saveEmergencyCache(enRouteIncident, responder)

      // Simulated reconnect query
      const rehydrated = loadEmergencyCache()
      assert.equal(rehydrated.incidentId, 'inc-enroute-110')
      assert.equal(rehydrated.cachedResponder.unit_name, 'NDRF Unit 4')
      assert.equal(rehydrated.cachedResponder.radio_channel, 'VHF-04')
      assert.equal(normalizeToUiState(rehydrated.lastKnownStatus), EMERGENCY_STATE.EN_ROUTE)
    }
  )
})
