import { useState, useEffect, useCallback } from 'react'
import { fetchHazards, fetchIncidentClusters, fetchSituationSummary } from '../../../services/api'
import { isDemoModeActive } from '../incidents/useAuthorityIncidents'

export const useSituationIntelligence = () => {
  const [situationSummary, setSituationSummary] = useState(null)
  const [liveHazards, setLiveHazards] = useState([])
  const [incidentClusters, setIncidentClusters] = useState([])
  const [isRefreshingSituation, setIsRefreshingSituation] = useState(false)
  const [lastSynchronizedAt, setLastSynchronizedAt] = useState(null)
  const [dataProvenance, setDataProvenance] = useState(() =>
    isDemoModeActive() ? 'SIMULATED' : 'LIVE'
  )

  const loadSituationIntelligence = useCallback(async () => {
    setIsRefreshingSituation(true)
    const isDemo = isDemoModeActive()

    if (isDemo) {
      setDataProvenance('SIMULATED')
    }

    try {
      const [sitRes, hzRes, clRes] = await Promise.all([
        fetchSituationSummary(),
        fetchHazards(),
        fetchIncidentClusters(),
      ])

      const allSuccess = sitRes.success && hzRes.success && clRes.success
      const anySuccess = sitRes.success || hzRes.success || clRes.success

      if (sitRes.success && sitRes.data) {
        setSituationSummary(sitRes.data)
      } else {
        setSituationSummary(null)
      }

      if (hzRes.success && Array.isArray(hzRes.data)) {
        setLiveHazards(hzRes.data)
      } else {
        setLiveHazards([])
      }

      if (clRes.success && Array.isArray(clRes.data)) {
        setIncidentClusters(clRes.data)
      } else {
        setIncidentClusters([])
      }

      setLastSynchronizedAt(new Date().toISOString())

      if (isDemo) {
        setDataProvenance('SIMULATED')
      } else if (allSuccess) {
        setDataProvenance('LIVE')
      } else if (anySuccess) {
        setDataProvenance('PARTIAL')
      } else {
        setDataProvenance('UNAVAILABLE')
      }
    } finally {
      setIsRefreshingSituation(false)
    }
  }, [])

  useEffect(() => {
    let isMounted = true

    const init = async () => {
      if (isMounted) {
        await loadSituationIntelligence()
      }
    }
    init()

    return () => {
      isMounted = false
    }
  }, [loadSituationIntelligence])

  return {
    situationSummary,
    liveHazards,
    incidentClusters,
    isRefreshingSituation,
    lastSynchronizedAt,
    dataProvenance,
    setDataProvenance,
    loadSituationIntelligence,
  }
}

export default useSituationIntelligence
