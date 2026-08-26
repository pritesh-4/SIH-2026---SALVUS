import { useState, useEffect, useCallback, useMemo } from 'react'
import { fetchShelters, updateShelterOccupancy } from '../../../services/api'
import { authorityData } from '../../../data/authority/authorityMock'
import { subscribeToEvent } from '../../../lib/realtime/socket'
import { calculateDistanceKm } from '../incidents/incidentUtils'

export const useAuthorityShelters = ({ selectedIncident = null } = {}) => {
  const [liveShelters, setLiveShelters] = useState([])
  const [isLoadingShelters, setIsLoadingShelters] = useState(true)

  // ---------------------------------------------------------------------------
  // 1. Initial Load & Refresh
  // ---------------------------------------------------------------------------
  const loadShelters = useCallback(async () => {
    setIsLoadingShelters(true)
    const result = await fetchShelters()
    if (result.success && result.data && result.data.length > 0) {
      setLiveShelters(result.data)
    } else {
      setLiveShelters(authorityData.shelters || [])
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
    return liveShelters.map((s) => ({
      id: s.id,
      name: s.name,
      address: s.address,
      lat: s.latitude || 22.568,
      lng: s.longitude || 88.406,
      capacity: `${s.available_beds ?? 0} beds free (${s.occupancy_rate || '0%'} occ)`,
    }))
  }, [liveShelters])

  const candidateShelters = useMemo(() => {
    if (!selectedIncident || !liveShelters.length) return []

    const incLat = selectedIncident.latitude || 22.5726
    const incLon = selectedIncident.longitude || 88.3639

    return liveShelters
      .filter((s) => s.is_active && s.status !== 'CLOSED')
      .map((s) => {
        const distKm = calculateDistanceKm(incLat, incLon, s.latitude, s.longitude)
        const walkMin = Math.max(1, Math.ceil(distKm * 12))
        return {
          ...s,
          distanceKm: distKm,
          walkMin,
        }
      })
      .sort((a, b) => a.distanceKm - b.distanceKm)
      .slice(0, 2)
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
    totalBedsAvailable,
    shelterMapPoints,
    candidateShelters,
    adjustBeds,
    loadShelters,
  }
}
