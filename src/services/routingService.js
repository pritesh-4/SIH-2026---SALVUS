/**
 * Salvus Routing Client Service
 *
 * Provides frontend access to the Salvus OSRM routing service with
 * seamless fallback to client-side interpolated corridor geometry.
 */

import { apiClient } from './api'

/**
 * Calculate Haversine distance in km.
 */
export const haversineDistanceKm = (lat1, lon1, lat2, lon2) => {
  if (!lat1 || !lon1 || !lat2 || !lon2) return 0
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
  const speedKmh = profile === 'walking' ? 4.8 : profile === 'boat' ? 24.0 : 35.0
  const durationMinutes = Math.max(1, Math.round((distKm / speedKmh) * 60 * 10) / 10)

  const numPoints = 15
  const coordinates = []

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

  return {
    distance_km: distKm,
    distance_meters: Math.round(distKm * 1000),
    duration_seconds: durationMinutes * 60,
    duration_minutes: durationMinutes,
    eta_formatted: `${Math.max(1, Math.round(durationMinutes))} min`,
    coordinates,
    profile,
    status: 'FALLBACK_CORRIDOR',
    summary: 'Emergency Vector Corridor (Client Fallback)',
    is_fallback: true,
  }
}

/**
 * Fetch route between coordinates from backend routing API with automatic fallback.
 */
export const fetchRoute = async (originLat, originLon, destLat, destLon, profile = 'driving') => {
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
    if (response.data?.data) {
      return {
        success: true,
        data: response.data.data,
      }
    }
  } catch (error) {
    console.warn('[RoutingClient] Backend route query failed, using fallback corridor:', error)
  }

  const fallback = generateFallbackCorridor(originLat, originLon, destLat, destLon, profile)
  return {
    success: true,
    data: fallback,
  }
}
