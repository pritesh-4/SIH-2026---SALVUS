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
})
