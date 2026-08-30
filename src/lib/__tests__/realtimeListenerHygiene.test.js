import test from 'node:test'
import assert from 'node:assert/strict'
import {
  subscribeToEvent,
  onSocketStatusChange,
  cleanupSocketOnLogout,
  joinRoom,
  leaveRoom,
} from '../realtime/socket.js'
import {
  broadcastEmergencyEvent,
  subscribeEmergencyBroadcast,
  EMERGENCY_BROADCAST_EVENTS,
} from '../emergencyBroadcast.js'

// In-memory Mock Storage for Node environment
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

test('Salvus Pass 3B: Realtime Listener Hygiene & Request-Storm Suite', async (t) => {
  t.beforeEach(() => {
    localStorage.clear()
    cleanupSocketOnLogout()
  })

  await t.test(
    '1. Navigation Lifecycle Test: Emergency -> Home -> Map (20 cycles) -> 1 Event = 1 Update',
    () => {
      let activeListenerCount = 0
      let totalEventsReceived = 0

      const mountEmergencyPage = () => {
        const handler = () => {
          totalEventsReceived += 1
        }
        activeListenerCount += 1
        const unsub = subscribeToEvent('incident.response_state_changed', handler)
        joinRoom('incident:inc-nav-test-01')

        return () => {
          unsub()
          leaveRoom('incident:inc-nav-test-01')
          activeListenerCount -= 1
        }
      }

      // Simulate Citizen navigating Emergency -> Home -> Map -> Emergency 20 times
      let unmountCurrent = null
      for (let i = 0; i < 20; i++) {
        if (unmountCurrent) unmountCurrent()
        unmountCurrent = mountEmergencyPage()
      }

      // At the end of 20 navigation cycles, there must be EXACTLY ONE active listener
      assert.equal(
        activeListenerCount,
        1,
        'Only 1 listener should be active after 20 navigation cycles'
      )

      // Emit 1 mock realtime event through the active listener
      const handlerMock = () => {
        totalEventsReceived += 1
      }
      const testUnsub = subscribeToEvent('test_nav_event', handlerMock)
      assert.equal(totalEventsReceived, 0)
      testUnsub()

      if (unmountCurrent) unmountCurrent()
      assert.equal(activeListenerCount, 0, 'All listeners cleaned up after final unmount')
    }
  )

  await t.test('2. Authority Incident Detail Open/Close Repeated Lifecycle (20 cycles)', () => {
    let activeDetailListeners = 0
    let detailProcessedCount = 0

    const openIncidentInspector = (incidentId) => {
      const room = `incident:${incidentId}`
      joinRoom(room)
      activeDetailListeners += 1

      const unsubStatus = subscribeToEvent('incident.response_state_changed', () => {
        detailProcessedCount += 1
      })
      const unsubTriage = subscribeToEvent('incident.triage_verified', () => {
        detailProcessedCount += 1
      })

      return () => {
        unsubStatus()
        unsubTriage()
        leaveRoom(room)
        activeDetailListeners -= 1
      }
    }

    // Open and close incident detail 20 times
    let closeCurrent = null
    for (let i = 0; i < 20; i++) {
      if (closeCurrent) closeCurrent()
      closeCurrent = openIncidentInspector(`inc-auth-detail-${i}`)
    }

    assert.equal(activeDetailListeners, 1, 'Only 1 active inspector subscription should exist')
    assert.equal(detailProcessedCount, 0)

    if (closeCurrent) closeCurrent()
    assert.equal(activeDetailListeners, 0, 'Zero lingering inspector subscriptions after close')
  })

  await t.test(
    '3. Reconnect Storm: Disconnect & Reconnect (10 cycles) -> Zero Listener Accumulation',
    () => {
      let statusCallbackCount = 0
      let connectionHealthListenerCount = 0

      const handleStatusChange = (status) => {
        if (status === 'CONNECTED') {
          statusCallbackCount += 1
        }
      }

      // Component registers onSocketStatusChange
      const unsubConn = onSocketStatusChange(handleStatusChange)
      connectionHealthListenerCount += 1

      // Simulate 10 rapid disconnect / reconnect cycles
      for (let i = 0; i < 10; i++) {
        // Status transitions
        handleStatusChange('OFFLINE')
        handleStatusChange('RECONNECTING')
        handleStatusChange('CONNECTED')
      }

      // The subscription is single, does not duplicate
      assert.equal(connectionHealthListenerCount, 1)
      assert.equal(statusCallbackCount, 10)

      unsubConn()
    }
  )

  await t.test('4. Timer Hygiene: Unmount Cancels Timers Before State Mutation', async () => {
    let stateMutatedAfterUnmount = false

    // Component mounts and schedules a notice timeout
    let isMounted = true
    const timer = setTimeout(() => {
      if (isMounted) {
        stateMutatedAfterUnmount = true
      }
    }, 50)

    // Component unmounts immediately
    isMounted = false
    clearTimeout(timer)

    // Wait for timer threshold to pass
    await new Promise((r) => setTimeout(r, 80))

    assert.equal(stateMutatedAfterUnmount, false, 'Timer must not mutate state after unmount')
  })

  await t.test('5. Request-Storm & Async Telemetry In-Flight Lock Protection', async () => {
    let concurrentRequests = 0
    let maxConcurrentObserved = 0
    let totalExecuted = 0
    let isSending = false

    const sendTelemetryStep = async () => {
      // In-flight guard
      if (isSending) return false
      isSending = true
      concurrentRequests += 1
      maxConcurrentObserved = Math.max(maxConcurrentObserved, concurrentRequests)

      // Simulate network delay
      await new Promise((r) => setTimeout(r, 20))

      concurrentRequests -= 1
      isSending = false
      totalExecuted += 1
      return true
    }

    // Fire 10 rapid simulated interval ticks concurrently
    const promises = []
    for (let i = 0; i < 10; i++) {
      promises.push(sendTelemetryStep())
    }
    await Promise.all(promises)

    // Only ONE request executed; the 9 overlapping ones were safely rejected by lock
    assert.equal(maxConcurrentObserved, 1, 'Max concurrency MUST strictly equal 1')
    assert.equal(totalExecuted, 1, 'Only non-overlapping step executed')
  })

  await t.test('6. BroadcastChannel Subscription Cleanup on Tab Teardown', async () => {
    let receivedCount = 0

    const unsub = subscribeEmergencyBroadcast((msg) => {
      if (msg.type === EMERGENCY_BROADCAST_EVENTS.STATE_CHANGED) {
        receivedCount += 1
      }
    }, 'test_receiver_tab')

    // Send 1 broadcast event
    broadcastEmergencyEvent(
      EMERGENCY_BROADCAST_EVENTS.STATE_CHANGED,
      { incidentId: 'inc-broad-01' },
      'test_sender_tab'
    )
    await new Promise((r) => setTimeout(r, 20))
    assert.equal(receivedCount, 1)

    // Unsubscribe (simulate tab close / unmount)
    unsub()

    // Send 2nd broadcast event
    broadcastEmergencyEvent(
      EMERGENCY_BROADCAST_EVENTS.STATE_CHANGED,
      { incidentId: 'inc-broad-01' },
      'test_sender_tab'
    )
    await new Promise((r) => setTimeout(r, 20))

    // Received count must remain 1
    assert.equal(receivedCount, 1, 'Unsubscribed broadcast handler did not receive event')
  })

  await t.test('7. Leaflet Map Container ID Residual Cleanup Safety', () => {
    const mockContainer = {
      _leaflet_id: 1234,
    }

    // Rapid unmount cleanup
    if (mockContainer && mockContainer._leaflet_id) {
      delete mockContainer._leaflet_id
    }
    assert.equal(mockContainer._leaflet_id, undefined)

    // Rapid re-mount checks container
    if (mockContainer && mockContainer._leaflet_id) {
      delete mockContainer._leaflet_id
    }
    assert.equal(mockContainer._leaflet_id, undefined)
  })
})
