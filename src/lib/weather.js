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
