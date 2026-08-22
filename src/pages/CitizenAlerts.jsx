import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { citizenAlertsData } from '../data/citizen/alerts.mock'

export const CitizenAlerts = () => {
  const navigate = useNavigate()
  const [selectedFilter, setSelectedFilter] = useState('all')
  const [activeAlertDetail, setActiveAlertDetail] = useState(null)

  const { summary, filters, alerts } = citizenAlertsData

  const filteredAlerts = alerts.filter((a) => {
    if (selectedFilter === 'all') return true
    if (selectedFilter === 'critical') return a.severity === 'CRITICAL'
    if (selectedFilter === 'warning') return a.severity === 'WARNING'
    if (selectedFilter === 'watch') return a.severity === 'WATCH' || a.severity === 'INFO'
    return true
  })

  const getBadgeClasses = (severity) => {
    switch (severity) {
      case 'CRITICAL':
        return 'bg-rose-500/20 text-rose-300 border-rose-500/40'
      case 'WARNING':
        return 'bg-amber-500/20 text-amber-300 border-amber-500/40'
      case 'WATCH':
        return 'bg-sky-500/20 text-sky-300 border-sky-500/40'
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
            <span className="text-xs font-bold tracking-widest text-slate-400 uppercase">
              HAZARD INTELLIGENCE
            </span>
            <span className="h-1.5 w-1.5 rounded-full bg-slate-600"></span>
            <span className="text-xs font-mono text-rose-400">
              {summary.criticalCount} Critical Threat Active
            </span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight mt-1">
            Emergency Alerts & Advisories
          </h1>
        </div>

        {/* Live Source Status */}
        <div className="flex items-center gap-2 bg-[#111A24] border border-[#1E293B] px-3.5 py-2 rounded-xl text-xs text-slate-300">
          <span className="h-2 w-2 rounded-full bg-emerald-500"></span>
          <span>Feed Synchronized ({summary.lastUpdated})</span>
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="flex items-center gap-2 overflow-x-auto pb-3 mb-6 no-scrollbar">
        {filters.map((f) => (
          <button
            key={f.id}
            type="button"
            onClick={() => setSelectedFilter(f.id)}
            className={`px-4 py-1.5 rounded-full text-xs font-semibold tracking-wide transition-all whitespace-nowrap cursor-pointer flex items-center gap-2 ${
              selectedFilter === f.id
                ? 'bg-rose-500 text-white shadow-md shadow-rose-950/50'
                : 'bg-[#111A24] border border-[#1E293B] text-slate-300 hover:text-white'
            }`}
          >
            <span>{f.label}</span>
            <span className="text-[10px] px-1.5 py-0.2 rounded-full font-mono bg-slate-950/30">
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
            className={`bg-[#111A24] border border-[#1E293B] ${getBorderAccent(
              alert.severity
            )} rounded-xl p-5 sm:p-6 transition-all duration-200 hover:border-slate-600 hover:bg-[#14202C] cursor-pointer group`}
          >
            <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3 mb-3">
              <div className="flex items-center gap-2">
                <span
                  className={`px-2.5 py-0.5 rounded-full text-[11px] font-extrabold tracking-wider uppercase border ${getBadgeClasses(
                    alert.severity
                  )}`}
                >
                  {alert.severity}
                </span>
                <span className="text-xs text-slate-400 font-medium">· {alert.timestamp}</span>
              </div>

              <div className="flex items-center gap-2 text-xs text-slate-400 font-mono">
                <span className="text-slate-500">📍</span>
                <span>{alert.distance}</span>
              </div>
            </div>

            <h2 className="text-base sm:text-lg font-bold text-white tracking-tight group-hover:text-cyan-300 transition-colors">
              {alert.title}
            </h2>
            <p className="text-xs sm:text-sm text-slate-300 mt-1.5 leading-relaxed">
              {alert.summary}
            </p>

            <div className="mt-4 pt-3 border-t border-[#1E293B] flex items-center justify-between text-xs text-slate-400">
              <span className="truncate max-w-[280px] sm:max-w-md">{alert.source}</span>
              <span className="text-cyan-400 font-semibold flex items-center gap-1 group-hover:translate-x-1 transition-transform">
                Read Safety Actions →
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
          <div className="bg-[#111A24] border border-[#1E293B] rounded-2xl max-w-xl w-full p-6 sm:p-8 shadow-2xl max-h-[90vh] overflow-y-auto relative">
            {/* Modal Top Bar */}
            <div className="flex items-center justify-between gap-3 mb-4">
              <span
                className={`px-3 py-1 rounded-full text-xs font-bold tracking-wider uppercase border ${getBadgeClasses(
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

            {/* Title & Meta */}
            <h3
              id="alert-detail-title"
              className="text-xl sm:text-2xl font-extrabold text-white tracking-tight leading-snug"
            >
              {activeAlertDetail.title}
            </h3>
            <p className="text-xs text-slate-400 mt-1">
              Affecting:{' '}
              <strong className="text-slate-200">{activeAlertDetail.affectedArea}</strong>
            </p>

            {/* Full Explanation */}
            <div className="bg-[#0B1118] border border-[#1E293B] rounded-xl p-4 my-4 text-xs sm:text-sm text-slate-300 leading-relaxed font-normal">
              {activeAlertDetail.details}
            </div>

            {/* Recommended Safety Actions */}
            <div className="mb-5">
              <h4 className="text-xs font-bold tracking-wider text-slate-200 uppercase mb-2.5">
                Recommended Actions:
              </h4>
              <div className="space-y-2">
                {activeAlertDetail.actions.map((act, i) => (
                  <div
                    key={i}
                    className="flex items-start gap-2.5 text-xs text-slate-300 bg-[#162230]/60 p-2.5 rounded-lg border border-[#1E293B]"
                  >
                    <span className="text-cyan-400 font-bold">✓</span>
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
                    Recommended Safe Haven
                  </span>
                  <span className="text-xs font-bold text-white">
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
                  View on Map
                </button>
              </div>
            )}

            {/* Modal Actions */}
            <div className="flex flex-col sm:flex-row gap-3 pt-3 border-t border-[#1E293B]">
              <button
                type="button"
                onClick={() => navigate('/citizen/sos')}
                className="flex-1 py-3 px-4 rounded-xl bg-[#EF4444] hover:bg-rose-600 text-white font-bold text-xs tracking-wider uppercase transition-colors cursor-pointer text-center"
              >
                Request Evacuation (SOS)
              </button>
              <button
                type="button"
                onClick={() => setActiveAlertDetail(null)}
                className="py-3 px-5 rounded-xl bg-[#1E293B] hover:bg-[#2A3B4E] text-slate-200 font-semibold text-xs tracking-wider uppercase cursor-pointer"
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
