/**
 * Salvus Weather Utility Helpers (Build 04)
 */

/**
 * Map weather condition text or code to an appropriate semantic emoji icon.
 */
export const getWeatherIcon = (conditionText = '', weatherCode = 0, isDay = 1) => {
  const text = (conditionText || '').toLowerCase()
  if (text.includes('thunder') || [95, 96, 99].includes(weatherCode)) return '⛈️'
  if (text.includes('heavy rain') || weatherCode === 65) return '🌧️'
  if (
    text.includes('rain') ||
    text.includes('drizzle') ||
    text.includes('shower') ||
    [51, 53, 55, 61, 63, 80, 81, 82].includes(weatherCode)
  )
    return '🌦️'
  if (text.includes('snow') || [71, 73, 75, 77, 85, 86].includes(weatherCode)) return '🌨️'
  if (text.includes('fog') || [45, 48].includes(weatherCode)) return '🌫️'
  if (text.includes('overcast') || weatherCode === 3) return '☁️'
  if (text.includes('cloud') || text.includes('partly') || [1, 2].includes(weatherCode))
    return isDay ? '⛅' : '☁️'
  return isDay ? '☀️' : '🌙'
}

/**
 * Resolve UV index hazard severity label.
 */
export const getUvLabel = (uv) => {
  if (uv == null || uv <= 0) return '0 Low'
  if (uv < 3) return `${uv.toFixed(1)} Low`
  if (uv < 6) return `${uv.toFixed(1)} Moderate`
  if (uv < 8) return `${uv.toFixed(1)} High`
  if (uv < 11) return `${uv.toFixed(1)} Very High`
  return `${uv.toFixed(1)} Extreme`
}

/**
 * Check if condition text or WMO code represents thunderstorm activity.
 */
export const isThunderstormCondition = (conditionText = '', weatherCode = 0) => {
  const text = (conditionText || '').toLowerCase()
  return text.includes('thunder') || [95, 96, 99].includes(weatherCode)
}

/**
 * Check if condition text or metrics represent heavy rainfall.
 */
export const isHeavyRainCondition = (conditionText = '', weatherCode = 0, precip = 0) => {
  const text = (conditionText || '').toLowerCase()
  return text.includes('heavy rain') || weatherCode === 65 || precip >= 15.0
}

/**
 * Derive structured storm risk assessment from hourly & current telemetry.
 */
export const deriveStormRiskAssessment = (hourly = [], current = null) => {
  if (!Array.isArray(hourly)) return null

  const stormHours = hourly.filter((h) => isThunderstormCondition(h.condition, h.weather_code))
  const isCurrentStorm = current && isThunderstormCondition(current.condition, current.weather_code)

  if (stormHours.length === 0 && !isCurrentStorm) {
    return null
  }

  const firstStormTime = stormHours[0]?.time || (current ? 'Currently Active' : 'Upcoming')
  const lastStormTime =
    stormHours.length > 1
      ? stormHours[stormHours.length - 1].time
      : stormHours[0]
        ? `${stormHours[0].time} + 2h`
        : 'Next 2 hours'

  const expectedWindow =
    stormHours.length > 1 ? `${firstStormTime} – ${lastStormTime}` : `${firstStormTime}`

  const maxProb = Math.max(
    ...stormHours.map((h) => h.precipitation_probability || 0),
    current?.precipitation_probability || 0,
    0
  )

  const maxPrecip = Math.max(
    ...stormHours.map((h) => h.precipitation || 0),
    current?.precipitation || 0,
    0
  )

  const maxWind = Math.max(
    ...stormHours.map((h) => h.wind_speed || 0),
    current?.wind_gusts || current?.wind_speed || 0,
    0
  )

  let riskLevel = 'ELEVATED'
  if (maxProb >= 70 || stormHours.some((h) => [96, 99].includes(h.weather_code))) {
    riskLevel = 'HIGH'
  } else if (maxProb >= 40 || stormHours.length >= 2) {
    riskLevel = 'MODERATE'
  }

  return {
    hasStormRisk: true,
    riskLevel,
    expectedWindow,
    maxProb,
    maxPrecip,
    maxWind,
    recommendedAction:
      'Avoid exposed outdoor areas, tall trees, and metal structures. Stay indoors if lightning develops.',
  }
}
