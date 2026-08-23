/**
 * Salvus Geolocation Management System
 *
 * Privacy & Battery Policy:
 * - Regular hazard reporting uses one-off location requests on demand.
 * - Active SOS mode triggers continuous emergency tracking.
 * - Continuous tracking outside emergency mode is strictly prohibited.
 */

export const DEFAULT_LOCATION = {
  latitude: 22.5726,
  longitude: 88.3639,
  accuracyM: 4,
  accuracy: 'High Precision (±4m)',
  accuracyTier: 'HIGH',
  address: 'Sector 12, Salt Lake, Kolkata',
  coordinates: '22.5726° N, 88.3639° E',
  status: 'ACTIVE',
}

/**
 * Standard landmarks in Sector 12 / Salt Lake disaster corridor
 * for manual confirmation and GPS fallback.
 */
export const LANDMARKS = [
  {
    name: 'Sector 12 Community Hub',
    address: 'Block CF, Sector 12, Salt Lake',
    latitude: 22.5726,
    longitude: 88.3639,
  },
  {
    name: 'Karunamoyee Central Bus Terminus',
    address: 'Central Park East, Salt Lake',
    latitude: 22.5867,
    longitude: 88.4178,
  },
  {
    name: 'Salt Lake Stadium Evacuation Gate',
    address: 'Stadium Complex Gate 3, Sector 3',
    latitude: 22.568,
    longitude: 88.406,
  },
  {
    name: 'Sector 5 Electronics Complex',
    address: 'Sector V Ring Road',
    latitude: 22.58,
    longitude: 88.435,
  },
  {
    name: 'Eastern Metropolitan Bypass Junction',
    address: 'EM Bypass Elevated Connector',
    latitude: 22.551,
    longitude: 88.398,
  },
  {
    name: 'Ultadanga Transit Hub',
    address: 'VIP Road Connector',
    latitude: 22.596,
    longitude: 88.388,
  },
]

/**
 * Convert numerical accuracy in meters into human-readable ratings.
 */
export const getHumanAccuracy = (accuracyM) => {
  if (accuracyM == null) {
    return {
      label: 'Approximate',
      tier: 'APPROXIMATE',
      color: 'amber',
      badgeClass: 'bg-amber-950/60 text-amber-300 border-amber-500/40',
    }
  }

  const rounded = Math.round(accuracyM)

  if (rounded <= 15) {
    return {
      label: `High Precision (±${rounded}m)`,
      tier: 'HIGH',
      color: 'emerald',
      badgeClass: 'bg-emerald-950/60 text-emerald-300 border-emerald-500/40',
    }
  }

  if (rounded <= 50) {
    return {
      label: `Good Accuracy (±${rounded}m)`,
      tier: 'GOOD',
      color: 'cyan',
      badgeClass: 'bg-cyan-950/60 text-cyan-300 border-cyan-500/40',
    }
  }

  if (rounded <= 200) {
    return {
      label: `Approximate (±${rounded}m)`,
      tier: 'APPROXIMATE',
      color: 'amber',
      badgeClass: 'bg-amber-950/60 text-amber-300 border-amber-500/40',
    }
  }

  return {
    label: `Cell / Grid Triangulation (±${rounded}m)`,
    tier: 'LOW',
    color: 'orange',
    badgeClass: 'bg-orange-950/60 text-orange-300 border-orange-500/40',
  }
}

/**
 * Format latitude and longitude into displayable string.
 */
export const formatCoordinates = (lat, lng) => {
  if (lat == null || lng == null) return 'Coordinates unavailable'
  const latDir = lat >= 0 ? 'N' : 'S'
  const lngDir = lng >= 0 ? 'E' : 'W'
  return `${Math.abs(lat).toFixed(4)}° ${latDir}, ${Math.abs(lng).toFixed(4)}° ${lngDir}`
}

/**
 * Acquire one-off user coordinates via browser Geolocation API.
 * Handles permission denied, timeout, unavailable without throwing.
 */
export const getCurrentLocation = async (options = {}) => {
  if (!navigator?.geolocation) {
    return {
      success: false,
      error: 'Geolocation is not supported by this browser',
      status: 'UNAVAILABLE',
      ...DEFAULT_LOCATION,
    }
  }

  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const lat = position.coords.latitude
        const lng = position.coords.longitude
        const accuracyM = Math.round(position.coords.accuracy || 10)
        const accuracyMeta = getHumanAccuracy(accuracyM)

        resolve({
          success: true,
          latitude: lat,
          longitude: lng,
          accuracyM,
          accuracy: accuracyMeta.label,
          accuracyTier: accuracyMeta.tier,
          accuracyBadgeClass: accuracyMeta.badgeClass,
          coordinates: formatCoordinates(lat, lng),
          address: 'Current Device Location',
          status: 'ACTIVE',
        })
      },
      (error) => {
        let status
        let errorMessage

        switch (error.code) {
          case error.PERMISSION_DENIED:
            status = 'DENIED'
            errorMessage = 'Location permission denied. Please confirm landmark manually.'
            break
          case error.POSITION_UNAVAILABLE:
            status = 'UNAVAILABLE'
            errorMessage = 'Location position unavailable. Using sector default.'
            break
          case error.TIMEOUT:
            status = 'TIMEOUT'
            errorMessage = 'Location acquisition timed out.'
            break
          default:
            status = 'ERROR'
            errorMessage = error.message || 'Unknown location error'
        }

        // Return fallback default coordinates with error metadata
        resolve({
          success: false,
          error: errorMessage,
          status,
          ...DEFAULT_LOCATION,
        })
      },
      {
        enableHighAccuracy: true,
        timeout: options.timeout || 8000,
        maximumAge: options.maximumAge || 10000,
      }
    )
  })
}

/**
 * Emergency mode live location watcher.
 * ONLY invoked during active SOS mode.
 *
 * @param {Function} onUpdate - callback(locationData)
 * @param {Function} onError - callback(errorData)
 * @returns {Function} cleanup function to stop watching
 */
export const watchEmergencyLocation = (onUpdate, onError) => {
  if (!navigator?.geolocation) {
    if (onError) onError({ message: 'Geolocation unsupported', status: 'UNAVAILABLE' })
    return () => {}
  }

  const watchId = navigator.geolocation.watchPosition(
    (position) => {
      const lat = position.coords.latitude
      const lng = position.coords.longitude
      const accuracyM = Math.round(position.coords.accuracy || 5)
      const accuracyMeta = getHumanAccuracy(accuracyM)

      if (onUpdate) {
        onUpdate({
          latitude: lat,
          longitude: lng,
          accuracyM,
          accuracy: accuracyMeta.label,
          accuracyTier: accuracyMeta.tier,
          accuracyBadgeClass: accuracyMeta.badgeClass,
          coordinates: formatCoordinates(lat, lng),
          address: 'Live Emergency Telemetry (Active SOS)',
          status: 'ACTIVE',
        })
      }
    },
    (error) => {
      if (onError) {
        onError({
          code: error.code,
          message: error.message,
          status: error.code === 1 ? 'DENIED' : 'UNAVAILABLE',
        })
      }
    },
    {
      enableHighAccuracy: true,
      maximumAge: 5000,
      timeout: 10000,
    }
  )

  return () => {
    navigator.geolocation.clearWatch(watchId)
  }
}
