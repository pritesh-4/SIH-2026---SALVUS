import axios from 'axios'

const API_BASE_URL = import.meta.env.VITE_API_URL || ''

export const apiClient = axios.create({
  baseURL: API_BASE_URL,
  timeout: 10000,
  headers: {
    'Content-Type': 'application/json',
  },
})

// ---------------------------------------------------------------------------
// Incident API Calls
// ---------------------------------------------------------------------------

/**
 * Fetch all incidents from backend (newest first).
 */
export const fetchIncidents = async () => {
  try {
    const response = await apiClient.get('/api/incidents')
    return {
      success: true,
      data: response.data.data || [],
      count: response.data.count || 0,
    }
  } catch (error) {
    const message =
      error.response?.data?.detail?.error?.message ||
      error.response?.data?.detail?.message ||
      error.message ||
      'Failed to fetch incidents'
    return {
      success: false,
      error: { message, code: error.code || 'FETCH_ERROR' },
      data: [],
      count: 0,
    }
  }
}

/**
 * Fetch a single incident by ID with complete audit event timeline.
 */
export const fetchIncidentById = async (incidentId) => {
  try {
    const response = await apiClient.get(`/api/incidents/${incidentId}`)
    return {
      success: true,
      data: response.data.data,
    }
  } catch (error) {
    const message =
      error.response?.data?.detail?.error?.message ||
      error.response?.data?.detail?.message ||
      error.message ||
      'Failed to fetch incident details'
    return {
      success: false,
      error: { message, code: error.code || 'FETCH_ERROR' },
      data: null,
    }
  }
}

/**
 * Create a new incident report or SOS beacon.
 */
export const createIncident = async (payload) => {
  try {
    const body = {
      type: payload.type || 'flood',
      severity: payload.severity || 'MEDIUM',
      description:
        payload.description || (payload.is_sos ? 'SOS Distress Beacon' : 'Hazard Report'),
      reporter_name: payload.reporter_name || 'Citizen User',
      reporter_phone: payload.reporter_phone || null,
      latitude: Number(payload.latitude) || 22.5726,
      longitude: Number(payload.longitude) || 88.3639,
      affected_count: Number(payload.affected_count) || 1,
      is_sos: Boolean(payload.is_sos),
    }

    const response = await apiClient.post('/api/incidents', body)
    return {
      success: true,
      data: response.data.data,
    }
  } catch (error) {
    const message =
      error.response?.data?.detail?.error?.message ||
      (Array.isArray(error.response?.data?.detail)
        ? error.response.data.detail.map((d) => d.msg).join(', ')
        : error.response?.data?.detail?.message) ||
      error.message ||
      'Failed to create incident'
    return {
      success: false,
      error: { message, code: error.code || 'CREATE_ERROR' },
      data: null,
    }
  }
}

/**
 * Transition an incident status (NEW -> TRIAGE_PENDING -> VERIFIED -> RESOLVED / CANCELLED).
 */
export const updateIncidentStatus = async (incidentId, status, actor = 'authority') => {
  try {
    const response = await apiClient.patch(`/api/incidents/${incidentId}/status`, {
      status,
      actor,
    })
    return {
      success: true,
      data: response.data.data,
    }
  } catch (error) {
    const message =
      error.response?.data?.detail?.error?.message ||
      error.response?.data?.detail?.message ||
      error.message ||
      'Failed to transition incident status'
    return {
      success: false,
      error: { message, code: error.code || 'UPDATE_ERROR' },
      data: null,
    }
  }
}

// ---------------------------------------------------------------------------
// Responder Fleet API Calls
// ---------------------------------------------------------------------------

/**
 * Fetch all active response craft and rescue units.
 */
export const fetchResponders = async () => {
  try {
    const response = await apiClient.get('/api/responders')
    return {
      success: true,
      data: response.data.data || [],
      count: response.data.count || 0,
    }
  } catch (error) {
    const message =
      error.response?.data?.detail?.error?.message ||
      error.response?.data?.detail?.message ||
      error.message ||
      'Failed to fetch responders'
    return {
      success: false,
      error: { message, code: error.code || 'FETCH_ERROR' },
      data: [],
      count: 0,
    }
  }
}

/**
 * Update responder operational status or incident assignment.
 */
export const updateResponderStatus = async (responderId, status, assignedIncidentId = null) => {
  try {
    const payload = {}
    if (status) payload.status = status
    if (assignedIncidentId !== undefined) payload.assigned_incident_id = assignedIncidentId

    const response = await apiClient.patch(`/api/responders/${responderId}/status`, payload)
    return {
      success: true,
      data: response.data.data,
    }
  } catch (error) {
    const message =
      error.response?.data?.detail?.error?.message ||
      error.response?.data?.detail?.message ||
      error.message ||
      'Failed to update responder status'
    return {
      success: false,
      error: { message, code: error.code || 'UPDATE_ERROR' },
      data: null,
    }
  }
}

// ---------------------------------------------------------------------------
// Shelter Logistics API Calls
// ---------------------------------------------------------------------------

/**
 * Fetch all evacuation shelters with live bed capacities.
 */
export const fetchShelters = async () => {
  try {
    const response = await apiClient.get('/api/shelters')
    return {
      success: true,
      data: response.data.data || [],
      count: response.data.count || 0,
    }
  } catch (error) {
    const message =
      error.response?.data?.detail?.error?.message ||
      error.response?.data?.detail?.message ||
      error.message ||
      'Failed to fetch shelters'
    return {
      success: false,
      error: { message, code: error.code || 'FETCH_ERROR' },
      data: [],
      count: 0,
    }
  }
}

// ---------------------------------------------------------------------------
// Developer & Demo Helpers
// ---------------------------------------------------------------------------

/**
 * Developer helper: Seed demo scenarios into live backend.
 */
export const seedDevIncidents = async () => {
  try {
    const response = await apiClient.post('/api/incidents/dev/seed')
    return { success: true, data: response.data.data }
  } catch (error) {
    return { success: false, error: error.message }
  }
}

/**
 * Developer helper: Reset demo database to clean initial state.
 */
export const resetDevIncidents = async () => {
  try {
    const response = await apiClient.post('/api/incidents/dev/reset')
    return { success: true, data: response.data.data }
  } catch (error) {
    return { success: false, error: error.message }
  }
}
