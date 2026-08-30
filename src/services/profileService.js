import { apiClient, fetchRoleToken, getAuthToken } from './api'

/**
 * Fetch the authenticated citizen's persistent profile from the backend.
 * Automatically provisions a citizen identity session if unauthenticated.
 */
export const fetchCitizenProfile = async () => {
  try {
    let token = getAuthToken()
    if (!token) {
      token = await fetchRoleToken('CITIZEN', 'Citizen User')
    }

    const response = await apiClient.get('/api/profile/me')
    if (response.data?.success && response.data?.data) {
      return {
        success: true,
        data: response.data.data,
      }
    }

    return {
      success: false,
      error: {
        message: 'Invalid profile response structure from server.',
        code: 'INVALID_RESPONSE',
      },
    }
  } catch (error) {
    const message =
      error.response?.data?.error?.message ||
      error.response?.data?.detail?.error?.message ||
      error.response?.data?.detail?.message ||
      error.message ||
      'Profile could not be loaded.'

    const code =
      error.response?.data?.error?.code ||
      error.response?.data?.detail?.error?.code ||
      error.code ||
      'FETCH_PROFILE_ERROR'

    return {
      success: false,
      error: { message, code },
    }
  }
}

/**
 * Persist updates to editable fields of the citizen's profile.
 */
export const updateCitizenProfile = async (payload) => {
  try {
    const response = await apiClient.patch('/api/profile/me', payload)
    if (response.data?.success && response.data?.data) {
      return {
        success: true,
        data: response.data.data,
      }
    }

    return {
      success: false,
      error: {
        message: 'Unexpected profile update response from server.',
        code: 'INVALID_UPDATE_RESPONSE',
      },
    }
  } catch (error) {
    const message =
      error.response?.data?.error?.message ||
      error.response?.data?.detail?.error?.message ||
      error.response?.data?.detail?.message ||
      error.message ||
      'Profile could not be saved.'

    const code =
      error.response?.data?.error?.code ||
      error.response?.data?.detail?.error?.code ||
      error.code ||
      'UPDATE_PROFILE_ERROR'

    return {
      success: false,
      error: { message, code },
    }
  }
}

// ---------------------------------------------------------------------------
// Emergency Contacts Service
// ---------------------------------------------------------------------------

/**
 * Fetch all designated emergency contacts for the citizen.
 */
export const fetchEmergencyContacts = async () => {
  try {
    const response = await apiClient.get('/api/profile/emergency-contacts')
    if (response.data?.success && Array.isArray(response.data?.data)) {
      return {
        success: true,
        data: response.data.data,
        count: response.data.count || response.data.data.length,
      }
    }
    return {
      success: false,
      error: { message: 'Invalid emergency contacts response structure.', code: 'INVALID_DATA' },
      data: [],
    }
  } catch (error) {
    const message =
      error.response?.data?.error?.message ||
      error.response?.data?.detail?.error?.message ||
      error.response?.data?.detail?.message ||
      error.message ||
      'Failed to load emergency contacts.'
    return {
      success: false,
      error: { message, code: error.code || 'FETCH_CONTACTS_ERROR' },
      data: [],
    }
  }
}

/**
 * Create a new emergency contact.
 */
export const createEmergencyContact = async (payload) => {
  try {
    const response = await apiClient.post('/api/profile/emergency-contacts', payload)
    if (response.data?.success && response.data?.data) {
      return {
        success: true,
        data: response.data.data,
      }
    }
    return {
      success: false,
      error: { message: 'Failed to create emergency contact.', code: 'CREATE_ERROR' },
    }
  } catch (error) {
    const message =
      error.response?.data?.error?.message ||
      error.response?.data?.detail?.error?.message ||
      error.response?.data?.detail?.message ||
      error.message ||
      'Could not save emergency contact.'
    const code =
      error.response?.data?.error?.code ||
      error.response?.data?.detail?.error?.code ||
      'CREATE_CONTACT_ERROR'
    return {
      success: false,
      error: { message, code },
    }
  }
}

/**
 * Update an existing emergency contact.
 */
export const updateEmergencyContact = async (contactId, payload) => {
  try {
    const response = await apiClient.patch(`/api/profile/emergency-contacts/${contactId}`, payload)
    if (response.data?.success && response.data?.data) {
      return {
        success: true,
        data: response.data.data,
      }
    }
    return {
      success: false,
      error: { message: 'Failed to update emergency contact.', code: 'UPDATE_ERROR' },
    }
  } catch (error) {
    const message =
      error.response?.data?.error?.message ||
      error.response?.data?.detail?.error?.message ||
      error.response?.data?.detail?.message ||
      error.message ||
      'Could not update emergency contact.'
    const code =
      error.response?.data?.error?.code ||
      error.response?.data?.detail?.error?.code ||
      'UPDATE_CONTACT_ERROR'
    return {
      success: false,
      error: { message, code },
    }
  }
}

/**
 * Delete an emergency contact.
 */
export const deleteEmergencyContact = async (contactId) => {
  try {
    const response = await apiClient.delete(`/api/profile/emergency-contacts/${contactId}`)
    if (response.data?.success) {
      return { success: true }
    }
    return {
      success: false,
      error: { message: 'Failed to delete contact.', code: 'DELETE_ERROR' },
    }
  } catch (error) {
    const message =
      error.response?.data?.error?.message ||
      error.response?.data?.detail?.error?.message ||
      error.response?.data?.detail?.message ||
      error.message ||
      'Could not delete emergency contact.'
    return {
      success: false,
      error: { message, code: 'DELETE_CONTACT_ERROR' },
    }
  }
}

// ---------------------------------------------------------------------------
// Medical Information Service
// ---------------------------------------------------------------------------

/**
 * Fetch medical profile.
 */
export const fetchMedicalInfo = async () => {
  try {
    const response = await apiClient.get('/api/profile/medical')
    if (response.data?.success && response.data?.data) {
      return {
        success: true,
        data: response.data.data,
      }
    }
    return {
      success: false,
      error: { message: 'Failed to load medical information.', code: 'INVALID_MEDICAL_DATA' },
    }
  } catch (error) {
    const message =
      error.response?.data?.error?.message ||
      error.response?.data?.detail?.error?.message ||
      error.response?.data?.detail?.message ||
      error.message ||
      'Could not load medical information.'
    return {
      success: false,
      error: { message, code: 'FETCH_MEDICAL_ERROR' },
    }
  }
}

/**
 * Update medical profile.
 */
export const updateMedicalInfo = async (payload) => {
  try {
    const response = await apiClient.patch('/api/profile/medical', payload)
    if (response.data?.success && response.data?.data) {
      return {
        success: true,
        data: response.data.data,
      }
    }
    return {
      success: false,
      error: { message: 'Failed to update medical details.', code: 'UPDATE_MEDICAL_ERROR' },
    }
  } catch (error) {
    const message =
      error.response?.data?.error?.message ||
      error.response?.data?.detail?.error?.message ||
      error.response?.data?.detail?.message ||
      error.message ||
      'Medical information could not be saved.'
    return {
      success: false,
      error: { message, code: 'UPDATE_MEDICAL_ERROR' },
    }
  }
}

// ---------------------------------------------------------------------------
// Privacy Settings Service
// ---------------------------------------------------------------------------

/**
 * Fetch privacy and location settings.
 */
export const fetchPrivacySettings = async () => {
  try {
    const response = await apiClient.get('/api/profile/settings')
    if (response.data?.success && Array.isArray(response.data?.data)) {
      return {
        success: true,
        data: response.data.data,
      }
    }
    return {
      success: false,
      error: { message: 'Invalid privacy settings data.', code: 'INVALID_SETTINGS_DATA' },
      data: [],
    }
  } catch (error) {
    const message =
      error.response?.data?.error?.message ||
      error.response?.data?.detail?.error?.message ||
      error.response?.data?.detail?.message ||
      error.message ||
      'Could not load privacy settings.'
    return {
      success: false,
      error: { message, code: 'FETCH_SETTINGS_ERROR' },
      data: [],
    }
  }
}

/**
 * Update privacy preferences.
 */
export const updatePrivacySettings = async (settingsList) => {
  try {
    const payload = {
      settings: settingsList.map((s) => ({ id: s.id, value: Boolean(s.value) })),
    }
    const response = await apiClient.patch('/api/profile/settings', payload)
    if (response.data?.success && Array.isArray(response.data?.data)) {
      return {
        success: true,
        data: response.data.data,
      }
    }
    return {
      success: false,
      error: { message: 'Failed to persist settings.', code: 'UPDATE_SETTINGS_ERROR' },
    }
  } catch (error) {
    const message =
      error.response?.data?.error?.message ||
      error.response?.data?.detail?.error?.message ||
      error.response?.data?.detail?.message ||
      error.message ||
      'Privacy settings could not be saved.'
    return {
      success: false,
      error: { message, code: 'UPDATE_SETTINGS_ERROR' },
    }
  }
}

// ---------------------------------------------------------------------------
// Offline Emergency Pass Local Storage Helpers
// ---------------------------------------------------------------------------

const OFFLINE_PASS_KEY = 'salvus_offline_emergency_pass'

/**
 * Cache essential emergency pass data locally on device for zero-connectivity scenarios.
 */
export const saveOfflinePassLocal = (passData) => {
  if (typeof window === 'undefined') return false
  try {
    const payload = {
      ...passData,
      cachedAt: new Date().toISOString(),
      version: '1.0',
    }
    localStorage.setItem(OFFLINE_PASS_KEY, JSON.stringify(payload))
    return true
  } catch (e) {
    console.warn('[Salvus Offline] Failed to cache pass locally:', e)
    return false
  }
}

/**
 * Retrieve cached offline emergency pass.
 */
export const getOfflinePassLocal = () => {
  if (typeof window === 'undefined') return null
  try {
    const raw = localStorage.getItem(OFFLINE_PASS_KEY)
    return raw ? JSON.parse(raw) : null
  } catch (e) {
    console.warn('[Salvus Offline] Failed to read cached pass:', e)
    return null
  }
}

export default {
  fetchCitizenProfile,
  updateCitizenProfile,
  fetchEmergencyContacts,
  createEmergencyContact,
  updateEmergencyContact,
  deleteEmergencyContact,
  fetchMedicalInfo,
  updateMedicalInfo,
  fetchPrivacySettings,
  updatePrivacySettings,
  saveOfflinePassLocal,
  getOfflinePassLocal,
}
