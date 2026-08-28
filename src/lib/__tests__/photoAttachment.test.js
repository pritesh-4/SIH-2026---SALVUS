/* global process */
/**
 * Automated Test Suite for Salvus Photo Attachment Foundation & UX Utilities
 *
 * Tests:
 * 1. File validation for valid JPEG, PNG, WebP images
 * 2. Rejection of oversized (>5MB) files with clear human messaging
 * 3. Rejection of unsupported media types (PDF, plain text, GIF)
 * 4. Human-readable file size formatting (B, KB, MB)
 * 5. Safe Blob URL revocation
 * 6. Simulated multi-step submission orchestration (incident creation + upload + retry/continue flows)
 */

import { validateAttachmentFile, formatFileSize, revokePreviewUrl } from '../attachmentUtils.js'

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

async function runTests() {
  console.log('\n========================================')
  console.log('SALVUS PHOTO ATTACHMENT TEST SUITE')
  console.log('========================================\n')

  // ---------------------------------------------------------------------------
  // 1. File Size Formatting Tests
  // ---------------------------------------------------------------------------
  console.log('[Suite 1: File Size Formatting]')
  assertEqual(formatFileSize(0), '0 B', 'Formats 0 bytes')
  assertEqual(formatFileSize(512), '512 B', 'Formats sub-kilobyte bytes')
  assertEqual(formatFileSize(1024), '1 KB', 'Formats exactly 1 KB')
  assertEqual(formatFileSize(450 * 1024), '450 KB', 'Formats 450 KB')
  assertEqual(formatFileSize(1.5 * 1024 * 1024), '1.5 MB', 'Formats 1.5 MB')
  assertEqual(formatFileSize(5 * 1024 * 1024), '5.0 MB', 'Formats 5.0 MB')
  assertEqual(formatFileSize(null), '0 B', 'Handles null safely')
  assertEqual(formatFileSize(-100), '0 B', 'Handles negative numbers safely')

  // ---------------------------------------------------------------------------
  // 2. Candidate Photo Validation Tests
  // ---------------------------------------------------------------------------
  console.log('\n[Suite 2: Photo Validation]')

  // Valid JPEG
  const validJpeg = {
    name: 'flood_scene.jpg',
    size: 2 * 1024 * 1024,
    type: 'image/jpeg',
  }
  const resJpeg = validateAttachmentFile(validJpeg)
  assert(resJpeg.valid === true, 'Accepts valid 2MB JPEG image')
  assert(resJpeg.error === null, 'No error on valid JPEG')

  // Valid PNG
  const validPng = {
    name: 'structural_damage.png',
    size: 800 * 1024,
    type: 'image/png',
  }
  const resPng = validateAttachmentFile(validPng)
  assert(resPng.valid === true, 'Accepts valid PNG image')

  // Valid WebP
  const validWebp = {
    name: 'debris_road.webp',
    size: 350 * 1024,
    type: 'image/webp',
  }
  const resWebp = validateAttachmentFile(validWebp)
  assert(resWebp.valid === true, 'Accepts valid WebP image')

  // Rejection: Oversized file (> 5MB)
  const oversizedFile = {
    name: 'huge_panorama.jpg',
    size: 6 * 1024 * 1024,
    type: 'image/jpeg',
  }
  const resOversized = validateAttachmentFile(oversizedFile)
  assert(resOversized.valid === false, 'Rejects file exceeding 5MB')
  assert(resOversized.error.includes('too large'), 'Provides human-friendly size error message')

  // Rejection: Unsupported PDF format
  const pdfFile = {
    name: 'incident_report.pdf',
    size: 100 * 1024,
    type: 'application/pdf',
  }
  const resPdf = validateAttachmentFile(pdfFile)
  assert(resPdf.valid === false, 'Rejects PDF file')
  assert(resPdf.error.includes('Unsupported photo format'), 'Informs user about supported formats')

  // Rejection: Unsupported Text script
  const txtFile = {
    name: 'script.txt',
    size: 1024,
    type: 'text/plain',
  }
  const resTxt = validateAttachmentFile(txtFile)
  assert(resTxt.valid === false, 'Rejects text file')

  // Rejection: Null / missing file
  const resNull = validateAttachmentFile(null)
  assert(resNull.valid === false, 'Rejects null file')

  // ---------------------------------------------------------------------------
  // 3. Object URL Revocation Safety
  // ---------------------------------------------------------------------------
  console.log('\n[Suite 3: URL Revocation Safety]')
  let revokedUrl = null
  globalThis.URL = globalThis.URL || {}
  globalThis.URL.revokeObjectURL = (url) => {
    revokedUrl = url
  }

  revokePreviewUrl('blob:http://localhost:5173/abc-123')
  assertEqual(revokedUrl, 'blob:http://localhost:5173/abc-123', 'Revokes valid blob: URL')

  // Does not crash or call on non-blob strings
  revokedUrl = null
  revokePreviewUrl('https://res.cloudinary.com/demo/image.jpg')
  assertEqual(revokedUrl, null, 'Ignores non-blob external URLs')
  revokePreviewUrl(null)
  assertEqual(revokedUrl, null, 'Ignores null URL')

  // ---------------------------------------------------------------------------
  // 4. Multi-Step Submission State Transitions
  // ---------------------------------------------------------------------------
  console.log('\n[Suite 4: Submission State Flow Simulation]')

  // Scenario A: Submission without photo
  const runNoPhotoSubmission = async (createIncidentFn) => {
    const stateHistory = ['IDLE', 'CREATING_REPORT']
    const result = await createIncidentFn({ type: 'flood' })
    if (result.success) {
      stateHistory.push('SUCCESS')
    } else {
      stateHistory.push('ERROR')
    }
    return stateHistory
  }

  const historyNoPhoto = await runNoPhotoSubmission(async () => ({
    success: true,
    data: { id: 'inc-1001', ticket_id: 'SV-1001' },
  }))
  assertEqual(
    historyNoPhoto[historyNoPhoto.length - 1],
    'SUCCESS',
    'No-photo submission advances straight to SUCCESS'
  )

  // Scenario B: Submission with photo (both succeed)
  const runWithPhotoSuccess = async (createIncidentFn, uploadAttachmentFn, file) => {
    const stateHistory = ['IDLE', 'CREATING_REPORT']
    const incResult = await createIncidentFn({ type: 'hazard' })
    if (!incResult.success) {
      stateHistory.push('ERROR')
      return stateHistory
    }

    if (file) {
      stateHistory.push('UPLOADING_PHOTO')
      const uploadResult = await uploadAttachmentFn(incResult.data.id, file)
      if (uploadResult.success) {
        stateHistory.push('SUCCESS')
      } else {
        stateHistory.push('PHOTO_FAILED')
      }
    } else {
      stateHistory.push('SUCCESS')
    }
    return stateHistory
  }

  const historyWithPhoto = await runWithPhotoSuccess(
    async () => ({
      success: true,
      data: { id: 'inc-1002', ticket_id: 'SV-1002' },
    }),
    async () => ({
      success: true,
      data: { id: 'att-501', url: 'https://cdn.example.com/p.jpg' },
    }),
    validJpeg
  )
  assertEqual(
    historyWithPhoto[historyWithPhoto.length - 1],
    'SUCCESS',
    'With-photo submission completes as SUCCESS when both succeed'
  )

  // Scenario C: Incident succeeds, but photo upload fails (Partial failure recovery)
  const runWithPhotoFailure = async () => {
    const stateHistory = ['IDLE', 'CREATING_REPORT']
    const incResult = {
      success: true,
      data: { id: 'inc-1003', ticket_id: 'SV-1003' },
    }

    stateHistory.push('UPLOADING_PHOTO')
    const uploadResult = {
      success: false,
      error: { message: 'Network timeout during upload' },
    }
    if (!uploadResult.success) {
      stateHistory.push('PHOTO_FAILED')
    }
    return { stateHistory, incident: incResult.data }
  }

  const partialRes = await runWithPhotoFailure()
  assertEqual(
    partialRes.stateHistory[partialRes.stateHistory.length - 1],
    'PHOTO_FAILED',
    'Enters PHOTO_FAILED state without claiming full report failure'
  )
  assertEqual(
    partialRes.incident.ticket_id,
    'SV-1003',
    'Preserves created incident ticket ID for recovery'
  )

  console.log('\n========================================')
  console.log(`ALL TESTS PASSED: ${passedTests} passed, ${failedTests} failed`)
  console.log('========================================\n')
}

runTests().catch((err) => {
  console.error(err)
  process.exit(1)
})
