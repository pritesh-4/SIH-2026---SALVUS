import { useState, useEffect } from 'react'
import {
  Navigation,
  Send,
  Clock,
  MapPin,
  Users,
  Shield,
  Activity,
  ChevronDown,
  ChevronUp,
  AlertCircle,
  RefreshCw,
  CheckCircle2,
  ArrowRight,
  Zap,
} from 'lucide-react'
import { Card } from '../ui/Card'
import { Badge } from '../ui/Badge'
import { Button } from '../ui/Button'

/**
 * Recommended Response Dispatch Panel (Pass 4C - Dynamic Intelligence Decision Hub)
 *
 * Operational dispatch decision hub:
 * - Highlights recommended response unit with capability, Estimated ETA, distance, crew load, match score
 * - Plain fact-based reason why recommended ("WHY THIS UNIT?")
 * - Dynamic recommendation shift detection when assigned incident has a superior alternative
 * - Compact visual score factor breakdown (6 factors summing to 100)
 * - Tradeoff presentation for alternative candidates with comparative reasons
 * - Freshness timestamp & stale recommendation alert
 * - Direct [ PREVIEW ROUTE ], [ ASSIGN ], and [ REVIEW REASSIGNMENT ] actions
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
  recommendationShift = null,
  onDismissRecommendationShift,
  onReviewReassign,
  isAssigning = false,
}) => {
  const [showFormulaBreakdown, setShowFormulaBreakdown] = useState(false)
  const [now, setNow] = useState(Date.now)

  // Periodic tick to refresh relative elapsed time
  useEffect(() => {
    const interval = setInterval(() => {
      setNow(Date.now())
    }, 5000)
    return () => clearInterval(interval)
  }, [])

  const secondsAgo = topCandidate?.calculated_at
    ? Math.max(0, Math.floor((now - new Date(topCandidate.calculated_at).getTime()) / 1000))
    : 0

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
          <p className="text-xs text-salvus-text-secondary font-medium">
            Evaluating candidate units, spatial proximity & transit corridors...
          </p>
        </div>
      </Card>
    )
  }

  if (!topCandidate) {
    return (
      <Card variant="warning" padding="md" className="space-y-3 shadow-2xs">
        <div className="flex items-center justify-between border-b border-salvus-warning-border pb-2">
          <div className="flex items-center gap-1.5 text-salvus-warning font-bold text-xs">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>No Suitable Responder Available</span>
          </div>
          <Badge variant="warning" size="sm">
            Standby
          </Badge>
        </div>

        <div className="space-y-2 text-xs">
          <p className="text-salvus-text-secondary leading-relaxed font-medium">
            No active unit currently meets all operational readiness and safety criteria in this
            sector.
          </p>

          <div className="bg-salvus-muted/40 p-2.5 rounded-lg border border-salvus-border space-y-1 text-salvus-text-muted text-[11px]">
            <span className="font-semibold text-salvus-text-primary block">
              Evaluation Criteria Checked:
            </span>
            <div className="flex items-center gap-1.5">
              <span className="text-salvus-warning">⚠</span>
              <span>
                Available units with matching equipment for{' '}
                <strong>{incident.type?.replace('_', ' ') || 'disaster'}</strong>
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-salvus-warning">⚠</span>
              <span>Units within operational transit radius (&lt;25 km)</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-salvus-warning">⚠</span>
              <span>Units not already committed to active rescue missions</span>
            </div>
          </div>

          {onRefreshCandidates && (
            <Button
              variant="secondary"
              size="sm"
              fullWidth={true}
              onClick={onRefreshCandidates}
              leftIcon={<RefreshCw className="h-3.5 w-3.5" />}
              className="text-xs font-semibold mt-1"
            >
              Refresh Fleet Feeds
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

  const isStale = secondsAgo > 90

  // Format workload label
  const getWorkloadLabel = (load, maxCap) => {
    if (load == null && maxCap == null) return { text: 'Workload unavailable', variant: 'neutral' }
    if (maxCap == null) return { text: `Load: ${load ?? 0}`, variant: 'neutral' }
    const l = load ?? 0
    const ratio = l / maxCap
    if (ratio === 0) return { text: `Low (0/${maxCap} in use)`, variant: 'safe' }
    if (ratio <= 0.5) return { text: `Moderate (${l}/${maxCap} in use)`, variant: 'info' }
    return { text: `High (${l}/${maxCap} in use)`, variant: 'warning' }
  }

  const workloadInfo = getWorkloadLabel(topCandidate.current_load, topCandidate.max_capacity)

  return (
    <Card padding="sm" className="space-y-3 shadow-2xs">
      {/* Header & Freshness Notice */}
      <div className="flex items-center justify-between border-b border-salvus-border pb-2">
        <div className="flex items-center gap-1.5">
          <Badge variant="info" dot={true}>
            RECOMMENDED RESPONDER
          </Badge>
          {secondsAgo > 0 && (
            <span className="text-[10px] text-salvus-text-muted font-mono">
              {secondsAgo < 60 ? `${secondsAgo}s ago` : `${Math.floor(secondsAgo / 60)}m ago`}
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          <span className="text-xs text-salvus-text-muted">
            Score:{' '}
            <strong className="text-salvus-safe font-mono text-sm">
              {topCandidate.match_score != null
                ? `${topCandidate.match_score}/100`
                : topCandidate.matchScore != null
                  ? `${topCandidate.matchScore}/100`
                  : 'Score unlisted'}
            </strong>
          </span>

          {onRefreshCandidates && (
            <button
              type="button"
              onClick={onRefreshCandidates}
              title="Refresh recommendations"
              className="text-salvus-text-muted hover:text-salvus-text-primary p-1 rounded-md transition-colors cursor-pointer select-none"
            >
              <RefreshCw className="h-3 w-3" />
            </button>
          )}
        </div>
      </div>

      {/* DYNAMIC RECOMMENDATION SHIFT ALERT (Pass 4C) */}
      {recommendationShift && (
        <div className="p-3 bg-salvus-info-bg/70 border border-salvus-info-border rounded-xl space-y-2 text-xs animate-fadeIn">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5 font-bold text-salvus-info text-xs">
              <Zap className="h-4 w-4 shrink-0" />
              <span>Dynamic Recommendation Update</span>
            </div>
            <Badge variant="info" size="sm">
              Change Detected
            </Badge>
          </div>

          <p className="text-salvus-text-primary text-[11px] font-medium leading-relaxed">
            {recommendationShift.reason}
          </p>

          {/* Current vs New Side-by-Side Comparison */}
          <div className="grid grid-cols-2 gap-2 p-2 bg-salvus-surface rounded-lg border border-salvus-border text-[11px]">
            <div className="border-r border-salvus-border pr-2">
              <span className="text-[10px] text-salvus-text-muted uppercase block font-semibold">
                Current Unit
              </span>
              <strong className="text-salvus-text-secondary truncate block">
                {recommendationShift.currentResponder.unit_name}
              </strong>
              <span className="text-salvus-text-muted font-mono text-[10px]">
                ETA ~{recommendationShift.currentEtaFormatted}
              </span>
            </div>

            <div>
              <span className="text-[10px] text-salvus-info uppercase block font-semibold">
                New Recommended
              </span>
              <strong className="text-salvus-text-primary truncate block font-bold">
                {recommendationShift.newCandidate.unit_name}
              </strong>
              <span className="text-salvus-safe font-mono text-[10px] font-bold">
                ETA ~{recommendationShift.newEtaFormatted} (
                {recommendationShift.etaDeltaMinutes > 0
                  ? `-${recommendationShift.etaDeltaMinutes}m`
                  : 'faster'}
                )
              </span>
            </div>
          </div>

          {/* Authority Confirmation Actions */}
          <div className="flex items-center justify-end gap-2 pt-1">
            {onDismissRecommendationShift && (
              <Button
                variant="quiet"
                size="sm"
                onClick={onDismissRecommendationShift}
                className="text-[11px]"
              >
                Keep Current
              </Button>
            )}

            <Button
              variant="primary"
              size="sm"
              onClick={() => onReviewReassign?.(recommendationShift.newCandidate)}
              rightIcon={<ArrowRight className="h-3 w-3" />}
              className="text-[11px] font-bold shadow-xs"
            >
              Review Reassignment
            </Button>
          </div>
        </div>
      )}

      {/* Stale Warning Banner (if data is older than threshold) */}
      {isStale && !recommendationShift && (
        <div className="bg-salvus-warning-bg border border-salvus-warning-border p-2 rounded-lg flex items-center justify-between text-[11px] text-salvus-warning-text animate-fadeIn">
          <span>⚠️ Recommendation may have changed. Unit coordinates or status updated.</span>
          {onRefreshCandidates && (
            <button
              type="button"
              onClick={onRefreshCandidates}
              className="font-bold underline cursor-pointer hover:opacity-80 shrink-0 ml-2"
            >
              Refresh
            </button>
          )}
        </div>
      )}

      {/* Primary Recommended Unit Card */}
      <div className="bg-salvus-surface-elevated border border-salvus-border-strong p-3.5 rounded-xl space-y-3 shadow-xs">
        {/* Unit Headline */}
        <div className="flex items-start justify-between gap-2">
          <div>
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] font-bold text-salvus-info uppercase tracking-wider font-mono">
                #1 Recommended
              </span>
            </div>
            <h4 className="text-sm font-extrabold text-salvus-text-primary tracking-tight mt-0.5">
              {topCandidate.unit_name || topCandidate.unitName}
            </h4>
            <p className="text-xs text-salvus-text-secondary mt-0.5 font-medium">
              {topCandidate.team_lead && `Lead: ${topCandidate.team_lead} · `}
              {topCandidate.vehicle_type || 'Vehicle unlisted'}
            </p>
          </div>

          <Badge variant={topCandidate.status === 'AVAILABLE' ? 'safe' : 'info'} size="sm">
            {topCandidate.status || 'Status unlisted'}
          </Badge>
        </div>

        {/* 6-Metric Operational Grid */}
        <div className="grid grid-cols-3 gap-1.5 p-2 bg-salvus-muted/40 rounded-lg border border-salvus-border text-xs">
          <div>
            <span className="text-[10px] text-salvus-text-muted uppercase font-semibold block">
              Est. ETA
            </span>
            <div className="flex items-center gap-1 font-bold text-salvus-info font-mono mt-0.5">
              <Clock className="h-3 w-3 text-salvus-info shrink-0" />
              <span>
                {topCandidate.eta_formatted || topCandidate.etaFormatted || 'ETA unavailable'}
              </span>
            </div>
          </div>

          <div>
            <span className="text-[10px] text-salvus-text-muted uppercase font-semibold block">
              Distance
            </span>
            <div className="flex items-center gap-1 font-bold text-salvus-text-primary font-mono mt-0.5">
              <MapPin className="h-3 w-3 text-salvus-info shrink-0" />
              <span>
                {topCandidate.distance_km != null
                  ? `${topCandidate.distance_km} km`
                  : topCandidate.distanceKm != null
                    ? `${topCandidate.distanceKm} km`
                    : 'Distance unavailable'}
              </span>
            </div>
          </div>

          <div>
            <span className="text-[10px] text-salvus-text-muted uppercase font-semibold block">
              Capability
            </span>
            <div className="flex items-center gap-1 font-semibold text-salvus-safe truncate mt-0.5">
              <Shield className="h-3 w-3 shrink-0" />
              <span className="truncate">
                {topCandidate.capability
                  ? `${topCandidate.capability.replace('_', ' ')} ✓`
                  : 'Capability unlisted'}
              </span>
            </div>
          </div>

          <div>
            <span className="text-[10px] text-salvus-text-muted uppercase font-semibold block">
              Workload
            </span>
            <div className="flex items-center gap-1 text-salvus-text-secondary font-mono mt-0.5">
              <Users className="h-3 w-3 text-salvus-text-muted shrink-0" />
              <span>{workloadInfo.text}</span>
            </div>
          </div>

          <div>
            <span className="text-[10px] text-salvus-text-muted uppercase font-semibold block">
              Readiness
            </span>
            <div className="flex items-center gap-1 text-salvus-safe font-semibold mt-0.5">
              <Activity className="h-3 w-3 shrink-0" />
              <span className="truncate">
                {topCandidate.status === 'AVAILABLE'
                  ? 'Available'
                  : topCandidate.status || 'Unlisted'}
              </span>
            </div>
          </div>

          <div>
            <span className="text-[10px] text-salvus-text-muted uppercase font-semibold block">
              Capacity
            </span>
            <span className="font-semibold text-salvus-text-primary font-mono block mt-0.5">
              {topCandidate.max_capacity != null
                ? `${topCandidate.max_capacity} Pax`
                : 'Capacity unlisted'}
            </span>
          </div>
        </div>

        {/* WHY THIS UNIT? (Fact-based Plain Explanation) */}
        <div className="p-2.5 bg-salvus-muted/30 rounded-lg border border-salvus-border space-y-1 text-xs">
          <span className="text-[11px] font-bold text-salvus-text-primary block flex items-center gap-1.5">
            <CheckCircle2 className="h-3.5 w-3.5 text-salvus-safe" />
            <span>Why this responder:</span>
          </span>

          <p className="text-salvus-text-primary leading-relaxed text-xs font-medium">
            {topCandidate.match_reason ||
              (topCandidate.explanation?.headline
                ? topCandidate.explanation.headline
                : `Recommended response unit for incident #${incident.ticket_id || incident.id}.`)}
          </p>

          {topCandidate.explanation?.positive_factors &&
            topCandidate.explanation.positive_factors.length > 0 && (
              <div className="pt-1 space-y-0.5 border-t border-salvus-border/50">
                {topCandidate.explanation.positive_factors.slice(0, 2).map((bullet, idx) => (
                  <div
                    key={idx}
                    className="text-salvus-safe-text text-[11px] flex items-start gap-1 font-medium"
                  >
                    <span className="shrink-0 font-bold">✓</span>
                    <span>{bullet.replace(/^[✓\s]+/, '')}</span>
                  </div>
                ))}
              </div>
            )}
        </div>

        {/* Compact Visual Factor Breakdown Accordion */}
        <div>
          <button
            type="button"
            onClick={() => setShowFormulaBreakdown((prev) => !prev)}
            className="w-full flex items-center justify-between text-xs text-salvus-info hover:underline py-1 cursor-pointer font-medium select-none"
          >
            <span className="flex items-center gap-1">
              {showFormulaBreakdown ? (
                <ChevronUp className="h-3.5 w-3.5" />
              ) : (
                <ChevronDown className="h-3.5 w-3.5" />
              )}
              <span>
                {showFormulaBreakdown ? 'Hide Score Breakdown' : 'View Explainable Score Breakdown'}
              </span>
            </span>
            <span className="font-mono text-[11px] text-salvus-text-muted">
              {topCandidate.match_score != null
                ? `${topCandidate.match_score} / 100`
                : topCandidate.matchScore != null
                  ? `${topCandidate.matchScore} / 100`
                  : 'Score unlisted'}
            </span>
          </button>

          {showFormulaBreakdown && (
            <div className="mt-1.5 p-2.5 bg-salvus-muted/40 rounded-lg border border-salvus-border text-xs space-y-2 animate-fadeIn">
              {/* Factor 1: Capability */}
              <div className="space-y-0.5">
                <div className="flex justify-between text-[11px] font-medium">
                  <span>Specialized Capability Match</span>
                  <span className="font-bold text-salvus-text-primary font-mono">
                    {breakdown.capability_score != null
                      ? `${breakdown.capability_score} / 30 pts`
                      : '—'}
                  </span>
                </div>
                <div className="w-full bg-salvus-muted rounded-full h-1.5 overflow-hidden">
                  <div
                    className="bg-salvus-safe h-1.5 rounded-full"
                    style={{
                      width: `${breakdown.capability_score != null ? (breakdown.capability_score / 30) * 100 : 0}%`,
                    }}
                  />
                </div>
              </div>

              {/* Factor 2: Availability */}
              <div className="space-y-0.5">
                <div className="flex justify-between text-[11px] font-medium">
                  <span>Operational Readiness</span>
                  <span className="font-bold text-salvus-text-primary font-mono">
                    {breakdown.availability_score != null
                      ? `${breakdown.availability_score} / 20 pts`
                      : '—'}
                  </span>
                </div>
                <div className="w-full bg-salvus-muted rounded-full h-1.5 overflow-hidden">
                  <div
                    className="bg-salvus-info h-1.5 rounded-full"
                    style={{
                      width: `${breakdown.availability_score != null ? (breakdown.availability_score / 20) * 100 : 0}%`,
                    }}
                  />
                </div>
              </div>

              {/* Factor 3: Proximity */}
              <div className="space-y-0.5">
                <div className="flex justify-between text-[11px] font-medium">
                  <span>Spatial Proximity (&lt;25 km)</span>
                  <span className="font-bold text-salvus-text-primary font-mono">
                    {breakdown.distance_score != null
                      ? `${breakdown.distance_score} / 15 pts`
                      : '—'}
                  </span>
                </div>
                <div className="w-full bg-salvus-muted rounded-full h-1.5 overflow-hidden">
                  <div
                    className="bg-salvus-info h-1.5 rounded-full"
                    style={{
                      width: `${breakdown.distance_score != null ? (breakdown.distance_score / 15) * 100 : 0}%`,
                    }}
                  />
                </div>
              </div>

              {/* Factor 4: Transit ETA */}
              <div className="space-y-0.5">
                <div className="flex justify-between text-[11px] font-medium">
                  <span>Transit ETA (&lt;35 min)</span>
                  <span className="font-bold text-salvus-text-primary font-mono">
                    {breakdown.eta_score != null ? `${breakdown.eta_score} / 15 pts` : '—'}
                  </span>
                </div>
                <div className="w-full bg-salvus-muted rounded-full h-1.5 overflow-hidden">
                  <div
                    className="bg-salvus-info h-1.5 rounded-full"
                    style={{
                      width: `${breakdown.eta_score != null ? (breakdown.eta_score / 15) * 100 : 0}%`,
                    }}
                  />
                </div>
              </div>

              {/* Factor 5: Workload */}
              <div className="space-y-0.5">
                <div className="flex justify-between text-[11px] font-medium">
                  <span>Workload Capacity Available</span>
                  <span className="font-bold text-salvus-text-primary font-mono">
                    {breakdown.workload_score != null
                      ? `${breakdown.workload_score} / 10 pts`
                      : '—'}
                  </span>
                </div>
                <div className="w-full bg-salvus-muted rounded-full h-1.5 overflow-hidden">
                  <div
                    className="bg-salvus-safe h-1.5 rounded-full"
                    style={{
                      width: `${breakdown.workload_score != null ? (breakdown.workload_score / 10) * 100 : 0}%`,
                    }}
                  />
                </div>
              </div>

              {/* Factor 6: Severity Fit */}
              <div className="space-y-0.5">
                <div className="flex justify-between text-[11px] font-medium">
                  <span>Urgency & Crew Capacity Fit</span>
                  <span className="font-bold text-salvus-text-primary font-mono">
                    {breakdown.severity_fit_score != null
                      ? `${breakdown.severity_fit_score} / 10 pts`
                      : '—'}
                  </span>
                </div>
                <div className="w-full bg-salvus-muted rounded-full h-1.5 overflow-hidden">
                  <div
                    className="bg-salvus-safe h-1.5 rounded-full"
                    style={{
                      width: `${breakdown.severity_fit_score != null ? (breakdown.severity_fit_score / 10) * 100 : 0}%`,
                    }}
                  />
                </div>
              </div>

              <div className="flex justify-between border-t border-salvus-border pt-1.5 font-bold text-salvus-text-primary font-mono text-xs">
                <span>Total Normalized Score:</span>
                <span className="text-salvus-safe">
                  {topCandidate.match_score != null
                    ? `${topCandidate.match_score} / 100`
                    : topCandidate.matchScore != null
                      ? `${topCandidate.matchScore} / 100`
                      : 'Score unlisted'}
                </span>
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
            {isSelectedForRoute ? 'Route Active' : 'Preview Route'}
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

      {/* Tradeoff Alternatives Presentation */}
      {alternatives.length > 0 && (
        <div className="space-y-2 pt-2 border-t border-salvus-border">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-salvus-text-secondary uppercase">
              Alternative Available Units ({alternatives.length})
            </span>
            <span className="text-[10px] text-salvus-text-muted">Tradeoff Evaluation</span>
          </div>

          <div className="space-y-2">
            {alternatives.slice(0, 3).map((alt, idx) => {
              const isAltRouteActive =
                activeRoute?.responderId === alt.id ||
                activeRoute?.label?.includes(alt.unit_name || alt.unitName || '')

              return (
                <div
                  key={alt.id}
                  className="p-2.5 bg-salvus-muted/30 border border-salvus-border rounded-xl space-y-1.5 text-xs hover:border-salvus-border-strong transition-all"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <span className="text-[10px] font-bold text-salvus-text-muted font-mono bg-salvus-surface px-1.5 py-0.5 rounded border border-salvus-border">
                          #{idx + 2}
                        </span>
                        <strong className="text-salvus-text-primary truncate font-bold">
                          {alt.unit_name || alt.unitName}
                        </strong>
                        <span className="text-[10px] font-mono text-salvus-text-muted">
                          {alt.match_score != null
                            ? `(${alt.match_score}/100)`
                            : alt.matchScore != null
                              ? `(${alt.matchScore}/100)`
                              : ''}
                        </span>
                      </div>

                      <div className="flex items-center gap-2 text-[11px] text-salvus-text-secondary mt-0.5">
                        <span>{alt.vehicle_type || 'Vehicle unlisted'}</span>
                        <span>·</span>
                        <span className="font-mono">
                          {alt.distance_km != null
                            ? `${alt.distance_km} km`
                            : alt.distanceKm != null
                              ? `${alt.distanceKm} km`
                              : 'Distance unavailable'}
                        </span>
                        <span>·</span>
                        <span className="font-mono text-salvus-info font-semibold">
                          {alt.eta_formatted || alt.etaFormatted
                            ? `ETA ~${alt.eta_formatted || alt.etaFormatted}`
                            : 'ETA unavailable'}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        type="button"
                        onClick={() => onSelectRoute?.(alt)}
                        title="Preview route on map"
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
                        className="text-xs font-semibold"
                      >
                        Assign
                      </Button>
                    </div>
                  </div>

                  {/* Tradeoff Reason Summary */}
                  {(alt.comparative_reason || alt.comparativeReason) && (
                    <div className="bg-salvus-surface p-1.5 rounded-md border border-salvus-border/70 text-[11px] text-salvus-text-secondary font-medium">
                      <span>Tradeoff: </span>
                      <span className="text-salvus-text-primary">
                        {alt.comparative_reason || alt.comparativeReason}
                      </span>
                    </div>
                  )}
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
