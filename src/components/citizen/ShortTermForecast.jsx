import { getWeatherIcon, deriveStormRiskAssessment } from '../../lib/weather'
import { Badge } from '../ui/Badge'
import { formatRelativeFreshness } from '../../services/locationIntelligenceService'

/**
 * ShortTermForecast Component
 *
 * Compact near-term forecast strip displaying the next few hours of environmental changes.
 * Answers: "What is about to happen?"
 */
export const ShortTermForecast = ({
  hourly = [],
  current = null,
  observedAt = null,
  isLoading = false,
  status = 'AVAILABLE',
}) => {
  if (isLoading && hourly.length === 0) {
    return (
      <section
        aria-label="Near-Term Environmental Forecast"
        className="mb-6 rounded-2xl bg-salvus-surface border border-salvus-border p-4 sm:p-5 shadow-xs"
      >
        <div className="flex items-center justify-center gap-2.5 py-4 text-xs text-salvus-text-secondary">
          <span className="h-3 w-3 rounded-full bg-salvus-info animate-ping" />
          <span>Reading hourly meteorological telemetry...</span>
        </div>
      </section>
    )
  }

  if (status === 'UNAVAILABLE' || (!hourly.length && !current)) {
    return null
  }

  const stormAssessment = deriveStormRiskAssessment(hourly, current)

  // Derive intelligent forecast insight
  const rainHours = hourly.filter(
    (h) => h.precipitation_probability >= 50 || h.precipitation >= 1.0
  )
  const highWindHours = hourly.filter((h) => h.wind_speed >= 35)

  let insightText = 'Clear conditions expected over the coming hours.'
  let insightVariant = 'neutral'

  if (stormAssessment) {
    insightText = `Thunderstorm activity expected (${stormAssessment.expectedWindow}). Avoid exposed outdoor areas.`
    insightVariant = 'warning'
  } else if (rainHours.length > 0) {
    insightText = `Rain likely around ${rainHours[0].time} (${rainHours[0].precipitation_probability}% chance). Carry rain protection.`
    insightVariant = 'info'
  } else if (highWindHours.length > 0) {
    insightText = `Brisk winds gusting around ${highWindHours[0].time}. Secure loose outdoor objects.`
    insightVariant = 'warning'
  } else if (current?.summary) {
    insightText = current.summary
  }

  return (
    <section
      aria-label="Near-Term Environmental Forecast"
      className="mb-6 rounded-2xl bg-salvus-surface border border-salvus-border p-4 sm:p-5 shadow-xs transition-all"
    >
      {/* 1. Structured Thunderstorm / Severe Risk Assessment Panel (If Active) */}
      {stormAssessment && (
        <div className="mb-4 rounded-xl border border-amber-500/40 bg-gradient-to-r from-amber-950/40 via-amber-950/20 to-salvus-surface p-4 shadow-xs">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
            <div className="flex items-center gap-2">
              <span className="text-xl" aria-hidden="true">
                ⛈️
              </span>
              <h3 className="text-xs sm:text-sm font-bold text-amber-200 uppercase tracking-wider">
                Thunderstorm Risk Assessment
              </h3>
            </div>
            <Badge
              variant={stormAssessment.riskLevel === 'HIGH' ? 'critical' : 'warning'}
              size="sm"
              dot={true}
            >
              {stormAssessment.riskLevel} Risk ({stormAssessment.maxProb}% prob)
            </Badge>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-xs mb-3">
            <div className="bg-salvus-surface/80 border border-amber-500/20 rounded-lg p-2.5">
              <span className="text-[10px] text-amber-400 font-bold uppercase tracking-wider block mb-0.5">
                Expected Window
              </span>
              <span className="font-semibold text-salvus-text-primary">
                {stormAssessment.expectedWindow}
              </span>
            </div>

            <div className="bg-salvus-surface/80 border border-amber-500/20 rounded-lg p-2.5">
              <span className="text-[10px] text-amber-400 font-bold uppercase tracking-wider block mb-0.5">
                Precipitation
              </span>
              <span className="font-semibold text-salvus-text-primary">
                {stormAssessment.maxPrecip > 0 ? `${stormAssessment.maxPrecip} mm` : 'Variable'}
              </span>
            </div>

            <div className="bg-salvus-surface/80 border border-amber-500/20 rounded-lg p-2.5">
              <span className="text-[10px] text-amber-400 font-bold uppercase tracking-wider block mb-0.5">
                Peak Winds
              </span>
              <span className="font-semibold text-salvus-text-primary">
                {Math.round(stormAssessment.maxWind)} km/h
              </span>
            </div>

            <div className="bg-salvus-surface/80 border border-amber-500/20 rounded-lg p-2.5">
              <span className="text-[10px] text-amber-400 font-bold uppercase tracking-wider block mb-0.5">
                Data Source
              </span>
              <span className="font-semibold text-salvus-text-primary truncate block">
                Open-Meteo
              </span>
            </div>
          </div>

          <p className="text-xs text-amber-100/90 font-medium leading-relaxed bg-amber-950/30 border border-amber-500/30 rounded-lg p-2.5">
            👉 <strong>Guidance:</strong> {stormAssessment.recommendedAction}
          </p>
        </div>
      )}

      {/* 2. Standard Forecast Header */}
      <div className="flex items-center justify-between gap-3 mb-3">
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold uppercase tracking-wider text-salvus-text-muted">
            Next Few Hours
          </span>
          <span className="h-1 w-1 rounded-full bg-salvus-border-strong" />
          <span className="text-xs text-salvus-text-secondary font-semibold">
            Short-Term Forecast
          </span>
        </div>
        <span className="text-[11px] text-salvus-text-muted hidden sm:inline">
          {observedAt ? formatRelativeFreshness(observedAt, 'Hourly feed') : 'Open-Meteo Telemetry'}
        </span>
      </div>

      {/* 3. Hourly Timeline Cards: Responsive Horizontal Scroll */}
      <div className="flex items-stretch gap-2.5 sm:gap-3 overflow-x-auto pb-2 pt-1 no-scrollbar">
        {hourly.slice(0, 7).map((item, idx) => {
          const isStorm =
            (item.condition || '').toLowerCase().includes('thunder') ||
            [95, 96, 99].includes(item.weather_code)
          const isHighRain =
            !isStorm && (item.precipitation_probability >= 60 || item.precipitation >= 2.0)
          const isModerateRain = !isStorm && item.precipitation_probability >= 30 && !isHighRain
          return (
            <div
              key={item.time_iso || idx}
              className={`min-w-[100px] sm:min-w-[115px] p-3 rounded-xl border flex flex-col items-center justify-between text-center transition-all ${
                isStorm
                  ? 'bg-amber-950/30 border-amber-500/40 text-salvus-text-primary'
                  : isHighRain
                    ? 'bg-salvus-info-bg/40 border-salvus-info-border text-salvus-text-primary'
                    : 'bg-salvus-surface-elevated border-salvus-border/90 text-salvus-text-primary'
              }`}
            >
              <span className="text-xs font-bold text-salvus-text-secondary">{item.time}</span>

              <span className="text-2xl my-1.5" aria-hidden="true">
                {getWeatherIcon(item.condition, item.weather_code, 1)}
              </span>

              <div className="w-full">
                <span className="text-xs font-extrabold block">
                  {Math.round(item.temperature)}°C
                </span>
                <span
                  className="text-[10px] text-salvus-text-muted truncate block max-w-[90px] mx-auto mt-0.5"
                  title={item.condition}
                >
                  {item.condition}
                </span>

                {/* Rain/Storm probability tag */}
                <div className="mt-1.5 pt-1.5 border-t border-salvus-border/60 flex items-center justify-center gap-1 text-[10px]">
                  <span>{isStorm ? '⚡' : '💧'}</span>
                  <span
                    className={`font-bold ${
                      isStorm
                        ? 'text-amber-300'
                        : isHighRain
                          ? 'text-salvus-info'
                          : isModerateRain
                            ? 'text-sky-300'
                            : 'text-salvus-text-muted'
                    }`}
                  >
                    {item.precipitation_probability}%
                  </span>
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {/* 4. Grounded Situational Insight */}
      {!stormAssessment && (
        <div
          className={`mt-3 p-3 rounded-xl text-xs flex items-center gap-2.5 ${
            insightVariant === 'warning'
              ? 'bg-amber-950/30 border border-amber-500/30 text-amber-200'
              : insightVariant === 'info'
                ? 'bg-salvus-info-bg/40 border border-salvus-info-border text-salvus-info-text'
                : 'bg-salvus-muted/30 border border-salvus-border text-salvus-text-secondary'
          }`}
        >
          <span className="text-sm shrink-0">
            {insightVariant === 'warning' ? '⚠️' : insightVariant === 'info' ? 'ℹ️' : '💡'}
          </span>
          <span className="font-medium leading-relaxed">{insightText}</span>
        </div>
      )}
    </section>
  )
}

export default ShortTermForecast
