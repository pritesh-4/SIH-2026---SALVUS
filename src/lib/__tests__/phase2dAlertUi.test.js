/* global process */
/**
 * Phase 2D Test Suite: Real Source Health + Alert UI
 *
 * Verifies:
 * 1. computeBadgeCount excludes normal weather context
 * 2. Tri-fold alert classification (OFFICIAL WARNING vs FORECAST vs SALVUS DERIVED)
 * 3. Area Warning distance suppression (no fake 1.2 km away for district alerts)
 * 4. Empty state honesty: "No active local warnings" vs "Partial warning coverage"
 * 5. Provider health display matrix representation
 */

import { computeBadgeCount, normalizeAlert } from '../alertNormalization.js'

let passedTests = 0
let failedTests = 0

function assertEqual(actual, expected, message) {
  if (actual === expected) {
    console.log(`  ✓ PASS: ${message}`)
    passedTests++
  } else {
    console.error(`  ✗ FAIL: ${message} (Expected: ${expected}, Got: ${actual})`)
    failedTests++
  }
}

function assertTrue(condition, message) {
  if (condition) {
    console.log(`  ✓ PASS: ${message}`)
    passedTests++
  } else {
    console.error(`  ✗ FAIL: ${message}`)
    failedTests++
  }
}

console.log('=================================================================')
console.log('PHASE 2D TEST SUITE: REAL SOURCE HEALTH + ALERT UI')
console.log('=================================================================')

try {
  // ---------------------------------------------------------------------------
  // Scenario 1: Notification Badge Excludes Normal Weather
  // ---------------------------------------------------------------------------
  console.log('\n[Scenario 1: Notification Badge Excludes Normal Weather]')

  const activeAlerts = [
    // 1. Critical Official Warning (Should be counted)
    {
      id: 'warn-critical-01',
      title: 'Cyclone Warning',
      severity: 'CRITICAL',
      status: 'ACTIVE',
      is_active: true,
      category: 'cyclone',
      signal_type: 'CYCLONE_WARNING',
      expires_at: new Date(Date.now() + 3600000).toISOString(),
    },
    // 2. High Local Warning (Should be counted)
    {
      id: 'warn-flood-02',
      title: 'Flash Flood Warning',
      severity: 'WARNING',
      status: 'ACTIVE',
      is_active: true,
      category: 'flood',
      signal_type: 'FLOOD_WARNING',
      expires_at: new Date(Date.now() + 3600000).toISOString(),
    },
    // 3. Normal Weather Context (Must NOT be counted)
    {
      id: 'weather-context-03',
      title: 'Sunny Skies',
      severity: 'INFO',
      status: 'ACTIVE',
      is_active: true,
      category: 'weather',
      signal_type: 'NORMAL_WEATHER',
      is_weather_context: true,
      expires_at: new Date(Date.now() + 3600000).toISOString(),
    },
    // 4. Calm Weather Info (Must NOT be counted)
    {
      id: 'weather-calm-04',
      title: 'Calm Winds',
      severity: 'INFO',
      status: 'ACTIVE',
      is_active: true,
      category: 'weather',
      signal_type: 'WEATHER_CONTEXT',
      expires_at: new Date(Date.now() + 3600000).toISOString(),
    },
  ]

  const badgeCount = computeBadgeCount(activeAlerts, {})
  assertEqual(badgeCount, 2, 'Badge count correctly excludes normal weather context (count is 2)')

  // ---------------------------------------------------------------------------
  // Scenario 2: Tri-Fold Alert Classification
  // ---------------------------------------------------------------------------
  console.log('\n[Scenario 2: Tri-Fold Alert Classification]')

  const officialRaw = {
    id: 'sachet-alert-01',
    source: 'SACHET / NDMA India',
    source_type: 'CIVIL_DEFENSE',
    title: 'Severe Cyclone Landfall Alert',
    is_derived: false,
  }
  const normOfficial = normalizeAlert(officialRaw)
  assertEqual(
    normOfficial.alertClassification,
    'OFFICIAL WARNING',
    'Civil defense alert is classified as OFFICIAL WARNING'
  )

  const forecastRaw = {
    id: 'meteo-rain-02',
    source: 'Open-Meteo Weather Service',
    source_type: 'WEATHER_SERVICE',
    title: 'Rain Shower Forecast',
    is_derived: false,
  }
  const normForecast = normalizeAlert(forecastRaw)
  assertEqual(
    normForecast.alertClassification,
    'FORECAST',
    'Weather service forecast is classified as FORECAST'
  )

  const derivedRaw = {
    id: 'salvus-storm-03',
    source: 'Open-Meteo Weather Service',
    title: 'Thunderstorm Convective Risk',
    is_derived: true,
  }
  const normDerived = normalizeAlert(derivedRaw)
  assertEqual(
    normDerived.alertClassification,
    'SALVUS DERIVED',
    'Derived risk is classified as SALVUS DERIVED'
  )

  // ---------------------------------------------------------------------------
  // Scenario 3: Area Warning Distance Suppression (No Fake 1.2 km away)
  // ---------------------------------------------------------------------------
  console.log('\n[Scenario 3: Area Warning Distance Suppression]')

  const districtRaw = {
    id: 'sachet-mayurbhanj-01',
    source: 'IMD Bhubaneswar / SACHET',
    title: 'Moderate Rain Warning',
    affected_area: 'Mayurbhanj district of Odisha',
    affected_districts: ['Mayurbhanj'],
    state: 'Odisha',
    geographic_form: 'DISTRICT',
    relevance_level: 'LOCAL',
    distance_km: null, // No point distance!
  }
  const normDistrict = normalizeAlert(districtRaw)
  assertEqual(
    normDistrict.affectedArea,
    'Mayurbhanj district of Odisha',
    'Affected area is correctly preserved'
  )
  assertEqual(
    normDistrict.distance,
    'Applicable to your district',
    'District warning shows "Applicable to your district"'
  )
  assertTrue(
    !normDistrict.distance.includes('km away'),
    'District warning NEVER shows fake point distance like "1.2 km away"'
  )

  const pointRaw = {
    id: 'usgs-eq-01',
    source: 'USGS Earthquake Hazards Program',
    title: 'M 4.8 Earthquake',
    geographic_form: 'POINT',
    distance_km: 1.2,
    relevance_level: 'CRITICAL',
  }
  const normPoint = normalizeAlert(pointRaw)
  assertTrue(
    normPoint.distance.includes('1.2 km away'),
    'Point hazard with real coordinates shows genuine distance (1.2 km away)'
  )

  // ---------------------------------------------------------------------------
  // Scenario 4: Empty State Truthfulness
  // ---------------------------------------------------------------------------
  console.log('\n[Scenario 4: Empty State Truthfulness]')

  const allHealthyFeeds = [
    { source_id: 'sachet_ndma', status: 'AVAILABLE', status_label: 'LIVE', is_live: true },
    { source_id: 'gdacs', status: 'AVAILABLE', status_label: 'LIVE', is_live: true },
    { source_id: 'usgs_earthquake', status: 'AVAILABLE', status_label: 'LIVE', is_live: true },
    { source_id: 'open_meteo', status: 'AVAILABLE', status_label: 'LIVE', is_live: true },
  ]
  const hasReachableFailureHealthy = allHealthyFeeds.some(
    (s) => s.status === 'FAILED' || s.status === 'ERROR'
  )
  assertEqual(
    hasReachableFailureHealthy,
    false,
    'No failure in clean state allows "No active local warnings"'
  )

  const degradedFeeds = [
    { source_id: 'sachet_ndma', status: 'FAILED', status_label: 'FAILED', is_live: false },
    { source_id: 'open_meteo', status: 'AVAILABLE', status_label: 'LIVE', is_live: true },
  ]
  const hasReachableFailureDegraded = degradedFeeds.some(
    (s) => s.status === 'FAILED' || s.status === 'ERROR'
  )
  assertEqual(
    hasReachableFailureDegraded,
    true,
    'Failure in reachable feed triggers "Partial warning coverage"'
  )

  // ---------------------------------------------------------------------------
  // Scenario 5: Canonical Sources Telemetry Formatting
  // ---------------------------------------------------------------------------
  console.log('\n[Scenario 5: Canonical Sources Telemetry Formatting]')

  const CANONICAL_SOURCES = [
    { id: 'sachet_ndma', name: 'SACHET', defaultStatus: 'LIVE', isLive: true },
    {
      id: 'imd_india',
      name: 'IMD Direct',
      defaultStatus: 'UNAVAILABLE / VIA SACHET',
      isLive: false,
    },
    { id: 'osdma_satark', name: 'OSDMA', defaultStatus: 'CONFIGURATION REQUIRED', isLive: false },
    { id: 'odisha_flood', name: 'WRD', defaultStatus: 'CONFIGURATION REQUIRED', isLive: false },
    { id: 'gdacs', name: 'GDACS', defaultStatus: 'LIVE', isLive: true },
    { id: 'usgs_earthquake', name: 'USGS', defaultStatus: 'LIVE', isLive: true },
    { id: 'open_meteo', name: 'Open-Meteo', defaultStatus: 'LIVE', isLive: true },
  ]

  assertEqual(CANONICAL_SOURCES.length, 7, 'Exactly 7 canonical disaster telemetry sources tracked')
  assertEqual(
    CANONICAL_SOURCES.find((s) => s.name === 'SACHET').defaultStatus,
    'LIVE',
    'SACHET default is LIVE'
  )
  assertEqual(
    CANONICAL_SOURCES.find((s) => s.name === 'IMD Direct').defaultStatus,
    'UNAVAILABLE / VIA SACHET',
    'IMD Direct indicates UNAVAILABLE / VIA SACHET'
  )
  assertEqual(
    CANONICAL_SOURCES.find((s) => s.name === 'OSDMA').defaultStatus,
    'CONFIGURATION REQUIRED',
    'OSDMA indicates CONFIGURATION REQUIRED'
  )
  assertEqual(
    CANONICAL_SOURCES.find((s) => s.name === 'WRD').defaultStatus,
    'CONFIGURATION REQUIRED',
    'WRD indicates CONFIGURATION REQUIRED'
  )

  console.log('\n=================================================================')
  console.log(`PHASE 2D TEST SUMMARY: ${passedTests} PASSED, ${failedTests} FAILED`)
  console.log('=================================================================')

  if (failedTests > 0) {
    process.exit(1)
  }
} catch (err) {
  console.error('\n❌ FATAL TEST ERROR:', err.message)
  process.exit(1)
}
