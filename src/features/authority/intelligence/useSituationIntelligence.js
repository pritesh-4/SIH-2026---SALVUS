import { useState, useEffect, useCallback } from 'react'
import { fetchHazards, fetchIncidentClusters, fetchSituationSummary } from '../../../services/api'

export const useSituationIntelligence = () => {
  const [situationSummary, setSituationSummary] = useState(null)
  const [liveHazards, setLiveHazards] = useState([])
  const [incidentClusters, setIncidentClusters] = useState([])
  const [isRefreshingSituation, setIsRefreshingSituation] = useState(false)
  const [dataProvenance, setDataProvenance] = useState('LIVE')

  const loadSituationIntelligence = useCallback(async () => {
    setIsRefreshingSituation(true)
    const isDemo =
      typeof window !== 'undefined' &&
      (window.location.search.includes('demo=true') ||
        localStorage.getItem('salvus_demo_mode') === 'true')

    if (isDemo) {
      setDataProvenance('SIMULATED')
    }

    try {
      const [sitRes, hzRes, clRes] = await Promise.all([
        fetchSituationSummary(),
        fetchHazards(),
        fetchIncidentClusters(),
      ])

      if (sitRes.success && sitRes.data) {
        setSituationSummary(sitRes.data)
        if (!isDemo) setDataProvenance('LIVE')
      } else if (!isDemo) {
        setDataProvenance('CACHED')
      }

      if (hzRes.success && hzRes.data) {
        setLiveHazards(hzRes.data)
      }
      if (clRes.success && clRes.data) {
        setIncidentClusters(clRes.data)
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
    dataProvenance,
    setDataProvenance,
    loadSituationIntelligence,
  }
}
