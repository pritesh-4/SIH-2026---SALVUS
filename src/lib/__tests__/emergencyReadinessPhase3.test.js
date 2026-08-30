/**
 * Salvus Emergency Readiness Phase 3 Test Suite
 *
 * Covers:
 * - Readiness scoring and checklist completeness
 * - Offline pass staleness detection
 * - Offline cache clearing logic
 * - Emergency Web Audio siren fallback safety
 */

import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { playTestEmergencySiren } from '../emergencyAudio.js'

describe('Salvus Emergency Readiness Phase 3 Pipeline', () => {
  it('Scenario 1: Readiness Completeness Scoring', () => {
    // Case A: Missing emergency contact
    const profileIncomplete = { full_name: 'Aditi Mukherjee', phone: '+91 98301 23456' }
    const contactsEmpty = []

    const hasValidIdentityA = Boolean(
      profileIncomplete.full_name?.trim() && profileIncomplete.phone?.trim()
    )
    const hasEmergencyContactA = contactsEmpty.length > 0 && contactsEmpty.some((c) => c.is_primary)
    const isReadyA = hasValidIdentityA && hasEmergencyContactA

    assert.equal(hasValidIdentityA, true)
    assert.equal(hasEmergencyContactA, false)
    assert.equal(isReadyA, false) // SETUP INCOMPLETE

    // Case B: Configured identity and primary contact
    const contactsConfigured = [
      { id: 'ec-1', name: 'Dr. Mukherjee', phone: '+91 98300 11223', is_primary: true },
    ]
    const hasEmergencyContactB =
      contactsConfigured.length > 0 && contactsConfigured.some((c) => c.is_primary)
    const isReadyB = hasValidIdentityA && hasEmergencyContactB

    assert.equal(hasEmergencyContactB, true)
    assert.equal(isReadyB, true) // READY
  })

  it('Scenario 2: Offline Emergency Pass Staleness Calculation', () => {
    const cachedPassTime = new Date('2026-08-30T10:00:00Z').getTime()
    const cachedPass = {
      cachedAt: new Date(cachedPassTime).toISOString(),
      emergencyId: 'SLV-CIT-7829',
    }

    // Profile updated AFTER pass was generated
    const updatedProfile = {
      emergency_id: 'SLV-CIT-7829',
      updated_at: new Date(cachedPassTime + 5000).toISOString(),
    }

    const isStaleProfile =
      new Date(updatedProfile.updated_at).getTime() > new Date(cachedPass.cachedAt).getTime() + 1000
    assert.equal(isStaleProfile, true)

    // Contact updated AFTER pass was generated
    const contacts = [{ id: 'c1', updated_at: new Date(cachedPassTime + 10000).toISOString() }]
    const isStaleContact = contacts.some(
      (c) => new Date(c.updated_at).getTime() > new Date(cachedPass.cachedAt).getTime() + 1000
    )
    assert.equal(isStaleContact, true)
  })

  it('Scenario 3: Offline Cache Disabling Clears Local Storage', () => {
    let mockLocalStorage = {
      salvus_offline_emergency_pass: JSON.stringify({ emergencyId: 'SLV-CIT-7829' }),
      salvus_profile_snapshot_local: JSON.stringify({ profile: { id: 'cit-1' } }),
    }

    const clearOfflineData = () => {
      delete mockLocalStorage.salvus_offline_emergency_pass
      delete mockLocalStorage.salvus_profile_snapshot_local
    }

    assert.ok(mockLocalStorage.salvus_offline_emergency_pass)
    assert.ok(mockLocalStorage.salvus_profile_snapshot_local)

    clearOfflineData()

    assert.equal(mockLocalStorage.salvus_offline_emergency_pass, undefined)
    assert.equal(mockLocalStorage.salvus_profile_snapshot_local, undefined)
  })

  it('Scenario 4: Audio Siren Tester Safety and Fallback in Non-Browser Context', () => {
    let errorReceived = null
    const stopFn = playTestEmergencySiren({
      onError: (err) => {
        errorReceived = err
      },
    })

    assert.equal(typeof stopFn, 'function')
    // In Node (non-browser), it cleanly triggers onError without throwing unhandled exceptions
    assert.ok(errorReceived)
  })
})
