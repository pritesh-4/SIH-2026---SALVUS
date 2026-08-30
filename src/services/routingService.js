/**
 * Salvus Routing Client Service
 *
 * Provides frontend access to the Salvus OSRM routing service with
 * seamless fallback to client-side interpolated corridor geometry and
 * race-safe route request management (cancels stale responses).
 */

import { apiClient } from './api.js'

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
 * Check if coordinate has moved beyond minimum threshold in meters.
 */
export const hasSignificantlyMoved = (lat1, lon1, lat2, lon2, thresholdMeters = 30) => {
  const distKm = haversineDistanceKm(lat1, lon1, lat2, lon2)
  return distKm * 1000 >= thresholdMeters
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
export const fetchRoute = async (
  originLat,
  originLon,
  destLat,
  destLon,
  profile = 'driving',
  signal = null
) => {
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
      signal,
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
    if (error.name === 'CanceledError' || error.code === 'ERR_CANCELED') {
      return { success: false, isCancelled: true, data: null }
    }
    console.warn('[RoutingClient] Backend route query failed, using fallback corridor:', error)
  }

  const fallback = generateFallbackCorridor(oLat, oLon, dLat, dLon, profile)
  return {
    success: true,
    data: fallback,
  }
}

/**
 * Race-Safe Route Query Manager
 *
 * Enforces:
 * 1. Monotonically increasing sequence IDs to drop stale out-of-order route responses.
 * 2. In-flight request cancellation via AbortController when coordinates change.
 * 3. Distance thresholding to prevent expensive re-queries on micro GPS jitter (< 30m).
 */
export class RouteManager {
  constructor(thresholdMeters = 30) {
    this.thresholdMeters = thresholdMeters
    this.currentSeq = 0
    this.abortController = null
    this.lastQueryOrigin = null
    this.lastQueryDest = null
    this.cachedRoute = null
  }

  async calculateRoute(originLat, originLon, destLat, destLon, profile = 'driving', force = false) {
    const oLat = Number(originLat)
    const oLon = Number(originLon)
    const dLat = Number(destLat)
    const dLon = Number(destLon)

    if (isNaN(oLat) || isNaN(oLon) || isNaN(dLat) || isNaN(dLon)) {
      return { success: false, data: null, error: 'INVALID_COORDS' }
    }

    // Micro-movement check: return cached route if movement is negligible
    if (
      !force &&
      this.cachedRoute &&
      this.lastQueryOrigin &&
      this.lastQueryDest &&
      !hasSignificantlyMoved(
        this.lastQueryOrigin.lat,
        this.lastQueryOrigin.lon,
        oLat,
        oLon,
        this.thresholdMeters
      ) &&
      !hasSignificantlyMoved(
        this.lastQueryDest.lat,
        this.lastQueryDest.lon,
        dLat,
        dLon,
        this.thresholdMeters
      )
    ) {
      return { success: true, data: this.cachedRoute, isCached: true }
    }

    // Cancel any previous in-flight route query
    if (this.abortController) {
      this.abortController.abort()
    }
    this.abortController = new AbortController()

    const requestSeq = ++this.currentSeq

    const result = await fetchRoute(oLat, oLon, dLat, dLon, profile, this.abortController.signal)

    // Stale response guard: If another query started while this was in-flight, discard
    if (requestSeq !== this.currentSeq) {
      return { success: false, isStale: true, data: null }
    }

    if (result.success && result.data) {
      this.lastQueryOrigin = { lat: oLat, lon: oLon }
      this.lastQueryDest = { lat: dLat, lon: dLon }
      this.cachedRoute = result.data
    }

    return result
  }

  clear() {
    if (this.abortController) {
      this.abortController.abort()
      this.abortController = null
    }
    this.currentSeq = 0
    this.lastQueryOrigin = null
    this.lastQueryDest = null
    this.cachedRoute = null
  }
}

export default {
  haversineDistanceKm,
  hasSignificantlyMoved,
  formatEta,
  generateFallbackCorridor,
  fetchRoute,
  RouteManager,
}
