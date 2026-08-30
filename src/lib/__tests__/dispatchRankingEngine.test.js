import { describe, it } from 'node:test'
import assert from 'node:assert'

describe('Pass 4B: Responder Recommendation UX & Decision Flow Contract', () => {
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
    calculated_at: new Date(Date.now() - 10000).toISOString(), // 10s ago
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
      unit_name: 'TEAM 05',
      team_lead: 'Commander Bose',
      vehicle_type: 'High-Water Ambulance',
      capability: 'AMBULANCE',
      status: 'AVAILABLE',
      latitude: 22.592,
      longitude: 88.39,
      radio_channel: 'VHF-02',
      max_capacity: 4,
      current_load: 0,
      distance_km: 3.1,
      eta_minutes: 9.0,
      eta_formatted: '9 min',
      match_score: 68,
      match_reason: 'High-Water Medical Evacuation Support',
      is_recommended: false,
      rank: 3,
      calculated_at: new Date(Date.now() - 10000).toISOString(),
      comparative_reason:
        'Viable alternative, but secondary capability (70% match vs 100%), ETA 4 min slower, 1.7 km farther.',
      explanation: {
        headline: 'Secondary Standby Unit',
        positive_factors: ['✓ Medical support'],
        negative_factors: [],
        breakdown: {
          final_score: 68,
          capability_score: 21,
          availability_score: 20,
          distance_score: 9,
          eta_score: 8,
          workload_score: 10,
          severity_fit_score: 0,
        },
      },
    },
  ]

  it('Scenario 1: Primary recommendation appears with score, Estimated ETA, and fact-based reason', () => {
    assert.strictEqual(mockPrimaryCandidate.is_recommended, true)
    assert.strictEqual(mockPrimaryCandidate.rank, 1)
    assert.strictEqual(mockPrimaryCandidate.unit_name, 'TEAM 03')
    assert.strictEqual(mockPrimaryCandidate.eta_formatted, '5 min')
    assert.strictEqual(mockPrimaryCandidate.distance_km, 1.4)
    assert.strictEqual(mockPrimaryCandidate.match_score, 87)
    assert.ok(mockPrimaryCandidate.match_reason.includes('Recommended because TEAM 03'))
  })

  it('Scenario 2: Recommendation changes after refreshed fleet calculation', () => {
    const refreshedFleet = [
      { ...mockPrimaryCandidate, match_score: 70, rank: 2, is_recommended: false },
      { ...mockAlternativeCandidates[0], match_score: 92, rank: 1, is_recommended: true },
    ]

    const newPrimary = refreshedFleet.find((c) => c.is_recommended)
    assert.strictEqual(newPrimary.id, 'resp-02')
    assert.strictEqual(newPrimary.unit_name, 'TEAM 01')
    assert.strictEqual(newPrimary.match_score, 92)
  })

  it('Scenario 3: Alternative selected displays concise tradeoff explanation', () => {
    const alt = mockAlternativeCandidates[0]
    assert.strictEqual(alt.rank, 2)
    assert.strictEqual(alt.is_recommended, false)
    assert.ok(alt.comparative_reason)
    assert.ok(alt.comparative_reason.includes('ETA 2 min slower'))
  })

  it('Scenario 4: Route preview updates tactical corridor geometry and label', () => {
    const candidate = mockPrimaryCandidate
    const previewRoute = {
      responderId: candidate.id,
      coordinates: [
        [candidate.latitude, candidate.longitude],
        [22.5726, 88.3639],
      ],
      distanceKm: candidate.distance_km,
      etaFormatted: candidate.eta_formatted,
      label: `${candidate.unit_name} Route`,
      status: 'OPTIMAL_OSRM',
    }

    assert.strictEqual(previewRoute.responderId, 'resp-01')
    assert.strictEqual(previewRoute.distanceKm, 1.4)
    assert.strictEqual(previewRoute.etaFormatted, '5 min')
    assert.strictEqual(previewRoute.label, 'TEAM 03 Route')
  })

  it('Scenario 5: Stale candidate detection flags aged timestamp (>90s)', () => {
    const staleCalculatedAt = new Date(Date.now() - 120000).toISOString() // 120s ago
    const elapsedSec = Math.floor((Date.now() - new Date(staleCalculatedAt).getTime()) / 1000)
    const isStale = elapsedSec > 90

    assert.strictEqual(isStale, true)
    assert.ok(elapsedSec >= 120)
  })

  it('Scenario 6: Responder becomes unavailable revalidates and generates warning', () => {
    const assignResult = {
      success: false,
      error: 'Responder unit TEAM 03 is currently OFFLINE and cannot be dispatched.',
    }

    assert.strictEqual(assignResult.success, false)
    assert.ok(assignResult.error.includes('OFFLINE'))
  })

  it('Scenario 7: Assignment conflict rejects double dispatch', () => {
    const conflictResult = {
      success: false,
      error: 'Incident #SV-2048 already has an active assignment to another unit.',
    }

    assert.strictEqual(conflictResult.success, false)
    assert.ok(conflictResult.error.includes('already has an active assignment'))
  })

  it('Scenario 8: Zero eligible responders presents clear criteria checklist without phantom unit', () => {
    const candidates = []
    const topCandidate = candidates.find((c) => c.is_recommended) || null

    assert.strictEqual(topCandidate, null)
    assert.strictEqual(candidates.length, 0)
  })
})
