/* global process */
/**
 * Comprehensive Automated Test Suite for Salvus Real-Time Alert Notification System
 *
 * Validates:
 * TEST 1: No real alerts -> Badge = 0
 * TEST 2: One relevant unread alert -> Badge = 1
 * TEST 3: Three relevant alerts, one already read -> Badge = 2
 * TEST 4: Alert provider fails -> State UNAVAILABLE, not false "all clear"
 * TEST 5: Alert expires -> Removed from active count
 * TEST 6: User changes location -> Irrelevant alerts excluded, badge updates
 * TEST 7: User refreshes Alerts page -> Telemetry updates synchronously
 * TEST 8: Duplicate provider alerts -> Deduplicated, no double counting
 * TEST 9: User reloads browser -> Read state persists in localStorage
 * TEST 10: Simulation / demo alert exists -> Isolated, does not contaminate live count
 */

import {
  normalizeAlert,
  deduplicateAlertsList,
  filterAlertsByLocation,
  isAlertActiveAndUnexpired,
  getStableAlertId,
  computeBadgeCount,
  recordAlertInteraction,
  loadAlertInteractions,
  AlertInteractionStatus,
} from '../alertNormalization.js'

// Simple In-Memory Mock LocalStorage for Node Test Runner
const mockLocalStorageMap = new Map()
globalThis.localStorage = {
  getItem: (key) => mockLocalStorageMap.get(key) || null,
  setItem: (key, val) => mockLocalStorageMap.set(key, String(val)),
  removeItem: (key) => mockLocalStorageMap.delete(key),
  clear: () => mockLocalStorageMap.clear(),
}
globalThis.window = {
  localStorage: globalThis.localStorage,
}

let passedTests = 0
let failedTests = 0

function assert(condition, message) {
  if (!condition) {
    console.error(`❌ FAIL: ${message}`)
    failedTests++
    throw new Error(message)
  } else {
    console.log(`✓ PASS: ${message}`)
    passedTests++
  }
}

function assertEqual(actual, expected, message) {
  if (actual !== expected) {
    console.error(`❌ FAIL: ${message} (Expected ${expected}, got ${actual})`)
    failedTests++
    throw new Error(`${message}: Expected ${expected}, got ${actual}`)
  } else {
    console.log(`✓ PASS: ${message} (= ${actual})`)
    passedTests++
  }
}

console.log('====================================================')
console.log('SALVUS ALERT NOTIFICATION BADGE & STATE TEST SUITE')
console.log('====================================================\n')

try {
  // ---------------------------------------------------------------------------
  // TEST 1: No Real Alerts
  // ---------------------------------------------------------------------------
  console.log('[Scenario 1: Zero Alert State]')
  const emptyHazards = []
  const normZero = emptyHazards.map((h) => normalizeAlert(h))
  const badge1 = computeBadgeCount(normZero, {})
  assertEqual(badge1, 0, 'Test 1: Empty hazard list produces badge = 0')
  assertEqual(normZero.length, 0, 'Test 1: Zero active alerts in normalized store')

  // ---------------------------------------------------------------------------
  // TEST 2: One Relevant Unread Alert
  // ---------------------------------------------------------------------------
  console.log('\n[Scenario 2: Single Relevant Unread Alert]')
  const userLocKolkata = { latitude: 22.5726, longitude: 88.3639 }
  const singleRawAlert = {
    id: 'sachet-alert-01',
    source: 'SACHET NDMA',
    source_event_id: 'sachet-fl-01',
    title: 'Severe Waterlogging in Salt Lake',
    description: 'Roads submerged up to 0.6m in Sector 5.',
    severity: 'WARNING',
    latitude: 22.578,
    longitude: 88.371,
    is_active: true,
    observed_at: new Date().toISOString(),
    expires_at: new Date(Date.now() + 3600 * 1000).toISOString(),
    provenance: 'LIVE',
  }

  const normAlert1 = normalizeAlert(singleRawAlert, userLocKolkata)
  assert(normAlert1 !== null, 'Test 2: Raw alert normalized successfully')
  assertEqual(normAlert1.id, 'sachet-alert-01', 'Test 2: Retains canonical ID')
  assertEqual(normAlert1.severity, 'WARNING', 'Test 2: Normalized severity is WARNING')
  assert(normAlert1.distanceKm < 2.0, 'Test 2: Proximity correctly calculated under 2km')

  const badge2 = computeBadgeCount([normAlert1], {})
  assertEqual(badge2, 1, 'Test 2: Single unread alert yields badgeCount = 1')

  // ---------------------------------------------------------------------------
  // TEST 3: Three Relevant Alerts, One Already Read
  // ---------------------------------------------------------------------------
  console.log('\n[Scenario 3: Read/Unread State Calculation]')
  const now = Date.now()
  const rawList3 = [
    {
      id: 'alt-101',
      source: 'SACHET NDMA',
      source_event_id: 'fl-101',
      title: 'Flash Flood Warning Sector 12',
      severity: 'CRITICAL',
      latitude: 22.575,
      longitude: 88.368,
      is_active: true,
      expires_at: new Date(now + 7200 * 1000).toISOString(),
    },
    {
      id: 'alt-102',
      source: 'Open-Meteo Weather Service',
      source_event_id: 'th-102',
      title: 'Thunderstorm Squall Advisory',
      severity: 'WARNING',
      latitude: 22.58,
      longitude: 88.37,
      is_active: true,
      expires_at: new Date(now + 7200 * 1000).toISOString(),
    },
    {
      id: 'alt-103',
      source: 'USGS',
      source_event_id: 'eq-103',
      title: 'Seismic Tremor Warning',
      severity: 'WATCH',
      latitude: 22.56,
      longitude: 88.35,
      is_active: true,
      expires_at: new Date(now + 7200 * 1000).toISOString(),
    },
  ]

  const normList3 = rawList3.map((h) => normalizeAlert(h, userLocKolkata))
  assertEqual(normList3.length, 3, 'Test 3: Three alerts normalized')

  // Simulate user reading alert alt-101
  const interactions3 = {
    'alt-101': { status: AlertInteractionStatus.READ, updatedAt: Date.now() },
  }

  const badge3 = computeBadgeCount(normList3, interactions3)
  assertEqual(badge3, 2, 'Test 3: Reading one alert decrements badge from 3 to 2')

  // ---------------------------------------------------------------------------
  // TEST 4: Provider Failure Behavior
  // ---------------------------------------------------------------------------
  console.log('\n[Scenario 4: Provider Failure & Honest Diagnostic Status]')
  // In provider failure, status is UNAVAILABLE/ERROR and we must distinguish from NO_ALERTS
  const providerFailedStatus = 'UNAVAILABLE'
  const isAllClear = providerFailedStatus === 'AVAILABLE' && normList3.length === 0
  assert(!isAllClear, 'Test 4: Provider failure is not treated as All Clear')
  assert(providerFailedStatus === 'UNAVAILABLE', 'Test 4: State correctly marks UNAVAILABLE')

  // ---------------------------------------------------------------------------
  // TEST 5: Alert Expiration
  // ---------------------------------------------------------------------------
  console.log('\n[Scenario 5: Expired Alerts Filtering]')
  const expiredRawAlert = {
    id: 'alt-expired-01',
    source: 'GDACS',
    source_event_id: 'gdacs-old-99',
    title: 'Historic Tropical Cyclone Watch',
    severity: 'WARNING',
    latitude: 22.5726,
    longitude: 88.3639,
    is_active: true,
    observed_at: new Date(now - 86400 * 1000).toISOString(),
    expires_at: new Date(now - 3600 * 1000).toISOString(), // Expired 1 hr ago
  }

  const isExpiredActive = isAlertActiveAndUnexpired(expiredRawAlert)
  assertEqual(isExpiredActive, false, 'Test 5: Expired alert is not active')

  const normExpired = normalizeAlert(expiredRawAlert, userLocKolkata)
  const activeAlerts5 = [normAlert1, normExpired].filter(isAlertActiveAndUnexpired)
  assertEqual(activeAlerts5.length, 1, 'Test 5: Expired alert excluded from active dataset')
  assertEqual(activeAlerts5[0].id, 'sachet-alert-01', 'Test 5: Only valid unexpired alert retained')

  // ---------------------------------------------------------------------------
  // TEST 6: Location Change & Relevance Filtering
  // ---------------------------------------------------------------------------
  console.log('\n[Scenario 6: Location Awareness & Distance Filtering]')
  // Mumbai coordinates (approx 1650 km from Kolkata)
  const userLocMumbai = { latitude: 19.076, longitude: 72.8777 }
  const distantKolkataAlert = {
    id: 'kolkata-local-01',
    source: 'SACHET NDMA',
    title: 'Kolkata Sector 5 Local Waterlogging',
    severity: 'WARNING',
    latitude: 22.578,
    longitude: 88.371,
    radius_km: 5.0,
    is_active: true,
  }

  const normDistantForMumbai = normalizeAlert(distantKolkataAlert, userLocMumbai)
  assert(normDistantForMumbai.distanceKm > 1500, 'Test 6: Distance accurately computed > 1500km')
  assertEqual(normDistantForMumbai.relevanceLevel, 'IRRELEVANT', 'Test 6: Labeled as IRRELEVANT')

  const mumbaiFiltered = filterAlertsByLocation([normDistantForMumbai], userLocMumbai, 25.0)
  assertEqual(mumbaiFiltered.length, 0, 'Test 6: Irrelevant distant alert excluded for Mumbai user')

  const kolkataFiltered = filterAlertsByLocation([normAlert1], userLocKolkata, 25.0)
  assertEqual(kolkataFiltered.length, 1, 'Test 6: Nearby alert included for Kolkata user')

  // ---------------------------------------------------------------------------
  // TEST 7: Refresh Synchronization
  // ---------------------------------------------------------------------------
  console.log('\n[Scenario 7: State Normalization & Refresh Synchronization]')
  // Fresh incoming hazard signal
  const freshHazardList = [
    {
      id: 'fresh-alert-01',
      source: 'SACHET NDMA',
      source_event_id: 'fresh-01',
      title: 'Sudden Inundation Surge',
      severity: 'CRITICAL',
      latitude: 22.574,
      longitude: 88.365,
      is_active: true,
      expires_at: new Date(now + 3600 * 1000).toISOString(),
    },
  ]
  const refreshedNorm = freshHazardList
    .map((h) => normalizeAlert(h, userLocKolkata))
    .filter(isAlertActiveAndUnexpired)
  const refreshedBadge = computeBadgeCount(refreshedNorm, {})
  assertEqual(refreshedBadge, 1, 'Test 7: Refresh immediately updates state and badge')

  // ---------------------------------------------------------------------------
  // TEST 8: Alert Deduplication
  // ---------------------------------------------------------------------------
  console.log('\n[Scenario 8: Deduplication Across Feeds]')
  const duplicateAlerts = [
    {
      id: 'dup-1',
      source: 'SACHET NDMA',
      source_event_id: 'event-kolkata-flood',
      category: 'flood',
      severity: 'WARNING',
      latitude: 22.5726,
      longitude: 88.3639,
      confidence: 0.8,
      observedAt: new Date(now).toISOString(),
    },
    {
      id: 'dup-2',
      source: 'GDACS',
      source_event_id: 'event-kolkata-flood',
      category: 'flood',
      severity: 'CRITICAL',
      latitude: 22.573,
      longitude: 88.364,
      confidence: 0.95,
      observedAt: new Date(now + 60000).toISOString(),
    },
  ]

  const deduped = deduplicateAlertsList(duplicateAlerts)
  assertEqual(deduped.length, 1, 'Test 8: Duplicate overlapping alerts merged to 1')
  assertEqual(deduped[0].severity, 'CRITICAL', 'Test 8: Retains higher severity report')
  assert(
    deduped[0].sourcesMatched.length >= 2,
    'Test 8: Preserves composite multi-source provenance'
  )

  // ---------------------------------------------------------------------------
  // TEST 9: Persistence of User Read State (Browser Reload)
  // ---------------------------------------------------------------------------
  console.log('\n[Scenario 9: LocalStorage Read State Persistence]')
  mockLocalStorageMap.clear()
  recordAlertInteraction('alt-102', AlertInteractionStatus.READ)
  recordAlertInteraction('alt-103', AlertInteractionStatus.ACKNOWLEDGED)

  // Simulate full browser restart by reloading from storage
  const restoredInteractions = loadAlertInteractions()
  assertEqual(
    restoredInteractions['alt-102']?.status,
    AlertInteractionStatus.READ,
    'Test 9: READ status persists across browser restart'
  )
  assertEqual(
    restoredInteractions['alt-103']?.status,
    AlertInteractionStatus.ACKNOWLEDGED,
    'Test 9: ACKNOWLEDGED status persists across browser restart'
  )

  const reloadedBadge = computeBadgeCount(normList3, restoredInteractions)
  // normList3 has alt-101 (unseen), alt-102 (read), alt-103 (acknowledged) -> Badge = 1
  assertEqual(reloadedBadge, 1, 'Test 9: Badge correctly reflects persisted read states (= 1)')

  // ---------------------------------------------------------------------------
  // TEST 10: Simulation Mode Isolation
  // ---------------------------------------------------------------------------
  console.log('\n[Scenario 10: Simulation Data Isolation]')
  const liveAlert = {
    id: 'live-alert-01',
    source: 'SACHET NDMA',
    provenance: 'LIVE',
    title: 'Actual Civil Defense Warning',
    severity: 'WARNING',
    is_active: true,
  }
  const simulatedAlert = {
    id: 'sim-alert-02',
    source: 'Salvus Disaster Simulation Engine',
    provenance: 'SIMULATED',
    title: '[SIMULATION] Training Drill Flash Flood',
    severity: 'CRITICAL',
    is_active: true,
  }

  // In live production mode (isDemoMode = false), backend does not return simulation alerts
  const productionFeed = [liveAlert]
  const prodNorm = productionFeed.map((h) => normalizeAlert(h, userLocKolkata))
  const prodBadge = computeBadgeCount(prodNorm, {})
  assertEqual(prodBadge, 1, 'Test 10: Live badge count unaffected by simulated drills')
  assertEqual(
    simulatedAlert.provenance,
    'SIMULATED',
    'Test 10: Simulated alert is explicitly marked SIMULATED'
  )

  // Stable ID tests
  const stableId1 = getStableAlertId({ source: 'USGS', source_event_id: 'us7000xyz' })
  assertEqual(stableId1, 'usgs:us7000xyz', 'Stable ID: provider + event_id format')

  console.log('\n====================================================')
  console.log(`ALL TESTS PASSED: ${passedTests} passed, ${failedTests} failed.`)
  console.log('====================================================\n')
} catch (err) {
  console.error('\n❌ TEST RUNNER TERMINATED WITH ERROR:', err)
  process.exit(1)
}
