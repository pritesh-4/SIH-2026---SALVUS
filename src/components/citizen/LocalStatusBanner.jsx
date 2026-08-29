import { Badge } from '../ui/Badge'

/**
 * LocalStatusBanner Component
 *
 * Grounded situational verdict answering:
 * 1. Is anything dangerous?
 * 2. Does any hazard affect MY location?
 * 3. What should I do?
 */
export const LocalStatusBanner = ({
  hazards = [],
  areaSafety = null,
  weather = null,
  isLocationOff = false,
  onOpenAlertDetail,
}) => {
  const current = weather?.current

  // If location is off, show overview guidance
  if (isLocationOff) {
    return null
  }

  // 1. Check for Active Hazards in user's area
  const criticalHazard = hazards.find(
    (h) => h.severity === 'CRITICAL' || h.relevance_level === 'CRITICAL'
  )
  const warningHazard = hazards.find(
    (h) => h.severity === 'WARNING' || h.relevance_level === 'HIGH'
  )
  const watchHazard = hazards.find(
    (h) => ['WATCH', 'ADVISORY'].includes(h.severity) || h.relevance_level === 'MODERATE'
  )

  // 2. Derive Weather Advisory signals if no critical disaster
  const isThunderstorm =
    (current?.condition || '').toLowerCase().includes('thunder') ||
    [95, 96, 99].includes(current?.weather_code)
  const isHeavyRain =
    (current?.condition || '').toLowerCase().includes('heavy rain') ||
    current?.weather_code === 65 ||
    (current?.precipitation || 0) >= 15.0
  const isLightRain =
    (current?.precipitation || 0) > 0.2 || (current?.precipitation_probability || 0) >= 50
  const isExtremeHeat = (current?.temperature || 0) >= 40.0
  const isHighWind = (current?.wind_gusts || 0) >= 50.0 || (current?.wind_speed || 0) >= 35.0

  let level = 'NORMAL'
  let title = 'Conditions look normal around you.'
  let description =
    'No active disaster alerts or severe meteorological threats detected in your sector.'
  let recommendation =
    'Continue normal routines. Salvus continues monitoring active emergency feeds.'
  let targetHazard = null

  if (criticalHazard) {
    level = 'CRITICAL'
    title = criticalHazard.title || 'Immediate Threat in Your Sector'
    description =
      criticalHazard.why_it_matters ||
      criticalHazard.description ||
      'Active high-severity hazard requiring immediate precautions.'
    recommendation =
      criticalHazard.recommended_action || 'Follow civil defense evacuation guidelines.'
    targetHazard = criticalHazard
  } else if (warningHazard) {
    level = 'WARNING'
    title = warningHazard.title || 'Hazard Warning in Your Sector'
    description =
      warningHazard.why_it_matters ||
      warningHazard.description ||
      'Elevated hazard risk detected near your location.'
    recommendation =
      warningHazard.recommended_action || 'Exercise caution and avoid affected areas.'
    targetHazard = warningHazard
  } else if (watchHazard) {
    level = 'WATCH'
    title = watchHazard.title || 'Hazard Watch Active'
    description =
      watchHazard.why_it_matters ||
      watchHazard.description ||
      'Monitored conditions may escalate in your area.'
    recommendation =
      watchHazard.recommended_action || 'Stay alert to local weather and civil defense advisories.'
    targetHazard = watchHazard
  } else if (isThunderstorm) {
    level = 'WATCH'
    title = 'Weather Watch: Thunderstorm Activity Possible'
    description = 'Atmospheric conditions indicate developing thunderstorm activity in your region.'
    recommendation =
      'Avoid exposed outdoor areas, tall trees, and metal structures if lightning increases.'
  } else if (isHeavyRain) {
    level = 'WARNING'
    title = 'Heavy Rain Advisory Active'
    description =
      'High precipitation rate active near your coordinates with localized waterlogging risk.'
    recommendation =
      'Avoid low-lying roads and underpasses. Drive with low beams and reduced speed.'
  } else if (isExtremeHeat) {
    level = 'ADVISORY'
    title = 'Elevated Heat Advisory'
    description = `High ambient temperature of ${Math.round(current.temperature)}°C recorded.`
    recommendation =
      'Stay well-hydrated, wear light clothing, and avoid prolonged direct sun exposure.'
  } else if (isHighWind) {
    level = 'ADVISORY'
    title = 'Brisk Gusty Winds Advisory'
    description = `Wind gusts up to ${Math.round(current.wind_gusts || current.wind_speed)} km/h recorded.`
    recommendation = 'Secure loose outdoor items and beware of falling tree branches.'
  } else if (isLightRain) {
    level = 'ADVISORY'
    title = 'Light Rain Advisory'
    description = `${current.condition || 'Rain'} is currently affecting your sector.`
    recommendation = 'Carry rain protection. Roadways and footpaths may be slippery.'
  }

  // Visual styling maps
  const styles = {
    CRITICAL: {
      container: 'bg-rose-950/40 border-rose-500/50 text-rose-100',
      badge: 'critical',
      badgeLabel: 'Critical Threat',
      icon: '🚨',
      buttonClass: 'bg-rose-600 hover:bg-rose-700 text-white',
    },
    WARNING: {
      container: 'bg-amber-950/40 border-amber-500/50 text-amber-100',
      badge: 'warning',
      badgeLabel: 'Hazard Warning',
      icon: '⚠️',
      buttonClass: 'bg-amber-600 hover:bg-amber-700 text-white',
    },
    WATCH: {
      container: 'bg-amber-950/25 border-amber-500/40 text-amber-200',
      badge: 'warning',
      badgeLabel: 'Weather Watch',
      icon: '⚡',
      buttonClass:
        'bg-salvus-surface border border-amber-500/50 text-amber-200 hover:bg-amber-950/50',
    },
    ADVISORY: {
      container: 'bg-salvus-info-bg/50 border-salvus-info-border text-salvus-text-primary',
      badge: 'info',
      badgeLabel: 'Weather Advisory',
      icon: '🌦️',
      buttonClass: '',
    },
    NORMAL: {
      container: 'bg-salvus-safe-bg/40 border-salvus-safe-border text-salvus-text-primary',
      badge: 'safe',
      badgeLabel: 'Normal Conditions',
      icon: '🛡️',
      buttonClass: '',
    },
  }

  const activeStyle = styles[level] || styles.NORMAL

  return (
    <section
      aria-label="Current Local Status"
      className={`mb-6 p-4 sm:p-5 rounded-2xl border ${activeStyle.container} shadow-sm transition-all`}
    >
      <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
        <div className="flex items-start gap-3.5">
          <span className="text-2xl sm:text-3xl shrink-0 mt-0.5" aria-hidden="true">
            {activeStyle.icon}
          </span>
          <div className="min-w-0">
            <div className="flex items-center gap-2 mb-1 flex-wrap">
              <Badge variant={activeStyle.badge} dot={true}>
                {activeStyle.badgeLabel}
              </Badge>
              {areaSafety?.level === 'SAFE' && level === 'NORMAL' && (
                <span className="text-[11px] font-semibold text-salvus-safe">
                  ✓ Area Safety Engine Verified
                </span>
              )}
            </div>

            <h2 className="text-base sm:text-lg font-bold text-salvus-text-primary tracking-tight">
              {title}
            </h2>

            <p className="text-xs sm:text-sm text-salvus-text-secondary mt-1 leading-relaxed max-w-2xl">
              {description}
            </p>

            {/* Actionable Guidance Box */}
            <div className="mt-3 p-3 rounded-xl bg-salvus-surface/60 border border-salvus-border/60 text-xs">
              <span className="text-[10px] font-bold uppercase tracking-wider text-salvus-text-muted block mb-0.5">
                Recommended Action
              </span>
              <p className="font-medium text-salvus-text-primary leading-relaxed">
                {recommendation}
              </p>
            </div>
          </div>
        </div>

        {targetHazard && onOpenAlertDetail && (
          <div className="shrink-0 self-end md:self-center">
            <button
              type="button"
              onClick={() => onOpenAlertDetail(targetHazard)}
              className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer shadow-xs ${activeStyle.buttonClass}`}
            >
              View Full Advisory →
            </button>
          </div>
        )}
      </div>
    </section>
  )
}

export default LocalStatusBanner
