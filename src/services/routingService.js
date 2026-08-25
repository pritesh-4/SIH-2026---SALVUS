/**
 * Salvus Routing Client Service
 *
 * Provides frontend access to the Salvus OSRM routing service with
 * seamless fallback to client-side interpolated corridor geometry.
 */

import { apiClient } from './api'

/**
 * Calculate Haversine distance in km between two coordinate pairs.
 */
export const haversineDistanceKm = (lat1, lon1, lat2, lon2) => {
  if (
    typeof lat1 !== 'number' ||
    typeof lon1 !== 'number' ||
    typeof lat2 !== 'number' ||
    typeof lon2 !== 'number'
  ) {
    return 0
  }
  const R = 6371.0
  const dLat = ((lat2 - lat1) * Math.PI) / 180
  const dLon = ((lon2 - lon1) * Math.PI) / 180
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2)
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  return Math.round(R * c * 100) / 100
}

/**
 * Format seconds into a human-readable ETA string.
 */
export const formatEta = (seconds) => {
  if (seconds <= 30) return '1 min'
  const minutes = Math.max(1, Math.round(seconds / 60))
  if (minutes < 60) return `${minutes} min`
  const hours = Math.floor(minutes / 60)
  const rem = minutes % 60
  return rem === 0 ? `${hours} hr` : `${hours} hr ${rem} min`
}

/**
 * Generate client-side fallback corridor polyline [[lat, lon], ...]
 */
export const generateFallbackCorridor = (
  originLat,
  originLon,
  destLat,
  destLon,
  profile = 'driving'
) => {
  const distKm = haversineDistanceKm(originLat, originLon, destLat, destLon)
  const distMeters = Math.round(distKm * 1000)
  const speedKmh = profile === 'walking' ? 4.8 : profile === 'boat' ? 24.0 : 35.0
  const durationSeconds = distKm > 0.01 ? Math.max(30, Math.round((distKm / speedKmh) * 3600)) : 0
  const durationMinutes = Math.round((durationSeconds / 60) * 10) / 10

  let coordinates = []
  if (distKm < 0.001) {
    coordinates = [[Number(originLat.toFixed(6)), Number(originLon.toFixed(6))]]
  } else {
    const numPoints = 15
    const midLat = (originLat + destLat) / 2.0
    const midLon = (originLon + destLon) / 2.0
    const dlat = destLat - originLat
    const dlon = destLon - originLon

    const perpScale = 0.08
    const offsetLat = -dlon * perpScale
    const offsetLon = dlat * perpScale

    for (let i = 0; i < numPoints; i++) {
      const t = i / (numPoints - 1)
      const ctrlLat = midLat + offsetLat
      const ctrlLon = midLon + offsetLon

      const lat = (1 - t) ** 2 * originLat + 2 * (1 - t) * t * ctrlLat + t ** 2 * destLat
      const lon = (1 - t) ** 2 * originLon + 2 * (1 - t) * t * ctrlLon + t ** 2 * destLon
      coordinates.push([Number(lat.toFixed(6)), Number(lon.toFixed(6))])
    }
  }

  return {
    distance_km: distKm,
    distance_meters: distMeters,
    duration_seconds: durationSeconds,
    duration_minutes: durationMinutes,
    eta_seconds: durationSeconds,
    eta_formatted: distKm > 0.001 ? formatEta(durationSeconds) : 'Immediate',
    coordinates,
    geometry: coordinates,
    profile,
    status: 'FALLBACK_CORRIDOR',
    summary: 'Emergency Vector Corridor (Client Fallback)',
    provider: 'salvus_fallback',
    calculated_at: new Date().toISOString(),
    is_fallback: true,
  }
}

/**
 * Fetch route between coordinates from backend routing API with automatic fallback.
 */
export const fetchRoute = async (originLat, originLon, destLat, destLon, profile = 'driving') => {
  const oLat = Number(originLat)
  const oLon = Number(originLon)
  const dLat = Number(destLat)
  const dLon = Number(destLon)

  if (isNaN(oLat) || isNaN(oLon) || isNaN(dLat) || isNaN(dLon)) {
    return {
      success: false,
      error: { code: 'INVALID_COORDINATES', message: 'Non-numeric coordinates provided' },
      data: null,
    }
  }

  try {
    const response = await apiClient.get('/api/routes', {
      params: {
        origin_lat: oLat,
        origin_lng: oLon,
        dest_lat: dLat,
        dest_lng: dLon,
        profile,
      },
    })
    if (response.data?.data) {
      const d = response.data.data
      return {
        success: true,
        data: {
          distance_km: d.distance_km,
          distance_meters: d.distance_meters,
          duration_seconds: d.duration_seconds,
          duration_minutes: d.duration_minutes,
          eta_seconds: d.eta_seconds ?? d.duration_seconds,
          eta_formatted: d.eta_formatted,
          coordinates: d.coordinates || d.geometry || [],
          geometry: d.geometry || d.coordinates || [],
          profile: d.profile || profile,
          status: d.status,
          summary: d.summary || 'Tactical Route',
          provider: d.provider || 'osrm',
          calculated_at: d.calculated_at || new Date().toISOString(),
          is_fallback: Boolean(d.is_fallback),
        },
      }
    }
  } catch (error) {
    console.warn('[RoutingClient] Backend route query failed, using fallback corridor:', error)
  }

  const fallback = generateFallbackCorridor(oLat, oLon, dLat, dLon, profile)
  return {
    success: true,
    data: fallback,
  }
}

export default {
  haversineDistanceKm,
  formatEta,
  generateFallbackCorridor,
  fetchRoute,
}
