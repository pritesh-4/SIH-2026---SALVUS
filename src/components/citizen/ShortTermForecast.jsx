import { getWeatherIcon } from '../../lib/weather'

/**
 * ShortTermForecast Component
 *
 * Compact near-term forecast strip displaying the next few hours of environmental changes.
 * Answers: "What is about to happen?"
 */
export const ShortTermForecast = ({ hourly = [], current = null, isLoading = false }) => {
  if (isLoading && hourly.length === 0) {
    return null
  }

  if (!hourly || hourly.length === 0) {
    return null
  }

  // Derive intelligent forecast insight
  const rainHours = hourly.filter(
    (h) => h.precipitation_probability >= 50 || h.precipitation >= 1.0
  )
  const highWindHours = hourly.filter((h) => h.wind_speed >= 35)
  const stormHours = hourly.filter((h) => (h.condition || '').toLowerCase().includes('thunder'))

  let insightText = 'Clear conditions expected over the coming hours.'
  let insightVariant = 'neutral'

  if (stormHours.length > 0) {
    insightText = `Thunderstorms possible around ${stormHours[0].time}. Avoid exposed areas.`
    insightVariant = 'warning'
  } else if (rainHours.length > 0) {
    insightText = `Rain likely around ${rainHours[0].time} (${rainHours[0].precipitation_probability}% chance). Carry rain protection.`
    insightVariant = 'info'
  } else if (highWindHours.length > 0) {
    insightText = `Brisk winds gusting around ${highWindHours[0].time}. Secure loose objects.`
    insightVariant = 'warning'
  } else if (current?.summary) {
    insightText = current.summary
  }

  return (
    <section
      aria-label="Near-Term Environmental Forecast"
      className="mb-6 rounded-2xl bg-salvus-surface border border-salvus-border p-4 sm:p-5 shadow-xs"
    >
      <div className="flex items-center justify-between gap-3 mb-3">
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold uppercase tracking-wider text-salvus-text-muted">
            Next Few Hours
          </span>
          <span className="h-1 w-1 rounded-full bg-salvus-border-strong" />
          <span className="text-xs text-salvus-text-secondary">Short-Term Forecast</span>
        </div>
        <span className="text-[11px] text-salvus-text-muted hidden sm:inline">
          Hourly Weather Telemetry
        </span>
      </div>

      {/* Hourly Timeline Cards: Responsive Horizontal Scroll */}
      <div className="flex items-stretch gap-2.5 sm:gap-3 overflow-x-auto pb-2 pt-1 no-scrollbar">
        {hourly.slice(0, 7).map((item, idx) => {
          const isHighRain = item.precipitation_probability >= 60 || item.precipitation >= 2.0
          const isModerateRain = item.precipitation_probability >= 30 && !isHighRain
          return (
            <div
              key={item.time_iso || idx}
              className={`min-w-[100px] sm:min-w-[115px] p-3 rounded-xl border flex flex-col items-center justify-between text-center transition-all ${
                isHighRain
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
                <span className="text-[10px] text-salvus-text-muted truncate block max-w-[90px] mx-auto mt-0.5">
                  {item.condition}
                </span>

                {/* Rain probability tag */}
                <div className="mt-1.5 pt-1.5 border-t border-salvus-border/60 flex items-center justify-center gap-1 text-[10px]">
                  <span>💧</span>
                  <span
                    className={`font-bold ${
                      isHighRain
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

      {/* Grounded Situational Insight */}
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
    </section>
  )
}

export default ShortTermForecast
