import { useState, useEffect, useCallback, useMemo } from 'react'
import { fetchShelters, updateShelterOccupancy } from '../../../services/api'
import { authorityData } from '../../../data/authority/authorityMock'
import { subscribeToEvent } from '../../../lib/realtime/socket'
import { calculateDistanceKm } from '../incidents/incidentUtils'
import { isDemoModeActive } from '../incidents/useAuthorityIncidents'

export const useAuthorityShelters = ({ selectedIncident = null } = {}) => {
  const [liveShelters, setLiveShelters] = useState([])
  const [isLoadingShelters, setIsLoadingShelters] = useState(true)
  const [shelterDataMode, setShelterDataMode] = useState(() =>
    isDemoModeActive() ? 'SIMULATED' : 'LIVE'
  )
  const [lastSynchronizedAt, setLastSynchronizedAt] = useState(null)

  // ---------------------------------------------------------------------------
  // 1. Initial Load & Refresh (Enforce Server Truth)
  // ---------------------------------------------------------------------------
  const loadShelters = useCallback(async () => {
    setIsLoadingShelters(true)
    const isDemo = isDemoModeActive()
    const result = await fetchShelters()
    if (result.success && Array.isArray(result.data)) {
      setLiveShelters(result.data)
      setShelterDataMode(isDemo ? 'SIMULATED' : 'LIVE')
      setLastSynchronizedAt(new Date().toISOString())
    } else if (isDemo) {
      setLiveShelters(authorityData.shelters || [])
      setShelterDataMode('SIMULATED')
      setLastSynchronizedAt(new Date().toISOString())
    } else {
      setShelterDataMode((prevMode) => (prevMode === 'LIVE' ? 'STALE' : 'UNAVAILABLE'))
    }
    setIsLoadingShelters(false)
  }, [])

  useEffect(() => {
    let isMounted = true

    const init = async () => {
      await loadShelters()
    }
    if (isMounted) {
      init()
    }

    const handleShelter = (updatedShelter) => {
      setLiveShelters((prev) =>
        prev.map((s) => (s.id === updatedShelter.id ? { ...s, ...updatedShelter } : s))
      )
    }

    const unsub = subscribeToEvent('shelter.updated', handleShelter)

    return () => {
      isMounted = false
      unsub()
    }
  }, [loadShelters])

  // ---------------------------------------------------------------------------
  // 2. Computed Values
  // ---------------------------------------------------------------------------
  const totalBedsAvailable = useMemo(
    () => liveShelters.reduce((acc, s) => acc + (s.available_beds ?? s.availableBeds ?? 0), 0),
    [liveShelters]
  )

  const shelterMapPoints = useMemo(() => {
    return liveShelters
      .filter(
        (s) =>
          typeof s.latitude === 'number' &&
          typeof s.longitude === 'number' &&
          !isNaN(s.latitude) &&
          !isNaN(s.longitude)
      )
      .map((s) => ({
        id: s.id,
        name: s.name,
        address: s.address,
        lat: s.latitude,
        lng: s.longitude,
        capacity: `${s.available_beds ?? 0} beds free (${s.occupancy_rate || '0%'} occ)`,
        locationAvailable: true,
      }))
  }, [liveShelters])

  const candidateShelters = useMemo(() => {
    if (!selectedIncident || !liveShelters.length) return []

    const incLat = selectedIncident.latitude
    const incLon = selectedIncident.longitude
    const hasCoords =
      typeof incLat === 'number' && typeof incLon === 'number' && !isNaN(incLat) && !isNaN(incLon)

    return liveShelters
      .filter((s) => s.is_active && s.status !== 'CLOSED')
      .map((s) => {
        const hasShelterCoords =
          typeof s.latitude === 'number' &&
          typeof s.longitude === 'number' &&
          !isNaN(s.latitude) &&
          !isNaN(s.longitude)
        const distKm =
          hasCoords && hasShelterCoords
            ? calculateDistanceKm(incLat, incLon, s.latitude, s.longitude)
            : null
        const walkMin = distKm !== null ? Math.max(1, Math.ceil(distKm * 12)) : null
        return {
          ...s,
          distanceKm: distKm,
          walkMin,
        }
      })
      .sort((a, b) => {
        if (a.distanceKm === null) return 1
        if (b.distanceKm === null) return -1
        return a.distanceKm - b.distanceKm
      })
  }, [selectedIncident, liveShelters])

  // ---------------------------------------------------------------------------
  // 3. Actions
  // ---------------------------------------------------------------------------
  const adjustBeds = useCallback(async (shelterId, currentAvail, delta) => {
    const newAvail = Math.max(0, currentAvail + delta)
    const result = await updateShelterOccupancy(shelterId, newAvail)
    if (result.success && result.data) {
      setLiveShelters((prev) =>
        prev.map((s) => (s.id === shelterId ? { ...s, ...result.data } : s))
      )
    }
    return result
  }, [])

  return {
    liveShelters,
    setLiveShelters,
    isLoadingShelters,
    shelterDataMode,
    lastSynchronizedAt,
    totalBedsAvailable,
    shelterMapPoints,
    candidateShelters,
    adjustBeds,
    loadShelters,
  }
}

export default useAuthorityShelters
