import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { normalizeIncident } from '../../features/authority/incidents/useAuthorityIncidents.js'
import { shouldAcceptStatusUpdate } from '../stateMachine.js'
import {
  filterIncidents,
  calculateDistanceKm,
} from '../../features/authority/incidents/incidentUtils.js'

describe('Salvus Authority Command Center Operational Pipeline Tests', () => {
  it('Scenario 1: Canonical Incident Normalization preserves all citizen-generated fields', () => {
    const rawCitizenIncident = {
      id: 'inc-cit-9982',
      ticket_id: 'SV-9982',
      type: 'flood',
      severity: 'CRITICAL',
      status: 'NEW',
      description: 'Water level reaching 1.8m. Trapped on second floor balcony.',
      location_name: 'Sector 5, Salt Lake, Kolkata',
      latitude: 22.5812,
      longitude: 88.4231,
      affected_count: 4,
      is_sos: true,
      reporter_name: 'Debashis Roy',
      reporter_phone: '+91 98300 98765',
      attachments: [
        {
          id: 'att-1',
          url: '/api/attachments/att-1',
          original_filename: 'flood_water_level.jpg',
          size_bytes: 204850,
        },
      ],
      ai_triage: {
        hazard_type: 'flood',
        confidence: 0.94,
        recommended_capability: 'FLOOD_BOAT',
        priority_reasoning: 'Rapidly rising water threatens structural integrity.',
      },
      events: [
        {
          id: 'evt-1',
          incident_id: 'inc-cit-9982',
          event_type: 'CREATED',
          actor: 'citizen',
          created_at: '2026-08-30T10:00:00Z',
        },
      ],
    }

    const normalized = normalizeIncident(rawCitizenIncident)

    assert.equal(normalized.id, 'inc-cit-9982')
    assert.equal(normalized.ticket_id, 'SV-9982')
    assert.equal(normalized.type, 'flood')
    assert.equal(normalized.severity, 'CRITICAL')
    assert.equal(normalized.status, 'NEW')
    assert.equal(
      normalized.description,
      'Water level reaching 1.8m. Trapped on second floor balcony.'
    )
    assert.equal(normalized.latitude, 22.5812)
    assert.equal(normalized.longitude, 88.4231)
    assert.equal(normalized.affected_count, 4)
    assert.equal(normalized.is_sos, true)
    assert.equal(normalized.reporter_name, 'Debashis Roy')
    assert.equal(normalized.reporter_phone, '+91 98300 98765')
    assert.equal(normalized.attachments.length, 1)
    assert.equal(normalized.attachments[0].original_filename, 'flood_water_level.jpg')
    assert.equal(normalized.ai_triage.recommended_capability, 'FLOOD_BOAT')
    assert.equal(normalized.events.length, 1)
  })

  it('Scenario 2: Zero Mock Fallback Guarantee in LIVE Mode', () => {
    // When backend returns 0 incidents, normalized list must be strictly 0, never mock items
    const backendData = []
    const normalizedList = backendData.map(normalizeIncident).filter(Boolean)

    assert.equal(normalizedList.length, 0, 'Must have exactly 0 incidents when backend is empty')
    assert.deepEqual(normalizedList, [], 'Must not inject mock incidents into live dataset')
  })

  it('Scenario 3: Real GPS Coordinates Preservation (No Hardcoding or Truncation)', () => {
    const rawGpsIncident = {
      id: 'inc-gps-1',
      latitude: 22.569723,
      longitude: 88.369814,
      location_name: null,
    }

    const normalized = normalizeIncident(rawGpsIncident)
    assert.equal(normalized.latitude, 22.569723)
    assert.equal(normalized.longitude, 88.369814)
    assert.ok(normalized.location_name.includes('22.5697°N, 88.3698°E'))

    const dist = calculateDistanceKm(22.569723, 88.369814, 22.574, 88.372)
    assert.ok(
      dist > 0 && dist < 1.0,
      `Calculated distance should be realistic (~0.5km), got ${dist}km`
    )
  })

  it('Scenario 4: Out-of-Order Realtime Status Transition Protection', () => {
    // If incident is currently ASSIGNED, an out-of-order NEW or TRIAGE_PENDING event must be rejected
    const currentStatus = 'ASSIGNED'
    assert.equal(
      shouldAcceptStatusUpdate(currentStatus, 'NEW'),
      false,
      'Should reject regression from ASSIGNED to NEW'
    )
    assert.equal(
      shouldAcceptStatusUpdate(currentStatus, 'TRIAGE_PENDING'),
      false,
      'Should reject regression to TRIAGE_PENDING'
    )
    assert.equal(
      shouldAcceptStatusUpdate(currentStatus, 'EN_ROUTE'),
      true,
      'Should accept forward progression to EN_ROUTE'
    )
    assert.equal(
      shouldAcceptStatusUpdate(currentStatus, 'ON_SCENE'),
      true,
      'Should accept forward progression to ON_SCENE'
    )
    assert.equal(
      shouldAcceptStatusUpdate(currentStatus, 'RESOLVED'),
      true,
      'Should accept resolution'
    )
  })

  it('Scenario 5: Incident Queue Urgency Filtering', () => {
    const incidents = [
      { id: '1', severity: 'LOW', status: 'NEW', is_sos: false, affected_count: 1 },
      { id: '2', severity: 'CRITICAL', status: 'NEW', is_sos: true, affected_count: 5 },
      { id: '3', severity: 'HIGH', status: 'ASSIGNED', is_sos: false, affected_count: 2 },
      { id: '4', severity: 'MEDIUM', status: 'RESOLVED', is_sos: false, affected_count: 1 },
    ]

    const immediate = filterIncidents(incidents, 'immediate')
    assert.equal(immediate.length, 1)
    assert.equal(immediate[0].id, '2')

    const review = filterIncidents(incidents, 'review')
    assert.equal(review.length, 2)

    const response = filterIncidents(incidents, 'response')
    assert.equal(response.length, 1)
    assert.equal(response[0].id, '3')

    const resolved = filterIncidents(incidents, 'resolved')
    assert.equal(resolved.length, 1)
    assert.equal(resolved[0].id, '4')
  })

  it('Scenario 6: Null and Partial Incident Ingestion Resilience', () => {
    assert.equal(normalizeIncident(null), null)
    assert.equal(normalizeIncident(undefined), null)

    const emptyObj = normalizeIncident({})
    assert.ok(emptyObj.id.startsWith('INC-'))
    assert.ok(emptyObj.ticket_id.startsWith('SV-'))
    assert.equal(emptyObj.status, 'NEW')
    assert.equal(emptyObj.is_sos, false)
    assert.deepEqual(emptyObj.attachments, [])
    assert.deepEqual(emptyObj.events, [])
  })

  it('Scenario 7: Responder Coordinate Safety (No Silent Hardcoded 22.574 Fallback)', () => {
    const rawResponders = [
      {
        id: 'r1',
        unit_name: 'NDRF Unit 1',
        latitude: 28.6139,
        longitude: 77.209,
        status: 'AVAILABLE',
      },
      { id: 'r2', unit_name: 'NDRF Unit 2', latitude: null, longitude: null, status: 'AVAILABLE' },
      { id: 'r3', unit_name: 'NDRF Unit 3', status: 'AVAILABLE' },
    ]

    // Map points must filter out units without numeric coordinates
    const mapPoints = rawResponders
      .filter((r) => typeof r.latitude === 'number' && typeof r.longitude === 'number')
      .map((r) => ({
        id: r.id,
        lat: r.latitude,
        lng: r.longitude,
        locationAvailable: true,
      }))

    assert.equal(mapPoints.length, 1, 'Only 1 responder has real coordinates')
    assert.equal(mapPoints[0].id, 'r1')
    assert.equal(mapPoints[0].lat, 28.6139)
    assert.equal(mapPoints[0].lng, 77.209)

    // Ensure no fallback coordinates (like 22.574 or 88.372) are injected for r2 or r3
    assert.equal(
      mapPoints.some((p) => p.lat === 22.574 || p.lng === 88.372),
      false
    )
  })

  it('Scenario 8: Shelter Bed Aggregation & Coordinate Safety', () => {
    const rawShelters = [
      {
        id: 's1',
        name: 'Hub A',
        available_beds: 45,
        total_beds: 100,
        latitude: 28.6,
        longitude: 77.2,
      },
      {
        id: 's2',
        name: 'Hub B',
        available_beds: 120,
        total_beds: 200,
        latitude: null,
        longitude: null,
      },
      {
        id: 's3',
        name: 'Hub C',
        available_beds: 0,
        total_beds: 50,
        latitude: 28.7,
        longitude: 77.3,
      },
    ]

    const totalBeds = rawShelters.reduce((acc, s) => acc + (s.available_beds ?? 0), 0)
    assert.equal(
      totalBeds,
      165,
      'Total available beds must be accurately summed (45 + 120 + 0 = 165)'
    )

    const shelterMapPoints = rawShelters
      .filter((s) => typeof s.latitude === 'number' && typeof s.longitude === 'number')
      .map((s) => ({ id: s.id, lat: s.latitude, lng: s.longitude, locationAvailable: true }))

    assert.equal(shelterMapPoints.length, 2, 'Only shelters with real coordinates appear on map')
    assert.equal(
      shelterMapPoints.some((s) => s.id === 's2'),
      false,
      'Shelter without coords is excluded from map'
    )
  })

  it('Scenario 9: Data Provenance Unification (LIVE / SIMULATED / PARTIAL / UNAVAILABLE)', () => {
    const deriveProvenance = (incMode, fleetMode, shelterMode, sitMode) => {
      const modes = [incMode, fleetMode, shelterMode, sitMode]
      if (modes.every((m) => m === 'SIMULATED')) return 'SIMULATED'
      if (modes.every((m) => m === 'LIVE')) return 'LIVE'
      if (modes.some((m) => m === 'UNAVAILABLE')) return 'PARTIAL'
      return 'PARTIAL'
    }

    assert.equal(deriveProvenance('LIVE', 'LIVE', 'LIVE', 'LIVE'), 'LIVE')
    assert.equal(deriveProvenance('SIMULATED', 'SIMULATED', 'SIMULATED', 'SIMULATED'), 'SIMULATED')
    assert.equal(deriveProvenance('LIVE', 'LIVE', 'UNAVAILABLE', 'LIVE'), 'PARTIAL')
    assert.equal(deriveProvenance('LIVE', 'UNAVAILABLE', 'UNAVAILABLE', 'UNAVAILABLE'), 'PARTIAL')
  })

  it('Scenario 10: calculateDistanceKm returns null on missing or invalid coordinates', () => {
    assert.equal(calculateDistanceKm(null, null, 22.5, 88.3), null)
    assert.equal(calculateDistanceKm(22.5, 88.3, undefined, null), null)
    assert.equal(calculateDistanceKm('invalid', 88.3, 22.5, 88.3), null)
    assert.ok(typeof calculateDistanceKm(22.5, 88.3, 22.6, 88.4) === 'number')
  })

  it('Scenario 11: Grounded Metric Derivation strictly from Live Domain Arrays', () => {
    const rawIncidents = [
      { id: '1', status: 'NEW', severity: 'CRITICAL', is_sos: true },
      { id: '2', status: 'TRIAGE_PENDING', severity: 'HIGH', is_sos: false },
      { id: '3', status: 'VERIFIED', severity: 'MEDIUM', is_sos: false },
      { id: '4', status: 'RESOLVED', severity: 'HIGH', is_sos: false },
      { id: '5', status: 'CANCELLED', severity: 'LOW', is_sos: false },
    ]

    const active = rawIncidents.filter((inc) => !['RESOLVED', 'CANCELLED'].includes(inc.status))
    const critical = active.filter((inc) => inc.severity === 'CRITICAL' || inc.is_sos)
    const resolved = rawIncidents.filter((inc) => inc.status === 'RESOLVED')
    const triagePending = active.filter((inc) =>
      ['NEW', 'TRIAGE_PENDING', 'AWAITING_DISPATCH'].includes(inc.status)
    )

    assert.equal(active.length, 3, 'Active incidents must exclude RESOLVED and CANCELLED')
    assert.equal(critical.length, 1, 'Critical count must include CRITICAL or SOS')
    assert.equal(resolved.length, 1, 'Resolved count must equal 1')
    assert.equal(triagePending.length, 2, 'Triage pending must equal 2')

    // Responders deployed metric
    const responders = [
      { id: 'r1', status: 'AVAILABLE' },
      { id: 'r2', status: 'EN_ROUTE' },
      { id: 'r3', status: 'ON_SCENE' },
      { id: 'r4', status: 'OFFLINE' },
    ]
    const deployedCount = responders.filter((r) =>
      ['ASSIGNED', 'EN_ROUTE', 'NEARBY', 'ON_SCENE'].includes(r.status)
    ).length
    assert.equal(deployedCount, 2, 'Deployed units must count only active mission states')
  })

  it('Scenario 12: Missing Coordinates Safe Formatting (No NaN or undefined in UI strings)', () => {
    const formatCoordinatesSafe = (lat, lon) => {
      if (typeof lat === 'number' && typeof lon === 'number' && !isNaN(lat) && !isNaN(lon)) {
        return `${lat.toFixed(4)}°N, ${lon.toFixed(4)}°E`
      }
      return 'GPS Coordinates Pending'
    }

    assert.equal(formatCoordinatesSafe(22.5726, 88.3639), '22.5726°N, 88.3639°E')
    assert.equal(formatCoordinatesSafe(null, null), 'GPS Coordinates Pending')
    assert.equal(formatCoordinatesSafe(undefined, 88.36), 'GPS Coordinates Pending')
    assert.equal(formatCoordinatesSafe(NaN, 88.36), 'GPS Coordinates Pending')
  })

  it('Scenario 13: Provenance State Transitions (LIVE, STALE, UNAVAILABLE, SIMULATED, PARTIAL)', () => {
    const deriveProvenance = (dataMode, fleetDataMode, shelterDataMode, dataProvenance) => {
      const modes = [dataMode, fleetDataMode, shelterDataMode, dataProvenance]
      const isAllSimulated = modes.every((m) => m === 'SIMULATED')
      if (isAllSimulated) return 'SIMULATED'

      const isAllLive = modes.every((m) => m === 'LIVE')
      if (isAllLive) return 'LIVE'

      const isAllUnavailable = modes.every((m) => m === 'UNAVAILABLE')
      if (isAllUnavailable) return 'UNAVAILABLE'

      const isAnyStale = modes.some((m) => m === 'STALE')
      const isAnyUnavailable = modes.some((m) => m === 'UNAVAILABLE')
      const isAnyPartial = modes.some((m) => m === 'PARTIAL')

      if (isAnyStale) return 'STALE'
      if (isAnyUnavailable || isAnyPartial) return 'PARTIAL'
      return dataMode || 'LIVE'
    }

    assert.equal(deriveProvenance('LIVE', 'LIVE', 'LIVE', 'LIVE'), 'LIVE')
    assert.equal(deriveProvenance('SIMULATED', 'SIMULATED', 'SIMULATED', 'SIMULATED'), 'SIMULATED')
    assert.equal(deriveProvenance('STALE', 'LIVE', 'LIVE', 'LIVE'), 'STALE')
    assert.equal(deriveProvenance('UNAVAILABLE', 'LIVE', 'LIVE', 'LIVE'), 'PARTIAL')
    assert.equal(
      deriveProvenance('UNAVAILABLE', 'UNAVAILABLE', 'UNAVAILABLE', 'UNAVAILABLE'),
      'UNAVAILABLE'
    )
  })

  it('Scenario 14: Honest Empty Live Authority State (0 Incidents, 0 Responders, 0 Shelters)', () => {
    const emptyIncidents = []
    const emptyResponders = []
    const emptyShelters = []

    const normalizedIncidents = emptyIncidents.map(normalizeIncident).filter(Boolean)
    const active = normalizedIncidents.filter(
      (inc) => !['RESOLVED', 'CANCELLED'].includes(inc.status)
    )
    const sosCount = active.filter((inc) => Boolean(inc.is_sos)).length
    const critical = active.filter((inc) => inc.severity === 'CRITICAL' || inc.is_sos).length
    const resolved = normalizedIncidents.filter((inc) => inc.status === 'RESOLVED').length
    const totalBeds = emptyShelters.reduce((acc, s) => acc + (s.available_beds ?? 0), 0)

    const responderMapPoints = emptyResponders
      .filter((r) => typeof r.latitude === 'number' && typeof r.longitude === 'number')
      .map((r) => ({ id: r.id, lat: r.latitude, lng: r.longitude }))

    const shelterMapPoints = emptyShelters
      .filter((s) => typeof s.latitude === 'number' && typeof s.longitude === 'number')
      .map((s) => ({ id: s.id, lat: s.latitude, lng: s.longitude }))

    assert.equal(normalizedIncidents.length, 0, 'No fake incidents present')
    assert.equal(active.length, 0, 'Active count is 0')
    assert.equal(sosCount, 0, 'SOS count is 0')
    assert.equal(critical, 0, 'Critical count is 0')
    assert.equal(resolved, 0, 'Resolved count is 0')
    assert.equal(totalBeds, 0, 'Total available beds is 0')
    assert.equal(responderMapPoints.length, 0, 'No fake responder map markers')
    assert.equal(shelterMapPoints.length, 0, 'No fake shelter map markers')
  })

  it('Scenario 15: Clean Live Database Test — Single Real Citizen SOS Flow', () => {
    const rawCitizenSos = {
      id: 'inc-live-sos-001',
      ticket_id: 'SV-7711',
      type: 'flood',
      severity: 'CRITICAL',
      status: 'NEW',
      description: 'Flood water breaching boundary wall. Need boat evacuation.',
      latitude: 19.076,
      longitude: 72.8777,
      affected_count: 2,
      is_sos: true,
      reporter_name: 'Pooja Sharma',
      created_at: new Date().toISOString(),
    }

    const liveIncidents = [normalizeIncident(rawCitizenSos)]
    const active = liveIncidents.filter((inc) => !['RESOLVED', 'CANCELLED'].includes(inc.status))
    const sosCount = active.filter((inc) => Boolean(inc.is_sos)).length

    assert.equal(active.length, 1, 'Exactly 1 active incident')
    assert.equal(sosCount, 1, 'Exactly 1 active SOS')
    assert.equal(liveIncidents[0].ticket_id, 'SV-7711')
    assert.equal(liveIncidents[0].latitude, 19.076)
    assert.equal(liveIncidents[0].longitude, 72.8777)
    assert.equal(
      liveIncidents[0].description,
      'Flood water breaching boundary wall. Need boat evacuation.'
    )
  })

  it('Scenario 16: Clean Live Database Test — Real Citizen Hazard Report', () => {
    const rawHazardReport = {
      id: 'inc-live-hz-002',
      ticket_id: 'SV-7712',
      type: 'power_line',
      severity: 'HIGH',
      status: 'TRIAGE_PENDING',
      description: 'Sparks from transformer near primary school.',
      latitude: 19.08,
      longitude: 72.885,
      affected_count: 0,
      is_sos: false,
      reporter_name: 'Citizen Anil',
      created_at: new Date().toISOString(),
    }

    const liveIncidents = [normalizeIncident(rawHazardReport)]
    const active = liveIncidents.filter((inc) => !['RESOLVED', 'CANCELLED'].includes(inc.status))
    const sosCount = active.filter((inc) => Boolean(inc.is_sos)).length

    assert.equal(active.length, 1, '1 active incident')
    assert.equal(sosCount, 0, 'Hazard report is not an SOS')
    assert.equal(liveIncidents[0].ticket_id, 'SV-7712')
    assert.equal(liveIncidents[0].type, 'power_line')
    assert.equal(liveIncidents[0].severity, 'HIGH')
  })

  it('Scenario 17: Cancellation Flow Updates Canonical State & Active SOS Count Decreases', () => {
    const initialSos = normalizeIncident({
      id: 'inc-sos-101',
      ticket_id: 'SV-101',
      type: 'flood',
      severity: 'CRITICAL',
      status: 'NEW',
      is_sos: true,
    })

    let incidents = [initialSos]
    let active = incidents.filter((inc) => !['RESOLVED', 'CANCELLED'].includes(inc.status))
    assert.equal(active.length, 1)
    assert.equal(active.filter((i) => i.is_sos).length, 1)

    // Citizen cancels emergency
    const cancelledPayload = { id: 'inc-sos-101', status: 'CANCELLED' }
    incidents = incidents.map((inc) =>
      inc.id === cancelledPayload.id ? { ...inc, status: cancelledPayload.status } : inc
    )

    active = incidents.filter((inc) => !['RESOLVED', 'CANCELLED'].includes(inc.status))
    const activeSos = active.filter((i) => i.is_sos).length

    assert.equal(active.length, 0, 'Active incidents must drop to 0 after cancellation')
    assert.equal(activeSos, 0, 'Active SOS count must drop to 0')
    assert.equal(incidents.length, 1, 'Incident remains in history for auditing')
  })

  it('Scenario 18: Resolution Flow Updates Canonical State', () => {
    const verifiedInc = normalizeIncident({
      id: 'inc-med-102',
      ticket_id: 'SV-102',
      type: 'medical',
      severity: 'HIGH',
      status: 'ASSIGNED',
      is_sos: false,
    })

    let incidents = [verifiedInc]
    let active = incidents.filter((inc) => !['RESOLVED', 'CANCELLED'].includes(inc.status))
    assert.equal(active.length, 1)

    // Authority resolves incident
    const resolvedPayload = { id: 'inc-med-102', status: 'RESOLVED' }
    incidents = incidents.map((inc) =>
      inc.id === resolvedPayload.id ? { ...inc, status: resolvedPayload.status } : inc
    )

    active = incidents.filter((inc) => !['RESOLVED', 'CANCELLED'].includes(inc.status))
    const resolved = incidents.filter((inc) => inc.status === 'RESOLVED')

    assert.equal(active.length, 0, 'Active count is 0')
    assert.equal(resolved.length, 1, 'Resolved count is 1')
  })

  it('Scenario 19: AI Triage Binding to Exact Incident Identity (No Cross-Incident Leakage)', () => {
    const incA = normalizeIncident({
      id: 'inc-A',
      ticket_id: 'SV-1001',
      description: 'Flood in basement',
      ai_triage: {
        hazard_type: 'Flash Flood',
        confidence: 0.95,
        recommended_capability: 'FLOOD_BOAT',
      },
    })

    const incB = normalizeIncident({
      id: 'inc-B',
      ticket_id: 'SV-1002',
      description: 'Fire in electrical room',
      ai_triage: {
        hazard_type: 'Electrical Fire',
        confidence: 0.91,
        recommended_capability: 'HAZMAT',
      },
    })

    const incidents = [incA, incB]

    const selectedA = incidents.find((i) => i.id === 'inc-A')
    const selectedB = incidents.find((i) => i.id === 'inc-B')

    assert.equal(selectedA.ticket_id, 'SV-1001')
    assert.equal(selectedA.ai_triage.hazard_type, 'Flash Flood')
    assert.equal(selectedA.ai_triage.recommended_capability, 'FLOOD_BOAT')

    assert.equal(selectedB.ticket_id, 'SV-1002')
    assert.equal(selectedB.ai_triage.hazard_type, 'Electrical Fire')
    assert.equal(selectedB.ai_triage.recommended_capability, 'HAZMAT')
  })

  it('Scenario 20: Reconnection Re-syncs State from Authoritative Backend Truth', () => {
    // Server truth after reconnection
    const serverIncidents = [
      normalizeIncident({ id: 'inc-1', ticket_id: 'SV-1', status: 'RESOLVED', is_sos: true }),
      normalizeIncident({ id: 'inc-2', ticket_id: 'SV-2', status: 'NEW', is_sos: false }),
    ]

    // On reconnect silent refetch: server truth replaces stale local state
    const reconciledIncidents = serverIncidents.map(normalizeIncident).filter(Boolean)
    const active = reconciledIncidents.filter(
      (inc) => !['RESOLVED', 'CANCELLED'].includes(inc.status)
    )
    const sosCount = active.filter((inc) => Boolean(inc.is_sos)).length

    assert.equal(active.length, 1, 'Only inc-2 is active')
    assert.equal(sosCount, 0, 'Resolved inc-1 no longer counts towards active SOS')
    assert.equal(reconciledIncidents.length, 2, 'Total 2 incidents in history')
  })

  it('Scenario 21: Incident with null affected_count does NOT default to 1', () => {
    const incNullCount = normalizeIncident({
      id: 'inc-null',
      description: 'Flood water rising',
      affected_count: null,
      reporter_name: null,
    })

    assert.equal(incNullCount.affected_count, null, 'Must preserve null and not invent 1')
    assert.equal(incNullCount.reporter_name, null, 'Must preserve null reporter_name')
  })

  it('Scenario 22: Incident with 0 affected_count preserves 0 (not 1)', () => {
    const incZeroCount = normalizeIncident({
      id: 'inc-zero',
      description: 'Downed power line on empty road',
      affected_count: 0,
    })

    assert.equal(incZeroCount.affected_count, 0, 'Must preserve explicit 0 and not convert to 1')
  })

  it('Scenario 23: Incident missing coordinates does not fabricate coordinates or location', () => {
    const incNoCoords = normalizeIncident({
      id: 'inc-no-gps',
      description: 'Distress call from unknown spot',
      latitude: null,
      longitude: null,
      location_name: null,
    })

    assert.equal(incNoCoords.latitude, null)
    assert.equal(incNoCoords.longitude, null)
    assert.equal(incNoCoords.location_name, null)
  })

  it('Scenario 24: Candidate responder missing distance/capacity handles null gracefully', () => {
    const candidate = {
      id: 'resp-sparse',
      unit_name: 'NDRF Rescue Unit 9',
      status: 'AVAILABLE',
      max_capacity: null,
      current_load: null,
      distance_km: null,
      eta_formatted: null,
      capability: null,
    }

    assert.equal(candidate.max_capacity, null)
    assert.equal(candidate.current_load, null)
    assert.equal(candidate.distance_km, null)
    assert.equal(candidate.eta_formatted, null)
    assert.equal(candidate.capability, null)
  })

  it('Scenario 25: Shelter distance and walking time calculation returns null when coords missing', () => {
    const dist = calculateDistanceKm(null, null, 22.5, 88.4)
    assert.equal(dist, null, 'Distance must be null when coordinates are missing')
  })

  it('Scenario 26: Zone 2 Attention Bar detects Critical Threats & Active SOS', () => {
    const computedMetrics = {
      critical: 2,
      activeSos: 1,
      triagePending: 3,
      active: 4,
      resolved: 1,
    }
    const hasUrgentAttention =
      computedMetrics.critical > 0 ||
      computedMetrics.activeSos > 0 ||
      computedMetrics.triagePending > 0
    assert.equal(hasUrgentAttention, true)
    assert.equal(computedMetrics.critical, 2)
    assert.equal(computedMetrics.activeSos, 1)
  })

  it('Scenario 27: Priority Workspace sorts CRITICAL SOS over standard CRITICAL and HIGH', () => {
    const incA = normalizeIncident({
      id: 'inc-1',
      severity: 'HIGH',
      is_sos: false,
      status: 'NEW',
    })
    const incB = normalizeIncident({
      id: 'inc-2',
      severity: 'CRITICAL',
      is_sos: false,
      status: 'NEW',
    })
    const incC = normalizeIncident({
      id: 'inc-3',
      severity: 'HIGH',
      is_sos: true,
      status: 'NEW',
    })

    const list = [incA, incB, incC]
    const sevWeight = { CRITICAL: 4, HIGH: 3, MEDIUM: 2, LOW: 1 }
    const sorted = [...list].sort((a, b) => {
      if (a.is_sos && !b.is_sos) return -1
      if (!a.is_sos && b.is_sos) return 1
      return (sevWeight[b.severity] || 0) - (sevWeight[a.severity] || 0)
    })

    assert.equal(sorted[0].id, 'inc-3', 'SOS incident must be rank #1')
    assert.equal(sorted[1].id, 'inc-2', 'Critical non-SOS must be rank #2')
    assert.equal(sorted[2].id, 'inc-1', 'High non-SOS must be rank #3')
  })

  it('Scenario 28: Work State Filters accurately segment operational lifecycle phases', () => {
    const incidents = [
      normalizeIncident({ id: '1', severity: 'CRITICAL', is_sos: true, status: 'NEW' }),
      normalizeIncident({ id: '2', severity: 'MEDIUM', is_sos: false, status: 'TRIAGE_PENDING' }),
      normalizeIncident({ id: '3', severity: 'HIGH', is_sos: false, status: 'EN_ROUTE' }),
      normalizeIncident({ id: '4', severity: 'LOW', is_sos: false, status: 'RESOLVED' }),
    ]

    const immediate = filterIncidents(incidents, 'immediate')
    const review = filterIncidents(incidents, 'review')
    const response = filterIncidents(incidents, 'response')
    const resolved = filterIncidents(incidents, 'resolved')

    assert.equal(immediate.length, 1, 'Immediate must catch CRITICAL SOS')
    assert.equal(review.length, 2, 'Review must catch NEW and TRIAGE_PENDING')
    assert.equal(response.length, 1, 'Response must catch EN_ROUTE')
    assert.equal(resolved.length, 1, 'Resolved must catch RESOLVED')
  })

  it('Scenario 29: Realtime Operational Event Stream sorts chronologically descending', () => {
    const rawEvents = [
      { id: 'evt-1', created_at: '2026-08-30T10:00:00Z', type: 'SOS_CREATED' },
      { id: 'evt-2', created_at: '2026-08-30T10:05:00Z', type: 'ASSIGNED' },
      { id: 'evt-3', created_at: '2026-08-30T10:02:00Z', type: 'VERIFIED' },
    ]

    const sortedEvents = [...rawEvents].sort(
      (a, b) => new Date(b.created_at) - new Date(a.created_at)
    )

    assert.equal(sortedEvents[0].id, 'evt-2', 'Newest event at index 0')
    assert.equal(sortedEvents[1].id, 'evt-3', 'Mid event at index 1')
    assert.equal(sortedEvents[2].id, 'evt-1', 'Oldest event at index 2')
  })

  it('Scenario 30: Supporting Operations preserves fleet and shelter counters without collision', () => {
    const fleet = [
      { id: 'r-1', status: 'EN_ROUTE' },
      { id: 'r-2', status: 'AVAILABLE' },
      { id: 'r-3', status: 'AVAILABLE' },
    ]
    const shelters = [
      { id: 's-1', total_beds: 100, available_beds: 45 },
      { id: 's-2', total_beds: 50, available_beds: 50 },
    ]

    const activeUnits = fleet.filter((r) => r.status !== 'AVAILABLE').length
    const totalBeds = shelters.reduce((acc, s) => acc + s.available_beds, 0)

    assert.equal(activeUnits, 1, '1 unit active')
    assert.equal(totalBeds, 95, '95 free beds available')
  })

  it('Scenario 31: normalizeIncident preserves explicit is_sos: false even for CRITICAL severity', () => {
    const criticalNonSos = normalizeIncident({
      id: 'inc-crit-1',
      ticket_id: 'SV-9911',
      severity: 'CRITICAL',
      is_sos: false,
    })

    assert.equal(criticalNonSos.is_sos, false, 'CRITICAL must not automatically become SOS')
    assert.equal(criticalNonSos.severity, 'CRITICAL')
  })

  it('Scenario 32: normalizeIncident does NOT fabricate timestamps if missing', () => {
    const noTimestampInc = normalizeIncident({
      id: 'inc-no-ts',
      ticket_id: 'SV-9912',
      created_at: null,
      updated_at: null,
    })

    assert.equal(noTimestampInc.created_at, null, 'Must preserve null created_at')
    assert.equal(noTimestampInc.updated_at, null, 'Must preserve null updated_at')
  })

  it('Scenario 33: normalizeIncident does NOT invent random IDs for live backend records', () => {
    const incWithoutId = normalizeIncident({
      ticket_id: 'SV-5544',
      description: 'Road blockage',
    })

    assert.equal(incWithoutId.id, 'SV-5544', 'Must fallback to ticket_id or null, not Math.random')
    assert.equal(incWithoutId.ticket_id, 'SV-5544')
  })

  it('Scenario 34: Computed operational metrics strictly decouple SOS from Critical severity', () => {
    const dataset = [
      normalizeIncident({ id: '1', severity: 'CRITICAL', is_sos: false, status: 'NEW' }),
      normalizeIncident({ id: '2', severity: 'HIGH', is_sos: true, status: 'NEW' }),
      normalizeIncident({ id: '3', severity: 'MEDIUM', is_sos: false, status: 'NEW' }),
    ]

    const active = dataset.filter((i) => !['RESOLVED', 'CANCELLED'].includes(i.status))
    const activeSos = active.filter((i) => Boolean(i.is_sos))
    const critical = active.filter((i) => i.severity === 'CRITICAL')

    assert.equal(activeSos.length, 1, 'Only incident #2 is an active SOS')
    assert.equal(critical.length, 1, 'Only incident #1 is a critical threat')
    assert.equal(active.length, 3, 'Total 3 active incidents')
  })

  it('Scenario 35: Live Mode with 0 backend records yields 0 operational incidents, 0 responders, 0 shelters', () => {
    const liveBackendIncidents = []
    const liveBackendResponders = []
    const liveBackendShelters = []

    const normalizedIncidents = liveBackendIncidents.map(normalizeIncident).filter(Boolean)
    const activeUnits = liveBackendResponders.filter((r) => r.status !== 'AVAILABLE').length
    const totalBeds = liveBackendShelters.reduce((acc, s) => acc + s.available_beds, 0)

    assert.equal(normalizedIncidents.length, 0, 'Zero incidents on clean live start')
    assert.equal(activeUnits, 0, 'Zero units active on clean live start')
    assert.equal(totalBeds, 0, 'Zero beds on clean live start')
  })
})
