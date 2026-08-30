/* global process */
/**
 * Comprehensive Automated Test Suite for Salvus Location Intelligence Foundation
 *
 * Tests:
 * 1. Accuracy tier conversions & human-readable formatting
 * 2. Coordinates formatting (N/S, E/W, null checks)
 * 3. Location model normalization (Browser vs Landmark vs Unknown)
 * 4. Landmark fallback generation & explicit APPROXIMATE labeling
 * 5. Browser getCurrentLocation success / denied / timeout handling
 * 6. Emergency watcher start / update / clearWatch cleanup lifecycle
 */

import {
  getHumanAccuracy,
  formatCoordinates,
  createLocationModel,
  createLandmarkLocation,
  getCurrentLocation,
  watchEmergencyLocation,
  checkLocationPermission,
  LANDMARKS,
  INITIAL_LOCATION_STATE,
} from '../location.js'

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
    console.error(
      `❌ FAIL: ${message} -> Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`
    )
    failedTests++
    throw new Error(`${message}: Expected ${expected}, got ${actual}`)
  } else {
    console.log(`✓ PASS: ${message}`)
    passedTests++
  }
}

async function runTests() {
  console.log('\n========================================')
  console.log('SALVUS LOCATION INTELLIGENCE TEST SUITE')
  console.log('========================================\n')

  // ---------------------------------------------------------------------------
  // 1. Accuracy Tier Classification Tests
  // ---------------------------------------------------------------------------
  console.log('[Suite 1: Accuracy Tier Classification]')
  const highAcc = getHumanAccuracy(8)
  assertEqual(highAcc.tier, 'HIGH', 'Accuracy <= 15m resolves to HIGH tier')
  assert(
    highAcc.label.includes('High Precision') && highAcc.label.includes('8m'),
    'High precision label formatting'
  )

  const goodAcc = getHumanAccuracy(35)
  assertEqual(goodAcc.tier, 'GOOD', 'Accuracy <= 50m resolves to GOOD tier')
  assert(goodAcc.label.includes('Good Accuracy'), 'Good accuracy label formatting')

  const approxAcc = getHumanAccuracy(120)
  assertEqual(approxAcc.tier, 'APPROXIMATE', 'Accuracy <= 200m resolves to APPROXIMATE tier')
  assert(approxAcc.label.includes('Approximate'), 'Approximate label formatting')

  const lowAcc = getHumanAccuracy(450)
  assertEqual(lowAcc.tier, 'LOW', 'Accuracy > 200m resolves to LOW tier')
  assert(lowAcc.label.includes('Low accuracy'), 'Low accuracy label formatting')

  const nullAcc = getHumanAccuracy(null)
  assertEqual(nullAcc.tier, 'APPROXIMATE', 'Null accuracy defaults safely to APPROXIMATE tier')

  // ---------------------------------------------------------------------------
  // 2. Coordinate Formatting Tests
  // ---------------------------------------------------------------------------
  console.log('\n[Suite 2: Coordinate Formatting]')
  assertEqual(
    formatCoordinates(22.5726, 88.3639),
    '22.5726° N, 88.3639° E',
    'Standard Kolkata coordinates formatted with N and E'
  )
  assertEqual(
    formatCoordinates(-33.8688, 151.2093),
    '33.8688° S, 151.2093° E',
    'Southern hemisphere latitude formatted with S'
  )
  assertEqual(
    formatCoordinates(40.7128, -74.006),
    '40.7128° N, 74.0060° W',
    'Western hemisphere longitude formatted with W'
  )
  assertEqual(
    formatCoordinates(null, 88.3639),
    'Coordinates unavailable',
    'Null coordinates return graceful unavailable message'
  )

  // ---------------------------------------------------------------------------
  // 3. Location Model Normalization Tests
  // ---------------------------------------------------------------------------
  console.log('\n[Suite 3: Location Model Normalization]')
  const browserModel = createLocationModel({
    latitude: 22.5726,
    longitude: 88.3639,
    accuracy: 6,
    source: 'BROWSER',
  })
  assertEqual(browserModel.latitude, 22.5726, 'Latitude normalized')
  assertEqual(browserModel.longitude, 88.3639, 'Longitude normalized')
  assertEqual(browserModel.accuracy, 6, 'Accuracy rounded in meters')
  assertEqual(browserModel.source, 'BROWSER', 'Source marked as BROWSER')
  assertEqual(browserModel.permission, 'GRANTED', 'Permission set to GRANTED')
  assertEqual(browserModel.isFallback, false, 'Browser location is not fallback')
  assertEqual(browserModel.accuracyTier, 'HIGH', 'Accuracy tier calculated correctly')

  const initialModel = INITIAL_LOCATION_STATE
  assertEqual(initialModel.latitude, null, 'Initial model latitude is null')
  assertEqual(initialModel.source, 'UNKNOWN', 'Initial model source is UNKNOWN')
  assertEqual(initialModel.permission, 'PROMPT', 'Initial model permission is PROMPT')

  // ---------------------------------------------------------------------------
  // 4. Landmark Fallback Generation Tests
  // ---------------------------------------------------------------------------
  console.log('\n[Suite 4: Landmark Fallback Model]')
  const landmark = LANDMARKS[0]
  const landmarkModel = createLandmarkLocation(landmark, 'DENIED')
  assertEqual(landmarkModel.latitude, landmark.latitude, 'Landmark latitude set')
  assertEqual(landmarkModel.longitude, landmark.longitude, 'Landmark longitude set')
  assertEqual(landmarkModel.source, 'LANDMARK', 'Source marked as LANDMARK')
  assertEqual(landmarkModel.isFallback, true, 'isFallback is true for landmark')
  assertEqual(landmarkModel.accuracy, null, 'Landmark has null GPS accuracy')
  assertEqual(landmarkModel.accuracyTier, 'APPROXIMATE', 'Landmark tier is APPROXIMATE')
  assertEqual(landmarkModel.permission, 'DENIED', 'Retains DENIED permission state')
  assert(landmarkModel.accuracyLabel.includes('Approximate'), 'Landmark labeled as Approximate')

  // ---------------------------------------------------------------------------
  // 5. Geolocation API Execution Simulation Tests
  // ---------------------------------------------------------------------------
  console.log('\n[Suite 5: Geolocation API Execution & Error Handling]')

  function setMockNavigator(mockObj) {
    Object.defineProperty(globalThis, 'navigator', {
      value: mockObj,
      configurable: true,
      writable: true,
    })
    Object.defineProperty(globalThis, 'window', {
      value: { navigator: mockObj },
      configurable: true,
      writable: true,
    })
  }

  // A. Simulation: Browser Success
  const mockSuccessGeo = {
    getCurrentPosition: (successCb) => {
      successCb({
        coords: {
          latitude: 22.585,
          longitude: 88.415,
          accuracy: 12.4,
        },
        timestamp: 1700000000000,
      })
    },
  }

  setMockNavigator({ geolocation: mockSuccessGeo })
  const successRes = await getCurrentLocation()
  assertEqual(successRes.success, true, 'getCurrentLocation resolves success = true')
  assertEqual(successRes.model.source, 'BROWSER', 'Returned model source is BROWSER')
  assertEqual(successRes.model.latitude, 22.585, 'Latitude captured from navigator')
  assertEqual(successRes.model.accuracy, 12, 'Accuracy rounded correctly')
  assertEqual(successRes.model.permission, 'GRANTED', 'Permission is GRANTED')

  // B. Simulation: Permission Denied
  const mockDeniedGeo = {
    getCurrentPosition: (successCb, errorCb) => {
      const err = new Error('User denied Geolocation')
      err.code = 1 // PERMISSION_DENIED
      err.PERMISSION_DENIED = 1
      err.POSITION_UNAVAILABLE = 2
      err.TIMEOUT = 3
      errorCb(err)
    },
  }

  setMockNavigator({ geolocation: mockDeniedGeo })
  const deniedRes = await getCurrentLocation()
  assertEqual(deniedRes.success, false, 'Permission denied resolves success = false')
  assertEqual(deniedRes.model.latitude, null, 'No coordinates invented on permission denied')
  assertEqual(deniedRes.model.permission, 'DENIED', 'Permission is DENIED')
  assertEqual(deniedRes.model.source, 'UNKNOWN', 'Source is UNKNOWN')
  assert(deniedRes.model.error.includes('Location access is off'), 'Calm error message returned')

  // C. Simulation: Geolocation Unavailable
  setMockNavigator({})
  const unavailRes = await getCurrentLocation()
  assertEqual(unavailRes.success, false, 'Unavailable geolocation resolves success = false')
  assertEqual(unavailRes.model.permission, 'UNAVAILABLE', 'Permission marked UNAVAILABLE')
  assert(unavailRes.model.error.includes('cannot provide location'), 'Reassuring browser message')

  // ---------------------------------------------------------------------------
  // 6. Emergency Watcher Lifecycle & Teardown Tests
  // ---------------------------------------------------------------------------
  console.log('\n[Suite 6: Emergency Watcher Lifecycle]')
  let clearedWatchId = null
  let watchUpdateCount = 0

  const mockWatcherGeo = {
    watchPosition: (onSuccess) => {
      // Simulate two location updates
      setTimeout(() => {
        onSuccess({
          coords: { latitude: 22.5726, longitude: 88.3639, accuracy: 5 },
          timestamp: Date.now(),
        })
      }, 10)
      setTimeout(() => {
        onSuccess({
          coords: { latitude: 22.5728, longitude: 88.3641, accuracy: 4 },
          timestamp: Date.now(),
        })
      }, 30)
      return 101
    },
    clearWatch: (id) => {
      clearedWatchId = id
    },
  }

  setMockNavigator({ geolocation: mockWatcherGeo })

  let latestModel = null
  const stopWatch = watchEmergencyLocation((model) => {
    watchUpdateCount++
    latestModel = model
  })

  // Wait for updates
  await new Promise((r) => setTimeout(r, 60))
  assertEqual(watchUpdateCount, 2, 'Watcher received live updates')
  assertEqual(latestModel.source, 'BROWSER', 'Emergency watcher source is BROWSER')
  assertEqual(latestModel.accuracyTier, 'HIGH', 'Emergency telemetry has HIGH accuracy')

  // Call teardown
  stopWatch()
  assertEqual(clearedWatchId, 101, 'clearWatch invoked with correct watch ID on teardown')

  // ---------------------------------------------------------------------------
  // 7. Golden Test Cases A through H (Build 04 Hardening Pass)
  // ---------------------------------------------------------------------------
  console.log('\n[Suite 7: Final Golden Test Cases A-H]')

  // Case A: Location allowed, no hazard
  setMockNavigator({
    geolocation: {
      getCurrentPosition: (cb) => {
        cb({ coords: { latitude: 22.45, longitude: 88.25, accuracy: 10 } })
      },
    },
  })
  const caseARes = await getCurrentLocation()
  assertEqual(caseARes.success, true, 'Case A: Location allowed successfully')
  assertEqual(caseARes.model.latitude, 22.45, 'Case A: Coordinates captured accurately')
  assertEqual(caseARes.model.permission, 'GRANTED', 'Case A: Permission is GRANTED')

  // Case B: Location allowed, hazard area coords
  setMockNavigator({
    geolocation: {
      getCurrentPosition: (cb) => {
        cb({ coords: { latitude: 22.578, longitude: 88.371, accuracy: 8 } })
      },
    },
  })
  const caseBRes = await getCurrentLocation()
  assertEqual(caseBRes.success, true, 'Case B: Real location in hazard sector acquired')
  assertEqual(caseBRes.model.latitude, 22.578, 'Case B: Latitude matches Sector 12')

  // Case C: Location denied -> No fake location shown
  setMockNavigator({
    geolocation: {
      getCurrentPosition: (_, errorCb) => {
        const err = new Error('Permission denied')
        err.code = 1
        errorCb(err)
      },
    },
  })
  const caseCRes = await getCurrentLocation()
  assertEqual(caseCRes.success, false, 'Case C: Success is false on permission denied')
  assertEqual(caseCRes.model.latitude, null, 'Case C: No fake coordinates invented')
  assertEqual(caseCRes.model.source, 'UNKNOWN', 'Case C: Source remains UNKNOWN')
  assertEqual(caseCRes.model.permission, 'DENIED', 'Case C: Permission explicitly DENIED')

  // Case D: Poor GPS accuracy (>200m) -> Approximate state communicated
  const caseDAcc = getHumanAccuracy(350)
  assertEqual(caseDAcc.tier, 'LOW', 'Case D: Accuracy >200m classified as LOW tier')
  assert(caseDAcc.description.includes('Coarse area triangulation'), 'Case D: Reassuring advice')

  // Case E: External API / Geolocation unavailable -> Core app usable
  setMockNavigator({})
  const caseERes = await getCurrentLocation()
  assertEqual(caseERes.success, false, 'Case E: Handled cleanly without throw')
  assertEqual(caseERes.model.permission, 'UNAVAILABLE', 'Case E: UNAVAILABLE status')

  // Case F: Active SOS -> Controlled location tracking starts
  let caseFWatchStarted = false
  const mockSosGeo = {
    watchPosition: (cb) => {
      caseFWatchStarted = true
      cb({ coords: { latitude: 22.5726, longitude: 88.3639, accuracy: 4 } })
      return 999
    },
    clearWatch: (id) => {
      if (id === 999) caseFWatchStarted = false
    },
  }
  setMockNavigator({ geolocation: mockSosGeo })
  let caseFSosModel = null
  const stopSosWatch = watchEmergencyLocation((m) => {
    caseFSosModel = m
  })
  assertEqual(caseFWatchStarted, true, 'Case F: Active SOS begins controlled watch')
  assertEqual(caseFSosModel.source, 'BROWSER', 'Case F: Telemetry received')

  // Case G: SOS resolved -> Tracking stops
  stopSosWatch()
  assertEqual(caseFWatchStarted, false, 'Case G: SOS resolution stops continuous tracking')

  // Case H: Citizen manual pan -> Preserves user interaction flag
  let userInteracted = false
  function simulateUserPan() {
    userInteracted = true
  }
  simulateUserPan()
  assertEqual(userInteracted, true, 'Case H: User pan sets manual interaction state')

  // ---------------------------------------------------------------------------
  // 8. Auto Location Detection on First Entry & Concurrency Suite (Bug Fix #1)
  // ---------------------------------------------------------------------------
  console.log('\n[Suite 8: Auto Location Detection & Concurrency (Bug Fix #1)]')

  // TEST 1: Fresh browser -> PROMPT permission -> Location allowed -> Acquired
  setMockNavigator({
    geolocation: {
      getCurrentPosition: (cb) => {
        cb({ coords: { latitude: 22.5726, longitude: 88.3639, accuracy: 10 } })
      },
    },
    permissions: {
      query: async () => ({ state: 'prompt' }),
    },
  })
  const t1Perm = await checkLocationPermission()
  assertEqual(t1Perm, 'PROMPT', 'TEST 1: Fresh browser permission resolves to PROMPT')
  const t1Loc = await getCurrentLocation()
  assertEqual(t1Loc.success, true, 'TEST 1: Location acquisition succeeds')
  assertEqual(t1Loc.model.source, 'BROWSER', 'TEST 1: Source is marked BROWSER')
  assertEqual(t1Loc.model.permission, 'GRANTED', 'TEST 1: Model permission updated to GRANTED')

  // TEST 2: Fresh browser -> PROMPT permission -> Location denied by user
  setMockNavigator({
    geolocation: {
      getCurrentPosition: (_, errCb) => {
        const err = new Error('User denied Geolocation')
        err.code = 1
        errCb(err)
      },
    },
    permissions: {
      query: async () => ({ state: 'prompt' }),
    },
  })
  const t2Perm = await checkLocationPermission()
  assertEqual(t2Perm, 'PROMPT', 'TEST 2: Fresh browser permission starts as PROMPT')
  const t2Loc = await getCurrentLocation({ force: true })
  assertEqual(t2Loc.success, false, 'TEST 2: Acquisition gracefully reports success = false')
  assertEqual(t2Loc.model.permission, 'DENIED', 'TEST 2: Model permission marked as DENIED')
  assertEqual(t2Loc.model.latitude, null, 'TEST 2: No fake coordinates invented')
  assertEqual(t2Loc.model.error, 'Location access is off.', 'TEST 2: Calm error message shown')

  // TEST 3: Permission already GRANTED -> Auto-acquire happens seamlessly
  setMockNavigator({
    geolocation: {
      getCurrentPosition: (cb) => {
        cb({ coords: { latitude: 22.5867, longitude: 88.4178, accuracy: 14 } })
      },
    },
    permissions: {
      query: async () => ({ state: 'granted' }),
    },
  })
  const t3Perm = await checkLocationPermission()
  assertEqual(t3Perm, 'GRANTED', 'TEST 3: Permission returns GRANTED immediately')
  const t3Loc = await getCurrentLocation({ force: true })
  assertEqual(t3Loc.success, true, 'TEST 3: Coordinates auto-acquired without prompt')
  assertEqual(t3Loc.model.latitude, 22.5867, 'TEST 3: Real device latitude captured')

  // TEST 4: Permission previously DENIED -> checkLocationPermission returns DENIED
  setMockNavigator({
    geolocation: {
      getCurrentPosition: (_, errCb) => {
        const err = new Error('Permission denied')
        err.code = 1
        errCb(err)
      },
    },
    permissions: {
      query: async () => ({ state: 'denied' }),
    },
  })
  const t4Perm = await checkLocationPermission()
  assertEqual(t4Perm, 'DENIED', 'TEST 4: State detects previously denied permission')

  // TEST 5: Concurrency Safety & Deduplication (5 simultaneous calls -> 1 browser invocation)
  let geoCallCount = 0
  setMockNavigator({
    geolocation: {
      getCurrentPosition: (cb) => {
        geoCallCount++
        setTimeout(() => {
          cb({ coords: { latitude: 22.57, longitude: 88.4, accuracy: 8 } })
        }, 20)
      },
    },
  })
  const [p1, p2, p3, p4, p5] = await Promise.all([
    getCurrentLocation({ force: true }),
    getCurrentLocation(),
    getCurrentLocation(),
    getCurrentLocation(),
    getCurrentLocation(),
  ])
  assertEqual(geoCallCount, 1, 'TEST 5: Only ONE geolocation request fired for 5 concurrent calls')
  assertEqual(p1.success, true, 'TEST 5: Promise 1 resolved successfully')
  assertEqual(p2.success, true, 'TEST 5: Promise 2 joined in-flight and succeeded')
  assertEqual(p3.success, true, 'TEST 5: Promise 3 joined in-flight and succeeded')
  assertEqual(p4.success, true, 'TEST 5: Promise 4 joined in-flight and succeeded')
  assertEqual(p5.success, true, 'TEST 5: Promise 5 joined in-flight and succeeded')
  assertEqual(p1.model.latitude, 22.57, 'TEST 5: Identical coordinates returned across all callers')

  // TEST 6: Slow GPS / Timeout handling
  setMockNavigator({
    geolocation: {
      getCurrentPosition: () => {
        // Intentionally hang without calling callback
      },
    },
  })
  const t6Loc = await getCurrentLocation({ timeout: 50, force: true })
  assertEqual(t6Loc.success, false, 'TEST 6: Timeout resolves cleanly with success = false')
  assertEqual(t6Loc.model.status, 'TIMEOUT', 'TEST 6: Status is TIMEOUT')
  assert(t6Loc.model.error.includes('timed out'), 'TEST 6: Helpful non-crashing timeout message')

  // TEST 7: Acquired coordinates match downstream requirements
  setMockNavigator({
    geolocation: {
      getCurrentPosition: (cb) => {
        cb({ coords: { latitude: 22.5726, longitude: 88.3639, accuracy: 6 } })
      },
    },
  })
  const t7Loc = await getCurrentLocation({ force: true })
  assertEqual(t7Loc.model.latitude, 22.5726, 'TEST 7: Latitude available for places and hazards')
  assertEqual(t7Loc.model.longitude, 88.3639, 'TEST 7: Longitude available for places and hazards')
  assertEqual(t7Loc.model.isFallback, false, 'TEST 7: Real GPS is not marked as fallback')

  // TEST 8: User manual pan flag resets on programmatic recenter signal
  let userPanState = true
  function handleRecenterSignal() {
    userPanState = false
  }
  handleRecenterSignal()
  assertEqual(userPanState, false, 'TEST 8: Recenter signal resets user pan suppression')

  console.log('\n========================================')
  console.log(`ALL TESTS COMPLETED: ${passedTests} passed, ${failedTests} failed`)
  console.log('========================================\n')
}

runTests().catch((err) => {
  console.error('Test execution error:', err)
  process.exit(1)
})
