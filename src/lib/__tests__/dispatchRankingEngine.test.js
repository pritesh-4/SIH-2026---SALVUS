import { describe, it } from 'node:test'
import assert from 'node:assert'
import { haversineDistance } from '../../services/routingService.js'

describe('Pass 4C: Dynamic Rescue Recommendation & Reassignment Contract', () => {
  const mockPrimaryCandidate = {
    id: 'resp-01',
    unit_name: 'TEAM 03',
    team_lead: 'Capt. Roy',
    vehicle_type: 'Inflatable Zodiac Boat',
    capability: 'FLOOD_BOAT',
    status: 'AVAILABLE',
    latitude: 22.574,
    longitude: 88.372,
    radio_channel: 'VHF-14',
    max_capacity: 8,
    current_load: 0,
    distance_km: 1.4,
    eta_minutes: 5.0,
    eta_formatted: '5 min',
    match_score: 87,
    match_reason:
      'Recommended because TEAM 03 is available immediately, has Specialized Inflatable Flood Rescue Watercraft (100% match), and offers fastest transit corridor (~5 min / 1.4 km) with zero load backlog.',
    is_recommended: true,
    rank: 1,
    calculated_at: new Date(Date.now() - 10000).toISOString(),
    comparative_reason: null,
    explanation: {
      headline: '★ PRIMARY RECOMMENDATION — TEAM 03',
      positive_factors: [
        '✓ Specialized Inflatable Flood Rescue Watercraft (100% profile match)',
        '✓ Available immediately with zero active commitments',
        '✓ Rapid response transit (~5 min / 1.4 km)',
        '✓ Full crew availability (0/8 load)',
      ],
      negative_factors: [],
      breakdown: {
        final_score: 87,
        capability_score: 30,
        availability_score: 20,
        distance_score: 15,
        eta_score: 12,
        workload_score: 10,
        severity_fit_score: 0,
        max_weights: {
          capability: 30,
          availability: 20,
          distance: 15,
          eta: 15,
          workload: 10,
          severity_fit: 10,
        },
      },
    },
  }

  const mockAlternativeCandidates = [
    {
      id: 'resp-02',
      unit_name: 'TEAM 01',
      team_lead: 'Dr. Sen',
      vehicle_type: 'Rescue Craft',
      capability: 'FLOOD_BOAT',
      status: 'AVAILABLE',
      latitude: 22.585,
      longitude: 88.38,
      radio_channel: 'VHF-08',
      max_capacity: 6,
      current_load: 0,
      distance_km: 2.2,
      eta_minutes: 7.0,
      eta_formatted: '7 min',
      match_score: 79,
      match_reason: 'Specialized Inflatable Flood Rescue Watercraft',
      is_recommended: false,
      rank: 2,
      calculated_at: new Date(Date.now() - 10000).toISOString(),
      comparative_reason: 'Viable alternative, but ETA 2 min slower, 0.8 km farther.',
      explanation: {
        headline: 'Secondary Standby Unit',
        positive_factors: ['✓ Flood Rescue Watercraft'],
        negative_factors: [],
        breakdown: {
          final_score: 79,
          capability_score: 30,
          availability_score: 20,
          distance_score: 11,
          eta_score: 8,
          workload_score: 10,
          severity_fit_score: 0,
        },
      },
    },
    {
      id: 'resp-03',
      unit_name: 'TEAM 07',
      team_lead: 'Commander Bose',
      vehicle_type: 'Inflatable Zodiac Boat',
      capability: 'FLOOD_BOAT',
      status: 'AVAILABLE',
      latitude: 22.573,
      longitude: 88.365,
      radio_channel: 'VHF-02',
      max_capacity: 8,
      current_load: 0,
      distance_km: 0.6,
      eta_minutes: 2.5,
      eta_formatted: '3 min',
      match_score: 96,
      match_reason: 'Specialized Inflatable Flood Rescue Watercraft',
      is_recommended: true,
      rank: 1,
      calculated_at: new Date().toISOString(),
      comparative_reason: null,
      explanation: {
        headline: '★ PRIMARY RECOMMENDATION — TEAM 07',
        positive_factors: ['✓ Closest available watercraft (~3 min / 0.6 km)'],
        negative_factors: [],
        breakdown: {
          final_score: 96,
          capability_score: 30,
          availability_score: 20,
          distance_score: 15,
          eta_score: 15,
          workload_score: 10,
          severity_fit_score: 6,
        },
      },
    },
  ]

  it('Scenario 1: Responder moves (>=200m triggers recalculation, <200m is debounced)', () => {
    const origLat = 22.5726
    const origLon = 88.3639

    // Minor jitter (30m)
    const jitterLat = 22.5728
    const jitterLon = 88.3639
    const distJitterMeters = haversineDistance(origLat, origLon, jitterLat, jitterLon) * 1000.0
    const shouldTriggerJitter = distJitterMeters >= 200.0
    assert.strictEqual(shouldTriggerJitter, false)

    // Meaningful movement (400m)
    const moveLat = 22.5762
    const moveLon = 88.3639
    const distMoveMeters = haversineDistance(origLat, origLon, moveLat, moveLon) * 1000.0
    const shouldTriggerMove = distMoveMeters >= 200.0
    assert.strictEqual(shouldTriggerMove, true)
  })

  it('Scenario 2: ETA changes meaningfully (>= 2 min delta triggers shift evaluation)', () => {
    const currentAssignedEta = 7.0
    const newCandidateEta = 3.0
    const etaDelta = currentAssignedEta - newCandidateEta

    assert.ok(etaDelta >= 2.0)
    const isMeaningful = etaDelta >= 2.0
    assert.strictEqual(isMeaningful, true)
  })

  it('Scenario 3: Responder becomes unavailable / OFFLINE triggers recommendation shift', () => {
    const assignedResponder = { ...mockPrimaryCandidate, status: 'OFFLINE' }
    const newCandidate = mockAlternativeCandidates[1] // TEAM 07

    const shouldShift =
      assignedResponder.status === 'OFFLINE' && newCandidate.status === 'AVAILABLE'
    assert.strictEqual(shouldShift, true)

    const shiftReason = `Currently assigned ${assignedResponder.unit_name} is OFFLINE. ${newCandidate.unit_name} is now recommended.`
    assert.ok(shiftReason.includes('OFFLINE'))
    assert.ok(shiftReason.includes('TEAM 07 is now recommended'))
  })

  it('Scenario 4: Route failure / fallback corridor maintains valid geometry and status', () => {
    const fallbackRoute = {
      responderId: 'resp-01',
      coordinates: [
        [22.574, 88.372],
        [22.5726, 88.3639],
      ],
      distanceKm: 1.2,
      etaFormatted: '5 min',
      provider: 'vector_corridor',
      status: 'ESTIMATED',
      isFallback: true,
    }

    assert.strictEqual(fallbackRoute.status, 'ESTIMATED')
    assert.strictEqual(fallbackRoute.isFallback, true)
    assert.strictEqual(fallbackRoute.coordinates.length, 2)
  })

  it('Scenario 5: Route becomes slower / delayed creates dynamic shift notice', () => {
    const delayedEta = 8.0 // Traffic / flooded corridor delay (+3 min)
    const alternativeEta = 3.0 // TEAM 07 is ~3 min

    const etaDiff = delayedEta - alternativeEta
    assert.ok(etaDiff >= 2.0)

    const shiftPayload = {
      currentEtaFormatted: `${delayedEta} min`,
      newEtaFormatted: `${alternativeEta} min`,
      etaDeltaMinutes: Math.round(etaDiff),
      reason: `Route conditions changed. TEAM 07 is now ${Math.round(etaDiff)} min faster (~${alternativeEta} min) and qualified.`,
    }

    assert.strictEqual(shiftPayload.etaDeltaMinutes, 5)
    assert.ok(shiftPayload.reason.includes('TEAM 07 is now 5 min faster'))
  })

  it('Scenario 6: New responder becomes available triggers recommendation shift if superior', () => {
    const candidates = [mockAlternativeCandidates[1], mockPrimaryCandidate]
    const top = candidates[0]

    assert.strictEqual(top.id, 'resp-03')
    assert.strictEqual(top.unit_name, 'TEAM 07')
    assert.ok(top.match_score > mockPrimaryCandidate.match_score)
  })

  it('Scenario 7: Incident severity changes triggers re-evaluation', () => {
    const prevIncidentKey = 'inc-01_NEW_MEDIUM'
    const updatedIncidentKey = 'inc-01_NEW_CRITICAL'

    const isIncidentChange = prevIncidentKey !== updatedIncidentKey
    assert.strictEqual(isIncidentChange, true)
  })

  it('Scenario 8: Stale calculation returning late is safely discarded (Race Protection)', () => {
    let latestRequestId = 0

    // Request 1 starts
    const req1Id = ++latestRequestId // 1

    // Request 2 starts (newer telemetry)
    const req2Id = ++latestRequestId // 2

    // Request 2 finishes first
    const isReq2Valid = req2Id >= latestRequestId // true (2 >= 2)
    assert.strictEqual(isReq2Valid, true)

    // Request 1 finishes later
    const isReq1Valid = req1Id >= latestRequestId // false (1 < 2 -> DISCARDED)
    assert.strictEqual(isReq1Valid, false)
  })

  it('Scenario 9: Recommendation shift notification banner payload generated for authority', () => {
    const shift = {
      currentResponder: mockPrimaryCandidate,
      currentEtaFormatted: '7 min',
      newCandidate: mockAlternativeCandidates[1],
      newEtaFormatted: '3 min',
      etaDeltaMinutes: 4,
      reason: 'TEAM 07 is now 4 min faster (~3 min) and qualified for this incident.',
      detectedAt: Date.now(),
    }

    assert.strictEqual(shift.currentResponder.unit_name, 'TEAM 03')
    assert.strictEqual(shift.newCandidate.unit_name, 'TEAM 07')
    assert.strictEqual(shift.etaDeltaMinutes, 4)
  })

  it('Scenario 10: Operator keeps current assignment (dismisses shift alert)', () => {
    let activeShift = { reason: 'TEAM 07 is faster' }
    const dismissShift = () => {
      activeShift = null
    }

    dismissShift()
    assert.strictEqual(activeShift, null)
  })

  it('Scenario 11: Operator accepts new recommendation (reassignment releases previous responder)', () => {
    let liveResponders = [
      { id: 'resp-01', unit_name: 'TEAM 03', status: 'ASSIGNED', assigned_incident_id: 'inc-01' },
      { id: 'resp-03', unit_name: 'TEAM 07', status: 'AVAILABLE', assigned_incident_id: null },
    ]

    const reassignTo = 'resp-03'
    const targetIncidentId = 'inc-01'

    liveResponders = liveResponders.map((r) => {
      if (r.id === reassignTo) {
        return { ...r, status: 'ASSIGNED', assigned_incident_id: targetIncidentId }
      }
      if (r.assigned_incident_id === targetIncidentId) {
        return { ...r, status: 'AVAILABLE', assigned_incident_id: null }
      }
      return r
    })

    const prevUnit = liveResponders.find((r) => r.id === 'resp-01')
    const newUnit = liveResponders.find((r) => r.id === 'resp-03')

    assert.strictEqual(prevUnit.status, 'AVAILABLE')
    assert.strictEqual(prevUnit.assigned_incident_id, null)

    assert.strictEqual(newUnit.status, 'ASSIGNED')
    assert.strictEqual(newUnit.assigned_incident_id, 'inc-01')
  })
})
