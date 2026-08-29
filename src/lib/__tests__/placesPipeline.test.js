/* global process */
/**
 * Automated Test Suite for Salvus Nearby Facilities Pipeline & Categorization
 *
 * Tests:
 * 1. Canonical category normalization (OSM tag mapping to controlled category IDs)
 * 2. Category filter matching (Single source of truth for counts, markers & list)
 * 3. Raw place normalization (Distance recalculation, provenance, address parsing)
 * 4. Human-readable distance formatting ('450 m away', '2.4 km away')
 * 5. Movement threshold evaluation (> 150m)
 * 6. Intelligent sorting for 'all' (emergency relevance) and specific categories (proximity)
 */

import {
  normalizePlaceCategory,
  getCategoryInfo,
  matchesCategoryFilter,
  formatDistance,
  calculateClientDistanceM,
  normalizePlace,
  hasMovedSignificantly,
  sortPlacesForCategory,
} from '../../services/placesService.js'

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

function runTests() {
  console.log('\n========================================')
  console.log('SALVUS PLACES PIPELINE TEST SUITE')
  console.log('========================================\n')

  // ---------------------------------------------------------------------------
  // 1. Canonical Category Normalization Tests
  // ---------------------------------------------------------------------------
  console.log('[Suite 1: Canonical Category Normalization]')
  assertEqual(normalizePlaceCategory('hospital'), 'hospital', 'Hospital -> hospital')
  assertEqual(normalizePlaceCategory('HOSPITAL'), 'hospital', 'HOSPITAL (uppercase) -> hospital')
  assertEqual(normalizePlaceCategory('clinic'), 'hospital', 'Clinic -> hospital')
  assertEqual(normalizePlaceCategory('CLINIC'), 'hospital', 'CLINIC -> hospital')
  assertEqual(normalizePlaceCategory('doctors'), 'hospital', 'Doctors -> hospital')

  assertEqual(normalizePlaceCategory('pharmacy'), 'pharmacy', 'Pharmacy -> pharmacy')
  assertEqual(normalizePlaceCategory('PHARMACY'), 'pharmacy', 'PHARMACY -> pharmacy')
  assertEqual(normalizePlaceCategory('chemist'), 'pharmacy', 'Chemist -> pharmacy')
  assertEqual(normalizePlaceCategory('medical_supply'), 'pharmacy', 'Medical supply -> pharmacy')

  assertEqual(normalizePlaceCategory('police'), 'police', 'Police -> police')
  assertEqual(normalizePlaceCategory('POLICE'), 'police', 'POLICE -> police')
  assertEqual(normalizePlaceCategory('police_station'), 'police', 'Police station -> police')
  assertEqual(normalizePlaceCategory('police_outpost'), 'police', 'Police outpost -> police')

  assertEqual(
    normalizePlaceCategory('fire_station'),
    'fire_station',
    'Fire station -> fire_station'
  )
  assertEqual(
    normalizePlaceCategory('FIRE_STATION'),
    'fire_station',
    'FIRE_STATION -> fire_station'
  )
  assertEqual(normalizePlaceCategory('fire'), 'fire_station', 'Fire -> fire_station')
  assertEqual(
    normalizePlaceCategory('fire_service'),
    'fire_station',
    'Fire service -> fire_station'
  )

  assertEqual(normalizePlaceCategory('shelter'), 'shelter', 'Shelter -> shelter')
  assertEqual(normalizePlaceCategory('SHELTER'), 'shelter', 'SHELTER -> shelter')
  assertEqual(normalizePlaceCategory('safe_places'), 'shelter', 'Safe places -> shelter')
  assertEqual(
    normalizePlaceCategory('evacuation_centre'),
    'shelter',
    'Evacuation centre -> shelter'
  )
  assertEqual(normalizePlaceCategory('community_centre'), 'shelter', 'Community centre -> shelter')
  assertEqual(normalizePlaceCategory('townhall'), 'shelter', 'Townhall -> shelter')

  assertEqual(normalizePlaceCategory('emergency'), 'emergency', 'Emergency -> emergency')
  assertEqual(normalizePlaceCategory('ambulance'), 'emergency', 'Ambulance -> emergency')

  assertEqual(normalizePlaceCategory('unknown_xyz'), 'other', 'Unknown tag -> other')
  assertEqual(normalizePlaceCategory(null), 'other', 'Null -> other')

  // ---------------------------------------------------------------------------
  // 2. Category Metadata & Tactical Mapping Tests
  // ---------------------------------------------------------------------------
  console.log('\n[Suite 2: Category Metadata Info]')
  const hospInfo = getCategoryInfo('hospital')
  assertEqual(hospInfo.id, 'hospital', 'Hospital info ID')
  assertEqual(hospInfo.icon, '🏥', 'Hospital icon')

  const pharmInfo = getCategoryInfo('chemist')
  assertEqual(pharmInfo.id, 'pharmacy', 'Chemist info ID maps to pharmacy')
  assertEqual(pharmInfo.icon, '💊', 'Pharmacy icon')

  const policeInfo = getCategoryInfo('police_outpost')
  assertEqual(policeInfo.id, 'police', 'Police outpost info ID maps to police')
  assertEqual(policeInfo.icon, '🛡️', 'Police icon')

  // ---------------------------------------------------------------------------
  // 3. Category Filter Matching Tests (Counts, Markers, Directory)
  // ---------------------------------------------------------------------------
  console.log('\n[Suite 3: Category Filter Matching]')
  const hospitalPlace = { id: '1', category: 'hospital', name: 'General Hospital' }
  const clinicPlace = { id: '2', category: 'clinic', name: 'City Clinic' }
  const pharmacyPlace = { id: '3', category: 'pharmacy', name: 'Apollo Pharmacy' }
  const chemistPlace = { id: '4', category: 'chemist', name: 'Local Chemist' }
  const policePlace = { id: '5', category: 'police', name: 'Central Police Station' }
  const firePlace = { id: '6', category: 'fire_station', name: 'Fire Headquarters' }
  const shelterPlace = { id: '7', category: 'community_centre', name: 'Town Hall Shelter' }

  assert(matchesCategoryFilter(hospitalPlace, 'all'), 'Hospital matches all')
  assert(matchesCategoryFilter(hospitalPlace, 'hospital'), 'Hospital matches hospital')
  assert(matchesCategoryFilter(clinicPlace, 'hospital'), 'Clinic matches hospital filter')
  assert(
    !matchesCategoryFilter(hospitalPlace, 'pharmacy'),
    'Hospital does not match pharmacy filter'
  )

  assert(matchesCategoryFilter(pharmacyPlace, 'pharmacy'), 'Pharmacy matches pharmacy')
  assert(matchesCategoryFilter(chemistPlace, 'pharmacy'), 'Chemist matches pharmacy filter')

  assert(matchesCategoryFilter(policePlace, 'police'), 'Police matches police')
  assert(!matchesCategoryFilter(policePlace, 'fire_station'), 'Police does not match fire filter')

  assert(matchesCategoryFilter(firePlace, 'fire_station'), 'Fire station matches fire_station')
  assert(matchesCategoryFilter(shelterPlace, 'shelter'), 'Community centre matches shelter filter')

  // ---------------------------------------------------------------------------
  // 4. Place Normalization Tests
  // ---------------------------------------------------------------------------
  console.log('\n[Suite 4: Place Object Normalization]')
  const rawOsmNode = {
    id: 'osm-node-101',
    source: 'OpenStreetMap',
    provenance: 'OSM_MAPPED',
    category: 'CLINIC',
    name: '  Health Point Clinic  ',
    latitude: 22.227,
    longitude: 84.853,
    address: 'Ring Road, Sector 2',
    phone: '+91 661 2400000',
  }

  const normalized = normalizePlace(rawOsmNode, 22.22, 84.85)
  assert(normalized !== null, 'Normalized place is not null')
  assertEqual(normalized.id, 'osm-node-101', 'Preserved ID')
  assertEqual(normalized.name, 'Health Point Clinic', 'Trimmed name')
  assertEqual(normalized.category, 'hospital', 'Normalized category is hospital')
  assertEqual(normalized.provenance, 'OSM_MAPPED', 'Preserved provenance')
  assertEqual(normalized.phone, '+91 661 2400000', 'Preserved phone')
  assert(normalized.distance_meters > 0, 'Distance calculated from origin')
  assert(
    normalized.distance_formatted.includes('m') || normalized.distance_formatted.includes('km'),
    'Distance formatted'
  )

  // Strict 10,000m filter rejection
  const farPlace = {
    id: 'far-101',
    category: 'hospital',
    name: 'Far Hospital',
    latitude: 23.5, // > 100 km away
    longitude: 85.5,
  }
  assertEqual(
    normalizePlace(farPlace, 22.22, 84.85),
    null,
    'Far facility (>10km) is strictly filtered out'
  )

  // Invalid coordinates return null
  assertEqual(
    normalizePlace({ latitude: 'invalid', longitude: 84.853 }),
    null,
    'Invalid latitude returns null'
  )

  // ---------------------------------------------------------------------------
  // 5. Distance & Movement Calculation Tests
  // ---------------------------------------------------------------------------
  console.log('\n[Suite 5: Distance & Movement Thresholds]')
  const dist = calculateClientDistanceM(22.227, 84.853, 22.235, 84.865)
  assert(dist > 1000 && dist < 2000, `Calculated realistic distance: ${dist}m`)

  assertEqual(formatDistance(450), '450 m away', 'Format < 1km')
  assertEqual(formatDistance(2350), '2.4 km away', 'Format > 1km')

  assert(
    hasMovedSignificantly(null, { latitude: 22.227, longitude: 84.853 }),
    'Null previous coordinates triggers move'
  )
  assert(
    !hasMovedSignificantly(
      { latitude: 22.227, longitude: 84.853 },
      { latitude: 22.2271, longitude: 84.8531 },
      150
    ),
    'Small move (~15m) does not trigger threshold'
  )
  assert(
    hasMovedSignificantly(
      { latitude: 22.227, longitude: 84.853 },
      { latitude: 22.23, longitude: 84.853 },
      150
    ),
    'Large move (~330m) triggers threshold'
  )

  // ---------------------------------------------------------------------------
  // 6. Intelligent Category Sorting Tests
  // ---------------------------------------------------------------------------
  console.log('\n[Suite 6: Intelligent Category & Emergency Sorting]')
  const testSet = [
    {
      id: 'pharm-1',
      category: 'pharmacy',
      name: 'Close Pharmacy',
      distance_meters: 200,
      confidence: 0.8,
    },
    {
      id: 'hosp-1',
      category: 'hospital',
      name: 'City Hospital',
      distance_meters: 600,
      confidence: 0.9,
    },
    {
      id: 'shelter-ver',
      category: 'shelter',
      name: 'Salvus Central Shelter',
      provenance: 'SALVUS_VERIFIED',
      distance_meters: 800,
      confidence: 1.0,
    },
    {
      id: 'fire-1',
      category: 'fire_station',
      name: 'Fire Station 1',
      distance_meters: 500,
      confidence: 0.85,
    },
  ]

  // Nearby ('all') sort should prioritize Salvus verified shelter -> Hospital -> Fire -> Pharmacy
  const sortedAll = sortPlacesForCategory(testSet, 'all')
  assertEqual(sortedAll[0].id, 'shelter-ver', 'Top priority in Nearby is Salvus Verified Shelter')
  assertEqual(sortedAll[1].id, 'hosp-1', 'Second priority is Hospital')
  assertEqual(sortedAll[2].id, 'fire-1', 'Third priority is Fire Station')
  assertEqual(sortedAll[3].id, 'pharm-1', 'Fourth priority is Pharmacy')

  // Specific category tab ('pharmacy') should strictly sort by proximity distance
  const pharmacies = [
    { id: 'p2', category: 'pharmacy', name: 'Far Chemist', distance_meters: 1500 },
    { id: 'p1', category: 'pharmacy', name: 'Near Chemist', distance_meters: 300 },
  ]
  const sortedPharm = sortPlacesForCategory(pharmacies, 'pharmacy')
  assertEqual(sortedPharm[0].id, 'p1', 'Closest pharmacy is ranked #1 in category tab')
  assertEqual(sortedPharm[1].id, 'p2', 'Farther pharmacy is ranked #2 in category tab')

  console.log(`\n========================================`)
  console.log(`RESULTS: ${passedTests} passed, ${failedTests} failed.`)
  console.log(`========================================\n`)

  if (failedTests > 0) {
    process.exit(1)
  }
}

runTests()
