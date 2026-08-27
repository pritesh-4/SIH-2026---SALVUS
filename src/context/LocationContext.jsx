import { createContext, useState, useEffect, useCallback, useRef } from 'react'

import {
  INITIAL_LOCATION_STATE,
  getCurrentLocation,
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

  // Check initial browser permission on mount without triggering an annoying prompt
  useEffect(() => {
    checkLocationPermission().then((perm) => {
      if (isMountedRef.current) {
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
      }
    })
  }, [])

  /**
   * Request one-off browser device coordinates.
   * Safe, non-throwing, returns normalized location model.
   */
  const requestLocation = useCallback(
    async (options = {}) => {
      if (isAcquiring) return location

      setIsAcquiring(true)
      setError(null)

      const result = await getCurrentLocation(options)

      if (isMountedRef.current) {
        setIsAcquiring(false)
        if (result.success && result.model) {
          setLocation(result.model)
          setError(null)
          // Trigger map recenter on successful initial location lock
          setRecenterSignal((s) => s + 1)
          return result.model
        } else {
          const fallbackModel = result.model || INITIAL_LOCATION_STATE
          setLocation(fallbackModel)
          setError(result.error || 'Location access is off.')
          return fallbackModel
        }
      }
      return location
    },
    [isAcquiring, location]
  )

  /**
   * Explicitly select a landmark fallback location.
   * Sets source to 'LANDMARK' and isFallback to true.
   */
  const selectLandmark = useCallback(
    (landmarkOrName) => {
      let landmarkObj
      if (typeof landmarkOrName === 'string') {
        landmarkObj =
          LANDMARKS.find((l) => l.name.toLowerCase() === landmarkOrName.toLowerCase()) ||
          LANDMARKS[0]
      } else if (landmarkOrName && typeof landmarkOrName.latitude === 'number') {
        landmarkObj = landmarkOrName
      } else {
        landmarkObj = LANDMARKS[0]
      }

      const landmarkModel = createLandmarkLocation(landmarkObj, location.permission)
      setLocation(landmarkModel)
      setError(null)
      setRecenterSignal((s) => s + 1)
      return landmarkModel
    },
    [location.permission]
  )

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
