import { Badge } from '../ui/Badge'
import { formatRelativeFreshness } from '../../services/locationIntelligenceService'
import { getWeatherIcon, getUvLabel } from '../../lib/weather'

/**
 * LocalConditionsBar Component
 *
 * Persistent horizontal situational intelligence strip positioned at the top of Citizen Alerts.
 * Answers: "What is happening around me right now?"
 */
export const LocalConditionsBar = ({
  weather,
  location,
  isLoading = false,
  isLocationOff = false,
  onRequestLocation,
  onSelectLandmark,
  landmarks = [],
  isAcquiring = false,
}) => {
  const current = weather?.current
  const freshness = weather?.freshness || 'LIVE'
  const observedAt = weather?.observedAt || current?.observed_at
  const status = weather?.status || 'AVAILABLE'
  const isStaleOrDegraded = status === 'DEGRADED' || freshness === 'STALE'
  const isUnavailable = status === 'FAILED' || freshness === 'UNAVAILABLE' || !current

  const locationLabel =
    location?.address ||
    (location?.landmarkName ? `${location.landmarkName} (Approx)` : null) ||
    (typeof location?.latitude === 'number'
      ? `${location.latitude.toFixed(3)}°, ${location.longitude.toFixed(3)}°`
      : 'Device Coordinates')

  return (
    <section
      aria-label="Local Environmental Conditions"
      className="mb-6 rounded-2xl bg-salvus-surface-elevated border border-salvus-border overflow-hidden shadow-sm transition-all"
    >
      {/* Top Header Strip: Location, Freshness & Telemetry Source */}
      <div className="px-4 sm:px-5 py-2.5 bg-salvus-surface/90 border-b border-salvus-border flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-bold text-salvus-text-muted uppercase tracking-wider text-[11px] flex items-center gap-1.5">
            <span className="text-salvus-info">🌐</span> Local Conditions
          </span>
          <span className="h-1 w-1 rounded-full bg-salvus-border-strong hidden sm:inline-block" />
          <span className="font-semibold text-salvus-text-primary flex items-center gap-1 truncate max-w-[280px] sm:max-w-md">
            <span>📍</span>
            <span className="truncate">{locationLabel}</span>
          </span>
          {location?.isFallback && (
            <Badge variant="neutral" size="sm">
              Landmark Fallback
            </Badge>
          )}
        </div>

        <div className="flex items-center gap-2.5 shrink-0 text-salvus-text-muted text-[11px]">
          {/* Freshness & Status Dot */}
          <div className="flex items-center gap-1.5">
            <span
              className={`h-2 w-2 rounded-full ${
                isUnavailable
                  ? 'bg-rose-500 animate-pulse'
                  : isStaleOrDegraded
                    ? 'bg-amber-400'
                    : 'bg-emerald-400 animate-pulse'
              }`}
            />
            <span className="font-medium text-salvus-text-secondary">
              {isUnavailable
                ? 'Weather Offline'
                : observedAt
                  ? formatRelativeFreshness(observedAt, 'Observed')
                  : 'Live Feed'}
            </span>
          </div>

          <span className="h-1 w-1 rounded-full bg-salvus-border-strong" />
          <span className="truncate hidden md:inline text-salvus-text-muted">
            Source: <strong className="text-salvus-text-secondary font-medium">Open-Meteo</strong>
          </span>
        </div>
      </div>

      {/* Main Conditions Dashboard */}
      {isLocationOff && !location?.latitude ? (
        <div className="p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-salvus-muted/20">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-xs font-bold uppercase tracking-wider text-salvus-warning">
                Location Required
              </span>
            </div>
            <h3 className="text-sm sm:text-base font-bold text-salvus-text-primary">
              Location access is off.
            </h3>
            <p className="text-xs text-salvus-text-secondary mt-0.5 max-w-lg">
              Enable GPS or select a nearby landmark to retrieve verified local weather, rainfall,
              and hazard intelligence.
            </p>
          </div>

          <div className="flex items-center gap-2 flex-wrap shrink-0">
            <button
              type="button"
              onClick={onRequestLocation}
              disabled={isAcquiring}
              className="px-3.5 py-1.5 rounded-xl bg-salvus-info text-white text-xs font-bold hover:bg-sky-600 transition-colors shadow-xs flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
            >
              <span>{isAcquiring ? '⏳' : '📍'}</span>
              <span>{isAcquiring ? 'Acquiring...' : 'Use Current Location'}</span>
            </button>

            {landmarks.length > 0 && (
              <select
                aria-label="Choose location manually"
                onChange={(e) =>
                  e.target.value && onSelectLandmark && onSelectLandmark(e.target.value)
                }
                defaultValue=""
                className="bg-salvus-surface border border-salvus-border text-salvus-text-primary text-xs rounded-xl px-3 py-1.5 focus:outline-none focus:border-salvus-info cursor-pointer"
              >
                <option value="" disabled>
                  Choose landmark manually...
                </option>
                {landmarks.map((lm) => (
                  <option key={lm.name} value={lm.name}>
                    {lm.name}
                  </option>
                ))}
              </select>
            )}
          </div>
        </div>
      ) : isLoading && !current ? (
        <div className="p-6 text-center flex items-center justify-center gap-3">
          <span className="h-3.5 w-3.5 rounded-full bg-salvus-info animate-ping" />
          <span className="text-xs font-semibold text-salvus-text-secondary">
            Reading local meteorological telemetry...
          </span>
        </div>
      ) : isUnavailable ? (
        <div className="p-4 sm:p-5 flex items-center justify-between gap-3 text-xs text-salvus-text-secondary">
          <div className="flex items-center gap-2">
            <span className="text-base">📡</span>
            <span>
              Local weather telemetry temporarily reconnecting. Active disaster feeds continue
              monitoring.
            </span>
          </div>
          <Badge variant="neutral" size="sm">
            Weather Unavailable
          </Badge>
        </div>
      ) : (
        /* Primary Metrics Cluster: Responsive Horizontal Grid / Scrolling Row */
        <div className="p-4 sm:p-5">
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-3 sm:gap-4 items-stretch">
            {/* 1. Primary Temperature & Condition */}
            <div className="col-span-2 sm:col-span-1 md:col-span-2 p-3 rounded-xl bg-salvus-surface border border-salvus-border/80 flex items-center justify-between gap-3 shadow-xs">
              <div className="flex items-center gap-3 min-w-0">
                <span className="text-3xl sm:text-4xl shrink-0" aria-hidden="true">
                  {getWeatherIcon(current.condition, current.weather_code, current.is_day)}
                </span>
                <div className="min-w-0">
                  <div className="flex items-baseline gap-1.5">
                    <span className="text-2xl sm:text-3xl font-extrabold text-salvus-text-primary tracking-tight">
                      {Math.round(current.temperature)}°C
                    </span>
                    {current.feels_like !== undefined && (
                      <span className="text-xs font-medium text-salvus-text-muted">
                        Feels {Math.round(current.feels_like)}°
                      </span>
                    )}
                  </div>
                  <span className="text-xs font-bold text-salvus-text-secondary block truncate mt-0.5">
                    {current.condition}
                  </span>
                </div>
              </div>
            </div>

            {/* 2. Precipitation / Rain */}
            <div className="p-3 rounded-xl bg-salvus-surface border border-salvus-border/80 flex flex-col justify-between shadow-xs">
              <div className="flex items-center justify-between text-salvus-text-muted text-[11px] font-semibold uppercase tracking-wider">
                <span>Rain / Precip</span>
                <span>💧</span>
              </div>
              <div className="mt-1.5">
                <span className="text-base sm:text-lg font-bold text-salvus-text-primary block">
                  {current.precipitation_probability > 0
                    ? `${current.precipitation_probability}%`
                    : current.precipitation > 0
                      ? `${current.precipitation} mm`
                      : '0% Rain'}
                </span>
                <span className="text-[11px] text-salvus-text-muted block truncate mt-0.5">
                  {current.precipitation > 0
                    ? `${current.precipitation} mm/h rate`
                    : 'No active rain'}
                </span>
              </div>
            </div>

            {/* 3. Wind */}
            <div className="p-3 rounded-xl bg-salvus-surface border border-salvus-border/80 flex flex-col justify-between shadow-xs">
              <div className="flex items-center justify-between text-salvus-text-muted text-[11px] font-semibold uppercase tracking-wider">
                <span>Wind</span>
                <span>💨</span>
              </div>
              <div className="mt-1.5">
                <span className="text-base sm:text-lg font-bold text-salvus-text-primary block">
                  {Math.round(current.wind_speed)} km/h
                </span>
                <span className="text-[11px] text-salvus-text-muted block truncate mt-0.5">
                  {current.wind_gusts > current.wind_speed
                    ? `Gusts ${Math.round(current.wind_gusts)} km/h`
                    : 'Normal breeze'}
                </span>
              </div>
            </div>

            {/* 4. Humidity */}
            <div className="p-3 rounded-xl bg-salvus-surface border border-salvus-border/80 flex flex-col justify-between shadow-xs">
              <div className="flex items-center justify-between text-salvus-text-muted text-[11px] font-semibold uppercase tracking-wider">
                <span>Humidity</span>
                <span>💧</span>
              </div>
              <div className="mt-1.5">
                <span className="text-base sm:text-lg font-bold text-salvus-text-primary block">
                  {current.humidity}%
                </span>
                <span className="text-[11px] text-salvus-text-muted block truncate mt-0.5">
                  {current.humidity > 80 ? 'High moisture' : 'Moderate'}
                </span>
              </div>
            </div>

            {/* 5. UV Index / Visibility */}
            <div className="p-3 rounded-xl bg-salvus-surface border border-salvus-border/80 flex flex-col justify-between shadow-xs">
              <div className="flex items-center justify-between text-salvus-text-muted text-[11px] font-semibold uppercase tracking-wider">
                <span>UV / Visibility</span>
                <span>☀️</span>
              </div>
              <div className="mt-1.5">
                <span className="text-base sm:text-lg font-bold text-salvus-text-primary block truncate">
                  {current.uv_index > 0
                    ? getUvLabel(current.uv_index)
                    : `${current.visibility_km} km`}
                </span>
                <span className="text-[11px] text-salvus-text-muted block truncate mt-0.5">
                  {current.visibility_km ? `Vis: ${current.visibility_km} km` : 'Normal range'}
                </span>
              </div>
            </div>
          </div>
        </div>
      )}
    </section>
  )
}

export default LocalConditionsBar
