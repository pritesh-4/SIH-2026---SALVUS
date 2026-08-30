import { useState, useRef, useEffect, useCallback } from 'react'
import {
  fetchCitizenProfile,
  updateCitizenProfile,
  fetchEmergencyContacts,
  createEmergencyContact,
  updateEmergencyContact,
  deleteEmergencyContact,
  updateMedicalInfo,
  fetchPrivacySettings,
  updatePrivacySettings,
  saveOfflinePassLocal,
  getOfflinePassLocal,
  checkPassStatus,
  saveProfileSnapshotLocal,
  getCachedProfileSnapshot,
  deriveInitials,
  formatLastSyncedTime,
} from '../services/profileService'
import { playTestEmergencySiren } from '../lib/emergencyAudio'
import { Card } from '../components/ui/Card'
import { Badge } from '../components/ui/Badge'
import { Button } from '../components/ui/Button'
import { Toggle } from '../components/ui/Toggle'
import { ThemeToggle } from '../components/ui/ThemeToggle'
import { Input, Select, Label, Checkbox } from '../components/ui/Input'
import { Modal } from '../components/ui/Modal'
import { LoadingState } from '../components/ui/LoadingState'
import { ErrorState } from '../components/ui/ErrorState'

const APP_METADATA = {
  version: 'Salvus Citizen v1.2.0-beta',
  build: 'Build 2026.08',
}

const BLOOD_GROUPS = ['O+', 'O-', 'A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'UNKNOWN']
const MOBILITY_OPTIONS = [
  'Fully Mobile / Ambulatory',
  'Assisted Walker / Cane Required',
  'Wheelchair Access Required',
  'Non-Ambulatory / Stretcher Transfer Required',
]
const RELATIONSHIP_OPTIONS = [
  'Father',
  'Mother',
  'Spouse',
  'Sister',
  'Brother',
  'Child',
  'Neighbor',
  'Friend / Colleague',
  'Physician / Caregiver',
  'Other',
]

export const CitizenProfile = () => {
  // 1. Authoritative Server & Offline State
  const [profile, setProfile] = useState(null)
  const [contacts, setContacts] = useState([])
  const [privacySettings, setPrivacySettings] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState(null)
  const [isOfflineFallback, setIsOfflineFallback] = useState(false)
  const [lastSyncedAt, setLastSyncedAt] = useState(null)

  // Granular section states for partial API failure resilience
  const [contactsLoading, setContactsLoading] = useState(false)
  const [contactsError, setContactsError] = useState(null)
  const [privacyLoading, setPrivacyLoading] = useState(false)
  const [privacyError, setPrivacyError] = useState(null)

  // 2. Identity Edit Form State
  const [isEditingIdentity, setIsEditingIdentity] = useState(false)
  const [identityForm, setIdentityForm] = useState({
    full_name: '',
    phone: '',
    email: '',
    blood_group: 'UNKNOWN',
    registered_address: '',
  })
  const [identitySaveStatus, setIdentitySaveStatus] = useState('idle')
  const [identitySaveError, setIdentitySaveError] = useState(null)

  // 3. Medical Edit Modal State
  const [isMedicalModalOpen, setIsMedicalModalOpen] = useState(false)
  const [medicalForm, setMedicalForm] = useState({
    blood_group: 'UNKNOWN',
    conditionsText: '',
    allergiesText: '',
    mobility_note: 'Fully Mobile / Ambulatory',
    medications_note: '',
  })
  const [medicalSaveStatus, setMedicalSaveStatus] = useState('idle')
  const [medicalSaveError, setMedicalSaveError] = useState(null)

  // 4. Contact Modal (Add / Edit) & Delete Modal State
  const [isContactModalOpen, setIsContactModalOpen] = useState(false)
  const [editingContactId, setEditingContactId] = useState(null)
  const [contactForm, setContactForm] = useState({
    name: '',
    relationship: 'Father',
    phone: '',
    is_primary: false,
    notify_on_sos: true,
  })
  const [contactSaveStatus, setContactSaveStatus] = useState('idle')
  const [contactSaveError, setContactSaveError] = useState(null)

  const [deleteConfirmContact, setDeleteConfirmContact] = useState(null)
  const [isDeletingContact, setIsDeletingContact] = useState(false)

  // 5. Offline Emergency Pass Modal & Staleness State
  const [isOfflinePassModalOpen, setIsOfflinePassModalOpen] = useState(false)
  const [passStatus, setPassStatus] = useState('NOT_SAVED')
  const [cachedPassData, setCachedPassData] = useState(null)

  // 6. Audio Siren Tester & UI Disclosures
  const [isSirenPlaying, setIsSirenPlaying] = useState(false)
  const [sirenError, setSirenError] = useState(null)
  const stopSirenRef = useRef(null)

  const [showMedicalDetails, setShowMedicalDetails] = useState(false)
  const [showAddressDetails, setShowAddressDetails] = useState(false)
  const [toastMessage, setToastMessage] = useState(null)

  const toastTimeoutRef = useRef(null)

  const showToast = useCallback((msg) => {
    setToastMessage(msg)
    if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current)
    toastTimeoutRef.current = setTimeout(() => setToastMessage(null), 3500)
  }, [])

  // -------------------------------------------------------------------------
  // Initial Data Fetch Pipeline & Offline Resilience
  // -------------------------------------------------------------------------
  useEffect(() => {
    let isMounted = true

    const runInit = async () => {
      try {
        const results = await Promise.allSettled([
          fetchCitizenProfile(),
          fetchEmergencyContacts(),
          fetchPrivacySettings(),
        ])

        if (!isMounted) return

        const profRes =
          results[0].status === 'fulfilled'
            ? results[0].value
            : { success: false, error: { message: results[0].reason?.message } }
        const contRes =
          results[1].status === 'fulfilled'
            ? results[1].value
            : { success: false, error: { message: results[1].reason?.message } }
        const privRes =
          results[2].status === 'fulfilled'
            ? results[2].value
            : { success: false, error: { message: results[2].reason?.message } }

        if (profRes.success && profRes.data) {
          setIsOfflineFallback(false)
          setLastSyncedAt(null)
          setProfile(profRes.data)
          setIdentityForm({
            full_name: profRes.data.full_name || '',
            phone: profRes.data.phone || '',
            email: profRes.data.email || '',
            blood_group: profRes.data.blood_group || 'UNKNOWN',
            registered_address: profRes.data.registered_address || '',
          })

          let loadedContacts = []
          if (contRes.success && Array.isArray(contRes.data)) {
            loadedContacts = contRes.data
            setContacts(loadedContacts)
            setContactsError(null)
          } else {
            setContactsError(contRes.error?.message || 'Emergency contacts unavailable.')
          }

          let loadedPriv = []
          if (privRes.success && Array.isArray(privRes.data)) {
            loadedPriv = privRes.data
            setPrivacySettings(loadedPriv)
            setPrivacyError(null)
          } else {
            setPrivacyError(privRes.error?.message || 'Privacy settings unavailable.')
          }

          saveProfileSnapshotLocal(profRes.data, loadedContacts, loadedPriv)
          setPassStatus(checkPassStatus(profRes.data, loadedContacts))
          setCachedPassData(getOfflinePassLocal())
        } else {
          // Attempt graceful fallback to offline snapshot if available on device
          const offlineSnapshot = getCachedProfileSnapshot()
          if (offlineSnapshot?.profile) {
            setIsOfflineFallback(true)
            setLastSyncedAt(offlineSnapshot.cachedAt || null)
            setProfile(offlineSnapshot.profile)
            setContacts(offlineSnapshot.contacts || [])
            setPrivacySettings(offlineSnapshot.settings || [])
            setContactsError(null)
            setPrivacyError(null)
            setPassStatus(checkPassStatus(offlineSnapshot.profile, offlineSnapshot.contacts || []))
            setCachedPassData(getOfflinePassLocal())
          } else {
            setLoadError(
              profRes.error?.message || 'Profile unavailable. Unable to connect to server.'
            )
          }
        }
      } catch {
        if (!isMounted) return
        const offlineSnapshot = getCachedProfileSnapshot()
        if (offlineSnapshot?.profile) {
          setIsOfflineFallback(true)
          setLastSyncedAt(offlineSnapshot.cachedAt || null)
          setProfile(offlineSnapshot.profile)
          setContacts(offlineSnapshot.contacts || [])
          setPrivacySettings(offlineSnapshot.settings || [])
          setContactsError(null)
          setPrivacyError(null)
          setPassStatus(checkPassStatus(offlineSnapshot.profile, offlineSnapshot.contacts || []))
          setCachedPassData(getOfflinePassLocal())
        } else {
          setLoadError('Network disconnected. No offline emergency snapshot found on this device.')
        }
      } finally {
        if (isMounted) {
          setIsLoading(false)
        }
      }
    }

    runInit()

    return () => {
      isMounted = false
      if (stopSirenRef.current) stopSirenRef.current()
      if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current)
    }
  }, [])

  const handleRetry = () => {
    setIsLoading(true)
    setLoadError(null)
    Promise.allSettled([fetchCitizenProfile(), fetchEmergencyContacts(), fetchPrivacySettings()])
      .then((results) => {
        const profRes =
          results[0].status === 'fulfilled'
            ? results[0].value
            : { success: false, error: { message: results[0].reason?.message } }
        const contRes =
          results[1].status === 'fulfilled'
            ? results[1].value
            : { success: false, error: { message: results[1].reason?.message } }
        const privRes =
          results[2].status === 'fulfilled'
            ? results[2].value
            : { success: false, error: { message: results[2].reason?.message } }

        if (profRes.success && profRes.data) {
          setIsOfflineFallback(false)
          setLastSyncedAt(null)
          setProfile(profRes.data)
          setIdentityForm({
            full_name: profRes.data.full_name || '',
            phone: profRes.data.phone || '',
            email: profRes.data.email || '',
            blood_group: profRes.data.blood_group || 'UNKNOWN',
            registered_address: profRes.data.registered_address || '',
          })

          let loadedContacts = []
          if (contRes.success && Array.isArray(contRes.data)) {
            loadedContacts = contRes.data
            setContacts(loadedContacts)
            setContactsError(null)
          } else {
            setContactsError(contRes.error?.message || 'Emergency contacts unavailable.')
          }

          let loadedPriv = []
          if (privRes.success && Array.isArray(privRes.data)) {
            loadedPriv = privRes.data
            setPrivacySettings(loadedPriv)
            setPrivacyError(null)
          } else {
            setPrivacyError(privRes.error?.message || 'Privacy settings unavailable.')
          }

          saveProfileSnapshotLocal(profRes.data, loadedContacts, loadedPriv)
          setPassStatus(checkPassStatus(profRes.data, loadedContacts))
          setCachedPassData(getOfflinePassLocal())
        } else {
          setLoadError(
            profRes.error?.message || 'Profile unavailable. Unable to connect to server.'
          )
        }
      })
      .catch((err) => {
        setLoadError(err.message || 'Connection failed.')
      })
      .finally(() => {
        setIsLoading(false)
      })
  }

  const handleRetryContacts = async () => {
    setContactsLoading(true)
    setContactsError(null)
    const res = await fetchEmergencyContacts()
    if (res.success && Array.isArray(res.data)) {
      setContacts(res.data)
      saveProfileSnapshotLocal(profile, res.data, privacySettings)
      setPassStatus(checkPassStatus(profile, res.data))
    } else {
      setContactsError(res.error?.message || 'Failed to reload emergency contacts.')
    }
    setContactsLoading(false)
  }

  const handleRetrySettings = async () => {
    setPrivacyLoading(true)
    setPrivacyError(null)
    const res = await fetchPrivacySettings()
    if (res.success && Array.isArray(res.data)) {
      setPrivacySettings(res.data)
      saveProfileSnapshotLocal(profile, contacts, res.data)
    } else {
      setPrivacyError(res.error?.message || 'Failed to reload privacy settings.')
    }
    setPrivacyLoading(false)
  }

  // -------------------------------------------------------------------------
  // Readiness Calculation (Deterministic Emergency Safety Standard)
  // -------------------------------------------------------------------------
  const hasValidIdentity = Boolean(profile?.full_name?.trim() && profile?.phone?.trim())
  const hasEmergencyContact = contacts.length > 0 && contacts.some((c) => c.is_primary)
  const hasMedicalSetup = Boolean(
    (profile?.blood_group && profile?.blood_group !== 'UNKNOWN') ||
    (profile?.medical_info?.conditions && profile.medical_info.conditions.length > 0) ||
    (profile?.medical_info?.allergies && profile.medical_info.allergies.length > 0)
  )

  const isReadinessComplete = hasValidIdentity && hasEmergencyContact
  const readinessLabel = isReadinessComplete ? 'READY' : 'SETUP INCOMPLETE'

  // -------------------------------------------------------------------------
  // Identity Handlers
  // -------------------------------------------------------------------------
  const handleStartIdentityEdit = () => {
    if (!profile) return
    setIdentityForm({
      full_name: profile.full_name || '',
      phone: profile.phone || '',
      email: profile.email || '',
      blood_group: profile.blood_group || 'UNKNOWN',
      registered_address: profile.registered_address || '',
    })
    setIdentitySaveStatus('idle')
    setIdentitySaveError(null)
    setIsEditingIdentity(true)
  }

  const handleCancelIdentityEdit = () => {
    if (!profile) return
    setIdentityForm({
      full_name: profile.full_name || '',
      phone: profile.phone || '',
      email: profile.email || '',
      blood_group: profile.blood_group || 'UNKNOWN',
      registered_address: profile.registered_address || '',
    })
    setIdentitySaveStatus('idle')
    setIdentitySaveError(null)
    setIsEditingIdentity(false)
  }

  const handleSaveIdentity = async (e) => {
    e?.preventDefault()
    if (!identityForm.full_name.trim()) {
      setIdentitySaveError('Full name cannot be blank.')
      setIdentitySaveStatus('error')
      return
    }

    setIdentitySaveStatus('saving')
    setIdentitySaveError(null)

    const payload = {
      full_name: identityForm.full_name.trim(),
      phone: identityForm.phone.trim() || null,
      email: identityForm.email.trim() || null,
      blood_group: identityForm.blood_group || 'UNKNOWN',
      registered_address: identityForm.registered_address.trim() || null,
    }

    const res = await updateCitizenProfile(payload)
    if (res.success && res.data) {
      setProfile(res.data)
      saveProfileSnapshotLocal(res.data, contacts, privacySettings)
      setPassStatus(checkPassStatus(res.data, contacts))
      setIdentitySaveStatus('saved')
      setIsEditingIdentity(false)
      showToast('✓ Identity details updated successfully')
    } else {
      setIdentitySaveStatus('error')
      setIdentitySaveError(res.error?.message || 'Profile could not be saved.')
    }
  }

  // -------------------------------------------------------------------------
  // Modal Visibility Handlers
  // -------------------------------------------------------------------------
  const handleCloseMedicalModal = useCallback(() => {
    setIsMedicalModalOpen(false)
  }, [])

  const handleCloseContactModal = useCallback(() => {
    setIsContactModalOpen(false)
  }, [])

  const handleCloseDeleteConfirm = useCallback(() => {
    setDeleteConfirmContact(null)
  }, [])

  const handleCloseOfflinePassModal = useCallback(() => {
    setIsOfflinePassModalOpen(false)
  }, [])

  // -------------------------------------------------------------------------
  // Medical Handlers
  // -------------------------------------------------------------------------
  const handleOpenMedicalModal = () => {
    const med = profile?.medical_info || {}
    setMedicalForm({
      blood_group: profile?.blood_group || 'UNKNOWN',
      conditionsText: (med.conditions || []).join(', '),
      allergiesText: (med.allergies || []).join(', '),
      mobility_note: med.mobilityNote || 'Fully Mobile / Ambulatory',
      medications_note: profile?.medications_note || '',
    })
    setMedicalSaveStatus('idle')
    setMedicalSaveError(null)
    setIsMedicalModalOpen(true)
  }

  const handleSaveMedical = async (e) => {
    e?.preventDefault()
    setMedicalSaveStatus('saving')
    setMedicalSaveError(null)

    const conditions = medicalForm.conditionsText
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)

    const allergies = medicalForm.allergiesText
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)

    const payload = {
      blood_group: medicalForm.blood_group,
      conditions,
      allergies,
      mobility_note: medicalForm.mobility_note,
      medications_note: medicalForm.medications_note.trim() || null,
    }

    const res = await updateMedicalInfo(payload)
    if (res.success && res.data) {
      const updatedProfile = {
        ...profile,
        blood_group: res.data.blood_group,
        medical_info: {
          conditions: res.data.conditions,
          allergies: res.data.allergies,
          mobilityNote: res.data.mobility_note,
        },
        medications_note: res.data.medications_note,
      }
      setProfile(updatedProfile)
      saveProfileSnapshotLocal(updatedProfile, contacts, privacySettings)
      setPassStatus(checkPassStatus(updatedProfile, contacts))
      setMedicalSaveStatus('saved')
      setIsMedicalModalOpen(false)
      showToast('✓ Emergency medical information updated')
    } else {
      setMedicalSaveStatus('error')
      setMedicalSaveError(res.error?.message || 'Failed to save medical information.')
    }
  }

  // -------------------------------------------------------------------------
  // Emergency Contacts Handlers
  // -------------------------------------------------------------------------
  const handleOpenAddContact = () => {
    setEditingContactId(null)
    setContactForm({
      name: '',
      relationship: 'Father',
      phone: '',
      is_primary: contacts.length === 0,
      notify_on_sos: true,
    })
    setContactSaveStatus('idle')
    setContactSaveError(null)
    setIsContactModalOpen(true)
  }

  const handleOpenEditContact = (contact) => {
    setEditingContactId(contact.id)
    setContactForm({
      name: contact.name,
      relationship: contact.relationship,
      phone: contact.phone,
      is_primary: Boolean(contact.is_primary),
      notify_on_sos: Boolean(contact.notify_on_sos),
    })
    setContactSaveStatus('idle')
    setContactSaveError(null)
    setIsContactModalOpen(true)
  }

  const handleSaveContact = async (e) => {
    e?.preventDefault()
    if (!contactForm.name.trim()) {
      setContactSaveError('Contact name is required.')
      setContactSaveStatus('error')
      return
    }
    if (!contactForm.phone.trim() || contactForm.phone.trim().length < 5) {
      setContactSaveError('Please enter a valid phone number (minimum 5 digits).')
      setContactSaveStatus('error')
      return
    }

    setContactSaveStatus('saving')
    setContactSaveError(null)

    const payload = {
      name: contactForm.name.trim(),
      relationship: contactForm.relationship.trim(),
      phone: contactForm.phone.trim(),
      is_primary: contactForm.is_primary,
      notify_on_sos: contactForm.notify_on_sos,
    }

    if (editingContactId) {
      const res = await updateEmergencyContact(editingContactId, payload)
      if (res.success && res.data) {
        const refetch = await fetchEmergencyContacts()
        const updatedContacts = refetch.success ? refetch.data : contacts
        setContacts(updatedContacts)
        saveProfileSnapshotLocal(profile, updatedContacts, privacySettings)
        setPassStatus(checkPassStatus(profile, updatedContacts))
        setIsContactModalOpen(false)
        showToast('✓ Emergency contact updated')
      } else {
        setContactSaveStatus('error')
        setContactSaveError(res.error?.message || 'Could not update contact.')
      }
    } else {
      const res = await createEmergencyContact(payload)
      if (res.success && res.data) {
        const refetch = await fetchEmergencyContacts()
        const updatedContacts = refetch.success ? refetch.data : contacts
        setContacts(updatedContacts)
        saveProfileSnapshotLocal(profile, updatedContacts, privacySettings)
        setPassStatus(checkPassStatus(profile, updatedContacts))
        setIsContactModalOpen(false)
        showToast('✓ New emergency contact added')
      } else {
        setContactSaveStatus('error')
        setContactSaveError(res.error?.message || 'Could not create contact.')
      }
    }
  }

  const handleSetPrimaryContact = async (contact) => {
    if (contact.is_primary) return
    const res = await updateEmergencyContact(contact.id, { is_primary: true })
    if (res.success) {
      const refetch = await fetchEmergencyContacts()
      const updatedContacts = refetch.success ? refetch.data : contacts
      setContacts(updatedContacts)
      saveProfileSnapshotLocal(profile, updatedContacts, privacySettings)
      setPassStatus(checkPassStatus(profile, updatedContacts))
      showToast(`⭐ Set ${contact.name} as Primary Contact`)
    } else {
      showToast(`Failed to set primary: ${res.error?.message}`)
    }
  }

  const handleConfirmDeleteContact = async () => {
    if (!deleteConfirmContact) return
    setIsDeletingContact(true)

    const res = await deleteEmergencyContact(deleteConfirmContact.id)
    if (res.success) {
      const refetch = await fetchEmergencyContacts()
      const updatedContacts = refetch.success ? refetch.data : []
      setContacts(updatedContacts)
      saveProfileSnapshotLocal(profile, updatedContacts, privacySettings)
      setPassStatus(checkPassStatus(profile, updatedContacts))
      setDeleteConfirmContact(null)
      showToast('✓ Contact removed from emergency roster')
    } else {
      showToast(`Delete failed: ${res.error?.message}`)
    }
    setIsDeletingContact(false)
  }

  // -------------------------------------------------------------------------
  // Privacy Settings Toggles & Cache Purge
  // -------------------------------------------------------------------------
  const handleTogglePrivacySetting = async (id) => {
    const target = privacySettings.find((s) => s.id === id)
    if (!target || target.locked) return

    const updated = privacySettings.map((s) => (s.id === id ? { ...s, value: !s.value } : s))
    setPrivacySettings(updated) // Optimistic update

    const res = await updatePrivacySettings(updated)
    if (res.success && Array.isArray(res.data)) {
      setPrivacySettings(res.data)
      const offlineSetting = res.data.find((s) => s.id === 'offline_cache')
      if (offlineSetting && !offlineSetting.value) {
        setPassStatus('NOT_SAVED')
        setCachedPassData(null)
        showToast('Offline cache disabled & local passes cleared')
      } else {
        showToast('Preference updated')
      }
    } else {
      setPrivacySettings(privacySettings) // Rollback
      showToast('Could not save preference setting.')
    }
  }

  // -------------------------------------------------------------------------
  // Real Web Audio Emergency Siren Tester
  // -------------------------------------------------------------------------
  const handleToggleSirenTest = () => {
    if (isSirenPlaying) {
      if (stopSirenRef.current) {
        stopSirenRef.current()
        stopSirenRef.current = null
      }
      setIsSirenPlaying(false)
      return
    }

    setSirenError(null)
    const stopFn = playTestEmergencySiren({
      onStart: () => {
        setIsSirenPlaying(true)
      },
      onEnd: () => {
        setIsSirenPlaying(false)
        stopSirenRef.current = null
      },
      onError: (err) => {
        setIsSirenPlaying(false)
        setSirenError('Audio playback restricted by browser. Click again to permit test tone.')
        console.warn('[Salvus Siren Audio Error]', err)
      },
    })
    stopSirenRef.current = stopFn
  }

  // -------------------------------------------------------------------------
  // Real Offline Emergency Pass Generator
  // -------------------------------------------------------------------------
  const handleSaveAndOpenOfflinePass = () => {
    const primaryContact = contacts.find((c) => c.is_primary) || contacts[0] || null
    const secondaryContact = contacts.find((c) => c.id !== primaryContact?.id) || null

    const passPayload = {
      emergencyId: profile?.emergency_id || '—',
      fullName: profile?.full_name || 'Citizen User',
      bloodGroup: profile?.blood_group || 'UNKNOWN',
      phone: profile?.phone || 'Not registered',
      registeredAddress: profile?.registered_address || 'No residential address on file',
      primaryContact: primaryContact
        ? {
            name: primaryContact.name,
            phone: primaryContact.phone,
            relation: primaryContact.relationship,
          }
        : null,
      secondaryContact: secondaryContact
        ? {
            name: secondaryContact.name,
            phone: secondaryContact.phone,
            relation: secondaryContact.relationship,
          }
        : null,
      conditions: profile?.medical_info?.conditions || [],
      allergies: profile?.medical_info?.allergies || [],
      mobilityNote: profile?.medical_info?.mobilityNote || 'Fully Mobile / Ambulatory',
      medicationsNote: profile?.medications_note || null,
    }

    const saved = saveOfflinePassLocal(passPayload)
    if (saved) {
      setPassStatus('SAVED')
      setCachedPassData(getOfflinePassLocal())
      setIsOfflinePassModalOpen(true)
      showToast('✓ Offline Emergency Pass cached on device')
    }
  }

  // -------------------------------------------------------------------------
  // View Rendering Conditions
  // -------------------------------------------------------------------------
  if (isLoading) {
    return (
      <div className="max-w-[1440px] w-full mx-auto px-4 sm:px-8 lg:px-12 py-6 sm:py-8 animate-fadeIn space-y-6">
        <div>
          <div className="h-4 w-44 bg-salvus-muted rounded-md animate-pulse mb-2" />
          <div className="h-8 w-64 bg-salvus-muted rounded-md animate-pulse" />
        </div>
        <LoadingState variant="skeleton" lines={6} label="Loading your emergency profile..." />
      </div>
    )
  }

  if (loadError && !profile) {
    return (
      <div className="max-w-[1440px] w-full mx-auto px-4 sm:px-8 lg:px-12 py-12 animate-fadeIn">
        <ErrorState
          title="Emergency Readiness Unavailable"
          description={loadError}
          onRetry={handleRetry}
          retryLabel="Retry Connection"
        />
      </div>
    )
  }

  const identity = {
    fullName: profile?.full_name || 'Citizen User',
    phone: profile?.phone || 'Not registered',
    email: profile?.email || 'Not registered',
    registeredAddress: profile?.registered_address || 'No residential address on file',
    bloodGroup: profile?.blood_group || 'UNKNOWN',
    avatarInitials: profile?.avatar_initials || deriveInitials(profile?.full_name),
    emergencyId: profile?.emergency_id || '—',
    isVerified: Boolean(profile?.is_verified),
    medicalInfo: profile?.medical_info || {
      conditions: [],
      allergies: [],
      mobilityNote: 'Fully Mobile / Ambulatory',
    },
    medicationsNote: profile?.medications_note,
  }

  const conditionsList = identity.medicalInfo.conditions || []
  const allergiesList = identity.medicalInfo.allergies || []
  const mobilityNote = identity.medicalInfo.mobilityNote || 'Fully Mobile / Ambulatory'
  const totalMedicalCount = conditionsList.length + allergiesList.length

  const primaryContact = contacts.find((c) => c.is_primary) || contacts[0]

  return (
    <div className="max-w-[1440px] w-full mx-auto px-4 sm:px-8 lg:px-12 py-6 sm:py-8 animate-fadeIn space-y-6">
      {/* Top Header & Toast Notification */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <span className="text-xs font-semibold text-salvus-text-secondary tracking-wide uppercase">
            Disaster Preparedness & Profile
          </span>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-salvus-text-primary tracking-tight mt-0.5">
            My Emergency Readiness
          </h1>
        </div>

        {toastMessage && (
          <div
            role="status"
            className="flex items-center gap-2 bg-salvus-safe-bg border border-salvus-safe-border text-salvus-safe px-4 py-2 rounded-xl text-xs font-bold animate-fadeIn shadow-xs"
          >
            {toastMessage}
          </div>
        )}
      </div>

      {/* Offline Mode Indicator if loaded from local cache */}
      {isOfflineFallback && (
        <div className="bg-salvus-warning-bg border border-salvus-warning-border rounded-2xl p-4 text-salvus-warning-text flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs font-medium animate-fadeIn shadow-xs">
          <div className="flex items-start sm:items-center gap-2.5">
            <span className="text-lg shrink-0">📡</span>
            <div>
              <strong>Offline Mode Active:</strong> Viewing locally stored emergency readiness
              records
              {lastSyncedAt && (
                <span>
                  {' '}
                  (Last synced:{' '}
                  <span className="font-mono">{formatLastSyncedTime(lastSyncedAt)}</span>)
                </span>
              )}
              . Changes will sync when connection returns.
            </div>
          </div>
          <button
            type="button"
            onClick={handleRetry}
            className="underline font-bold hover:opacity-80 shrink-0 cursor-pointer self-start sm:self-auto"
          >
            Try Reconnecting
          </button>
        </div>
      )}

      {/* Emergency Readiness Status Hero Banner */}
      <Card
        variant={isReadinessComplete ? 'default' : 'warning'}
        padding="md"
        className="border-2 transition-all"
      >
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-start md:items-center gap-3.5">
            <div
              className={`h-11 w-11 rounded-xl flex items-center justify-center font-bold text-lg shrink-0 ${
                isReadinessComplete
                  ? 'bg-salvus-safe-bg text-salvus-safe border border-salvus-safe-border'
                  : 'bg-salvus-warning-bg text-salvus-warning-text border border-salvus-warning-border'
              }`}
            >
              {isReadinessComplete ? '✓' : '⚠️'}
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs font-bold uppercase tracking-wider text-salvus-text-secondary">
                  Emergency Readiness Status
                </span>
                <Badge variant={isReadinessComplete ? 'safe' : 'warning'}>{readinessLabel}</Badge>
              </div>
              <p className="text-xs text-salvus-text-secondary mt-0.5 leading-relaxed font-normal">
                {isReadinessComplete
                  ? 'Your profile, verified identity, and primary contact are configured for emergency dispatch.'
                  : 'Your readiness is incomplete. Add a primary emergency contact so Salvus knows who to notify during SOS.'}
              </p>
            </div>
          </div>

          {/* Actionable Readiness Checklist Pills */}
          <div className="flex items-center gap-2 flex-wrap pt-2 md:pt-0 border-t md:border-t-0 border-salvus-border">
            <span
              className={`text-[11px] px-2.5 py-1 rounded-lg font-medium border flex items-center gap-1.5 ${
                hasValidIdentity
                  ? 'bg-salvus-safe-bg text-salvus-safe border-salvus-safe-border'
                  : 'bg-salvus-critical-bg text-salvus-critical border-salvus-critical-border'
              }`}
            >
              <span>{hasValidIdentity ? '✓' : '✗'}</span> Identity
            </span>

            <span
              className={`text-[11px] px-2.5 py-1 rounded-lg font-medium border flex items-center gap-1.5 ${
                hasEmergencyContact
                  ? 'bg-salvus-safe-bg text-salvus-safe border-salvus-safe-border'
                  : 'bg-salvus-critical-bg text-salvus-critical border-salvus-critical-border'
              }`}
            >
              <span>{hasEmergencyContact ? '✓' : '✗'}</span> Contact
            </span>

            <span
              className={`text-[11px] px-2.5 py-1 rounded-lg font-medium border flex items-center gap-1.5 ${
                hasMedicalSetup
                  ? 'bg-salvus-safe-bg text-salvus-safe border-salvus-safe-border'
                  : 'bg-salvus-muted text-salvus-text-secondary border-salvus-border'
              }`}
            >
              <span>{hasMedicalSetup ? '✓' : '○'}</span> Medical
            </span>

            <span className="text-[11px] px-2.5 py-1 rounded-lg font-medium border bg-salvus-info-bg text-salvus-info border-salvus-info-border flex items-center gap-1.5">
              <span>🔒</span> Location Protected
            </span>
          </div>
        </div>
      </Card>

      {/* 2-Column Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Identity, Contacts & Medical (7 cols) */}
        <div className="lg:col-span-7 space-y-6">
          {/* Identity Card */}
          <Card padding="lg" className="relative overflow-hidden">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-5 border-b border-salvus-border">
              <div className="flex items-center gap-4">
                <div className="h-14 w-14 rounded-2xl bg-salvus-info-bg border border-salvus-info-border flex items-center justify-center text-salvus-info text-xl font-bold">
                  {identity.avatarInitials}
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-xl font-bold text-salvus-text-primary tracking-tight">
                      {identity.fullName}
                    </h2>
                    <Badge variant={identity.isVerified ? 'safe' : 'neutral'}>
                      {identity.isVerified ? 'Verified Citizen' : 'Registered'}
                    </Badge>
                  </div>
                  <p className="text-xs text-salvus-text-muted mt-0.5 font-mono">
                    Emergency ID: <span className="font-bold">{identity.emergencyId}</span>
                  </p>
                </div>
              </div>

              {/* Action Controls & Blood Group Badge */}
              <div className="flex items-center gap-3 self-start sm:self-auto">
                <div className="bg-salvus-critical-bg border border-salvus-critical-border px-4 py-2 rounded-xl text-center">
                  <span className="text-[10px] text-salvus-critical uppercase font-medium block">
                    Blood Group
                  </span>
                  <span className="text-lg font-bold text-salvus-critical">
                    {identity.bloodGroup}
                  </span>
                </div>

                {!isEditingIdentity && (
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={handleStartIdentityEdit}
                    className="shrink-0 text-xs"
                  >
                    ✏️ Edit
                  </Button>
                )}
              </div>
            </div>

            {/* Editable Profile Form */}
            {isEditingIdentity ? (
              <form onSubmit={handleSaveIdentity} className="mt-5 space-y-4 animate-fadeIn">
                {identitySaveError && (
                  <div
                    role="alert"
                    className="p-3 rounded-xl bg-salvus-critical-bg border border-salvus-critical-border text-salvus-critical text-xs font-medium"
                  >
                    Profile could not be saved: {identitySaveError}
                  </div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                  <div>
                    <Label htmlFor="prof-name" required={true}>
                      Full Legal / Preferred Name
                    </Label>
                    <Input
                      id="prof-name"
                      value={identityForm.full_name}
                      onChange={(e) =>
                        setIdentityForm((prev) => ({ ...prev, full_name: e.target.value }))
                      }
                      placeholder="e.g. Full Legal Name"
                      disabled={identitySaveStatus === 'saving'}
                    />
                  </div>

                  <div>
                    <Label htmlFor="prof-blood">Blood Group</Label>
                    <Select
                      id="prof-blood"
                      value={identityForm.blood_group}
                      onChange={(e) =>
                        setIdentityForm((prev) => ({ ...prev, blood_group: e.target.value }))
                      }
                      disabled={identitySaveStatus === 'saving'}
                    >
                      {BLOOD_GROUPS.map((bg) => (
                        <option key={bg} value={bg}>
                          {bg}
                        </option>
                      ))}
                    </Select>
                  </div>

                  <div>
                    <Label htmlFor="prof-phone">Contact Phone</Label>
                    <Input
                      id="prof-phone"
                      type="tel"
                      value={identityForm.phone}
                      onChange={(e) =>
                        setIdentityForm((prev) => ({ ...prev, phone: e.target.value }))
                      }
                      placeholder="e.g. +91 98300 00000"
                      disabled={identitySaveStatus === 'saving'}
                    />
                  </div>

                  <div>
                    <Label htmlFor="prof-email">Email Address</Label>
                    <Input
                      id="prof-email"
                      type="email"
                      value={identityForm.email}
                      onChange={(e) =>
                        setIdentityForm((prev) => ({ ...prev, email: e.target.value }))
                      }
                      placeholder="e.g. user@example.com"
                      disabled={identitySaveStatus === 'saving'}
                    />
                  </div>
                </div>

                <div>
                  <Label htmlFor="prof-address">Registered Residence</Label>
                  <Input
                    id="prof-address"
                    value={identityForm.registered_address}
                    onChange={(e) =>
                      setIdentityForm((prev) => ({
                        ...prev,
                        registered_address: e.target.value,
                      }))
                    }
                    placeholder="e.g. Flat / Street, Sector, City"
                    disabled={identitySaveStatus === 'saving'}
                  />
                </div>

                <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-salvus-border">
                  <Button
                    type="button"
                    variant="quiet"
                    size="sm"
                    onClick={handleCancelIdentityEdit}
                    disabled={identitySaveStatus === 'saving'}
                  >
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    variant="primary"
                    size="sm"
                    disabled={identitySaveStatus === 'saving'}
                  >
                    {identitySaveStatus === 'saving' ? 'Saving…' : 'Save Changes'}
                  </Button>
                </div>
              </form>
            ) : (
              /* View Mode Address & Medical Details */
              <div className="mt-4 space-y-3.5">
                {/* Registered Residence */}
                <div className="bg-salvus-muted/40 border border-salvus-border p-3.5 rounded-xl">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-salvus-text-primary">
                      Registered Residence
                    </span>
                    <button
                      type="button"
                      onClick={() => setShowAddressDetails(!showAddressDetails)}
                      className="text-xs text-salvus-info hover:underline font-medium cursor-pointer"
                    >
                      {showAddressDetails ? 'Hide' : 'Show address'}
                    </button>
                  </div>
                  {showAddressDetails ? (
                    <p className="text-xs text-salvus-text-secondary mt-2 leading-relaxed">
                      {identity.registeredAddress} · <span>{identity.phone}</span>
                    </p>
                  ) : (
                    <p className="text-xs text-salvus-text-muted mt-1 font-mono">
                      Registered Residence (••••••••)
                    </p>
                  )}
                </div>

                {/* Critical Medical Profile */}
                <div className="bg-salvus-muted/40 border border-salvus-border p-3.5 rounded-xl">
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="text-xs font-semibold text-salvus-text-primary block">
                        Emergency Medical Information
                      </span>
                      <span className="text-xs text-salvus-text-muted">
                        {totalMedicalCount > 0
                          ? `${totalMedicalCount} critical medical items on file`
                          : 'Optional — helps paramedics during rescue triage'}
                      </span>
                    </div>
                    <div className="flex items-center gap-3">
                      <button
                        type="button"
                        onClick={handleOpenMedicalModal}
                        className="text-xs font-semibold text-salvus-info hover:underline cursor-pointer"
                      >
                        ✏️ Edit Medical
                      </button>
                      <button
                        type="button"
                        onClick={() => setShowMedicalDetails(!showMedicalDetails)}
                        className="text-xs font-medium text-salvus-text-secondary hover:text-salvus-text-primary cursor-pointer"
                      >
                        {showMedicalDetails ? 'Hide' : 'View details'}
                      </button>
                    </div>
                  </div>

                  {showMedicalDetails && (
                    <div className="mt-3 pt-3 border-t border-salvus-border space-y-2.5 animate-fadeIn">
                      <div className="flex flex-wrap gap-2">
                        {conditionsList.map((c) => (
                          <span
                            key={`cond-${c}`}
                            className="text-xs bg-salvus-critical-bg border border-salvus-critical-border text-salvus-critical px-2.5 py-1 rounded-lg font-medium"
                          >
                            Medical: {c}
                          </span>
                        ))}
                        {allergiesList.map((a) => (
                          <span
                            key={`allergy-${a}`}
                            className="text-xs bg-salvus-warning-bg border border-salvus-warning-border text-salvus-warning-text px-2.5 py-1 rounded-lg font-medium"
                          >
                            Allergy: {a}
                          </span>
                        ))}
                        {conditionsList.length === 0 && allergiesList.length === 0 && (
                          <span className="text-xs text-salvus-text-muted italic">
                            No critical conditions or allergies recorded.
                          </span>
                        )}
                      </div>

                      <div className="text-xs text-salvus-text-secondary space-y-1 pt-1">
                        <p>
                          <span className="font-semibold text-salvus-text-primary">Mobility:</span>{' '}
                          {mobilityNote}
                        </p>
                        {identity.medicationsNote && (
                          <p>
                            <span className="font-semibold text-salvus-text-primary">
                              Medications:
                            </span>{' '}
                            {identity.medicationsNote}
                          </p>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </Card>

          {/* Emergency Contacts Section */}
          <Card padding="lg">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-sm font-bold text-salvus-text-primary">
                  Designated Emergency Contacts
                </h3>
                <p className="text-xs text-salvus-text-secondary mt-0.5">
                  Automatically prioritized & notified when you activate emergency SOS.
                </p>
              </div>

              {contacts.length < 5 && !contactsError && (
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={handleOpenAddContact}
                  className="text-xs"
                >
                  ＋ Add Contact
                </Button>
              )}
            </div>

            <div className="space-y-3">
              {contactsLoading ? (
                <div className="p-6 text-center">
                  <div className="h-4 w-40 bg-salvus-muted rounded mx-auto animate-pulse mb-2" />
                  <p className="text-xs text-salvus-text-muted">Loading emergency contacts...</p>
                </div>
              ) : contactsError ? (
                <div className="p-4 bg-salvus-critical-bg/30 border border-salvus-critical-border rounded-xl text-xs space-y-2">
                  <div className="flex items-center gap-2 text-salvus-critical font-bold">
                    <span>⚠️</span>
                    <span>Emergency contacts unavailable</span>
                  </div>
                  <p className="text-salvus-text-secondary">{contactsError}</p>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={handleRetryContacts}
                    className="text-xs mt-1"
                  >
                    Retry Contacts
                  </Button>
                </div>
              ) : contacts.length === 0 ? (
                <div className="p-6 text-center bg-salvus-warning-bg border border-salvus-warning-border rounded-xl">
                  <span className="text-2xl block mb-2">⚠️</span>
                  <p className="text-xs font-bold text-salvus-warning-text">
                    No emergency contact configured.
                  </p>
                  <p className="text-xs text-salvus-text-secondary mt-1">
                    Add at least one designated contact so emergency coordinators know who to call.
                  </p>
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={handleOpenAddContact}
                    className="mt-3.5 text-xs"
                  >
                    Add Primary Emergency Contact
                  </Button>
                </div>
              ) : (
                contacts.map((contact, idx) => (
                  <div
                    key={contact.id}
                    className="bg-salvus-muted/40 border border-salvus-border rounded-xl p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 transition-all"
                  >
                    <div className="flex items-center gap-3">
                      <div
                        className={`h-9 w-9 rounded-xl border flex items-center justify-center font-bold text-xs ${
                          contact.is_primary
                            ? 'bg-salvus-info-bg border-salvus-info-border text-salvus-info'
                            : 'bg-salvus-surface border-salvus-border text-salvus-text-secondary'
                        }`}
                      >
                        {idx + 1}
                      </div>
                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <h4 className="text-sm font-semibold text-salvus-text-primary">
                            {contact.name}
                          </h4>
                          {contact.is_primary ? (
                            <Badge variant="info" size="sm">
                              Primary SOS Contact
                            </Badge>
                          ) : (
                            <button
                              type="button"
                              onClick={() => handleSetPrimaryContact(contact)}
                              className="text-[11px] text-salvus-text-muted hover:text-salvus-info hover:underline cursor-pointer"
                            >
                              ⭐ Set Primary
                            </button>
                          )}
                          {contact.notify_on_sos && (
                            <span className="text-[10px] text-salvus-safe bg-salvus-safe-bg border border-salvus-safe-border px-1.5 py-0.5 rounded-md font-medium">
                              SOS Alert
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-salvus-text-secondary mt-0.5">
                          {contact.relationship} ·{' '}
                          <span className="font-mono text-salvus-text-primary">
                            {contact.phone}
                          </span>
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 self-end sm:self-auto shrink-0">
                      <a
                        href={`tel:${contact.phone}`}
                        className="px-3 py-1.5 rounded-lg bg-salvus-surface-elevated hover:bg-salvus-surface-hover border border-salvus-border text-salvus-text-primary text-xs font-semibold transition-colors flex items-center"
                      >
                        📞 Call
                      </a>
                      <button
                        type="button"
                        onClick={() => handleOpenEditContact(contact)}
                        className="p-1.5 rounded-lg hover:bg-salvus-surface-hover text-salvus-text-secondary hover:text-salvus-text-primary transition-colors text-xs cursor-pointer"
                        aria-label="Edit contact"
                      >
                        ✏️
                      </button>
                      <button
                        type="button"
                        onClick={() => setDeleteConfirmContact(contact)}
                        className="p-1.5 rounded-lg hover:bg-salvus-critical-bg text-salvus-text-muted hover:text-salvus-critical transition-colors text-xs cursor-pointer"
                        aria-label="Delete contact"
                      >
                        🗑️
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </Card>
        </div>

        {/* Right Column: Privacy, Tools & Offline Pass (5 cols) */}
        <div className="lg:col-span-5 space-y-6">
          {/* Theme & Display Appearance */}
          <Card padding="md">
            <h3 className="text-sm font-bold text-salvus-text-primary mb-1">
              Display & Appearance
            </h3>
            <p className="text-xs text-salvus-text-secondary mb-3">
              Switch between High-Contrast Dark and Sunlight-Optimized Light theme.
            </p>
            <ThemeToggle showLabels={true} />
          </Card>

          {/* Privacy & Permissions Controls */}
          <Card padding="md">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-bold text-salvus-text-primary">
                Emergency Permissions & Privacy
              </h3>
            </div>

            <div className="space-y-3.5">
              {privacyLoading ? (
                <div className="p-4 text-center">
                  <div className="h-4 w-32 bg-salvus-muted rounded mx-auto animate-pulse mb-2" />
                  <p className="text-xs text-salvus-text-muted">Loading preferences...</p>
                </div>
              ) : privacyError ? (
                <div className="p-3.5 bg-salvus-critical-bg/30 border border-salvus-critical-border rounded-xl text-xs space-y-2">
                  <div className="flex items-center gap-2 text-salvus-critical font-bold">
                    <span>⚠️</span>
                    <span>Privacy settings unavailable</span>
                  </div>
                  <p className="text-salvus-text-secondary">{privacyError}</p>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={handleRetrySettings}
                    className="text-xs"
                  >
                    Retry Settings
                  </Button>
                </div>
              ) : (
                privacySettings.map((item) => (
                  <div
                    key={item.id}
                    className="flex items-start justify-between gap-3 pb-3 border-b border-salvus-border last:border-none last:pb-0"
                  >
                    <div className="pr-2">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h4 className="text-xs font-semibold text-salvus-text-primary">
                          {item.title}
                        </h4>
                        {item.badge && (
                          <Badge variant="info" size="sm">
                            {item.badge}
                          </Badge>
                        )}
                      </div>
                      <p className="text-xs text-salvus-text-secondary mt-0.5 leading-relaxed font-normal">
                        {item.description}
                      </p>
                    </div>

                    <Toggle
                      checked={item.value}
                      disabled={item.locked}
                      onChange={() => handleTogglePrivacySetting(item.id)}
                      ariaLabel={item.title}
                    />
                  </div>
                ))
              )}
            </div>
          </Card>

          {/* Emergency Readiness Tools */}
          <Card padding="md" className="space-y-3.5">
            <h3 className="text-sm font-bold text-salvus-text-primary mb-1">
              Readiness & Offline Tools
            </h3>

            {/* Siren Tone Audio Test */}
            <div className="p-3 bg-salvus-muted/40 border border-salvus-border rounded-xl space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-salvus-text-primary">
                  Emergency Siren Alert Audio
                </span>
                <span className="text-[10px] text-salvus-text-muted">Test only</span>
              </div>
              <Button
                variant={isSirenPlaying ? 'critical' : 'secondary'}
                size="sm"
                fullWidth={true}
                onClick={handleToggleSirenTest}
                className="font-medium text-xs flex items-center justify-center gap-2"
              >
                {isSirenPlaying ? (
                  <>
                    <span className="animate-pulse">🔊</span> Testing Audio Tone (Playing...)
                  </>
                ) : (
                  <>🔊 Test Emergency Siren Tone</>
                )}
              </Button>
              {sirenError ? (
                <p className="text-[11px] text-salvus-warning-text">{sirenError}</p>
              ) : (
                <p className="text-[11px] text-salvus-text-muted">
                  Plays a local 1.5-second dual test pulse (880Hz/440Hz). Never alerts authorities.
                </p>
              )}
            </div>

            {/* Offline Emergency Pass Manager */}
            <div className="p-3 bg-salvus-muted/40 border border-salvus-border rounded-xl space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-salvus-text-primary">
                  Offline Emergency Pass
                </span>
                <Badge
                  variant={
                    passStatus === 'SAVED'
                      ? 'safe'
                      : passStatus === 'NEEDS_UPDATE'
                        ? 'warning'
                        : 'neutral'
                  }
                  size="sm"
                >
                  {passStatus === 'SAVED'
                    ? 'Pass Saved'
                    : passStatus === 'NEEDS_UPDATE'
                      ? 'Needs Update'
                      : 'Not Saved'}
                </Badge>
              </div>

              <p className="text-[11px] text-salvus-text-secondary leading-relaxed">
                Stores your Emergency ID, blood group, allergies, and contact phone in device
                storage for zero-connectivity rescue desks.
              </p>

              <Button
                variant="primary"
                size="sm"
                fullWidth={true}
                onClick={handleSaveAndOpenOfflinePass}
                className="text-xs font-semibold"
              >
                💾{' '}
                {passStatus === 'SAVED'
                  ? 'View Offline Emergency Pass'
                  : 'Generate & Save Offline Pass'}
              </Button>
            </div>
          </Card>

          {/* App Info & Safe Local Architecture Note */}
          <div className="text-xs text-salvus-text-muted text-center space-y-1">
            <p>
              {APP_METADATA.version} · {APP_METADATA.build}
            </p>
            <p>🔒 Local Offline Storage Active · Zero-Data Resilience</p>
          </div>
        </div>
      </div>

      {/* ===================================================================== */}
      {/* MODAL 1: Medical Information Editor */}
      {/* ===================================================================== */}
      <Modal
        isOpen={isMedicalModalOpen}
        onClose={handleCloseMedicalModal}
        title="Edit Emergency Medical Profile"
        description="This critical data assists rescue teams and paramedics during evacuation triage."
        size="lg"
      >
        <form onSubmit={handleSaveMedical} className="space-y-4">
          {medicalSaveError && (
            <div
              role="alert"
              className="p-3 rounded-xl bg-salvus-critical-bg border border-salvus-critical-border text-salvus-critical text-xs font-medium"
            >
              {medicalSaveError}
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <Label htmlFor="med-blood">Blood Group</Label>
              <Select
                id="med-blood"
                value={medicalForm.blood_group}
                onChange={(e) =>
                  setMedicalForm((prev) => ({ ...prev, blood_group: e.target.value }))
                }
              >
                {BLOOD_GROUPS.map((bg) => (
                  <option key={bg} value={bg}>
                    {bg}
                  </option>
                ))}
              </Select>
            </div>

            <div>
              <Label htmlFor="med-mobility">Mobility & Evacuation Status</Label>
              <Select
                id="med-mobility"
                value={medicalForm.mobility_note}
                onChange={(e) =>
                  setMedicalForm((prev) => ({ ...prev, mobility_note: e.target.value }))
                }
              >
                {MOBILITY_OPTIONS.map((opt) => (
                  <option key={opt} value={opt}>
                    {opt}
                  </option>
                ))}
              </Select>
            </div>
          </div>

          <div>
            <Label htmlFor="med-conditions">Medical Conditions (Comma-separated)</Label>
            <Input
              id="med-conditions"
              value={medicalForm.conditionsText}
              onChange={(e) =>
                setMedicalForm((prev) => ({ ...prev, conditionsText: e.target.value }))
              }
              placeholder="e.g. Mild Asthma, Hypertension, Cardiac Stent"
            />
            <p className="text-[11px] text-salvus-text-muted mt-1">
              Example: Asthma, Diabetes Type 2 (Separate each condition with a comma)
            </p>
          </div>

          <div>
            <Label htmlFor="med-allergies">Allergies (Comma-separated)</Label>
            <Input
              id="med-allergies"
              value={medicalForm.allergiesText}
              onChange={(e) =>
                setMedicalForm((prev) => ({ ...prev, allergiesText: e.target.value }))
              }
              placeholder="e.g. Penicillin, Peanuts, Latex"
            />
          </div>

          <div>
            <Label htmlFor="med-medications">Critical Medications Note</Label>
            <Input
              id="med-medications"
              value={medicalForm.medications_note}
              onChange={(e) =>
                setMedicalForm((prev) => ({ ...prev, medications_note: e.target.value }))
              }
              placeholder="e.g. Carries Inhaler, Insulin pen in backpack"
            />
          </div>

          <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-salvus-border">
            <Button
              type="button"
              variant="quiet"
              size="sm"
              onClick={() => setIsMedicalModalOpen(false)}
              disabled={medicalSaveStatus === 'saving'}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant="primary"
              size="sm"
              disabled={medicalSaveStatus === 'saving'}
            >
              {medicalSaveStatus === 'saving' ? 'Saving…' : 'Save Medical Profile'}
            </Button>
          </div>
        </form>
      </Modal>

      {/* ===================================================================== */}
      {/* MODAL 2: Add / Edit Emergency Contact */}
      {/* ===================================================================== */}
      <Modal
        isOpen={isContactModalOpen}
        onClose={handleCloseContactModal}
        title={editingContactId ? 'Edit Emergency Contact' : 'Add Emergency Contact'}
        description="Designated contacts are notified during emergency SOS activations."
        size="md"
      >
        <form onSubmit={handleSaveContact} className="space-y-4">
          {contactSaveError && (
            <div
              role="alert"
              className="p-3 rounded-xl bg-salvus-critical-bg border border-salvus-critical-border text-salvus-critical text-xs font-medium"
            >
              {contactSaveError}
            </div>
          )}

          <div>
            <Label htmlFor="contact-name" required={true}>
              Contact Full Name
            </Label>
            <Input
              id="contact-name"
              value={contactForm.name}
              onChange={(e) => setContactForm((prev) => ({ ...prev, name: e.target.value }))}
              placeholder="e.g. Primary Contact Name"
              disabled={contactSaveStatus === 'saving'}
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            <div>
              <Label htmlFor="contact-rel">Relationship</Label>
              <Select
                id="contact-rel"
                value={contactForm.relationship}
                onChange={(e) =>
                  setContactForm((prev) => ({ ...prev, relationship: e.target.value }))
                }
                disabled={contactSaveStatus === 'saving'}
              >
                {RELATIONSHIP_OPTIONS.map((rel) => (
                  <option key={rel} value={rel}>
                    {rel}
                  </option>
                ))}
              </Select>
            </div>

            <div>
              <Label htmlFor="contact-phone" required={true}>
                Phone Number
              </Label>
              <Input
                id="contact-phone"
                type="tel"
                value={contactForm.phone}
                onChange={(e) => setContactForm((prev) => ({ ...prev, phone: e.target.value }))}
                placeholder="e.g. +91 98300 00000"
                disabled={contactSaveStatus === 'saving'}
              />
            </div>
          </div>

          <div className="space-y-2 pt-2 border-t border-salvus-border">
            <Checkbox
              id="contact-primary"
              label="Designate as Primary Contact"
              description="Primary contact is called first and receives immediate SOS telemetry."
              checked={contactForm.is_primary}
              onChange={(e) =>
                setContactForm((prev) => ({ ...prev, is_primary: e.target.checked }))
              }
              disabled={contactSaveStatus === 'saving'}
            />

            <Checkbox
              id="contact-sos"
              label="Notify on SOS Broadcast"
              description="Include in automated SMS and emergency broadcast roster."
              checked={contactForm.notify_on_sos}
              onChange={(e) =>
                setContactForm((prev) => ({ ...prev, notify_on_sos: e.target.checked }))
              }
              disabled={contactSaveStatus === 'saving'}
            />
          </div>

          <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-salvus-border">
            <Button
              type="button"
              variant="quiet"
              size="sm"
              onClick={handleCloseContactModal}
              disabled={contactSaveStatus === 'saving'}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant="primary"
              size="sm"
              disabled={contactSaveStatus === 'saving'}
            >
              {contactSaveStatus === 'saving'
                ? 'Saving…'
                : editingContactId
                  ? 'Update Contact'
                  : 'Add Contact'}
            </Button>
          </div>
        </form>
      </Modal>

      {/* ===================================================================== */}
      {/* MODAL 3: Delete Contact Confirmation */}
      {/* ===================================================================== */}
      <Modal
        isOpen={Boolean(deleteConfirmContact)}
        onClose={handleCloseDeleteConfirm}
        title="Remove Emergency Contact?"
        description="Are you sure you want to remove this contact from your emergency dispatch roster?"
        size="sm"
      >
        <div className="space-y-4">
          <div className="p-3 bg-salvus-muted/40 border border-salvus-border rounded-xl text-xs">
            <p className="font-bold text-salvus-text-primary">{deleteConfirmContact?.name}</p>
            <p className="text-salvus-text-secondary mt-0.5">
              {deleteConfirmContact?.relationship} · {deleteConfirmContact?.phone}
            </p>
          </div>

          <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-salvus-border">
            <Button
              type="button"
              variant="quiet"
              size="sm"
              onClick={handleCloseDeleteConfirm}
              disabled={isDeletingContact}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant="critical"
              size="sm"
              onClick={handleConfirmDeleteContact}
              disabled={isDeletingContact}
            >
              {isDeletingContact ? 'Removing…' : 'Remove Contact'}
            </Button>
          </div>
        </div>
      </Modal>

      {/* ===================================================================== */}
      {/* MODAL 4: Offline Emergency Pass */}
      {/* ===================================================================== */}
      <Modal
        isOpen={isOfflinePassModalOpen}
        onClose={handleCloseOfflinePassModal}
        title="Offline Emergency Pass"
        description="Saved locally to your device memory. Valid for intake triage at zero connectivity."
        size="lg"
      >
        <div className="space-y-4">
          <div className="bg-gradient-to-br from-salvus-surface-elevated to-salvus-surface border-2 border-salvus-info-border rounded-2xl p-5 shadow-lg relative overflow-hidden">
            {/* Header Badge */}
            <div className="flex items-center justify-between border-b border-salvus-border pb-3">
              <div>
                <span className="text-[10px] font-extrabold uppercase tracking-widest text-salvus-info">
                  SALVUS CITIZEN PASS
                </span>
                <h4 className="text-lg font-extrabold text-salvus-text-primary mt-0.5">
                  {cachedPassData?.fullName || identity.fullName}
                </h4>
              </div>
              <div className="bg-salvus-critical-bg border border-salvus-critical-border px-3 py-1.5 rounded-xl text-center">
                <span className="text-[9px] text-salvus-critical uppercase font-bold block">
                  Blood Group
                </span>
                <span className="text-base font-bold text-salvus-critical">
                  {cachedPassData?.bloodGroup || identity.bloodGroup}
                </span>
              </div>
            </div>

            {/* Middle Details Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 my-4 text-xs">
              <div>
                <span className="text-[10px] text-salvus-text-muted uppercase font-semibold block">
                  Emergency ID
                </span>
                <span className="font-mono font-bold text-salvus-text-primary text-sm">
                  {cachedPassData?.emergencyId || identity.emergencyId}
                </span>
              </div>

              <div>
                <span className="text-[10px] text-salvus-text-muted uppercase font-semibold block">
                  Primary Emergency Contact
                </span>
                {cachedPassData?.primaryContact ? (
                  <span className="text-salvus-text-primary font-medium">
                    {cachedPassData.primaryContact.name} ({cachedPassData.primaryContact.phone})
                  </span>
                ) : primaryContact ? (
                  <span className="text-salvus-text-primary font-medium">
                    {primaryContact.name} ({primaryContact.phone})
                  </span>
                ) : (
                  <span className="text-salvus-text-muted italic">None Designated</span>
                )}
              </div>

              <div>
                <span className="text-[10px] text-salvus-text-muted uppercase font-semibold block">
                  Critical Conditions & Allergies
                </span>
                <div className="flex flex-wrap gap-1.5 mt-1">
                  {(cachedPassData?.conditions || conditionsList).map((c) => (
                    <span
                      key={c}
                      className="bg-salvus-critical-bg text-salvus-critical text-[10px] px-2 py-0.5 rounded-md font-medium"
                    >
                      {c}
                    </span>
                  ))}
                  {(cachedPassData?.allergies || allergiesList).map((a) => (
                    <span
                      key={a}
                      className="bg-salvus-warning-bg text-salvus-warning-text text-[10px] px-2 py-0.5 rounded-md font-medium"
                    >
                      {a}
                    </span>
                  ))}
                  {(cachedPassData?.conditions || conditionsList).length === 0 &&
                    (cachedPassData?.allergies || allergiesList).length === 0 && (
                      <span className="text-salvus-text-muted text-[11px]">No critical alerts</span>
                    )}
                </div>
              </div>

              <div>
                <span className="text-[10px] text-salvus-text-muted uppercase font-semibold block">
                  Mobility Protocol
                </span>
                <span className="text-salvus-text-primary">
                  {cachedPassData?.mobilityNote || mobilityNote}
                </span>
              </div>
            </div>

            {/* Offline Verification Seal */}
            <div className="flex items-center justify-between pt-3 border-t border-salvus-border text-[11px] text-salvus-text-muted">
              <span>🔒 Locally Cached Snapshot</span>
              <span className="font-mono">
                Cached:{' '}
                {cachedPassData?.cachedAt
                  ? formatLastSyncedTime(cachedPassData.cachedAt)
                  : 'Just now'}
              </span>
            </div>
          </div>

          <div className="flex items-center justify-between text-xs pt-2">
            <span className="text-salvus-safe font-medium">✓ Cached on this local device</span>
            <Button variant="secondary" size="sm" onClick={() => setIsOfflinePassModalOpen(false)}>
              Done
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}

export default CitizenProfile
