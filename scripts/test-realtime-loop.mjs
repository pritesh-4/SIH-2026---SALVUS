import axios from 'axios'
import { io } from 'socket.io-client'

const BASE_URL = 'http://127.0.0.1:8000'

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function runRealtimeE2ETest() {
  console.log('====================================================')
  console.log('SALVUS PHASE 2 — REALTIME LOOP INTEGRATION TEST')
  console.log('====================================================')

  const receivedNewIncidents = []
  const authStatusChanges = []
  const citizenStatusChanges = []

  // 1. Connect Authority client to Socket.IO
  console.log('\n[Step 1] Connecting Authority Client to Socket.IO...')
  const authSocket = io(BASE_URL, {
    transports: ['websocket', 'polling'],
  })

  await new Promise((resolve) => {
    authSocket.on('connect', () => {
      console.log(`✓ Authority Client Connected (ID: ${authSocket.id})`)
      authSocket.emit('join_room', { room: 'authorities' })
      resolve()
    })
  })

  authSocket.on('incident:new', (data) => {
    console.log(
      `  → [Authority Socket] Received incident:new: #${data.ticket_id} (${data.type}, ${data.severity})`
    )
    receivedNewIncidents.push(data)
  })

  authSocket.on('incident:status_changed', (data) => {
    console.log(
      `  → [Authority Socket] Received status_changed: #${data.ticket_id} -> ${data.status}`
    )
    authStatusChanges.push(data)
  })

  await sleep(300)

  // 2. Citizen creates SOS Incident via POST /api/incidents
  console.log('\n[Step 2] Citizen submits SOS beacon to POST /api/incidents...')
  const createPayload = {
    type: 'flood',
    severity: 'CRITICAL',
    description: 'E2E Live Loop Test: Citizen trapped on second floor by surge.',
    reporter_name: 'Aditi Roy',
    reporter_phone: '+91 98301 24890',
    latitude: 22.5726,
    longitude: 88.3639,
    affected_count: 3,
    is_sos: true,
  }

  const createRes = await axios.post(`${BASE_URL}/api/incidents`, createPayload)
  const createdIncident = createRes.data.data
  const incidentId = createdIncident.id
  const ticketId = createdIncident.ticket_id

  console.log(
    `✓ Incident Created: Ticket #${ticketId} (ID: ${incidentId}) with status: ${createdIncident.status}`
  )

  // 3. Verify Authority received incident:new without reload
  console.log('\n[Step 3] Verifying Authority received live incident:new event...')
  await sleep(500)
  const matchingNew = receivedNewIncidents.find(
    (i) => i.id === incidentId || i.incident_id === incidentId
  )
  if (!matchingNew) {
    throw new Error(`FAIL: Authority did not receive incident:new for ticket ${ticketId}`)
  }
  console.log(
    `✓ Authority received incident:new with full payload: ${matchingNew.type} / ${matchingNew.severity}`
  )

  // 4. Citizen joins room `incident:{incidentId}`
  console.log('\n[Step 4] Connecting Citizen Client and subscribing to incident room...')
  const citizenSocket = io(BASE_URL, {
    transports: ['websocket', 'polling'],
  })

  await new Promise((resolve) => {
    citizenSocket.on('connect', () => {
      console.log(`✓ Citizen Client Connected (ID: ${citizenSocket.id})`)
      citizenSocket.emit('join_room', { room: `incident:${incidentId}` })
      resolve()
    })
  })

  citizenSocket.on('incident:status_changed', (data) => {
    console.log(
      `  → [Citizen Socket] Received status_changed: #${data.ticket_id} -> ${data.status}`
    )
    citizenStatusChanges.push(data)
  })

  await sleep(300)

  // 5. Authority transitions incident to TRIAGE_PENDING (NEW -> TRIAGE_PENDING)
  console.log('\n[Step 5] Authority transitions incident status: NEW -> TRIAGE_PENDING...')
  const triageRes = await axios.patch(`${BASE_URL}/api/incidents/${incidentId}/status`, {
    status: 'TRIAGE_PENDING',
    actor: 'AI Triage Engine',
  })
  console.log(`✓ Backend Response: status is now ${triageRes.data.data.status}`)

  await sleep(500)

  // 6. Verify BOTH Authority & Citizen received status_changed (TRIAGE_PENDING)
  console.log('\n[Step 6] Checking realtime status synchronization for TRIAGE_PENDING state...')
  const authTriage = authStatusChanges.find(
    (e) => (e.id === incidentId || e.incident_id === incidentId) && e.status === 'TRIAGE_PENDING'
  )
  const citizenTriage = citizenStatusChanges.find(
    (e) => (e.id === incidentId || e.incident_id === incidentId) && e.status === 'TRIAGE_PENDING'
  )

  if (!authTriage) throw new Error('FAIL: Authority did not receive TRIAGE_PENDING status event')
  if (!citizenTriage) throw new Error('FAIL: Citizen did not receive TRIAGE_PENDING status event')
  console.log('✓ BOTH Authority and Citizen received TRIAGE_PENDING status update in real time!')

  // 7. Authority verifies the incident (TRIAGE_PENDING -> VERIFIED)
  console.log('\n[Step 7] Authority transitions incident status: TRIAGE_PENDING -> VERIFIED...')
  const verifyRes = await axios.patch(`${BASE_URL}/api/incidents/${incidentId}/status`, {
    status: 'VERIFIED',
    actor: 'Lead Coordinator S. Mukherjee',
  })
  console.log(`✓ Backend Response: status is now ${verifyRes.data.data.status}`)

  await sleep(500)

  // 8. Verify BOTH Authority & Citizen received status_changed (VERIFIED)
  console.log('\n[Step 8] Checking realtime status synchronization for VERIFIED state...')
  const authVerified = authStatusChanges.find(
    (e) => (e.id === incidentId || e.incident_id === incidentId) && e.status === 'VERIFIED'
  )
  const citizenVerified = citizenStatusChanges.find(
    (e) => (e.id === incidentId || e.incident_id === incidentId) && e.status === 'VERIFIED'
  )

  if (!authVerified) throw new Error('FAIL: Authority did not receive VERIFIED status event')
  if (!citizenVerified) throw new Error('FAIL: Citizen did not receive VERIFIED status event')
  console.log('✓ BOTH Authority and Citizen received VERIFIED status update in real time!')

  // 9. Authority resolves the incident (VERIFIED -> RESOLVED)
  console.log('\n[Step 9] Authority transitions incident status: VERIFIED -> RESOLVED...')
  const resolveRes = await axios.patch(`${BASE_URL}/api/incidents/${incidentId}/status`, {
    status: 'RESOLVED',
    actor: 'NDRF Unit 4 Capt. Roy',
  })
  console.log(`✓ Backend Response: status is now ${resolveRes.data.data.status}`)

  await sleep(500)

  // 10. Verify BOTH Authority & Citizen received status_changed (RESOLVED)
  console.log('\n[Step 10] Checking realtime status synchronization for RESOLVED state...')
  const authResolved = authStatusChanges.find(
    (e) => (e.id === incidentId || e.incident_id === incidentId) && e.status === 'RESOLVED'
  )
  const citizenResolved = citizenStatusChanges.find(
    (e) => (e.id === incidentId || e.incident_id === incidentId) && e.status === 'RESOLVED'
  )

  if (!authResolved) throw new Error('FAIL: Authority did not receive RESOLVED status event')
  if (!citizenResolved) throw new Error('FAIL: Citizen did not receive RESOLVED status event')
  console.log('✓ BOTH Authority and Citizen received RESOLVED status update in real time!')

  // 11. Verify state machine prevents invalid transition on terminal state
  console.log('\n[Step 11] Verifying state machine protects resolved terminal state...')
  try {
    await axios.patch(`${BASE_URL}/api/incidents/${incidentId}/status`, {
      status: 'NEW',
      actor: 'invalid_actor',
    })
    throw new Error('FAIL: Invalid transition was not rejected')
  } catch (err) {
    if (err.response?.status === 400) {
      console.log(
        `✓ Backend correctly rejected invalid transition with 400 Bad Request: ${err.response.data.detail.error.message}`
      )
    } else {
      throw err
    }
  }

  // 12. Repeat core loop for Hazard Report & Cancellation workflow
  console.log(
    '\n[Step 12] Repeating core loop: Hazard Report -> Cancellation (NEW -> CANCELLED)...'
  )
  const hazardRes = await axios.post(`${BASE_URL}/api/incidents`, {
    type: 'power_line',
    severity: 'HIGH',
    description: 'Downed live line near Sector 12 block gate.',
    reporter_name: 'P. Sengupta',
    latitude: 22.5841,
    longitude: 88.412,
    affected_count: 5,
    is_sos: false,
  })
  const hazardId = hazardRes.data.data.id
  console.log(`✓ Hazard Report Created: #${hazardRes.data.data.ticket_id}`)

  await sleep(400)
  const hazardReceived = receivedNewIncidents.find(
    (i) => i.id === hazardId || i.incident_id === hazardId
  )
  if (!hazardReceived) throw new Error('FAIL: Authority did not receive hazard report in real time')
  console.log(`✓ Authority received hazard report event: #${hazardReceived.ticket_id}`)

  // Cancel hazard
  const cancelRes = await axios.patch(`${BASE_URL}/api/incidents/${hazardId}/status`, {
    status: 'CANCELLED',
    actor: 'citizen',
  })
  console.log(`✓ Incident successfully cancelled: status=${cancelRes.data.data.status}`)

  await sleep(400)
  const authCancelled = authStatusChanges.find(
    (e) => (e.id === hazardId || e.incident_id === hazardId) && e.status === 'CANCELLED'
  )
  if (!authCancelled) throw new Error('FAIL: Authority did not receive CANCELLED status event')
  console.log('✓ Authority received CANCELLED status update in real time!')

  // Cleanup
  authSocket.disconnect()
  citizenSocket.disconnect()

  console.log('\n====================================================')
  console.log('SUCCESS: Full Realtime Loop Test Completed (12/12 Steps Passed)!')
  console.log('====================================================\n')
}

runRealtimeE2ETest().catch((err) => {
  console.error('\n❌ Realtime E2E Test FAILED:', err)
  process.exit(1)
})
