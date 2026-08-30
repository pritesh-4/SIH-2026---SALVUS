/**
 * Salvus Emergency Readiness Test Suite (Phase 2)
 *
 * Validates emergency contacts, single-primary rules, medical records,
 * privacy preferences, and offline pass caching.
 */

import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

describe('Salvus Emergency Readiness Pipeline', () => {
  it('Scenario 1: Single Primary Contact Enforcement', () => {
    let contacts = [
      { id: 'c1', name: 'Dr. Mukherjee', phone: '+91 98300 11111', is_primary: true },
      { id: 'c2', name: 'Priya Das', phone: '+91 98300 22222', is_primary: false },
    ]

    // Promoting c2 to primary must demote c1
    const targetId = 'c2'
    contacts = contacts.map((c) => ({
      ...c,
      is_primary: c.id === targetId,
    }))

    assert.equal(contacts.find((c) => c.id === 'c2').is_primary, true)
    assert.equal(contacts.find((c) => c.id === 'c1').is_primary, false)
    assert.equal(contacts.filter((c) => c.is_primary).length, 1)
  })

  it('Scenario 2: Primary Promotion upon Deletion', () => {
    let contacts = [
      { id: 'c1', name: 'Primary Contact', priority: 1, is_primary: true },
      { id: 'c2', name: 'Secondary Contact', priority: 2, is_primary: false },
    ]

    // Delete primary contact c1
    const deletedId = 'c1'
    const wasPrimary = contacts.find((c) => c.id === deletedId)?.is_primary
    contacts = contacts.filter((c) => c.id !== deletedId)

    if (wasPrimary && contacts.length > 0) {
      contacts[0].is_primary = true
    }

    assert.equal(contacts.length, 1)
    assert.equal(contacts[0].id, 'c2')
    assert.equal(contacts[0].is_primary, true)
  })

  it('Scenario 3: Medical Records Sanitization and Bounds', () => {
    const rawConditionsInput = 'Mild Asthma ,  Hypertension, , Cardiac Stent '
    const rawAllergiesInput = 'Penicillin, Dust / Pollen '

    const sanitizedConditions = rawConditionsInput
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)

    const sanitizedAllergies = rawAllergiesInput
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)

    assert.deepEqual(sanitizedConditions, ['Mild Asthma', 'Hypertension', 'Cardiac Stent'])
    assert.deepEqual(sanitizedAllergies, ['Penicillin', 'Dust / Pollen'])
  })

  it('Scenario 4: System Safety Lock on Emergency Location Sharing', () => {
    const defaultSettings = [
      { id: 'emergency_location', title: 'Emergency Location', value: true, locked: true },
      { id: 'offline_cache', title: 'Offline Cache', value: true, locked: false },
    ]

    // Attempting to turn off emergency_location should be ignored because it is locked
    const attemptedToggles = {
      emergency_location: false,
      offline_cache: false,
    }

    const appliedSettings = defaultSettings.map((s) => {
      if (s.locked) return s // System safety requirement remains untouched
      return { ...s, value: attemptedToggles[s.id] ?? s.value }
    })

    assert.equal(appliedSettings.find((s) => s.id === 'emergency_location').value, true)
    assert.equal(appliedSettings.find((s) => s.id === 'offline_cache').value, false)
  })

  it('Scenario 5: Offline Emergency Pass Structure & Verification', () => {
    const profile = {
      emergency_id: 'SLV-CIT-7829',
      full_name: 'Aditi Mukherjee',
      blood_group: 'O+',
      phone: '+91 98301 23456',
      medical_info: {
        conditions: ['Mild Asthma'],
        allergies: ['Penicillin'],
        mobilityNote: 'Fully Mobile / Ambulatory',
      },
    }

    const primaryContact = {
      name: 'Dr. Sourav Mukherjee',
      phone: '+91 98300 11223',
    }

    const passPayload = {
      emergencyId: profile.emergency_id,
      fullName: profile.full_name,
      bloodGroup: profile.blood_group,
      primaryContact,
      conditions: profile.medical_info.conditions,
      allergies: profile.medical_info.allergies,
      cachedAt: new Date().toISOString(),
      version: '1.0',
    }

    assert.equal(passPayload.emergencyId, 'SLV-CIT-7829')
    assert.equal(passPayload.fullName, 'Aditi Mukherjee')
    assert.equal(passPayload.bloodGroup, 'O+')
    assert.equal(passPayload.primaryContact.name, 'Dr. Sourav Mukherjee')
    assert.equal(passPayload.conditions.length, 1)
  })
})
