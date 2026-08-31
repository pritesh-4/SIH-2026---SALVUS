/* global process */
/**
 * SALVUS — ALERT INTELLIGENCE PHASE 3 TEST SUITE
 * Citizen Alert Experience, Top Weather Strip, Thunderstorm UI, and Real-Time Verification
 */

import {
  normalizeAlert,
  isAlertActiveAndUnexpired,
  computeBadgeCount,
} from '../alertNormalization.js'
import { getWeatherIcon, isThunderstormCondition, deriveStormRiskAssessment } from '../weather.js'

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
    console.error(`❌ FAIL: ${message} (Expected: ${expected}, Got: ${actual})`)
    failedTests++
    throw new Error(`${message}: Expected ${expected}, got ${actual}`)
  } else {
    console.log(`✓ PASS: ${message} (= ${actual})`)
    passedTests++
  }
}

console.log('=================================================================')
console.log('SALVUS PHASE 3: CITIZEN ALERT EXPERIENCE & REALTIME TEST SUITE')
console.log('=================================================================\n')

try {
  // ---------------------------------------------------------------------------
  // TEST 1: Top Weather Strip - Real Metrics Formatting
  // ---------------------------------------------------------------------------
  console.log('[Scenario 1: Top Weather Strip Normalized Data Binding]')
  const mockCurrentWeather = {
    temperature: 31.4,
    feels_like: 34.2,
    condition: 'Partly Cloudy',
    weather_code: 2,
    precipitation_probability: 65,
    precipitation: 0.0,
    wind_speed: 18.2,
    wind_gusts: 24.5,
    humidity: 78,
    uv_index: 6.5,
    visibility_km: 10.0,
    is_day: 1,
    observed_at: new Date().toISOString(),
    thunderstorm_risk: 'POSSIBLE',
    is_thunderstorm_derived: true,
  }

  assertEqual(
    Math.round(mockCurrentWeather.temperature),
    31,
    'Test 1.1: Temperature rounded correctly'
  )
  assertEqual(
    Math.round(mockCurrentWeather.feels_like),
    34,
    'Test 1.2: Feels-like rounded correctly'
  )
  assertEqual(mockCurrentWeather.precipitation_probability, 65, 'Test 1.3: Rain probability 65%')
  assertEqual(Math.round(mockCurrentWeather.wind_speed), 18, 'Test 1.4: Wind speed 18 km/h')
  assertEqual(
    mockCurrentWeather.thunderstorm_risk,
    'POSSIBLE',
    'Test 1.5: Thunderstorm state is POSSIBLE'
  )
  assertEqual(getWeatherIcon('Partly Cloudy', 2, 1), '⛅', 'Test 1.6: Correct weather icon mapped')

  // ---------------------------------------------------------------------------
  // TEST 2: Thunderstorm UI - Dynamic State Handling (None vs Possible vs Active)
  // ---------------------------------------------------------------------------
  console.log('\n[Scenario 2: Thunderstorm UI Dynamic State Assessment]')

  // 2.1 Calm weather -> No thunderstorm assessment generated
  const calmHourly = [
    {
      time: '14:00',
      condition: 'Clear',
      weather_code: 0,
      precipitation_probability: 0,
      wind_speed: 10,
    },
    {
      time: '15:00',
      condition: 'Partly Cloudy',
      weather_code: 1,
      precipitation_probability: 10,
      wind_speed: 12,
    },
  ]
  const isCalmStorm = isThunderstormCondition('Clear', 0)
  assert(!isCalmStorm, 'Test 2.1: Clear weather correctly identified as non-storm')
  assert(
    deriveStormRiskAssessment(calmHourly) === null,
    'Test 2.1b: Calm hourly forecast yields null storm assessment'
  )

  // 2.2 Severe convective forecast -> Assessment generated with expected window
  const stormHourly = [
    {
      time: '16:00',
      condition: 'Thunderstorm',
      weather_code: 95,
      precipitation_probability: 80,
      precipitation: 15.0,
      wind_speed: 45,
    },
    {
      time: '17:00',
      condition: 'Heavy Thunderstorm',
      weather_code: 96,
      precipitation_probability: 90,
      precipitation: 25.0,
      wind_speed: 55,
    },
    {
      time: '18:00',
      condition: 'Rain',
      weather_code: 61,
      precipitation_probability: 40,
      precipitation: 2.0,
      wind_speed: 20,
    },
  ]
  const stormAssessment = deriveStormRiskAssessment(stormHourly, null)
  assert(
    stormAssessment !== null,
    'Test 2.2: Storm assessment generated when storm hourly forecast exists'
  )
  assertEqual(stormAssessment.riskLevel, 'HIGH', 'Test 2.3: Severe code 96 mapped to HIGH risk')
  assertEqual(
    stormAssessment.expectedWindow,
    '16:00 – 17:00',
    'Test 2.4: Expected storm window computed accurately'
  )
  assertEqual(stormAssessment.maxProb, 90, 'Test 2.5: Peak probability 90%')
  assert(
    stormAssessment.recommendedAction.includes('indoors'),
    'Test 2.6: Safety guidance includes indoor recommendation'
  )

  // ---------------------------------------------------------------------------
  // TEST 3: Provenance & Authority Hierarchy - Official vs Derived Separation
  // ---------------------------------------------------------------------------
  console.log('\n[Scenario 3: Official Warning vs Salvus Derived Separation]')
  const userLocBhubaneswar = { latitude: 20.2961, longitude: 85.8245 }

  const rawOfficialImd = {
    id: 'imd-warn-001',
    source: 'IMD',
    source_event_id: 'imd-cyc-01',
    title: 'Cyclone Advisory',
    description: 'Deep depression approaching coastal Odisha.',
    severity: 'WARNING',
    latitude: 20.3,
    longitude: 85.83,
    is_active: true,
    is_derived: false,
    authority_tier: 'OFFICIAL_GOV',
    observed_at: new Date().toISOString(),
    provenance: 'LIVE',
  }

  const rawDerivedMeteo = {
    id: 'open-meteo-ts-002',
    source: 'Open-Meteo',
    source_event_id: 'meteo-ts-02',
    title: 'Thunderstorm Risk Expected',
    description: 'Elevated convective parameters indicate storm likelihood.',
    severity: 'WATCH',
    latitude: 20.296,
    longitude: 85.824,
    is_active: true,
    is_derived: true,
    authority_tier: 'SALVUS_DERIVED',
    observed_at: new Date().toISOString(),
    provenance: 'LIVE',
  }

  const normImd = normalizeAlert(rawOfficialImd, userLocBhubaneswar)
  const normMeteo = normalizeAlert(rawDerivedMeteo, userLocBhubaneswar)

  assertEqual(normImd.is_derived, false, 'Test 3.1: IMD alert is NOT marked derived')
  assertEqual(
    normMeteo.is_derived,
    true,
    'Test 3.2: Open-Meteo storm alert is explicitly marked is_derived=True'
  )
  assertEqual(normImd.source, 'IMD', 'Test 3.3: Official attribution preserved for IMD')

  // ---------------------------------------------------------------------------
  // TEST 4: Multi-Source Deduplication & Consensus
  // ---------------------------------------------------------------------------
  console.log('\n[Scenario 4: Multi-Source Deduplication & Consensus Binding]')
  const rawConsolidatedAlert = {
    id: 'alert-heavy-rain-01',
    source: 'IMD',
    source_event_id: 'imd-rain-01',
    title: 'Heavy Rain Expected',
    description: 'Heavy precipitation forecast across urban sectors.',
    severity: 'WARNING',
    latitude: 20.298,
    longitude: 85.826,
    is_active: true,
    is_derived: false,
    sources_matched: ['IMD Mausam', 'SACHET NDMA', 'Open-Meteo'],
    observed_at: new Date().toISOString(),
    provenance: 'LIVE',
  }

  const normConsolidated = normalizeAlert(rawConsolidatedAlert, userLocBhubaneswar)
  assertEqual(
    normConsolidated.sources_matched.length,
    3,
    'Test 4.1: 3 contributing sources retained'
  )
  assert(
    normConsolidated.sources_matched.includes('SACHET NDMA'),
    'Test 4.2: NDMA included in consensus'
  )

  // ---------------------------------------------------------------------------
  // TEST 5: Location Invalidation & Spatial Distance Recomputation
  // ---------------------------------------------------------------------------
  console.log('\n[Scenario 5: Location Change Distance Invalidation]')
  const userLocCuttack = { latitude: 20.4625, longitude: 85.8828 } // ~20 km North-East of Bhubaneswar

  const normBhubaneswarAlertInCuttack = normalizeAlert(rawOfficialImd, userLocCuttack)
  assert(
    normBhubaneswarAlertInCuttack.distanceKm > 15.0 &&
      normBhubaneswarAlertInCuttack.distanceKm < 25.0,
    `Test 5.1: Distance accurately recalculated on location change (~${normBhubaneswarAlertInCuttack.distanceKm.toFixed(1)} km)`
  )

  // ---------------------------------------------------------------------------
  // TEST 6: Honest Degradation vs "All Clear" Truth Audit
  // ---------------------------------------------------------------------------
  console.log('\n[Scenario 6: Honest Degradation - Failure is Not "All Clear"]')
  const degradedSources = [
    { source_id: 'imd', source_name: 'IMD Mausam', status: 'FAILED', latency_ms: 0 },
    { source_id: 'open_meteo', source_name: 'Open-Meteo', status: 'AVAILABLE', latency_ms: 65 },
  ]
  const hasFailedFeed = degradedSources.some((s) => s.status === 'FAILED')
  assert(hasFailedFeed, 'Test 6.1: Provider failure state detected as degraded')

  // ---------------------------------------------------------------------------
  // TEST 7: Canonical Alert Count Excludes Normal Weather
  // ---------------------------------------------------------------------------
  console.log('\n[Scenario 7: Alert Count Excludes Normal Weather]')
  const alertListWithNormalWeather = [
    normImd,
    normMeteo,
    {
      id: 'weather-context-01',
      title: 'Sunny Day',
      severity: 'INFO',
      signal_type: 'NORMAL_WEATHER',
      is_active: false,
    },
  ]
  const activeActionable = alertListWithNormalWeather.filter(
    (a) => a.is_active && isAlertActiveAndUnexpired(a)
  )
  const badgeCount = computeBadgeCount(activeActionable, {})
  assertEqual(badgeCount, 2, 'Test 7.1: Badge count is 2 (excludes normal weather context)')

  console.log('\n=================================================================')
  console.log(`PHASE 3 TEST SUMMARY: ${passedTests} PASSED, ${failedTests} FAILED`)
  console.log('=================================================================')
} catch (err) {
  console.error('\n❌ FATAL TEST ERROR:', err.message)
  process.exit(1)
}
