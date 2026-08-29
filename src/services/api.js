import axios from 'axios'

const API_BASE_URL =
  (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.VITE_API_URL) || ''

let currentAuthToken =
  typeof window !== 'undefined' ? localStorage.getItem('salvus_auth_token') || null : null

export const getAuthToken = () => currentAuthToken

export const setAuthToken = (token) => {
  currentAuthToken = token
  if (typeof window !== 'undefined') {
    if (token) {
      localStorage.setItem('salvus_auth_token', token)
    } else {
      localStorage.removeItem('salvus_auth_token')
    }
  }
}

export const clearAuthToken = () => setAuthToken(null)

export const fetchRoleToken = async (role = 'AUTHORITY', name = null) => {
  try {
    const res = await axios.post(
      `${API_BASE_URL}/api/auth/token`,
      { role, name },
      { headers: { 'Content-Type': 'application/json' }, timeout: 5000 }
    )
    if (res.data?.access_token) {
      setAuthToken(res.data.access_token)
      return res.data.access_token
    }
  } catch (err) {
    console.warn('[Salvus Auth] Failed to fetch role token from server:', err.message)
  }
  return null
}

export const apiClient = axios.create({
  baseURL: API_BASE_URL,
  timeout: 10000,
  headers: {
    'Content-Type': 'application/json',
  },
})

// Request interceptor: automatically attach Bearer token to all outgoing API calls
apiClient.interceptors.request.use(
  (config) => {
    const token = getAuthToken()
    if (token) {
      config.headers.Authorization = `Bearer ${token}`
    }
    return config
  },
  (error) => Promise.reject(error)
)

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
    const lat = Number(payload.latitude)
    const lon = Number(payload.longitude)
    if (isNaN(lat) || isNaN(lon)) {
      throw new Error('Valid geographic coordinates (latitude and longitude) are required.')
    }

    const body = {
      type: payload.type || 'flood',
      severity: payload.severity || 'MEDIUM',
      description:
        payload.description || (payload.is_sos ? 'SOS Distress Beacon' : 'Hazard Report'),
      reporter_name: payload.reporter_name || 'Citizen User',
      reporter_phone: payload.reporter_phone || null,
      latitude: lat,
      longitude: lon,
      affected_count: Number(payload.affected_count) || 1,
      is_sos: Boolean(payload.is_sos),
    }

    const response = await apiClient.post('/api/incidents', body)
    if (response.data?.data?.access_token) {
      setAuthToken(response.data.data.access_token)
    }
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

/**
 * Upload an evidence photo attachment to an incident report via multipart/form-data.
 */
export const uploadIncidentAttachment = async (incidentId, file) => {
  try {
    const formData = new FormData()
    formData.append('file', file)

    const response = await apiClient.post(`/api/incidents/${incidentId}/attachments`, formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
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
      'Failed to upload incident attachment'
    const code = error.response?.data?.detail?.error?.code || error.code || 'UPLOAD_ERROR'
    return {
      success: false,
      error: { message, code },
      data: null,
    }
  }
}

/**
 * Fetch all evidence photo attachments for an incident.
 */
export const fetchIncidentAttachments = async (incidentId) => {
  try {
    const response = await apiClient.get(`/api/incidents/${incidentId}/attachments`)
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
      'Failed to fetch incident attachments'
    return {
      success: false,
      error: { message, code: error.code || 'FETCH_ERROR' },
      data: [],
      count: 0,
    }
  }
}

/**
 * Delete an evidence photo attachment from an incident.
 */
export const deleteIncidentAttachment = async (incidentId, attachmentId) => {
  try {
    const response = await apiClient.delete(
      `/api/incidents/${incidentId}/attachments/${attachmentId}`
    )
    return {
      success: true,
      data: response.data,
    }
  } catch (error) {
    const message =
      error.response?.data?.detail?.error?.message ||
      error.response?.data?.detail?.message ||
      error.message ||
      'Failed to delete incident attachment'
    return {
      success: false,
      error: { message, code: error.code || 'DELETE_ERROR' },
      data: null,
    }
  }
}

// ---------------------------------------------------------------------------
// AI Incident Triage API Calls
// ---------------------------------------------------------------------------

/**
 * Trigger safety-critical AI decision support triage on an incident.
 */
export const analyzeIncidentTriage = async (incidentId) => {
  try {
    const response = await apiClient.post(`/api/triage/analyze/${incidentId}`)
    return {
      success: true,
      data: response.data.data,
    }
  } catch (error) {
    const message =
      error.response?.data?.detail?.error?.message ||
      error.response?.data?.detail?.message ||
      error.message ||
      'Failed to evaluate AI incident triage'
    return {
      success: false,
      error: { message, code: error.code || 'TRIAGE_ERROR' },
      data: null,
    }
  }
}

/**
 * Operator approves AI triage assessment and transitions incident to VERIFIED.
 */
export const verifyIncidentTriage = async (incidentId, verificationData = {}) => {
  try {
    const response = await apiClient.post(`/api/triage/verify/${incidentId}`, {
      actor: verificationData.actor || 'Authority Dispatcher',
      reviewer_notes: verificationData.reviewer_notes || null,
      adjusted_severity: verificationData.adjusted_severity || null,
      adjusted_type: verificationData.adjusted_type || null,
      adjusted_capability: verificationData.adjusted_capability || null,
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
      'Failed to verify incident triage'
    return {
      success: false,
      error: { message, code: error.code || 'VERIFICATION_ERROR' },
      data: null,
    }
  }
}

/**
 * Operator overrides severity, type, or capability, logs audit trail, and confirms verification.
 */
export const adjustIncidentTriage = async (incidentId, adjustmentData) => {
  return verifyIncidentTriage(incidentId, adjustmentData)
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
 * Fetch ranked candidate responders for an active emergency incident.
 */
export const fetchResponderCandidates = async (incidentId) => {
  try {
    const response = await apiClient.get(`/api/responders/candidates/${incidentId}`)
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
      'Failed to fetch candidate responders'
    return {
      success: false,
      error: { message, code: error.code || 'FETCH_ERROR' },
      data: [],
      count: 0,
    }
  }
}

/**
 * Assign a responder unit to an incident.
 */
export const assignResponder = async (
  responderId,
  incidentId,
  status = 'ASSIGNED',
  actor = 'authority'
) => {
  try {
    const response = await apiClient.post(`/api/responders/${responderId}/assign`, {
      incident_id: incidentId,
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
      'Failed to assign responder to incident'
    return {
      success: false,
      error: { message, code: error.code || 'ASSIGN_ERROR' },
      data: null,
    }
  }
}

/**
 * Update responder operational status or incident assignment.
 */
export const updateResponderStatus = async (
  responderId,
  status,
  assignedIncidentId = null,
  actor = 'authority'
) => {
  try {
    const payload = { actor }
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

/**
 * Update responder real-time GPS coordinates.
 */
export const updateResponderLocation = async (responderId, latitude, longitude) => {
  try {
    const response = await apiClient.post(`/api/responders/${responderId}/location`, {
      latitude: Number(latitude),
      longitude: Number(longitude),
    })
    return {
      success: true,
      data: response.data.data,
    }
  } catch (error) {
    return {
      success: false,
      error: { message: error.message, code: 'UPDATE_ERROR' },
      data: null,
    }
  }
}

// ---------------------------------------------------------------------------
// Assignment Domain API Calls
// ---------------------------------------------------------------------------

/**
 * Authoritatively create a first-class incident-to-responder assignment.
 */
export const createAssignment = async (payload) => {
  try {
    const response = await apiClient.post('/api/assignments', {
      incident_id: payload.incident_id,
      responder_id: payload.responder_id,
      status: payload.status || 'ASSIGNED',
      assigned_by: payload.assigned_by || 'authority',
      score: payload.score ?? null,
      score_breakdown: payload.score_breakdown || null,
      assignment_reason: payload.assignment_reason || null,
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
      'Failed to create assignment'
    return {
      success: false,
      error: { message, code: error.response?.data?.detail?.error?.code || 'ASSIGNMENT_ERROR' },
      data: null,
    }
  }
}

/**
 * Fetch a single assignment by its unique ID.
 */
export const fetchAssignmentById = async (assignmentId) => {
  try {
    const response = await apiClient.get(`/api/assignments/${assignmentId}`)
    return {
      success: true,
      data: response.data.data,
    }
  } catch (error) {
    const message =
      error.response?.data?.detail?.error?.message ||
      error.response?.data?.detail?.message ||
      error.message ||
      'Failed to fetch assignment'
    return {
      success: false,
      error: { message, code: error.response?.data?.detail?.error?.code || 'FETCH_ERROR' },
      data: null,
    }
  }
}

/**
 * Fetch all assignments for an incident.
 */
export const fetchIncidentAssignments = async (incidentId) => {
  try {
    const response = await apiClient.get(`/api/incidents/${incidentId}/assignments`)
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
      'Failed to fetch incident assignments'
    return {
      success: false,
      error: { message, code: error.response?.data?.detail?.error?.code || 'FETCH_ERROR' },
      data: [],
      count: 0,
    }
  }
}

/**
 * Transition assignment lifecycle status.
 */
export const updateAssignmentStatus = async (
  assignmentId,
  status,
  actor = 'authority',
  notes = null
) => {
  try {
    const response = await apiClient.patch(`/api/assignments/${assignmentId}/status`, {
      status,
      actor,
      notes,
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
      'Failed to update assignment status'
    return {
      success: false,
      error: { message, code: error.response?.data?.detail?.error?.code || 'UPDATE_ERROR' },
      data: null,
    }
  }
}

/**
 * Fetch assignments list with optional filters.
 */
export const fetchAssignments = async (params = {}) => {
  try {
    const response = await apiClient.get('/api/assignments', { params })
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
      'Failed to fetch assignments'
    return {
      success: false,
      error: { message, code: error.response?.data?.detail?.error?.code || 'FETCH_ERROR' },
      data: [],
      count: 0,
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

/**
 * Fetch ranked candidate recommended shelters for a location.
 */
export const fetchRecommendedShelters = async (
  lat,
  lon,
  amenity = null,
  { maxRadiusKm = 25.0, demo = false, includeMapped = true } = {}
) => {
  if (lat == null || lon == null || typeof lat !== 'number' || typeof lon !== 'number') {
    return {
      success: true,
      data: [],
      count: 0,
    }
  }
  try {
    const params = {
      lat,
      lon,
      max_radius_km: maxRadiusKm,
      demo: Boolean(demo),
      include_mapped: Boolean(includeMapped),
    }
    if (amenity) params.amenity = amenity
    const response = await apiClient.get('/api/shelters/recommendations', { params })
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
      'Failed to fetch recommended shelters'
    return {
      success: false,
      error: { message, code: error.code || 'FETCH_ERROR' },
      data: [],
      count: 0,
    }
  }
}

/**
 * Reverse geocode latitude and longitude to human-readable neighborhood/locality/city.
 */
export const reverseGeocode = async (lat, lon) => {
  if (lat == null || lon == null || typeof lat !== 'number' || typeof lon !== 'number') {
    return { success: false, area_name: 'Location unavailable' }
  }
  try {
    const response = await apiClient.get('/api/places/reverse', {
      params: { lat, lon },
      timeout: 3500,
    })
    return (
      response.data || {
        success: true,
        area_name: `${lat.toFixed(3)}° N, ${lon.toFixed(3)}° E`,
        latitude: lat,
        longitude: lon,
      }
    )
  } catch {
    return {
      success: true,
      area_name: `${lat.toFixed(3)}° N, ${lon.toFixed(3)}° E`,
      latitude: lat,
      longitude: lon,
    }
  }
}

/**
 * Update shelter bed occupancy or status.
 */
export const updateShelterOccupancy = async (
  shelterId,
  availableBeds = null,
  status = null,
  suppliesStatus = null,
  actor = 'authority'
) => {
  try {
    const payload = { actor }
    if (availableBeds !== null) payload.available_beds = Number(availableBeds)
    if (status) payload.status = status
    if (suppliesStatus) payload.supplies_status = suppliesStatus

    const response = await apiClient.patch(`/api/shelters/${shelterId}`, payload)
    return {
      success: true,
      data: response.data.data,
    }
  } catch (error) {
    const message =
      error.response?.data?.detail?.error?.message ||
      error.response?.data?.detail?.message ||
      error.message ||
      'Failed to update shelter'
    return {
      success: false,
      error: { message, code: error.code || 'UPDATE_ERROR' },
      data: null,
    }
  }
}

// ---------------------------------------------------------------------------
// Routing & Simulation API Calls
// ---------------------------------------------------------------------------

/**
 * Fetch calculated route between origin and destination coordinates.
 */
export const fetchRouteApi = async (
  originLat,
  originLon,
  destLat,
  destLon,
  profile = 'driving'
) => {
  try {
    const response = await apiClient.get('/api/routing/route', {
      params: {
        origin_lat: originLat,
        origin_lng: originLon,
        dest_lat: destLat,
        dest_lng: destLon,
        profile,
      },
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
      'Failed to calculate route'
    return {
      success: false,
      error: { message, code: error.code || 'ROUTING_ERROR' },
      data: null,
    }
  }
}

/**
 * Advance responder through operational journey lifecycle (ASSIGNED -> EN_ROUTE -> NEARBY -> ON_SCENE -> RESOLVED).
 */
export const advanceResponderLifecycle = async (
  responderId,
  targetStatus,
  actor = 'authority',
  notes = null
) => {
  try {
    const response = await apiClient.post(`/api/responders/${responderId}/lifecycle`, {
      target_status: targetStatus,
      actor,
      notes,
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
      'Failed to advance responder lifecycle'
    return {
      success: false,
      error: { message, code: error.code || 'LIFECYCLE_ERROR' },
      data: null,
    }
  }
}

/**
 * Send simulated GPS telemetry step along active route.
 */
export const sendSimulationStep = async (stepPayload) => {
  try {
    const response = await apiClient.post('/api/simulation/step', stepPayload)
    return {
      success: true,
      data: response.data.data,
    }
  } catch {
    // Fallback: update responder location and status directly via responder endpoints
    if (stepPayload.responder_id && stepPayload.latitude && stepPayload.longitude) {
      await updateResponderLocation(
        stepPayload.responder_id,
        stepPayload.latitude,
        stepPayload.longitude
      )
      if (stepPayload.target_status) {
        await advanceResponderLifecycle(
          stepPayload.responder_id,
          stepPayload.target_status,
          'simulation_engine'
        )
      }
      return { success: true }
    }
    return {
      success: false,
      data: null,
    }
  }
}

/**
 * Reset all simulated fleet units to base seed locations.
 */
export const resetSimulationFleet = async () => {
  try {
    const response = await apiClient.post('/api/simulation/reset-fleet')
    return {
      success: true,
      data: response.data,
    }
  } catch (error) {
    return {
      success: false,
      error: { message: error.message },
    }
  }
}

// ---------------------------------------------------------------------------
// Disaster Intelligence & Situation API Calls
// ---------------------------------------------------------------------------

/**
 * Fetch multi-source normalized hazards with optional location filtering and source telemetry.
 */
export const fetchHazards = async (
  lat = null,
  lon = null,
  maxDistanceKm = null,
  includeSimulation = false
) => {
  try {
    const params = {}
    if (lat !== null) params.lat = lat
    if (lon !== null) params.lon = lon
    if (maxDistanceKm !== null) params.max_distance_km = maxDistanceKm
    if (includeSimulation) params.include_simulation = true

    const response = await apiClient.get('/api/hazards', { params })
    return {
      success: true,
      data: response.data.data || [],
      count: response.data.count || 0,
      sourceSummary: response.data.source_summary,
      sources: response.data.sources || {},
      sourcesHealth: response.data.sources_health || [],
    }
  } catch (error) {
    return {
      success: false,
      error: { message: error.message },
      data: [],
      count: 0,
      sources: {},
      sourcesHealth: [],
    }
  }
}

/**
 * Fetch spatial incident clusters.
 */
export const fetchIncidentClusters = async () => {
  try {
    const response = await apiClient.get('/api/hazards/clusters')
    return {
      success: true,
      data: response.data.data || [],
      count: response.data.count || 0,
    }
  } catch (error) {
    return {
      success: false,
      error: { message: error.message },
      data: [],
      count: 0,
    }
  }
}

/**
 * Fetch grounded situation statistics and AI briefing.
 */
export const fetchSituationSummary = async () => {
  try {
    const response = await apiClient.get('/api/situation/summary')
    return {
      success: true,
      data: response.data,
    }
  } catch (error) {
    return {
      success: false,
      error: { message: error.message },
      data: null,
    }
  }
}

// ---------------------------------------------------------------------------
// Real-World Geographic Places (Build 02: Real-World Geographic Context)
// ---------------------------------------------------------------------------

/**
 * Fetch real-world nearby geographic places (hospitals, clinics, pharmacies, police, fire)
 * with strict provenance separation (OSM_MAPPED vs SALVUS_VERIFIED).
 */
export const fetchNearbyPlaces = async ({
  lat,
  lng,
  radius = 2000,
  categories = null,
  includeVerified = true,
  safePlacesOnly = false,
}) => {
  try {
    const params = {
      lat,
      lng,
      radius,
      include_verified: includeVerified,
      safe_places_only: safePlacesOnly,
    }
    if (categories && categories.length > 0) {
      params.categories = Array.isArray(categories) ? categories.join(',') : categories
    }

    const response = await apiClient.get('/api/places/nearby', { params })
    return {
      success: true,
      data: response.data.data || [],
      count: response.data.count || 0,
      cached: response.data.cached || false,
      freshness: response.data.freshness || 'FRESH',
      status: response.data.status || 'OK',
      queryCenter: response.data.query_center,
      radiusMeters: response.data.radius_meters,
      searchedRadiusKm: response.data.searched_radius_km,
      fetchedAt: response.data.fetched_at,
    }
  } catch (error) {
    const message =
      error.response?.data?.detail?.error?.message ||
      error.response?.data?.detail?.message ||
      error.message ||
      'Nearby places are temporarily unavailable.'
    return {
      success: false,
      status: error.response?.data?.status || 'PROVIDER_UNAVAILABLE',
      error: { message, code: error.code || 'PLACES_UNAVAILABLE' },
      data: [],
      count: 0,
      freshness: 'UNAVAILABLE',
    }
  }
}

/**
 * Calculate on-demand turn-by-turn route to a specific selected place.
 */
export const fetchPlaceRoute = async ({
  placeId,
  originLat,
  originLon,
  profile = 'walking',
  radius = 5000,
}) => {
  try {
    const response = await apiClient.get(`/api/places/${encodeURIComponent(placeId)}/route`, {
      params: {
        origin_lat: originLat,
        origin_lon: originLon,
        profile,
        radius,
      },
    })
    return {
      success: true,
      data: response.data,
    }
  } catch (error) {
    const message =
      error.response?.data?.detail?.error?.message ||
      error.response?.data?.detail?.message ||
      error.message ||
      'Route calculation temporarily unavailable.'
    return {
      success: false,
      error: { message, code: error.code || 'ROUTE_UNAVAILABLE' },
      data: null,
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
