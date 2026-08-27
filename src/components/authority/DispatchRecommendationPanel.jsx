import { useState } from 'react'
import {
  Navigation,
  Send,
  Clock,
  MapPin,
  Users,
  ChevronDown,
  ChevronUp,
  AlertCircle,
  RefreshCw,
} from 'lucide-react'
import { Card } from '../ui/Card'
import { Badge } from '../ui/Badge'
import { Button } from '../ui/Button'

/**
 * Recommended Response Dispatch Panel
 * Part 9: Plain English response recommendation with prominent [ ASSIGN UNIT ] action.
 */
export const DispatchRecommendationPanel = ({
  incident,
  topCandidate,
  alternatives = [],
  activeRoute = null,
  isLoading = false,
  onSelectRoute,
  onRequestAssign,
  onRefreshCandidates,
  isAssigning = false,
}) => {
  const [showFormulaBreakdown, setShowFormulaBreakdown] = useState(false)

  if (!incident) return null

  if (isLoading) {
    return (
      <Card padding="md" className="space-y-3">
        <div className="flex items-center justify-between border-b border-salvus-border pb-2">
          <span className="text-xs font-bold uppercase text-salvus-text-secondary">
            Recommended Response
          </span>
          <Badge variant="neutral" size="sm">
            Evaluating
          </Badge>
        </div>
        <div className="py-6 text-center space-y-2">
          <RefreshCw className="h-4 w-4 text-salvus-info animate-spin mx-auto" />
          <p className="text-xs text-salvus-text-secondary">
            Evaluating candidate units, distance & transit routes...
          </p>
        </div>
      </Card>
    )
  }

  if (!topCandidate) {
    return (
      <Card variant="warning" padding="md" className="space-y-3">
        <div className="flex items-center justify-between border-b border-salvus-warning-border pb-2">
          <div className="flex items-center gap-1.5 text-salvus-warning font-bold text-xs">
            <AlertCircle className="h-3.5 w-3.5" />
            <span>No Available Unit in Range</span>
          </div>
          <Badge variant="warning" size="sm">
            Standby
          </Badge>
        </div>

        <div className="py-2 text-center space-y-2 text-xs">
          <p className="text-salvus-text-secondary">
            All fleet rescue units are currently committed or outside the immediate sector.
          </p>
          {onRefreshCandidates && (
            <Button
              variant="secondary"
              size="sm"
              onClick={onRefreshCandidates}
              leftIcon={<RefreshCw className="h-3.5 w-3.5" />}
              className="mx-auto"
            >
              Refresh Fleet Status
            </Button>
          )}
        </div>
      </Card>
    )
  }

  const breakdown = topCandidate.explanation?.breakdown || {}
  const isSelectedForRoute =
    activeRoute?.responderId === topCandidate.id ||
    activeRoute?.label?.includes(topCandidate.unit_name || topCandidate.unitName || '')

  return (
    <Card padding="sm" className="space-y-3">
      {/* Section Header */}
      <div className="flex items-center justify-between border-b border-salvus-border pb-2">
        <div className="flex items-center gap-1.5">
          <Badge variant="info" dot={true}>
            RECOMMENDED RESPONSE
          </Badge>
        </div>
        <span className="text-xs text-salvus-text-muted">
          Match Score:{' '}
          <strong className="text-salvus-text-primary">
            {topCandidate.match_score ?? topCandidate.matchScore}/100
          </strong>
        </span>
      </div>

      {/* Primary Recommended Unit */}
      <div className="bg-salvus-surface-elevated border border-salvus-border-strong p-3.5 rounded-xl space-y-3">
        {/* Unit Headline */}
        <div className="flex items-start justify-between gap-2">
          <div>
            <h4 className="text-sm font-bold text-salvus-text-primary">
              {topCandidate.unit_name || topCandidate.unitName}
            </h4>
            <p className="text-xs text-salvus-text-secondary mt-0.5">
              {topCandidate.team_lead && `Lead: ${topCandidate.team_lead} · `}
              {topCandidate.vehicle_type || 'Rescue Craft'} (
              {topCandidate.capability?.replace('_', ' ') || 'General'})
            </p>
          </div>

          <Badge variant="safe" size="sm">
            {topCandidate.status || 'AVAILABLE'}
          </Badge>
        </div>

        {/* 4-Metric Grid */}
        <div className="grid grid-cols-4 gap-1.5 p-2 bg-salvus-muted/40 rounded-lg border border-salvus-border text-xs">
          <div>
            <span className="text-[10px] text-salvus-text-muted uppercase block">Distance</span>
            <div className="flex items-center gap-1 font-bold text-salvus-text-primary">
              <MapPin className="h-3 w-3 text-salvus-info shrink-0" />
              <span>{topCandidate.distance_km ?? topCandidate.distanceKm ?? 1.2} km</span>
            </div>
          </div>

          <div>
            <span className="text-[10px] text-salvus-text-muted uppercase block">Est. ETA</span>
            <div className="flex items-center gap-1 font-bold text-salvus-info">
              <Clock className="h-3 w-3 text-salvus-info shrink-0" />
              <span>{topCandidate.eta_formatted || topCandidate.etaFormatted || '5 min'}</span>
            </div>
          </div>

          <div>
            <span className="text-[10px] text-salvus-text-muted uppercase block">Capacity</span>
            <span className="font-semibold text-salvus-text-primary truncate block">
              {topCandidate.max_capacity ?? 6} Persons
            </span>
          </div>

          <div>
            <span className="text-[10px] text-salvus-text-muted uppercase block">Crew Load</span>
            <div className="flex items-center gap-1 text-salvus-text-secondary">
              <Users className="h-3 w-3 text-salvus-text-muted shrink-0" />
              <span>{topCandidate.current_load ?? 0}</span>
            </div>
          </div>
        </div>

        {/* Why Reason */}
        <div className="p-2.5 bg-salvus-muted/30 rounded-lg border border-salvus-border space-y-1 text-xs">
          <span className="text-[11px] font-bold text-salvus-text-primary block">
            Why this unit:
          </span>
          <div className="space-y-1">
            {topCandidate.explanation?.positive_factors?.slice(0, 2).map((bullet, idx) => (
              <div key={idx} className="text-salvus-safe-text flex items-start gap-1.5">
                <span className="shrink-0 font-bold">✓</span>
                <span>{bullet.replace(/^[✓\s]+/, '')}</span>
              </div>
            ))}
            {!topCandidate.explanation?.positive_factors?.length && (
              <div className="text-salvus-text-secondary">
                ✓ Compatible equipment capability & optimal transit corridor
              </div>
            )}
          </div>
        </div>

        {/* Audit Formula Accordion */}
        <div>
          <button
            type="button"
            onClick={() => setShowFormulaBreakdown((prev) => !prev)}
            className="w-full flex items-center justify-between text-xs text-salvus-info hover:underline py-1 cursor-pointer"
          >
            <span className="flex items-center gap-1">
              {showFormulaBreakdown ? (
                <ChevronUp className="h-3.5 w-3.5" />
              ) : (
                <ChevronDown className="h-3.5 w-3.5" />
              )}
              <span>{showFormulaBreakdown ? 'Hide Match Breakdown' : 'View Match Breakdown'}</span>
            </span>
          </button>

          {showFormulaBreakdown && (
            <div className="mt-1.5 p-2 bg-salvus-muted/40 rounded-lg border border-salvus-border text-xs space-y-1 text-salvus-text-secondary">
              <div className="flex justify-between">
                <span>Capability Match (Max 30):</span>
                <span className="font-bold text-salvus-text-primary">
                  {breakdown.capability_score ?? 30} pts
                </span>
              </div>
              <div className="flex justify-between">
                <span>Operational Readiness (Max 20):</span>
                <span className="font-bold text-salvus-text-primary">
                  {breakdown.availability_score ?? 20} pts
                </span>
              </div>
              <div className="flex justify-between">
                <span>Spatial Proximity (Max 15):</span>
                <span className="font-bold text-salvus-text-primary">
                  {breakdown.distance_score ?? 15} pts
                </span>
              </div>
              <div className="flex justify-between">
                <span>Transit ETA (Max 15):</span>
                <span className="font-bold text-salvus-text-primary">
                  {breakdown.eta_score ?? 12} pts
                </span>
              </div>
              <div className="flex justify-between border-t border-salvus-border pt-1 font-bold text-salvus-text-primary">
                <span>Total Match:</span>
                <span className="text-salvus-safe">{topCandidate.match_score ?? 87} / 100</span>
              </div>
            </div>
          )}
        </div>

        {/* Action Buttons */}
        <div className="grid grid-cols-2 gap-2 pt-1">
          <Button
            variant="secondary"
            size="md"
            onClick={() => onSelectRoute?.(topCandidate)}
            leftIcon={<Navigation className="h-3.5 w-3.5 text-salvus-info" />}
            className="text-xs font-semibold"
          >
            {isSelectedForRoute ? 'Route Active' : 'View Route'}
          </Button>

          <Button
            variant="primary"
            size="md"
            disabled={isAssigning || topCandidate.status === 'OFFLINE'}
            onClick={() => onRequestAssign?.(topCandidate)}
            leftIcon={<Send className="h-3.5 w-3.5" />}
            className="text-xs font-bold"
          >
            {isAssigning ? 'Assigning...' : 'Assign Unit'}
          </Button>
        </div>
      </div>

      {/* Alternatives */}
      {alternatives.length > 0 && (
        <div className="space-y-2 pt-2 border-t border-salvus-border">
          <span className="text-xs font-semibold text-salvus-text-secondary block">
            Alternative Available Units ({alternatives.length})
          </span>

          <div className="space-y-1.5">
            {alternatives.slice(0, 3).map((alt, idx) => {
              const isAltRouteActive =
                activeRoute?.responderId === alt.id ||
                activeRoute?.label?.includes(alt.unit_name || alt.unitName || '')

              return (
                <div
                  key={alt.id}
                  className="p-2 bg-salvus-muted/30 border border-salvus-border rounded-lg flex items-center justify-between gap-2 text-xs"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span className="text-[10px] font-bold text-salvus-text-muted">
                        #{idx + 2}
                      </span>
                      <strong className="text-salvus-text-primary truncate">
                        {alt.unit_name || alt.unitName}
                      </strong>
                    </div>
                    <p className="text-[11px] text-salvus-text-secondary truncate">
                      {alt.vehicle_type || 'Craft'} · {alt.distance_km ?? alt.distanceKm ?? 2.1} km
                      · ETA {alt.eta_formatted || alt.etaFormatted || '8 min'}
                    </p>
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      type="button"
                      onClick={() => onSelectRoute?.(alt)}
                      title="View route corridor on map"
                      className={`p-1.5 rounded-lg border text-xs cursor-pointer transition-colors ${
                        isAltRouteActive
                          ? 'bg-salvus-info-bg border-salvus-info-border text-salvus-info'
                          : 'bg-salvus-surface border-salvus-border text-salvus-text-secondary hover:text-salvus-text-primary'
                      }`}
                    >
                      <Navigation className="h-3 w-3" />
                    </button>

                    <Button
                      variant="secondary"
                      size="sm"
                      disabled={isAssigning || alt.status === 'OFFLINE'}
                      onClick={() => onRequestAssign?.(alt)}
                      className="text-xs"
                    >
                      Assign
                    </Button>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </Card>
  )
}

export default DispatchRecommendationPanel
