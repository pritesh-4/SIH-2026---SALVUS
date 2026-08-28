/**
 * Salvus Geolocation Management System
 *
 * Single application-owned source of truth for device location.
 *
 * Privacy & Battery Policy:
 * - Regular map browsing & incident reporting uses one-off getCurrentPosition() requests.
 * - Active SOS mode transitions to controlled watchPosition() emergency tracking.
 * - Continuous tracking outside active emergency mode is strictly prohibited.
 * - Location is not stored in localStorage indefinitely.
 */

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
 * Avoids raw technical jargon as the primary UX.
 *
 * Tiers:
 * - HIGH (<= 15m): High Precision (±Xm)
 * - GOOD (<= 50m): Good Accuracy (±Xm)
 * - APPROXIMATE (<= 200m): Approximate (±Xm)
 * - LOW (> 200m): Low accuracy (±Xm)
 */
export const getHumanAccuracy = (accuracyM) => {
  if (accuracyM == null || typeof accuracyM !== 'number' || isNaN(accuracyM)) {
    return {
      label: 'Approximate',
      tier: 'APPROXIMATE',
      color: 'amber',
      badgeClass: 'bg-amber-950/60 text-amber-300 border-amber-500/40',
      description: 'Estimated location without satellite GPS lock',
    }
  }

  const rounded = Math.round(accuracyM)

  if (rounded <= 15) {
    return {
      label: `High Precision (±${rounded}m)`,
      tier: 'HIGH',
      color: 'emerald',
      badgeClass: 'bg-emerald-950/60 text-emerald-300 border-emerald-500/40',
      description: 'High-precision satellite GPS lock',
    }
  }

  if (rounded <= 50) {
    return {
      label: `Good Accuracy (±${rounded}m)`,
      tier: 'GOOD',
      color: 'cyan',
      badgeClass: 'bg-cyan-950/60 text-cyan-300 border-cyan-500/40',
      description: 'Reliable device location',
    }
  }

  if (rounded <= 200) {
    return {
      label: `Approximate (±${rounded}m)`,
      tier: 'APPROXIMATE',
      color: 'amber',
      badgeClass: 'bg-amber-950/60 text-amber-300 border-amber-500/40',
      description: 'Cell / Wi-Fi approximate positioning',
    }
  }

  return {
    label: `Low accuracy (±${rounded}m)`,
    tier: 'LOW',
    color: 'orange',
    badgeClass: 'bg-orange-950/60 text-orange-300 border-orange-500/40',
    description: 'Coarse area triangulation; manual confirmation recommended',
  }
}

/**
 * Format latitude and longitude into displayable human string.
 */
export const formatCoordinates = (lat, lng) => {
  if (lat == null || lng == null || typeof lat !== 'number' || typeof lng !== 'number') {
    return 'Coordinates unavailable'
  }
  const latDir = lat >= 0 ? 'N' : 'S'
  const lngDir = lng >= 0 ? 'E' : 'W'
  return `${Math.abs(lat).toFixed(4)}° ${latDir}, ${Math.abs(lng).toFixed(4)}° ${lngDir}`
}

/**
 * Normalized Initial Location Model
 */
export const INITIAL_LOCATION_STATE = {
  latitude: null,
  longitude: null,
  accuracy: null,
  timestamp: null,
  permission: 'PROMPT', // 'GRANTED' | 'DENIED' | 'PROMPT' | 'UNAVAILABLE'
  source: 'UNKNOWN', // 'BROWSER' | 'LANDMARK' | 'UNKNOWN'
  accuracyTier: 'UNKNOWN',
  accuracyLabel: 'Location access off',
  accuracyBadgeClass: 'bg-slate-800 text-slate-400 border-slate-700',
  coordinates: 'Coordinates unavailable',
  address: 'Location not set',
  landmarkName: null,
  isFallback: false,
  error: null,
  status: 'IDLE',
}

/**
 * Create a normalized location model object from raw coordinates and metadata.
 */
export const createLocationModel = (params = {}) => {
  const latitude = typeof params.latitude === 'number' ? params.latitude : null
  const longitude = typeof params.longitude === 'number' ? params.longitude : null
  const accuracy = typeof params.accuracy === 'number' ? Math.round(params.accuracy) : null
  const timestamp = params.timestamp || (latitude ? Date.now() : null)
  const permission = params.permission || (latitude ? 'GRANTED' : 'PROMPT')
  const source = params.source || (latitude ? 'BROWSER' : 'UNKNOWN')

  const humanAccuracy =
    source === 'BROWSER' && accuracy != null
      ? getHumanAccuracy(accuracy)
      : source === 'LANDMARK'
        ? {
            label: 'Approximate (Landmark)',
            tier: 'APPROXIMATE',
            color: 'amber',
            badgeClass: 'bg-amber-950/60 text-amber-300 border-amber-500/40',
            description: 'Approximate sector landmark fallback',
          }
        : {
            label: params.accuracyLabel || 'Unknown accuracy',
            tier: 'UNKNOWN',
            color: 'slate',
            badgeClass: 'bg-slate-800 text-slate-400 border-slate-700',
            description: 'Location not determined',
          }

  return {
    latitude,
    longitude,
    accuracy,
    timestamp,
    permission,
    source,
    accuracyTier: humanAccuracy.tier,
    accuracyLabel: humanAccuracy.label,
    accuracyBadgeClass: humanAccuracy.badgeClass,
    coordinates: formatCoordinates(latitude, longitude),
    address:
      params.address || (source === 'BROWSER' ? 'Current Device Location' : 'Unknown location'),
    landmarkName: params.landmarkName || null,
    isFallback: source === 'LANDMARK',
    error: params.error || null,
    status: params.status || (latitude ? 'ACTIVE' : 'IDLE'),
  }
}

/**
 * Create an explicit landmark fallback location model.
 * Never presents fallback coordinates as GPS.
 */
export const createLandmarkLocation = (landmark, currentPermission = 'DENIED') => {
  if (!landmark) return INITIAL_LOCATION_STATE
  return {
    latitude: landmark.latitude,
    longitude: landmark.longitude,
    accuracy: null, // Landmarks do not have GPS accuracy
    timestamp: Date.now(),
    permission: currentPermission,
    source: 'LANDMARK',
    accuracyTier: 'APPROXIMATE',
    accuracyLabel: 'Approximate (Landmark)',
    accuracyBadgeClass: 'bg-amber-950/60 text-amber-300 border-amber-500/40',
    coordinates: formatCoordinates(landmark.latitude, landmark.longitude),
    address: `${landmark.name}, ${landmark.address}`,
    landmarkName: landmark.name,
    isFallback: true,
    error: null,
    status: 'ACTIVE',
  }
}

/**
 * Query browser permissions for geolocation if supported.
 * @returns {Promise<'GRANTED' | 'DENIED' | 'PROMPT' | 'UNAVAILABLE'>}
 */
export const checkLocationPermission = async () => {
  if (typeof window === 'undefined' || !navigator?.permissions?.query) {
    return 'PROMPT'
  }

  try {
    const status = await navigator.permissions.query({ name: 'geolocation' })
    if (status.state === 'granted') return 'GRANTED'
    if (status.state === 'denied') return 'DENIED'
    return 'PROMPT'
  } catch {
    return 'PROMPT'
  }
}

/**
 * Acquire one-off user coordinates via browser Geolocation API.
 * Preferred for normal map browsing & reporting.
 * Handles permission denied, timeout, unavailable gracefully without throwing.
 *
 * @param {Object} options - GeolocationOptions override
 * @returns {Promise<{ success: boolean, model: Object, error: string | null }>}
 */
export const getCurrentLocation = async (options = {}) => {
  if (typeof window === 'undefined' || !navigator?.geolocation) {
    const errorMsg = 'Your browser cannot provide location right now.'
    return {
      success: false,
      error: errorMsg,
      model: createLocationModel({
        latitude: null,
        longitude: null,
        permission: 'UNAVAILABLE',
        source: 'UNKNOWN',
        error: errorMsg,
        status: 'UNAVAILABLE',
        address: errorMsg,
      }),
    }
  }

  return new Promise((resolve) => {
    let resolved = false

    const timeoutTimer = setTimeout(() => {
      if (resolved) return
      resolved = true
      const timeoutMsg = 'Location acquisition timed out. Please try again.'
      resolve({
        success: false,
        error: timeoutMsg,
        model: createLocationModel({
          latitude: null,
          longitude: null,
          permission: 'PROMPT',
          source: 'UNKNOWN',
          error: timeoutMsg,
          status: 'TIMEOUT',
          address: timeoutMsg,
        }),
      })
    }, options.timeout || 10000)

    navigator.geolocation.getCurrentPosition(
      (position) => {
        if (resolved) return
        resolved = true
        clearTimeout(timeoutTimer)

        const lat = position.coords.latitude
        const lng = position.coords.longitude
        const accuracy =
          typeof position.coords.accuracy === 'number' ? Math.round(position.coords.accuracy) : null
        const timestamp = position.timestamp || Date.now()

        const model = createLocationModel({
          latitude: lat,
          longitude: lng,
          accuracy,
          timestamp,
          permission: 'GRANTED',
          source: 'BROWSER',
          address: 'Current Device Location',
          status: 'ACTIVE',
        })

        resolve({
          success: true,
          error: null,
          model,
          // Legacy properties for backward compatibility during migration
          latitude: lat,
          longitude: lng,
          accuracyM: accuracy,
          accuracy: model.accuracyLabel,
          accuracyTier: model.accuracyTier,
          accuracyBadgeClass: model.accuracyBadgeClass,
          coordinates: model.coordinates,
          status: 'ACTIVE',
        })
      },
      (error) => {
        if (resolved) return
        resolved = true
        clearTimeout(timeoutTimer)

        let permission
        let status
        let errorMessage

        switch (error.code) {
          case 1:
          case error.PERMISSION_DENIED:
            permission = 'DENIED'
            status = 'DENIED'
            errorMessage = 'Location access is off.'
            break
          case 2:
          case error.POSITION_UNAVAILABLE:
            permission = 'UNAVAILABLE'
            status = 'UNAVAILABLE'
            errorMessage = 'Your browser cannot provide location right now.'
            break
          case 3:
          case error.TIMEOUT:
            permission = 'PROMPT'
            status = 'TIMEOUT'
            errorMessage = 'Location acquisition timed out.'
            break
          default:
            permission = 'UNAVAILABLE'
            status = 'ERROR'
            errorMessage = error.message || 'Location error occurred.'
        }

        const model = createLocationModel({
          latitude: null,
          longitude: null,
          permission,
          source: 'UNKNOWN',
          error: errorMessage,
          status,
          address: errorMessage,
        })

        resolve({
          success: false,
          error: errorMessage,
          model,
          // Legacy properties for backward compatibility
          latitude: null,
          longitude: null,
          accuracy: model.accuracyLabel,
          accuracyTier: model.accuracyTier,
          status,
        })
      },
      {
        enableHighAccuracy: true,
        timeout: options.timeout || 9000,
        maximumAge: options.maximumAge || 10000,
      }
    )
  })
}

/**
 * Emergency mode live location watcher.
 * ONLY invoked during active SOS mode.
 *
 * @param {Function} onUpdate - callback(locationModel)
 * @param {Function} onError - callback(errorData)
 * @param {Object} options - GeolocationOptions
 * @returns {Function} cleanup function to stop watching immediately
 */
export const watchEmergencyLocation = (onUpdate, onError, options = {}) => {
  if (typeof window === 'undefined' || !navigator?.geolocation) {
    if (onError) {
      onError({
        message: 'Your browser cannot provide location right now.',
        status: 'UNAVAILABLE',
        permission: 'UNAVAILABLE',
      })
    }
    return () => {}
  }

  let isActive = true

  const watchId = navigator.geolocation.watchPosition(
    (position) => {
      if (!isActive) return
      const lat = position.coords.latitude
      const lng = position.coords.longitude
      const accuracy =
        typeof position.coords.accuracy === 'number' ? Math.round(position.coords.accuracy) : null
      const timestamp = position.timestamp || Date.now()

      const model = createLocationModel({
        latitude: lat,
        longitude: lng,
        accuracy,
        timestamp,
        permission: 'GRANTED',
        source: 'BROWSER',
        address: 'Live Emergency Telemetry (Active SOS)',
        status: 'ACTIVE',
      })

      if (onUpdate) {
        onUpdate(model)
      }
    },
    (error) => {
      if (!isActive) return
      let permission
      let status
      let message

      if (error.code === 1) {
        permission = 'DENIED'
        status = 'DENIED'
        message = 'Location access is off.'
      } else if (error.code === 2) {
        permission = 'UNAVAILABLE'
        status = 'UNAVAILABLE'
        message = 'Your browser cannot provide location right now.'
      } else if (error.code === 3) {
        permission = 'PROMPT'
        status = 'TIMEOUT'
        message = 'Location telemetry acquisition timed out.'
      } else {
        permission = 'UNAVAILABLE'
        status = 'ERROR'
        message = error.message || 'Location error occurred.'
      }

      if (onError) {
        onError({
          code: error.code,
          message,
          status,
          permission,
        })
      }
    },
    {
      enableHighAccuracy: true,
      maximumAge: options.maximumAge || 4000,
      timeout: options.timeout || 10000,
    }
  )

  return () => {
    isActive = false
    try {
      navigator.geolocation.clearWatch(watchId)
    } catch {
      // Ignore clearWatch exceptions
    }
  }
}
