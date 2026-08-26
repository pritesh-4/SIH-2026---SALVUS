import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { citizenAlertsData } from '../data/citizen/alerts.mock'
import { fetchHazards } from '../services/api'

export const CitizenAlerts = () => {
  const navigate = useNavigate()
  const [selectedFilter, setSelectedFilter] = useState('all')
  const [activeAlertDetail, setActiveAlertDetail] = useState(null)
  const [liveHazards, setLiveHazards] = useState([])
  const [lastUpdated, setLastUpdated] = useState('Live Feed')

  useEffect(() => {
    let isMounted = true
    const loadHazards = async () => {
      const result = await fetchHazards(22.5726, 88.3639, 10.0)
      if (isMounted && result.success && result.data && result.data.length > 0) {
        setLiveHazards(result.data)
        setLastUpdated('Updated just now')
      }
    }
    loadHazards()
    return () => {
      isMounted = false
    }
  }, [])

  const { alerts: mockAlerts } = citizenAlertsData

  // Merge live hazards into alerts feed
  const displayAlerts =
    liveHazards.length > 0
      ? liveHazards.map((hz) => ({
          id: hz.hazard_id,
          severity: hz.severity,
          status: `${hz.severity} ACTIVE`,
          title: hz.title,
          summary: hz.description,
          details: hz.why_it_matters,
          distance: `${hz.affected_radius_km} km radius`,
          timestamp: 'Live Feed',
          provenance: hz.data_provenance || 'LIVE',
          source: hz.source,
          affectedArea: 'Sector 12 & Salt Lake Drainage Basin',
          actions: [
            hz.recommended_action,
            'Monitor municipal emergency VHF / SMS broadcasts.',
            'Keep power banks charged and move essential supplies above ground level.',
          ],
          nearestSafeHaven: {
            name: 'Salt Lake Stadium Evacuation Hub',
            distance: '0.9 km',
            routeStatus: 'Safe Elevated Corridor',
          },
        }))
      : mockAlerts

  const filteredAlerts = displayAlerts.filter((a) => {
    if (selectedFilter === 'all') return true
    if (selectedFilter === 'critical') return a.severity === 'CRITICAL'
    if (selectedFilter === 'warning') return a.severity === 'WARNING'
    if (selectedFilter === 'watch') return a.severity === 'WATCH' || a.severity === 'INFO'
    return true
  })

  const criticalCount = displayAlerts.filter((a) => a.severity === 'CRITICAL').length
  const warningCount = displayAlerts.filter((a) => a.severity === 'WARNING').length
  const watchCount = displayAlerts.filter((a) =>
    ['WATCH', 'INFO', 'ADVISORY'].includes(a.severity)
  ).length

  const filters = [
    { id: 'all', label: 'All Alerts', count: displayAlerts.length },
    { id: 'critical', label: 'Critical Threats', count: criticalCount },
    { id: 'warning', label: 'Warnings', count: warningCount },
    { id: 'watch', label: 'Advisories & Watch', count: watchCount },
  ]

  const getBadgeClasses = (severity) => {
    switch (severity) {
      case 'CRITICAL':
        return 'bg-rose-950/40 text-rose-300 border-rose-500/40'
      case 'WARNING':
        return 'bg-amber-950/40 text-amber-300 border-amber-500/40'
      case 'WATCH':
        return 'bg-sky-950/40 text-sky-300 border-sky-500/40'
      default:
        return 'bg-slate-800 text-slate-300 border-slate-700'
    }
  }

  const getBorderAccent = (severity) => {
    switch (severity) {
      case 'CRITICAL':
        return 'border-l-4 border-l-rose-500'
      case 'WARNING':
        return 'border-l-4 border-l-amber-500'
      case 'WATCH':
        return 'border-l-4 border-l-sky-500'
      default:
        return 'border-l-4 border-l-slate-600'
    }
  }

  return (
    <div className="max-w-[1440px] w-full mx-auto px-4 sm:px-8 lg:px-12 py-6 sm:py-8 animate-fadeIn">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-slate-400">Safety advisories</span>
            <span className="h-1 w-1 rounded-full bg-slate-600"></span>
            <span className="text-xs text-rose-400 font-medium">
              {criticalCount} Critical active
            </span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-100 tracking-tight mt-1">
            Emergency Alerts & Advisories
          </h1>
        </div>

        {/* Live Source Status */}
        <div className="flex items-center gap-2 bg-[#0D141F] border border-[#1A2533] px-3.5 py-2 rounded-xl text-xs text-slate-300">
          <span className="h-2 w-2 rounded-full bg-emerald-500"></span>
          <span>Feed updated ({lastUpdated})</span>
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="flex items-center gap-2 overflow-x-auto pb-3 mb-6 no-scrollbar">
        {filters.map((f) => (
          <button
            key={f.id}
            type="button"
            onClick={() => setSelectedFilter(f.id)}
            className={`px-3.5 py-1.5 rounded-full text-xs font-semibold tracking-wide transition-all whitespace-nowrap cursor-pointer flex items-center gap-2 ${
              selectedFilter === f.id
                ? 'bg-slate-700 text-white shadow-sm'
                : 'bg-[#0D141F] border border-[#1A2533] text-slate-300 hover:text-white'
            }`}
          >
            <span>{f.label}</span>
            <span className="text-[10px] px-1.5 py-0.2 rounded-full font-mono bg-slate-900 text-slate-300">
              {f.count}
            </span>
          </button>
        ))}
      </div>

      {/* Alerts Feed List */}
      <div className="space-y-4">
        {filteredAlerts.map((alert) => (
          <article
            key={alert.id}
            onClick={() => setActiveAlertDetail(alert)}
            className={`bg-[#0D141F] border border-[#1A2533] ${getBorderAccent(
              alert.severity
            )} rounded-xl p-5 sm:p-6 transition-all duration-200 hover:border-[#27384C] hover:bg-[#121B27] cursor-pointer group`}
          >
            {/* Header: Severity & Location */}
            <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3 mb-2.5">
              <div className="flex items-center gap-2">
                <span
                  className={`px-2.5 py-0.5 rounded-full text-xs font-semibold border ${getBadgeClasses(
                    alert.severity
                  )}`}
                >
                  {alert.severity}
                </span>
                <span className="text-xs text-slate-400">· {alert.timestamp}</span>
              </div>

              <div className="flex items-center gap-1.5 text-xs text-slate-400">
                <span>📍</span>
                <span>{alert.distance}</span>
              </div>
            </div>

            {/* 1. WHAT HAPPENED */}
            <h2 className="text-base sm:text-lg font-bold text-slate-100 tracking-tight group-hover:text-sky-300 transition-colors">
              {alert.title}
            </h2>

            {/* 2. WHY IT MATTERS HERE */}
            <p className="text-xs sm:text-sm text-slate-300 mt-1.5 leading-relaxed font-normal">
              {alert.summary}
            </p>

            {/* 3. WHAT TO DO (Prominent Action Preview) */}
            <div className="mt-3.5 pt-3 border-t border-[#1A2533] flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
              <div className="flex items-center gap-2 text-slate-400">
                <span className="text-slate-500">Source:</span>
                <span className="truncate max-w-[280px] sm:max-w-md">{alert.source}</span>
              </div>
              <span className="text-sky-400 font-semibold flex items-center gap-1 group-hover:translate-x-0.5 transition-transform shrink-0">
                View recommended safety actions →
              </span>
            </div>
          </article>
        ))}
      </div>

      {/* Alert Detail Modal */}
      {activeAlertDetail && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="alert-detail-title"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fadeIn"
        >
          <div className="bg-[#0D141F] border border-[#1A2533] rounded-2xl max-w-xl w-full p-6 sm:p-8 shadow-2xl max-h-[90vh] overflow-y-auto relative">
            {/* Modal Top Bar */}
            <div className="flex items-center justify-between gap-3 mb-4">
              <span
                className={`px-3 py-0.5 rounded-full text-xs font-semibold border ${getBadgeClasses(
                  activeAlertDetail.severity
                )}`}
              >
                {activeAlertDetail.status}
              </span>
              <button
                type="button"
                onClick={() => setActiveAlertDetail(null)}
                className="text-slate-400 hover:text-white text-lg font-bold p-1 cursor-pointer"
              >
                ✕
              </button>
            </div>

            {/* Title & Area */}
            <h3
              id="alert-detail-title"
              className="text-xl sm:text-2xl font-extrabold text-slate-100 tracking-tight leading-snug"
            >
              {activeAlertDetail.title}
            </h3>
            <p className="text-xs text-slate-400 mt-1">
              Affecting area:{' '}
              <strong className="text-slate-200">{activeAlertDetail.affectedArea}</strong>
            </p>

            {/* Why It Matters (Explanation) */}
            <div className="bg-[#080C12] border border-[#182332] rounded-xl p-4 my-4 text-xs sm:text-sm text-slate-300 leading-relaxed font-normal">
              {activeAlertDetail.details}
            </div>

            {/* Recommended Safety Actions (What to do) */}
            <div className="mb-5">
              <h4 className="text-xs font-bold tracking-wide text-slate-200 uppercase mb-2.5">
                What you should do:
              </h4>
              <div className="space-y-2">
                {activeAlertDetail.actions.map((act, i) => (
                  <div
                    key={i}
                    className="flex items-start gap-2.5 text-xs text-slate-300 bg-[#121B27] p-2.5 rounded-lg border border-[#1A2533]"
                  >
                    <span className="text-sky-400 font-bold">✓</span>
                    <span>{act}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Safe Haven recommendation */}
            {activeAlertDetail.nearestSafeHaven && (
              <div className="bg-emerald-950/20 border border-emerald-500/30 rounded-xl p-3.5 mb-5 flex items-center justify-between gap-3">
                <div>
                  <span className="text-[10px] font-bold text-emerald-400 uppercase tracking-wider block">
                    Recommended Safe Shelter
                  </span>
                  <span className="text-xs font-bold text-slate-100">
                    {activeAlertDetail.nearestSafeHaven.name}
                  </span>
                  <span className="text-[11px] text-slate-400 block mt-0.5">
                    {activeAlertDetail.nearestSafeHaven.distance} ·{' '}
                    {activeAlertDetail.nearestSafeHaven.routeStatus}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => navigate('/citizen/map')}
                  className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs whitespace-nowrap cursor-pointer"
                >
                  View on map
                </button>
              </div>
            )}

            {/* Modal Actions */}
            <div className="flex flex-col sm:flex-row gap-3 pt-3 border-t border-[#1A2533]">
              <button
                type="button"
                onClick={() => navigate('/citizen/sos')}
                className="flex-1 py-2.5 px-4 rounded-xl bg-[#EF4444] hover:bg-rose-600 text-white font-bold text-xs tracking-wide transition-colors cursor-pointer text-center"
              >
                Request SOS evacuation
              </button>
              <button
                type="button"
                onClick={() => setActiveAlertDetail(null)}
                className="py-2.5 px-5 rounded-xl bg-[#1A2533] hover:bg-[#27384C] text-slate-200 font-semibold text-xs cursor-pointer"
              >
                Dismiss
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default CitizenAlerts
