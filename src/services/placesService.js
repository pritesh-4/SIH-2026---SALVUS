/**
 * Salvus Client-Side Places Service
 *
 * Provides:
 * - Smart client-side threshold checks (avoids refetching on minor GPS jitter < 150m)
 * - Category definitions, tactical color tokens, and visual badges
 * - Initial distance formatting
 */

import { fetchNearbyPlaces } from './api'

export const PLACE_CATEGORIES = [
  { id: 'all', label: 'All Real-World Places', icon: '📍', color: 'slate' },
  { id: 'hospital', label: 'Hospitals & Clinics', icon: '🏥', color: 'rose' },
  { id: 'pharmacy', label: 'Pharmacies', icon: '💊', color: 'emerald' },
  { id: 'police', label: 'Police Stations', icon: '🛡️', color: 'sky' },
  { id: 'fire_station', label: 'Fire & Rescue', icon: '🚒', color: 'amber' },
  { id: 'shelter', label: 'Official Shelters', icon: '🏠', color: 'teal' },
]

export const PROVENANCE_LABELS = {
  SALVUS_VERIFIED: {
    label: 'SALVUS VERIFIED',
    variant: 'safe',
    description: 'Officially designated and verified civil defense facility.',
  },
  OSM_MAPPED: {
    label: 'MAPPED (OSM)',
    variant: 'neutral',
    description: 'Real-world geographic context from OpenStreetMap.',
  },
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
  radius = 2500,
  categories = null,
  includeVerified = true,
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
  })
}
