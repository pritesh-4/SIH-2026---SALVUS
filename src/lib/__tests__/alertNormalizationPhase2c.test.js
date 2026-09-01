import test from 'node:test'
import assert from 'node:assert/strict'
import { normalizeAlert, filterAlertsByLocation } from '../alertNormalization.js'

test('Phase 2C - Point Alert has numeric distance formatting and Haversine distance', () => {
  const pointAlert = normalizeAlert(
    {
      id: 'alt-pt-1',
      source: 'Municipal Sensor',
      latitude: 22.5726,
      longitude: 88.3639,
      geographic_form: 'POINT',
      severity: 'CRITICAL',
      title: 'Power Cable Down',
    },
    { latitude: 22.583, longitude: 88.3639 }
  )

  assert.equal(pointAlert.geographicForm, 'POINT')
  assert.ok(pointAlert.distanceKm !== null)
  assert.ok(pointAlert.distanceFormatted.includes('km away'))
})

test('Phase 2C - District Warning has NO fake distance and displays "Applicable to your district"', () => {
  const districtAlert = normalizeAlert(
    {
      id: 'alt-dist-1',
      source: 'SACHET / NDMA India',
      affected_area: 'Mayurbhanj district of Odisha',
      affected_districts: ['Mayurbhanj'],
      state: 'Odisha',
      geographic_form: 'DISTRICT',
      latitude: null, // Proving no fake coordinates
      longitude: null, // Proving no fake coordinates
      distance_km: null, // Proving no fake numeric distance
      relevance_level: 'LOCAL',
      severity: 'WARNING',
      title: 'Thunderstorm Warning',
    },
    { latitude: 21.932, longitude: 86.738 }
  )

  assert.equal(districtAlert.geographicForm, 'DISTRICT')
  assert.equal(districtAlert.latitude, null)
  assert.equal(districtAlert.longitude, null)
  assert.equal(districtAlert.distanceKm, null)
  assert.equal(districtAlert.distanceFormatted, 'Applicable to your district')
  assert.deepEqual(districtAlert.affectedDistricts, ['Mayurbhanj'])
  assert.equal(districtAlert.state, 'Odisha')
})

test('Phase 2C - Regional District Warning displays "Regional warning"', () => {
  const regionalAlert = normalizeAlert(
    {
      id: 'alt-dist-2',
      source: 'SACHET / NDMA India',
      affected_area: 'Mayurbhanj district of Odisha',
      affected_districts: ['Mayurbhanj'],
      state: 'Odisha',
      geographic_form: 'DISTRICT',
      latitude: null,
      longitude: null,
      distance_km: null,
      relevance_level: 'REGIONAL',
      severity: 'WARNING',
      title: 'Thunderstorm Warning',
    },
    { latitude: 20.2961, longitude: 85.8245 }
  )

  assert.equal(regionalAlert.distanceKm, null)
  assert.equal(regionalAlert.distanceFormatted, 'Regional warning')
})

test('Phase 2C - Multi-District Warning preserves all districts', () => {
  const multiAlert = normalizeAlert({
    id: 'alt-multi-1',
    source: 'JSDMA',
    affected_area: 'Ranchi, Gumla, Khunti, Lohardaga, Ramgarh, West Singhbhum',
    affected_districts: ['Ranchi', 'Gumla', 'Khunti', 'Lohardaga', 'Ramgarh', 'West Singhbhum'],
    state: 'Jharkhand',
    geographic_form: 'DISTRICT',
    relevance_level: 'LOCAL',
  })

  assert.equal(multiAlert.affectedDistricts.length, 6)
  assert.ok(multiAlert.affectedDistricts.includes('Khunti'))
  assert.ok(multiAlert.affectedDistricts.includes('Lohardaga'))
})

test('Phase 2C - Unresolvable Alert marked UNKNOWN is NOT filtered out as irrelevant', () => {
  const unkAlert = normalizeAlert({
    id: 'alt-unk-1',
    source: 'Civil Defense',
    title: 'Advisory',
    relevance_level: 'UNKNOWN',
    latitude: null,
    longitude: null,
  })

  const filtered = filterAlertsByLocation([unkAlert], { latitude: 22.57, longitude: 88.36 })
  assert.equal(filtered.length, 1)
  assert.equal(filtered[0].relevanceLevel, 'UNKNOWN')
})
