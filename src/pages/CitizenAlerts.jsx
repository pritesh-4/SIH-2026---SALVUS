import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { citizenAlertsData } from '../data/citizen/alerts.mock'
import { fetchHazards } from '../services/api'
import { Card } from '../components/ui/Card'
import { Badge } from '../components/ui/Badge'
import { Button } from '../components/ui/Button'
import { StatusIndicator } from '../components/ui/StatusIndicator'

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
        setLastUpdated('Just now')
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
            'Monitor official emergency broadcasts.',
            'Keep power banks charged and move supplies above ground level.',
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
    { id: 'watch', label: 'Advisories', count: watchCount },
  ]

  const getCardVariant = (severity) => {
    switch (severity) {
      case 'CRITICAL':
        return 'critical'
      case 'WARNING':
        return 'warning'
      case 'WATCH':
      case 'INFO':
        return 'info'
      default:
        return 'default'
    }
  }

  const getBadgeVariant = (severity) => {
    switch (severity) {
      case 'CRITICAL':
        return 'critical'
      case 'WARNING':
        return 'warning'
      case 'WATCH':
      case 'INFO':
        return 'info'
      default:
        return 'neutral'
    }
  }

  return (
    <div className="max-w-[1440px] w-full mx-auto px-4 sm:px-8 lg:px-12 py-6 sm:py-8 animate-fadeIn">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-salvus-text-secondary">
              Safety Advisories
            </span>
            <span className="h-1 w-1 rounded-full bg-salvus-border-strong"></span>
            <span className="text-xs text-salvus-critical font-medium">
              {criticalCount} Critical active
            </span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-salvus-text-primary tracking-tight mt-0.5">
            Emergency Alerts & Advisories
          </h1>
        </div>

        <StatusIndicator status="safe" label={`Feed updated ${lastUpdated}`} showDot={true} />
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
                ? 'bg-salvus-text-primary text-salvus-bg shadow-xs'
                : 'bg-salvus-surface border border-salvus-border text-salvus-text-secondary hover:text-salvus-text-primary'
            }`}
          >
            <span>{f.label}</span>
            <span
              className={`text-[10px] px-1.5 py-0.2 rounded-full font-bold ${
                selectedFilter === f.id
                  ? 'bg-salvus-bg/20 text-salvus-bg'
                  : 'bg-salvus-muted text-salvus-text-muted'
              }`}
            >
              {f.count}
            </span>
          </button>
        ))}
      </div>

      {/* Alerts Feed List */}
      <div className="space-y-4">
        {filteredAlerts.map((alert) => (
          <Card
            key={alert.id}
            variant={getCardVariant(alert.severity)}
            padding="md"
            onClick={() => setActiveAlertDetail(alert)}
            className="cursor-pointer transition-all hover:border-salvus-border-strong"
          >
            {/* Header: Severity & Location */}
            <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-2.5 mb-2">
              <div className="flex items-center gap-2">
                <Badge variant={getBadgeVariant(alert.severity)} dot={true}>
                  {alert.severity}
                </Badge>
                <span className="text-xs text-salvus-text-muted">· {alert.timestamp}</span>
              </div>

              <div className="flex items-center gap-1.5 text-xs text-salvus-text-muted">
                <span>📍</span>
                <span>{alert.distance}</span>
              </div>
            </div>

            {/* 1. WHAT HAPPENED */}
            <h2 className="text-base sm:text-lg font-bold text-salvus-text-primary tracking-tight">
              {alert.title}
            </h2>

            {/* 2. WHY IT MATTERS */}
            <p className="text-xs sm:text-sm text-salvus-text-secondary mt-1 leading-relaxed">
              {alert.summary}
            </p>

            {/* 3. WHAT TO DO Preview */}
            <div className="mt-3.5 pt-3 border-t border-salvus-border flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
              <div className="flex items-center gap-2 text-salvus-text-muted truncate">
                <span>Source:</span>
                <span className="truncate max-w-[280px] sm:max-w-md">{alert.source}</span>
              </div>
              <span className="text-salvus-info font-semibold flex items-center gap-1 shrink-0">
                View recommended safety actions →
              </span>
            </div>
          </Card>
        ))}
      </div>

      {/* Detailed Alert Modal with 3-Part Guidance */}
      {activeAlertDetail && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="alert-modal-title"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-xs animate-fadeIn"
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setActiveAlertDetail(null)
            }
          }}
        >
          <div className="bg-salvus-surface border border-salvus-border rounded-2xl max-w-xl w-full p-6 sm:p-7 shadow-2xl relative text-salvus-text-primary max-h-[85vh] overflow-y-auto">
            {/* Header */}
            <div className="flex items-center justify-between gap-3 mb-4 pb-3 border-b border-salvus-border">
              <div className="flex items-center gap-2">
                <Badge variant={getBadgeVariant(activeAlertDetail.severity)} dot={true}>
                  {activeAlertDetail.severity}
                </Badge>
                <span className="text-xs text-salvus-text-muted">{activeAlertDetail.distance}</span>
              </div>
              <button
                type="button"
                onClick={() => setActiveAlertDetail(null)}
                aria-label="Close advisory"
                className="text-salvus-text-muted hover:text-salvus-text-primary text-base font-bold p-1 cursor-pointer select-none"
              >
                ✕
              </button>
            </div>

            {/* 1. WHAT HAPPENED */}
            <div>
              <span className="text-xs font-bold text-salvus-text-muted uppercase tracking-wider block">
                What Happened
              </span>
              <h2
                id="alert-modal-title"
                className="text-xl font-bold text-salvus-text-primary tracking-tight mt-0.5"
              >
                {activeAlertDetail.title}
              </h2>
            </div>

            {/* 2. WHY IT MATTERS */}
            <div className="mt-4 bg-salvus-muted/40 border border-salvus-border rounded-xl p-3.5">
              <span className="text-xs font-bold text-salvus-text-primary uppercase block mb-1">
                Why It Matters
              </span>
              <p className="text-xs sm:text-sm text-salvus-text-secondary leading-relaxed">
                {activeAlertDetail.details || activeAlertDetail.summary}
              </p>
            </div>

            {/* 3. WHAT TO DO */}
            <div className="mt-4">
              <span className="text-xs font-bold text-salvus-text-primary uppercase tracking-wider block mb-2">
                What You Should Do
              </span>
              <div className="space-y-2">
                {activeAlertDetail.actions?.map((act, idx) => (
                  <div
                    key={idx}
                    className="bg-salvus-safe-bg border border-salvus-safe-border rounded-xl p-3 flex items-start gap-2.5 text-xs text-salvus-safe-text"
                  >
                    <span className="font-bold shrink-0">{idx + 1}.</span>
                    <span className="font-medium leading-relaxed">{act}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Safe Destination Callout */}
            {activeAlertDetail.nearestSafeHaven && (
              <div className="mt-4 p-3.5 bg-salvus-surface-elevated border border-salvus-border rounded-xl flex items-center justify-between gap-3">
                <div>
                  <span className="text-[11px] text-salvus-text-muted block font-semibold">
                    Recommended Safe Place
                  </span>
                  <strong className="text-xs sm:text-sm text-salvus-text-primary">
                    {activeAlertDetail.nearestSafeHaven.name}
                  </strong>
                  <span className="text-xs text-salvus-safe block mt-0.5">
                    {activeAlertDetail.nearestSafeHaven.distance} ·{' '}
                    {activeAlertDetail.nearestSafeHaven.routeStatus}
                  </span>
                </div>
                <Button
                  variant="safe"
                  size="sm"
                  onClick={() => {
                    setActiveAlertDetail(null)
                    navigate('/citizen/map')
                  }}
                  className="shrink-0"
                >
                  View Route
                </Button>
              </div>
            )}

            {/* Source & Actions */}
            <div className="mt-6 pt-4 border-t border-salvus-border flex flex-col sm:flex-row items-center justify-between gap-3">
              <span className="text-xs text-salvus-text-muted truncate">
                Source: {activeAlertDetail.source}
              </span>
              <Button
                variant="secondary"
                size="md"
                onClick={() => setActiveAlertDetail(null)}
                className="w-full sm:w-auto"
              >
                Close Advisory
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default CitizenAlerts
