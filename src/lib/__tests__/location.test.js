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

  console.log('\n========================================')
  console.log(`ALL TESTS COMPLETED: ${passedTests} passed, ${failedTests} failed`)
  console.log('========================================\n')
}

runTests().catch((err) => {
  console.error('Test execution error:', err)
  process.exit(1)
})
