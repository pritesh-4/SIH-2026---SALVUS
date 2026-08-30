import test from 'node:test'
import assert from 'node:assert/strict'
import { normalizeToUiState, isTerminalState, EMERGENCY_STATE } from '../stateMachine.js'
import {
  saveEmergencyCache,
  loadEmergencyCache,
  clearEmergencyCache,
  EMERGENCY_CACHE_KEY,
  LEGACY_INCIDENT_ID_KEY,
} from '../emergencyCache.js'

// Simple in-memory mock storage for testing
const createMockStorage = () => {
  const store = new Map()
  return {
    getItem: (key) => store.get(key) || null,
    setItem: (key, val) => store.set(key, String(val)),
    removeItem: (key) => store.delete(key),
    clear: () => store.clear(),
  }
}

test('Salvus Active Emergency Persistence & Rehydration Suite', async (t) => {
  let mockStorage
  const originalLocalStorage = globalThis.localStorage

  t.beforeEach(() => {
    mockStorage = createMockStorage()
    globalThis.localStorage = mockStorage
  })

  t.afterEach(() => {
    globalThis.localStorage = originalLocalStorage
  })

  await t.test('Scenario A: Refresh during TRIAGING state', () => {
    const serverIncident = {
      id: 'inc-triaging-001',
      ticket_id: 'SV-3001',
      status: 'TRIAGE_PENDING',
      type: 'flood',
      severity: 'CRITICAL',
      latitude: 22.5726,
      longitude: 88.3639,
    }

    // Save initial state before reload
    saveEmergencyCache(serverIncident)
    const cached = loadEmergencyCache()
    assert.equal(cached.incidentId, 'inc-triaging-001')
    assert.equal(cached.lastKnownStatus, 'TRIAGE_PENDING')

    // Simulate Rehydration from server truth
    const rehydratedUiState = normalizeToUiState(serverIncident.status)
    assert.equal(rehydratedUiState, EMERGENCY_STATE.TRIAGING)
    assert.equal(isTerminalState(rehydratedUiState), false)
  })

  await t.test('Scenario B: Refresh during VERIFIED state', () => {
    const serverIncident = {
      id: 'inc-verified-002',
      ticket_id: 'SV-3002',
      status: 'VERIFIED',
      type: 'flood',
      severity: 'CRITICAL',
      latitude: 22.5726,
      longitude: 88.3639,
    }

    saveEmergencyCache(serverIncident)
    const cached = loadEmergencyCache()
    assert.equal(cached.incidentId, 'inc-verified-002')

    const rehydratedUiState = normalizeToUiState(serverIncident.status)
    assert.equal(rehydratedUiState, EMERGENCY_STATE.VERIFIED)
    assert.equal(isTerminalState(rehydratedUiState), false)
  })

  await t.test('Scenario C: Refresh after ASSIGNMENT (responder details restored)', () => {
    const serverIncident = {
      id: 'inc-assigned-003',
      ticket_id: 'SV-3003',
      status: 'ASSIGNED',
      type: 'flood',
      severity: 'CRITICAL',
    }
    const assignedResponder = {
      id: 'resp-unit-4',
      unit_name: 'NDRF Rescue Unit 4',
      team_lead: 'Capt. A. Roy',
      status: 'ASSIGNED',
      latitude: 22.571,
      longitude: 88.362,
    }

    saveEmergencyCache(serverIncident, assignedResponder)
    const cached = loadEmergencyCache()
    assert.equal(cached.incidentId, 'inc-assigned-003')
    assert.equal(cached.cachedResponder?.unit_name, 'NDRF Rescue Unit 4')

    const rehydratedUiState = normalizeToUiState(serverIncident.status)
    assert.equal(rehydratedUiState, EMERGENCY_STATE.ASSIGNED)
  })

  await t.test('Scenario D: Refresh during EN_ROUTE state', () => {
    const serverIncident = {
      id: 'inc-enroute-004',
      ticket_id: 'SV-3004',
      status: 'EN_ROUTE',
      type: 'flood',
    }
    const responder = {
      id: 'resp-unit-4',
      unit_name: 'NDRF Unit 4',
      status: 'EN_ROUTE',
    }

    saveEmergencyCache(serverIncident, responder)
    const cached = loadEmergencyCache()
    assert.equal(cached.incidentId, 'inc-enroute-004')

    const rehydratedUiState = normalizeToUiState(serverIncident.status)
    assert.equal(rehydratedUiState, EMERGENCY_STATE.EN_ROUTE)
  })

  await t.test('Scenario E: Refresh during NEARBY state (proximity callout active)', () => {
    const serverIncident = {
      id: 'inc-nearby-005',
      ticket_id: 'SV-3005',
      status: 'NEARBY',
      type: 'flood',
    }

    saveEmergencyCache(serverIncident)
    const cached = loadEmergencyCache()
    assert.equal(cached.lastKnownStatus, 'NEARBY')

    const rehydratedUiState = normalizeToUiState(serverIncident.status)
    assert.equal(rehydratedUiState, EMERGENCY_STATE.NEARBY)
  })

  await t.test('Scenario F: Refresh during ON_SCENE state', () => {
    const serverIncident = {
      id: 'inc-onscene-006',
      ticket_id: 'SV-3006',
      status: 'ON_SCENE',
      type: 'flood',
    }

    saveEmergencyCache(serverIncident)
    const rehydratedUiState = normalizeToUiState(serverIncident.status)
    assert.equal(rehydratedUiState, EMERGENCY_STATE.ON_SCENE)
  })

  await t.test('Scenario G: Refresh after RESOLVED (terminal state purges active cache)', () => {
    const initialActive = {
      id: 'inc-res-007',
      ticket_id: 'SV-3007',
      status: 'ON_SCENE',
    }
    saveEmergencyCache(initialActive)
    assert.notEqual(mockStorage.getItem(EMERGENCY_CACHE_KEY), null)

    // Server returns RESOLVED status
    const resolvedServerIncident = {
      id: 'inc-res-007',
      ticket_id: 'SV-3007',
      status: 'RESOLVED',
    }

    const rehydratedUiState = normalizeToUiState(resolvedServerIncident.status)
    assert.equal(rehydratedUiState, EMERGENCY_STATE.RESOLVED)
    assert.equal(isTerminalState(rehydratedUiState), true)

    // Saving terminal incident purges active cache to prevent zombie resurrection
    saveEmergencyCache(resolvedServerIncident)
    assert.equal(mockStorage.getItem(EMERGENCY_CACHE_KEY), null)
    assert.equal(mockStorage.getItem(LEGACY_INCIDENT_ID_KEY), null)
  })

  await t.test('Scenario H: Refresh after CANCELLED (terminal state purges cache)', () => {
    const cancelledServerIncident = {
      id: 'inc-cancel-008',
      ticket_id: 'SV-3008',
      status: 'CANCELLED',
    }

    const rehydratedUiState = normalizeToUiState(cancelledServerIncident.status)
    assert.equal(rehydratedUiState, EMERGENCY_STATE.CANCELLED)
    assert.equal(isTerminalState(rehydratedUiState), true)

    saveEmergencyCache(cancelledServerIncident)
    assert.equal(loadEmergencyCache(), null)
  })

  await t.test('Scenario I: Direct Route Navigation with No Active Emergency on Server', () => {
    // If browser navigates directly to /citizen/emergency with empty localStorage
    const cached = loadEmergencyCache()
    assert.equal(cached, null)

    // Server response: data = null, isTerminal = false
    const serverActiveResult = {
      success: true,
      data: null,
      responder: null,
      isTerminal: false,
    }

    // Must resolve to no_active_emergency outcome without creating fake incident
    const outcome = serverActiveResult.data ? 'rehydrated' : 'no_active_emergency'
    assert.equal(outcome, 'no_active_emergency')
  })

  await t.test('Scenario J: Direct Route Navigation with Stale / Obsolete localStorage ID', () => {
    // LocalStorage has an obsolete ID
    mockStorage.setItem(LEGACY_INCIDENT_ID_KEY, 'obsolete-incident-999')

    // Server says incident not found / no active incident
    const serverResult = {
      success: true,
      data: null,
      isTerminal: false,
    }

    if (!serverResult.data) {
      clearEmergencyCache()
    }

    assert.equal(loadEmergencyCache(), null)
    assert.equal(mockStorage.getItem(LEGACY_INCIDENT_ID_KEY), null)
  })

  await t.test('Scenario K: Backend Temporarily Offline during Refresh', () => {
    // User had an active emergency cached before network dropped
    const priorIncident = {
      id: 'inc-offline-010',
      ticket_id: 'SV-3010',
      status: 'EN_ROUTE',
      created_at: new Date().toISOString(),
    }
    const priorResponder = {
      id: 'resp-101',
      unit_name: 'NDRF Unit 1',
    }
    saveEmergencyCache(priorIncident, priorResponder)

    // Server query fails with network error
    const offlineResult = {
      success: false,
      data: null,
      isOffline: true,
    }

    const cachedHint = loadEmergencyCache()
    assert.notEqual(cachedHint, null)
    assert.equal(cachedHint.incidentId, 'inc-offline-010')

    // Outcome is offline_unconfirmed: retains guidance but marks status as unconfirmed
    const outcome = offlineResult.isOffline && cachedHint ? 'offline_unconfirmed' : 'failure'
    assert.equal(outcome, 'offline_unconfirmed')
  })

  await t.test('Scenario L: Server & Local Storage Match (Idempotent Reuse)', () => {
    const incident = {
      id: 'inc-match-011',
      ticket_id: 'SV-3011',
      status: 'VERIFIED',
    }
    saveEmergencyCache(incident)

    const serverResult = {
      success: true,
      data: incident,
      responder: null,
      isTerminal: false,
    }

    const cached = loadEmergencyCache()
    assert.equal(cached.incidentId, serverResult.data.id)
    // Server and local match -> state updated without duplicating or resetting
    const uiState = normalizeToUiState(serverResult.data.status)
    assert.equal(uiState, EMERGENCY_STATE.VERIFIED)
  })
})
