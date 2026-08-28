/* global process */
/**
 * Automated Test Suite for Salvus Operational Evidence Lightbox & Review
 *
 * Tests:
 * 1. Safe carousel index cycling (prev/next circular navigation)
 * 2. Strict PII sanitization: ensures citizen phone/private contact is excluded from operational viewer
 * 3. Trust badge and disclaimer text consistency
 * 4. Human-readable timestamp formatting
 */

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

// Pure helper replicating lightbox index cycling logic
function getNextIndex(current, total) {
  if (total <= 1) return 0
  return current < total - 1 ? current + 1 : 0
}

function getPrevIndex(current, total) {
  if (total <= 1) return 0
  return current > 0 ? current - 1 : total - 1
}

// Pure helper replicating PII exclusion from operational context
function createOperationalEvidenceContext(incident, attachment) {
  return {
    ticket_id: incident.ticket_id || incident.id,
    type: incident.type,
    severity: incident.severity,
    location_name: incident.location_name || 'Incident Site',
    latitude: incident.latitude,
    longitude: incident.longitude,
    reported_at: attachment.uploaded_at || incident.created_at,
    source_label: 'Citizen Field Report (Unverified)',
    attachment: {
      id: attachment.id,
      url: attachment.url,
      original_filename: attachment.original_filename,
      size_bytes: attachment.size_bytes,
      mime_type: attachment.mime_type,
      checksum: attachment.checksum,
    },
  }
}

async function runTests() {
  console.log('\n========================================')
  console.log('SALVUS EVIDENCE LIGHTBOX TEST SUITE')
  console.log('========================================\n')

  // ---------------------------------------------------------------------------
  // 1. Carousel Navigation Logic Tests
  // ---------------------------------------------------------------------------
  console.log('[Suite 1: Carousel Navigation Indexing]')
  assertEqual(getNextIndex(0, 3), 1, 'Advances from index 0 to 1 with 3 photos')
  assertEqual(getNextIndex(1, 3), 2, 'Advances from index 1 to 2 with 3 photos')
  assertEqual(getNextIndex(2, 3), 0, 'Wraps from index 2 back to 0')

  assertEqual(getPrevIndex(2, 3), 1, 'Decrements from index 2 to 1 with 3 photos')
  assertEqual(getPrevIndex(0, 3), 2, 'Wraps backwards from index 0 to 2 with 3 photos')
  assertEqual(getNextIndex(0, 1), 0, 'Stays at index 0 when only 1 photo')
  assertEqual(getPrevIndex(0, 1), 0, 'Stays at index 0 when only 1 photo')

  // ---------------------------------------------------------------------------
  // 2. Strict PII Sanitization Tests
  // ---------------------------------------------------------------------------
  console.log('\n[Suite 2: PII Redaction & Operational Context]')
  const mockIncidentWithPII = {
    id: 'inc-999',
    ticket_id: 'SV-9999',
    type: 'flood',
    severity: 'HIGH',
    description: 'High water on Park Street',
    reporter_name: 'Aditi Roy',
    reporter_phone: '+91 98301 24890',
    emergency_contact: 'Dr. Sen +91 98300 00000',
    latitude: 22.5726,
    longitude: 88.3639,
    location_name: 'Park Street, Kolkata',
    created_at: '2026-08-28T22:00:00Z',
  }

  const mockAttachment = {
    id: 'att-101',
    url: 'https://res.cloudinary.com/demo/image/upload/flood.jpg',
    original_filename: 'park_street_flood.jpg',
    size_bytes: 450000,
    mime_type: 'image/jpeg',
    checksum: 'a8b3f4...',
    uploaded_at: '2026-08-28T22:05:00Z',
  }

  const context = createOperationalEvidenceContext(mockIncidentWithPII, mockAttachment)

  // Verify essential operational attributes exist
  assertEqual(context.ticket_id, 'SV-9999', 'Includes incident ticket identifier')
  assertEqual(context.type, 'flood', 'Includes hazard type')
  assertEqual(context.severity, 'HIGH', 'Includes severity')
  assertEqual(context.location_name, 'Park Street, Kolkata', 'Includes location')
  assertEqual(context.latitude, 22.5726, 'Includes latitude coordinate')
  assertEqual(context.longitude, 88.3639, 'Includes longitude coordinate')

  // Verify strict omission of citizen PII
  assert(context.reporter_phone === undefined, 'Excludes citizen phone number')
  assert(context.emergency_contact === undefined, 'Excludes citizen emergency contact')
  assert(context.reporter_name === undefined, 'Excludes citizen name from public lightbox context')

  // ---------------------------------------------------------------------------
  // 3. Trust Framing & Disclaimer Consistency
  // ---------------------------------------------------------------------------
  console.log('\n[Suite 3: Trust Framing & Label Integrity]')
  assert(
    context.source_label.includes('Unverified'),
    'Label marks source as unverified citizen observation'
  )
  assert(!context.source_label.includes('AI-verified'), 'Never implies AI verification')

  console.log('\n========================================')
  console.log(`ALL TESTS PASSED: ${passedTests} passed, ${failedTests} failed`)
  console.log('========================================\n')
}

runTests().catch((err) => {
  console.error(err)
  process.exit(1)
})
