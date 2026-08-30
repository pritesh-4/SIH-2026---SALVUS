import { createContext, useState, useEffect, useCallback, useRef } from 'react'

import {
  INITIAL_LOCATION_STATE,
  getCurrentLocation,
  createLocationModel,
  createLandmarkLocation,
  watchEmergencyLocation,
  checkLocationPermission,
  LANDMARKS,
} from '../lib/location'

const LocationContext = createContext(null)

export const LocationProvider = ({ children }) => {
  const [location, setLocation] = useState(INITIAL_LOCATION_STATE)
  const [isAcquiring, setIsAcquiring] = useState(false)
  const [error, setError] = useState(null)
  const [recenterSignal, setRecenterSignal] = useState(0)
  const [isWatchingEmergency, setIsWatchingEmergency] = useState(false)

  const stopEmergencyWatchRef = useRef(null)
  const isMountedRef = useRef(true)
  const locationRef = useRef(location)
  const isAcquiringRef = useRef(false)
  const inFlightRequestRef = useRef(null)

  useEffect(() => {
    locationRef.current = location
  }, [location])

  useEffect(() => {
    isMountedRef.current = true
    return () => {
      isMountedRef.current = false
      if (stopEmergencyWatchRef.current) {
        stopEmergencyWatchRef.current()
        stopEmergencyWatchRef.current = null
      }
    }
  }, [])

  /**
   * Request one-off browser device coordinates.
   * Safe, non-throwing, returns normalized location model.
   * Deduplicates in-flight calls and maintains stable callback identity.
   */
  const requestLocation = useCallback(async (options = {}) => {
    // Join active in-flight request if already running
    if (inFlightRequestRef.current && !options.force) {
      return inFlightRequestRef.current
    }

    if (isAcquiringRef.current && !options.force) {
      return locationRef.current
    }

    isAcquiringRef.current = true
    setIsAcquiring(true)
    setError(null)

    const requestPromise = (async () => {
      try {
        const result = await getCurrentLocation(options)
        if (isMountedRef.current) {
          if (result.success && result.model) {
            locationRef.current = result.model
            setLocation(result.model)
            setError(null)
            // Trigger map recenter on successful initial location lock
            setRecenterSignal((s) => s + 1)
            return result.model
          } else {
            const fallbackModel = result.model || INITIAL_LOCATION_STATE
            locationRef.current = fallbackModel
            setLocation(fallbackModel)
            setError(result.error || 'Location access is off.')
            return fallbackModel
          }
        }
        return locationRef.current
      } catch {
        const fallbackModel = createLocationModel({
          latitude: null,
          longitude: null,
          permission: 'UNAVAILABLE',
          source: 'UNKNOWN',
          error: "Couldn't determine your location.",
          status: 'ERROR',
        })
        if (isMountedRef.current) {
          locationRef.current = fallbackModel
          setLocation(fallbackModel)
          setError("Couldn't determine your location.")
        }
        return fallbackModel
      } finally {
        if (isMountedRef.current) {
          setIsAcquiring(false)
        }
        isAcquiringRef.current = false
        inFlightRequestRef.current = null
      }
    })()

    inFlightRequestRef.current = requestPromise
    return requestPromise
  }, [])

  // Check initial browser permission on mount and auto-acquire if already GRANTED
  useEffect(() => {
    let permissionStatusObj = null

    checkLocationPermission().then((perm) => {
      if (!isMountedRef.current) return

      setLocation((prev) => {
        if (prev.source === 'UNKNOWN' && prev.latitude === null) {
          return {
            ...prev,
            permission: perm,
            status: perm === 'DENIED' ? 'DENIED' : 'IDLE',
            error: perm === 'DENIED' ? 'Location access is off.' : null,
          }
        }
        return prev
      })

      // If browser permission is already GRANTED, automatically acquire location
      if (perm === 'GRANTED') {
        requestLocation()
      }
    })

    // Listen for permission changes (e.g. user toggles in browser settings)
    if (typeof navigator !== 'undefined' && navigator.permissions?.query) {
      navigator.permissions
        .query({ name: 'geolocation' })
        .then((status) => {
          if (!isMountedRef.current) return
          permissionStatusObj = status
          status.onchange = () => {
            if (!isMountedRef.current) return
            const newPerm =
              status.state === 'granted'
                ? 'GRANTED'
                : status.state === 'denied'
                  ? 'DENIED'
                  : 'PROMPT'

            setLocation((prev) => {
              if (newPerm === 'DENIED' && prev.source === 'UNKNOWN') {
                return {
                  ...prev,
                  permission: 'DENIED',
                  status: 'DENIED',
                  error: 'Location access is off.',
                }
              }
              return {
                ...prev,
                permission: newPerm,
              }
            })

            if (newPerm === 'GRANTED' && locationRef.current.latitude === null) {
              requestLocation()
            }
          }
        })
        .catch(() => {
          // Permissions API query not supported / failed
        })
    }

    return () => {
      if (permissionStatusObj) {
        permissionStatusObj.onchange = null
      }
    }
  }, [requestLocation])

  /**
   * Explicitly select a landmark fallback location.
   * Sets source to 'LANDMARK' and isFallback to true.
   */
  const selectLandmark = useCallback((landmarkOrName) => {
    let landmarkObj
    if (typeof landmarkOrName === 'string') {
      landmarkObj =
        LANDMARKS.find((l) => l.name.toLowerCase() === landmarkOrName.toLowerCase()) || LANDMARKS[0]
    } else if (landmarkOrName && typeof landmarkOrName.latitude === 'number') {
      landmarkObj = landmarkOrName
    } else {
      landmarkObj = LANDMARKS[0]
    }

    const landmarkModel = createLandmarkLocation(landmarkObj, locationRef.current.permission)
    locationRef.current = landmarkModel
    setLocation(landmarkModel)
    setError(null)
    setRecenterSignal((s) => s + 1)
    return landmarkModel
  }, [])

  /**
   * Recenter map on current location signal
   */
  const recenterMap = useCallback(() => {
    setRecenterSignal((s) => s + 1)
  }, [])

  /**
   * Start controlled emergency continuous watcher.
   * ONLY invoked during active emergency SOS mode.
   */
  const startEmergencyWatch = useCallback(() => {
    if (stopEmergencyWatchRef.current) {
      stopEmergencyWatchRef.current()
      stopEmergencyWatchRef.current = null
    }

    setIsWatchingEmergency(true)

    stopEmergencyWatchRef.current = watchEmergencyLocation(
      (updatedModel) => {
        if (isMountedRef.current) {
          setLocation(updatedModel)
          setError(null)
        }
      },
      (err) => {
        if (isMountedRef.current) {
          setError(err.message || 'Emergency location update error.')
        }
      }
    )
  }, [])

  /**
   * Stop emergency continuous watcher.
   */
  const stopEmergencyWatch = useCallback(() => {
    if (stopEmergencyWatchRef.current) {
      stopEmergencyWatchRef.current()
      stopEmergencyWatchRef.current = null
    }
    if (isMountedRef.current) {
      setIsWatchingEmergency(false)
    }
  }, [])

  const value = {
    location,
    isAcquiring,
    error,
    recenterSignal,
    isWatchingEmergency,
    requestLocation,
    selectLandmark,
    recenterMap,
    startEmergencyWatch,
    stopEmergencyWatch,
  }

  return <LocationContext.Provider value={value}>{children}</LocationContext.Provider>
}

export { LocationContext }
export default LocationContext
