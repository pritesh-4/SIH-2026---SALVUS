/**
 * Salvus Client-Side Facilities & Places Service (Phase 2 Real-World Data Engine)
 *
 * Provides:
 * - Canonical category definitions and robust normalization
 * - Strict client-side 10,000m (10 km) radius validation
 * - Clear straight-line distance formatting ('850 m away' / '1.3 km away')
 * - Provenance badge resolution (✓ Salvus verified, Official Authority, Geoapify, Map data)
 * - Single-source-of-truth category matching for counts, filters, map markers, and directory
 * - Multi-provider response status handling (AVAILABLE, PARTIAL_RESULTS, NO_RESULTS, UNAVAILABLE, STALE)
 */

import { fetchNearbyPlaces, fetchPlaceRoute } from './api.js'

/**
 * Controlled list of primary category filter tabs displayed in the UI.
 */
export const PLACE_CATEGORIES = [
  { id: 'all', label: 'Nearby', icon: '📍', color: 'slate' },
  { id: 'hospital', label: 'Hospitals', icon: '🏥', color: 'rose' },
  { id: 'pharmacy', label: 'Pharmacies', icon: '💊', color: 'emerald' },
  { id: 'police', label: 'Police', icon: '🛡️', color: 'sky' },
  { id: 'fire_station', label: 'Fire', icon: '🚒', color: 'amber' },
  { id: 'shelter', label: 'Safe Places', icon: '🏠', color: 'teal' },
]

export const PROVENANCE_LABELS = {
  SALVUS_VERIFIED: {
    label: '✓ Salvus verified',
    shortLabel: 'Verified',
    variant: 'safe',
    description: 'Officially designated and operational civil defense facility.',
  },
  OFFICIAL_AUTHORITY: {
    label: 'Official Authority',
    shortLabel: 'Official',
    variant: 'safe',
    description: 'Government or municipal emergency responder.',
  },
  GEOAPIFY_PLACES: {
    label: 'Geoapify Places',
    shortLabel: 'Geoapify',
    variant: 'neutral',
    description: 'Real-world geospatial facility intelligence.',
  },
  OSM_MAPPED: {
    label: 'Map data',
    shortLabel: 'Mapped',
    variant: 'neutral',
    description: 'Real-world geographic place from OpenStreetMap.',
  },
  SEEDED_DEMO: {
    label: 'Simulation demo',
    shortLabel: 'Demo',
    variant: 'warning',
    description: 'Seeded scenario facility for simulation mode.',
  },
}

/**
 * Normalizes raw category strings from diverse providers into a canonical category identifier:
 * 'hospital' | 'pharmacy' | 'police' | 'fire_station' | 'shelter' | 'emergency' | 'other'
 */
export const normalizePlaceCategory = (rawCategory) => {
  const catStr = String(rawCategory || '')
    .trim()
    .toLowerCase()
    .replace(/-/g, '_')

  if (
    catStr === 'hospital' ||
    catStr === 'clinic' ||
    catStr.includes('hospital') ||
    catStr.includes('clinic') ||
    catStr.includes('doctor')
  ) {
    return 'hospital'
  }

  if (
    catStr === 'pharmacy' ||
    catStr === 'chemist' ||
    catStr.includes('pharmacy') ||
    catStr.includes('chemist') ||
    catStr.includes('medical_supply')
  ) {
    return 'pharmacy'
  }

  if (
    catStr === 'police' ||
    catStr === 'police_station' ||
    catStr === 'police_outpost' ||
    catStr.includes('police')
  ) {
    return 'police'
  }

  if (
    catStr === 'fire_station' ||
    catStr === 'fire' ||
    catStr === 'fire_service' ||
    catStr.includes('fire')
  ) {
    return 'fire_station'
  }

  if (
    catStr === 'shelter' ||
    catStr === 'safe_places' ||
    catStr === 'safe_place' ||
    catStr.includes('shelter') ||
    catStr.includes('refuge') ||
    catStr.includes('evacuation') ||
    catStr.includes('community_centre') ||
    catStr.includes('townhall') ||
    catStr.includes('assembly_point')
  ) {
    return 'shelter'
  }

  if (
    catStr === 'emergency' ||
    catStr === 'emergency_service' ||
    catStr.includes('ambulance') ||
    catStr.includes('emergency')
  ) {
    return 'emergency'
  }

  return 'other'
}

/**
 * Returns user-facing metadata (label, icon, tactical color) for a place category.
 */
export const getCategoryInfo = (category) => {
  const canonical = normalizePlaceCategory(category)
  switch (canonical) {
    case 'hospital':
      return { id: 'hospital', label: 'Hospital / Clinic', icon: '🏥', color: 'rose' }
    case 'pharmacy':
      return { id: 'pharmacy', label: 'Pharmacy / Chemist', icon: '💊', color: 'emerald' }
    case 'police':
      return { id: 'police', label: 'Police Station', icon: '🛡️', color: 'sky' }
    case 'fire_station':
      return { id: 'fire_station', label: 'Fire & Rescue', icon: '🚒', color: 'amber' }
    case 'shelter':
      return { id: 'shelter', label: 'Safe Shelter / Refuge', icon: '🏠', color: 'teal' }
    case 'emergency':
      return { id: 'emergency', label: 'Emergency Response', icon: '🚑', color: 'rose' }
    default:
      return { id: 'other', label: 'Public Facility', icon: '📍', color: 'slate' }
  }
}

/**
 * Determines whether a place matches a given category filter tab.
 * Single source of truth for counts, list filtering, and map markers.
 */
export const matchesCategoryFilter = (place, filterId) => {
  if (!place || !filterId || filterId === 'all') return true
  if (filterId === 'hazards') return false

  const placeCanonical = normalizePlaceCategory(place.category)

  if (filterId === 'hospital') {
    return placeCanonical === 'hospital' || placeCanonical === 'emergency'
  }
  if (filterId === 'pharmacy') {
    return placeCanonical === 'pharmacy'
  }
  if (filterId === 'police') {
    return placeCanonical === 'police'
  }
  if (filterId === 'fire_station') {
    return placeCanonical === 'fire_station'
  }
  if (filterId === 'shelter') {
    return placeCanonical === 'shelter'
  }

  return placeCanonical === filterId
}

/**
 * Format geometric distance nicely for UI labels.
 * Under 1 km: '850 m away'
 * Over 1 km:  '1.3 km away'
 */
export const formatDistance = (meters) => {
  if (meters == null || isNaN(meters) || meters < 0) return 'Distance unknown'
  if (meters < 1000) {
    return `${Math.round(meters)} m away`
  }
  return `${(meters / 1000).toFixed(1)} km away`
}

/**
 * Calculate client-side straight-line Haversine distance in meters.
 */
export const calculateClientDistanceM = (lat1, lon1, lat2, lon2) => {
  if (
    typeof lat1 !== 'number' ||
    typeof lon1 !== 'number' ||
    typeof lat2 !== 'number' ||
    typeof lon2 !== 'number'
  ) {
    return null
  }
  const R = 6371000 // earth radius in meters
  const dLat = ((lat2 - lat1) * Math.PI) / 180
  const dLon = ((lon2 - lon1) * Math.PI) / 180
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2)
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  return Math.round(R * c)
}

/**
 * Normalize raw backend place into a consistent, predictable client-side model.
 * Enforces strict <= 10,000m (10 km) boundary.
 */
export const normalizePlace = (raw, originLat = null, originLon = null) => {
  if (!raw || typeof raw !== 'object') return null

  const lat = typeof raw.latitude === 'number' ? raw.latitude : parseFloat(raw.latitude)
  const lon = typeof raw.longitude === 'number' ? raw.longitude : parseFloat(raw.longitude)

  if (isNaN(lat) || isNaN(lon)) return null

  // Recalculate distance if origin is provided
  let distM =
    raw.distance_meters != null
      ? raw.distance_meters
      : raw.straight_line_distance_meters != null
        ? raw.straight_line_distance_meters
        : null
  let distKm = raw.distance_km

  if (originLat != null && originLon != null && !isNaN(originLat) && !isNaN(originLon)) {
    distM = calculateClientDistanceM(originLat, originLon, lat, lon)
    distKm = distM != null ? distM / 1000 : null
  }

  // Strict 10,000m radius check
  if (distM != null && distM > 10000) {
    return null
  }

  const rawCat = raw.category || 'other'
  const canonicalCat = normalizePlaceCategory(rawCat)

  let provenance = 'OSM_MAPPED'
  if (raw.provenance === 'SALVUS_VERIFIED' || raw.verified === true) {
    provenance = 'SALVUS_VERIFIED'
  } else if (raw.provider === 'geoapify' || raw.source?.includes('Geoapify')) {
    provenance = 'GEOAPIFY_PLACES'
  } else if (raw.provenance === 'SEEDED_DEMO') {
    provenance = 'SEEDED_DEMO'
  }

  return {
    id: String(raw.id || `place-${lat}-${lon}`),
    source: raw.source || (raw.provider === 'geoapify' ? 'Geoapify Places' : 'OpenStreetMap'),
    source_id:
      raw.source_id || raw.provider_place_id
        ? String(raw.source_id || raw.provider_place_id)
        : null,
    provenance,
    category: canonicalCat,
    raw_category: rawCat,
    name: String(raw.name || 'Unnamed Facility').trim(),
    latitude: lat,
    longitude: lon,
    address:
      raw.address || raw.formatted_address
        ? String(raw.address || raw.formatted_address).trim()
        : null,
    city: raw.city ? String(raw.city).trim() : null,
    phone: raw.phone ? String(raw.phone).trim() : null,
    website: raw.website ? String(raw.website).trim() : null,
    opening_hours: raw.opening_hours ? String(raw.opening_hours).trim() : null,
    open_now: raw.open_now != null ? raw.open_now : null,
    distance_km: distKm,
    distance_meters: distM,
    distance_formatted: raw.distance_formatted || formatDistance(distM),
    distance_type: 'Straight-line distance',
    amenities: Array.isArray(raw.amenities) ? raw.amenities : [],
    safe_place_details: raw.safe_place_details || null,
    confidence: typeof raw.confidence === 'number' ? raw.confidence : 0.85,
    fetched_at: raw.fetched_at || new Date().toISOString(),
    route_distance_m: raw.route_distance_m || null,
    route_duration_s: raw.route_duration_s || null,
  }
}

export const getProvenanceBadge = (provenance) => {
  if (provenance === 'SALVUS_VERIFIED') {
    return PROVENANCE_LABELS.SALVUS_VERIFIED
  }
  if (provenance === 'OFFICIAL_AUTHORITY') {
    return PROVENANCE_LABELS.OFFICIAL_AUTHORITY
  }
  if (provenance === 'GEOAPIFY_PLACES') {
    return PROVENANCE_LABELS.GEOAPIFY_PLACES
  }
  if (provenance === 'SEEDED_DEMO') {
    return PROVENANCE_LABELS.SEEDED_DEMO
  }
  return PROVENANCE_LABELS.OSM_MAPPED
}

export const normalizeWebsiteUrl = (url) => {
  if (!url || typeof url !== 'string') return null
  const trimmed = url.trim()
  if (!trimmed || trimmed === 'null' || trimmed === 'undefined') return null
  if (/^https?:\/\//i.test(trimmed)) {
    return trimmed
  }
  return `https://${trimmed}`
}

/**
 * Check if citizen moved significantly (> 150m) to warrant a geographic refetch.
 */
export const hasMovedSignificantly = (prevCoords, newCoords, thresholdM = 150) => {
  if (!prevCoords || !newCoords) return true
  if (
    typeof prevCoords.latitude !== 'number' ||
    typeof prevCoords.longitude !== 'number' ||
    typeof newCoords.latitude !== 'number' ||
    typeof newCoords.longitude !== 'number'
  ) {
    return true
  }

  const dist = calculateClientDistanceM(
    prevCoords.latitude,
    prevCoords.longitude,
    newCoords.latitude,
    newCoords.longitude
  )
  return dist === null || dist >= thresholdM
}

/**
 * Intelligent sorting of facilities based on category context.
 *
 * For 'all' (Nearby tab):
 * - Emergency Relevance (Salvus Shelters > Hospitals & Emergency > Fire > Police > Community Shelters > Pharmacies > Other)
 * - Proximity distance (closest first)
 * - Confidence score (highest first)
 *
 * For specific category tabs (Hospitals, Pharmacies, Police, Fire, Safe Places):
 * - Proximity distance (closest first)
 * - Verified status (Salvus verified first)
 * - Confidence score (highest first)
 */
export const getCategoryEmergencyPriority = (place) => {
  if (!place) return 99
  const isVerified = place.provenance === 'SALVUS_VERIFIED' || place.verified === true
  const cat = normalizePlaceCategory(place.category)

  if (cat === 'shelter' && isVerified) return 1
  if (cat === 'hospital' || cat === 'emergency') return 2
  if (cat === 'fire_station') return 3
  if (cat === 'police') return 4
  if (cat === 'shelter') return 5
  if (cat === 'pharmacy') return 6
  return 7
}

export const sortPlacesForCategory = (places, filterId = 'all') => {
  if (!Array.isArray(places)) return []
  const copy = [...places]

  if (filterId === 'all') {
    return copy.sort((a, b) => {
      const pA = getCategoryEmergencyPriority(a)
      const pB = getCategoryEmergencyPriority(b)
      if (pA !== pB) return pA - pB

      const distA = a.distance_meters != null ? a.distance_meters : Infinity
      const distB = b.distance_meters != null ? b.distance_meters : Infinity
      if (distA !== distB) return distA - distB

      const confA = typeof a.confidence === 'number' ? a.confidence : 0.5
      const confB = typeof b.confidence === 'number' ? b.confidence : 0.5
      return confB - confA
    })
  }

  // Specific category tab: strictly sort by proximity distance first
  return copy.sort((a, b) => {
    const distA = a.distance_meters != null ? a.distance_meters : Infinity
    const distB = b.distance_meters != null ? b.distance_meters : Infinity
    if (distA !== distB) return distA - distB

    const verA = a.provenance === 'SALVUS_VERIFIED' || a.verified === true ? 1 : 0
    const verB = b.provenance === 'SALVUS_VERIFIED' || b.verified === true ? 1 : 0
    if (verA !== verB) return verB - verA

    const confA = typeof a.confidence === 'number' ? a.confidence : 0.5
    const confB = typeof b.confidence === 'number' ? b.confidence : 0.5
    return confB - confA
  })
}

/**
 * Load nearby places with client normalization and structured state.
 */
export const loadNearbyPlaces = async ({
  latitude,
  longitude,
  radius = 10000,
  categories = null,
  includeVerified = true,
  safePlacesOnly = false,
}) => {
  if (typeof latitude !== 'number' || typeof longitude !== 'number') {
    return {
      success: false,
      status: 'INVALID_COORDINATES',
      freshness: 'UNAVAILABLE',
      error: 'Invalid coordinates for nearby search',
      data: [],
      count: 0,
    }
  }

  const res = await fetchNearbyPlaces({
    lat: latitude,
    lng: longitude,
    radius,
    categories,
    includeVerified,
    safePlacesOnly,
  })

  if (res.success) {
    const rawList = Array.isArray(res.data) ? res.data : []
    const normalized = rawList
      .map((p) => normalizePlace(p, latitude, longitude))
      .filter((p) => p !== null)

    return {
      success: true,
      status: res.status || (normalized.length > 0 ? 'AVAILABLE' : 'NO_RESULTS'),
      freshness: res.freshness || 'LIVE',
      cached: res.cached || false,
      data: normalized,
      count: normalized.length,
      fetchedAt: res.fetchedAt,
      categoryStatuses: res.category_statuses || {},
      providerSummary: res.provider_summary || 'Salvus Real-World Facilities Engine',
    }
  }

  return {
    success: false,
    status: res.status || 'UNAVAILABLE',
    freshness: res.freshness || 'UNAVAILABLE',
    cached: false,
    error: res.error?.message || 'Nearby places temporarily unavailable.',
    data: [],
    count: 0,
  }
}

/**
 * Priority scoring for recognizable emergency landmarks:
 * Tier 1: Major Hospitals & Emergency Trauma Centers
 * Tier 2: Police, Fire & Civil Defense Stations
 * Tier 3: Designated Shelters, Evacuation Assembly Points, Town Halls
 * Tier 4: Notable Civic & Transit Infrastructure (Train/Bus stations, Public Facilities)
 * Tier 5: Pharmacies & Local Facilities
 */
export const getLandmarkPriorityTier = (place) => {
  if (!place) return 99
  const cat = normalizePlaceCategory(place.category)
  const isVerified = place.provenance === 'SALVUS_VERIFIED' || place.verified === true

  if (cat === 'hospital' || cat === 'emergency') return 1
  if (cat === 'police' || cat === 'fire_station') return 2
  if (cat === 'shelter' || isVerified) return 3
  if (cat === 'pharmacy') return 5
  return 4 // Other public facilities / civic points / transit
}

/**
 * Load and rank real nearby landmarks for hazard reporting.
 *
 * - Queries nearby facilities within a focused 2.5–3.0km radius (auto-expanding up to 5km if sparse).
 * - Filters for recognizable, non-empty named entities.
 * - Sorts by emergency recognizability tier, then proximity distance.
 * - Formats human-friendly labels: "City Hospital — 450 m".
 * - Never invents fake coordinates or silently falls back to static cities.
 */
export const loadNearbyLandmarks = async ({
  latitude,
  longitude,
  radius = 3000,
  maxResults = 15,
} = {}) => {
  if (
    typeof latitude !== 'number' ||
    typeof longitude !== 'number' ||
    isNaN(latitude) ||
    isNaN(longitude)
  ) {
    return {
      success: false,
      status: 'INVALID_COORDINATES',
      landmarks: [],
      count: 0,
      error: 'Valid GPS coordinates are required for live landmark discovery.',
    }
  }

  try {
    // 1. Initial targeted search (default 3km)
    let placesResult = await loadNearbyPlaces({
      latitude,
      longitude,
      radius,
      includeVerified: true,
    })

    // 2. Adaptive radius expansion if very few results in rural/suburban areas
    if (placesResult.success && placesResult.data.length < 3 && radius < 5000) {
      const expandedResult = await loadNearbyPlaces({
        latitude,
        longitude,
        radius: 5000,
        includeVerified: true,
      })
      if (expandedResult.success && expandedResult.data.length > placesResult.data.length) {
        placesResult = expandedResult
      }
    }

    if (!placesResult.success) {
      return {
        success: false,
        status: placesResult.status || 'UNAVAILABLE',
        landmarks: [],
        count: 0,
        error: placesResult.error || 'Nearby landmarks are temporarily unavailable.',
      }
    }

    const rawPlaces = placesResult.data || []

    // 3. Filter valid places with meaningful names (exclude generic/empty)
    const validPlaces = rawPlaces.filter((p) => {
      if (!p || !p.name) return false
      const trimmed = p.name.trim()
      return trimmed.length >= 2 && trimmed !== 'Unnamed Facility' && trimmed !== 'Unknown'
    })

    // Deduplicate by name
    const seenNames = new Set()
    const uniquePlaces = []
    for (const p of validPlaces) {
      const key = p.name.toLowerCase().trim()
      if (!seenNames.has(key)) {
        seenNames.add(key)
        uniquePlaces.push(p)
      }
    }

    // 4. Rank landmarks by recognizability tier then proximity
    const ranked = uniquePlaces.sort((a, b) => {
      const tierA = getLandmarkPriorityTier(a)
      const tierB = getLandmarkPriorityTier(b)
      if (tierA !== tierB) return tierA - tierB

      const distA = a.distance_meters != null ? a.distance_meters : Infinity
      const distB = b.distance_meters != null ? b.distance_meters : Infinity
      if (distA !== distB) return distA - distB

      const confA = typeof a.confidence === 'number' ? a.confidence : 0.5
      const confB = typeof b.confidence === 'number' ? b.confidence : 0.5
      return confB - confA
    })

    // 5. Slice to maxResults and shape into structured landmark items
    const landmarks = ranked.slice(0, maxResults).map((p) => {
      const catInfo = getCategoryInfo(p.category)
      const distFormatted = p.distance_formatted || formatDistance(p.distance_meters)
      return {
        id: p.id,
        name: p.name,
        category: p.category,
        categoryLabel: catInfo.label,
        icon: catInfo.icon,
        latitude: p.latitude,
        longitude: p.longitude,
        distanceMeters: p.distance_meters,
        distanceFormatted: distFormatted,
        address: p.address || p.city || '',
        provenance: p.provenance,
        label: `${p.name} — ${distFormatted}`,
        fullLabel: `${p.name} — ${distFormatted} (${catInfo.label})`,
      }
    })

    return {
      success: true,
      status: landmarks.length > 0 ? 'AVAILABLE' : 'NO_RESULTS',
      landmarks,
      count: landmarks.length,
      searchedRadiusMeters: placesResult.radiusMeters || radius,
      fetchedAt: placesResult.fetchedAt || new Date().toISOString(),
    }
  } catch (err) {
    return {
      success: false,
      status: 'UNAVAILABLE',
      landmarks: [],
      count: 0,
      error: err.message || 'Failed to load nearby landmarks.',
    }
  }
}

export { fetchPlaceRoute }
