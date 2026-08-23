/**
 * Salvus Geolocation Management System
 *
 * Privacy & Battery Policy:
 * - Regular hazard reporting uses one-off location requests on demand.
 * - Active SOS mode triggers continuous emergency tracking.
 * - Continuous tracking outside emergency mode is strictly prohibited.
 */

const DEFAULT_LOCATION = {
  latitude: 22.5726,
  longitude: 88.3639,
  accuracy: '±4m',
  address: 'Sector 12, Salt Lake, Kolkata',
  coordinates: '22.5726° N, 88.3639° E',
}

/**
 * Format latitude and longitude into displayable string.
 */
export const formatCoordinates = (lat, lng) => {
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

        resolve({
          success: true,
          latitude: lat,
          longitude: lng,
          accuracy: `±${accuracyM}m`,
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
            errorMessage = 'Location permission denied by user'
            break
          case error.POSITION_UNAVAILABLE:
            status = 'UNAVAILABLE'
            errorMessage = 'Location position unavailable'
            break
          case error.TIMEOUT:
            status = 'TIMEOUT'
            errorMessage = 'Location acquisition timed out'
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

      if (onUpdate) {
        onUpdate({
          latitude: lat,
          longitude: lng,
          accuracy: `±${accuracyM}m`,
          coordinates: formatCoordinates(lat, lng),
          address: 'Live Emergency Telemetry',
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
