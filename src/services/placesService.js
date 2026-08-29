/**
 * Salvus Client-Side Places Service (Phase 3: Citizen Nearby Places Experience)
 *
 * Provides:
 * - 6 Simple, calm category definitions with icons and tactical color mappings
 * - Provenance badge resolution (✓ Salvus verified vs Map data)
 * - Safe URL normalization
 * - Smart client-side movement threshold checks (> 150m)
 */

import { fetchNearbyPlaces, fetchPlaceRoute } from './api'

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

export const getCategoryInfo = (category) => {
  const catStr = String(category || '').toLowerCase()
  if (catStr.includes('hospital') || catStr.includes('clinic')) {
    return { id: 'hospital', label: 'Hospital / Clinic', icon: '🏥', color: 'rose' }
  }
  if (catStr.includes('pharmacy') || catStr.includes('chemist')) {
    return { id: 'pharmacy', label: 'Pharmacy', icon: '💊', color: 'emerald' }
  }
  if (catStr.includes('police')) {
    return { id: 'police', label: 'Police Station', icon: '🛡️', color: 'sky' }
  }
  if (catStr.includes('fire')) {
    return { id: 'fire_station', label: 'Fire & Rescue', icon: '🚒', color: 'amber' }
  }
  if (catStr.includes('shelter') || catStr.includes('refuge') || catStr.includes('evacuation')) {
    return { id: 'shelter', label: 'Safe Shelter', icon: '🏠', color: 'teal' }
  }
  if (catStr.includes('emergency')) {
    return { id: 'emergency', label: 'Emergency Service', icon: '🚑', color: 'rose' }
  }
  return { id: 'other', label: 'Public Facility', icon: '📍', color: 'slate' }
}

export const getProvenanceBadge = (provenance) => {
  if (provenance === 'SALVUS_VERIFIED') {
    return PROVENANCE_LABELS.SALVUS_VERIFIED
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
 * Calculate distance in meters between two lat/lon pairs on client
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
  const R = 6371000 // meters
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
 * Check if citizen moved significantly (> 150m) to warrant a geographic refetch
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
 * Load nearby places with graceful fallback
 */
export const loadNearbyPlaces = async ({
  latitude,
  longitude,
  radius = 2000,
  categories = null,
  includeVerified = true,
  safePlacesOnly = false,
}) => {
  if (typeof latitude !== 'number' || typeof longitude !== 'number') {
    return {
      success: false,
      error: 'Invalid coordinates for nearby search',
      data: [],
    }
  }

  return await fetchNearbyPlaces({
    lat: latitude,
    lng: longitude,
    radius,
    categories,
    includeVerified,
    safePlacesOnly,
  })
}

export { fetchPlaceRoute }
