/**
 * Salvus Location Intelligence Service (Build 03)
 *
 * Coordinates:
 * 1. Actual citizen location from Browser GPS or Landmark fallback
 * 2. Multi-source normalized hazards (Open-Meteo, USGS, GDACS, IMD)
 * 3. Authoritative Salvus-verified evacuation shelters
 * 4. Contextual OpenStreetMap facilities (hospitals, pharmacies, police)
 * 5. Grounded area threat level evaluation (CRITICAL / WARNING / WATCH / SAFE / NO_DATA / LOCATION_REQUIRED)
 * 6. Movement threshold throttling (> 150m) to protect battery and API limits
 * 7. Human-friendly relative freshness formatting ("Updated 2 min ago")
 */

import { fetchHazards, fetchRecommendedShelters, apiClient } from './api'
import { hasMovedSignificantly } from './placesService'

/**
 * Format timestamp or ISO string into human-friendly relative freshness label.
 * e.g. "Just now", "Updated 2m ago", "Observed 14m ago"
 */
export const formatRelativeFreshness = (timestampOrIso, prefix = 'Updated') => {
  if (!timestampOrIso) return `${prefix} recently`

  try {
    const timeMs =
      typeof timestampOrIso === 'number' ? timestampOrIso : new Date(timestampOrIso).getTime()

    if (isNaN(timeMs)) return `${prefix} recently`

    const diffSeconds = Math.max(0, Math.floor((Date.now() - timeMs) / 1000))

    if (diffSeconds < 45) return 'Updated just now'
    const minutes = Math.floor(diffSeconds / 60)
    if (minutes < 60) return `${prefix} ${minutes}m ago`
    const hours = Math.floor(minutes / 60)
    if (hours < 24) return `${prefix} ${hours}h ago`
    const days = Math.floor(hours / 24)
    return `${prefix} ${days}d ago`
  } catch {
    return `${prefix} recently`
  }
}

/**
 * Fetch area safety status from backend or evaluate with graceful client fallback.
 */
export const fetchAreaSafetyStatus = async (lat, lon) => {
  if (lat == null || lon == null || typeof lat !== 'number' || typeof lon !== 'number') {
    return {
      success: true,
      level: 'LOCATION_REQUIRED',
      badgeText: 'Location Access Off',
      headline: 'Location Access Off',
      description: 'Turn on location to see verified safety conditions and nearby safe places.',
      recommendedAction: 'Turn on GPS or select a nearby landmark.',
      observedAt: new Date().toISOString(),
      evaluatedAt: new Date().toISOString(),
      dataProvenance: 'FALLBACK',
    }
  }

  try {
    const response = await apiClient.get('/api/hazards/area-status', {
      params: { lat, lon },
      timeout: 4500,
    })
    if (response.data?.level) {
      const d = response.data
      return {
        success: true,
        level: d.level,
        badgeText:
          d.level === 'CRITICAL'
            ? 'Critical Hazard Active'
            : d.level === 'WARNING'
              ? 'Active Hazard Advisory'
              : d.level === 'WATCH'
                ? 'Hazard Watch'
                : d.level === 'SAFE'
                  ? 'No Known Active Hazards'
                  : 'Status Unconfirmed',
        headline: d.headline || (d.level === 'SAFE' ? "You're currently safe." : 'Hazard Advisory'),
        description: d.description || 'No known active hazards near your location.',
        recommendedAction: d.recommended_action || 'Continue normal precautions.',
        activeHazardsCount: d.active_hazards_count,
        criticalHazardsCount: d.critical_hazards_count,
        warningHazardsCount: d.warning_hazards_count,
        nearestHazardDistanceKm: d.nearest_hazard_distance_km,
        nearestHazardTitle: d.nearest_hazard_title,
        nearestShelter: d.nearest_shelter,
        observedAt: d.observed_at,
        evaluatedAt: d.evaluated_at,
        dataProvenance: d.data_provenance || 'LIVE',
      }
    }
  } catch (err) {
    console.warn(
      '[LocationIntelligence] Backend area-status query failed, evaluating client-side fallback:',
      err.message
    )
  }

  // Graceful client fallback evaluation
  return {
    success: false,
    level: 'NO_DATA',
    badgeText: 'Live Data Reconnecting',
    headline: 'Live alert data is temporarily unavailable.',
    description:
      'We are reconnecting to monitoring feeds. If you need urgent help, you can still send SOS.',
    recommendedAction: 'Stay in a safe place. Emergency beacon remains active.',
    observedAt: new Date().toISOString(),
    evaluatedAt: new Date().toISOString(),
    dataProvenance: 'FALLBACK',
  }
}

/**
 * In-memory client cache for location intelligence data
 */
let _locationIntelligenceCache = {
  coords: null,
  timestamp: 0,
  hazards: [],
  shelters: [],
  safetyStatus: null,
}

/**
 * Load complete situational intelligence for a citizen's coordinates:
 * - Hazards
 * - Verified shelters
 * - Grounded Safety Status
 */
export const loadCitizenLocationContext = async ({ location, force = false }) => {
  const isLocationSet =
    location && typeof location.latitude === 'number' && typeof location.longitude === 'number'

  if (!isLocationSet) {
    const safetyStatus = {
      level: 'LOCATION_REQUIRED',
      badgeText: 'Location Access Off',
      headline: 'Location Access Off · Overview Mode',
      description:
        'Enable location to detect active floodwaters, seismic activity, and nearby safe shelters.',
      recommendedAction: 'Select your sector landmark or allow browser GPS permission.',
      observedAt: new Date().toISOString(),
      evaluatedAt: new Date().toISOString(),
      dataProvenance: 'FALLBACK',
    }
    return {
      success: true,
      hasLocation: false,
      safetyStatus,
      hazards: [],
      shelters: [],
      nearestShelter: null,
      activeAdvisory: null,
    }
  }

  const currentCoords = {
    latitude: location.latitude,
    longitude: location.longitude,
  }

  const now = Date.now()
  const cacheValid =
    !force &&
    _locationIntelligenceCache.coords &&
    !hasMovedSignificantly(_locationIntelligenceCache.coords, currentCoords, 150) &&
    now - _locationIntelligenceCache.timestamp < 180000 // 3 minutes TTL

  if (cacheValid) {
    return {
      success: true,
      hasLocation: true,
      ..._locationIntelligenceCache,
    }
  }

  try {
    // Parallel fetch with graceful failure handling
    const [hazardsRes, sheltersRes, safetyRes] = await Promise.allSettled([
      fetchHazards(location.latitude, location.longitude, 15.0),
      fetchRecommendedShelters(location.latitude, location.longitude),
      fetchAreaSafetyStatus(location.latitude, location.longitude),
    ])

    const hazards =
      hazardsRes.status === 'fulfilled' && hazardsRes.value?.success ? hazardsRes.value.data : []

    const shelters =
      sheltersRes.status === 'fulfilled' && sheltersRes.value?.success ? sheltersRes.value.data : []

    let safetyStatus = safetyRes.status === 'fulfilled' ? safetyRes.value : null

    // If backend safety status endpoint was offline, evaluate client-side
    if (!safetyStatus || safetyStatus.level === 'NO_DATA') {
      if (hazards.length > 0) {
        const crit = hazards.find(
          (h) =>
            h.severity === 'CRITICAL' && (h.is_within_affected_area || (h.distance_km || 99) <= 2.5)
        )
        const warn = hazards.find(
          (h) =>
            h.severity === 'WARNING' && (h.is_within_affected_area || (h.distance_km || 99) <= 4.0)
        )
        const watch = hazards.find((h) => h.severity === 'WATCH' || h.severity === 'ADVISORY')

        if (crit) {
          safetyStatus = {
            level: 'CRITICAL',
            badgeText: 'Critical Threat',
            headline: `Critical Threat: ${crit.title}`,
            description: crit.description,
            recommendedAction: crit.recommended_action,
            observedAt: crit.observed_at || new Date().toISOString(),
            evaluatedAt: new Date().toISOString(),
            dataProvenance: 'LIVE',
          }
        } else if (warn) {
          safetyStatus = {
            level: 'WARNING',
            badgeText: 'Active Warning',
            headline: `Hazard Warning: ${warn.title}`,
            description: warn.description,
            recommendedAction: warn.recommended_action,
            observedAt: warn.observed_at || new Date().toISOString(),
            evaluatedAt: new Date().toISOString(),
            dataProvenance: 'LIVE',
          }
        } else if (watch) {
          safetyStatus = {
            level: 'WATCH',
            badgeText: 'Advisory Watch',
            headline: `Advisory Watch: ${watch.title}`,
            description: watch.description,
            recommendedAction: watch.recommended_action,
            observedAt: watch.observed_at || new Date().toISOString(),
            evaluatedAt: new Date().toISOString(),
            dataProvenance: 'LIVE',
          }
        } else {
          safetyStatus = {
            level: 'SAFE',
            badgeText: 'No Known Active Hazards',
            headline: "You're currently safe.",
            description:
              'No active hazard warnings near you. Monitored channels report calm, clear conditions.',
            recommendedAction: 'All local emergency monitoring channels report normal conditions.',
            observedAt: new Date().toISOString(),
            evaluatedAt: new Date().toISOString(),
            dataProvenance: 'LIVE',
          }
        }
      } else if (hazardsRes.status === 'fulfilled') {
        // Active fetch succeeded with empty hazard list -> Verified Safe
        safetyStatus = {
          level: 'SAFE',
          badgeText: 'No Known Active Hazards',
          headline: "You're currently safe.",
          description:
            'No known active hazards near you. Weather and emergency feeds report calm conditions.',
          recommendedAction: 'Monitored live via weather and civil defense feeds.',
          observedAt: new Date().toISOString(),
          evaluatedAt: new Date().toISOString(),
          dataProvenance: 'LIVE',
        }
      } else {
        // Feeds failed
        safetyStatus = {
          level: 'NO_DATA',
          badgeText: 'Live Data Reconnecting',
          headline: 'Live alert data is temporarily unavailable.',
          description:
            'We are reconnecting to monitoring feeds. If you need urgent help, you can still send SOS.',
          recommendedAction: 'Stay alert and monitor local civil defense announcements.',
          observedAt: new Date().toISOString(),
          evaluatedAt: new Date().toISOString(),
          dataProvenance: 'FALLBACK',
        }
      }
    }

    // Top recommended shelter
    const topSafeShelter =
      shelters.find((s) => s.is_safe !== false && s.status !== 'CLOSED') || shelters[0] || null

    // Top active advisory
    const topAdvisory =
      hazards.find((h) => h.severity === 'WARNING' || h.severity === 'CRITICAL') ||
      hazards[0] ||
      null

    const result = {
      coords: currentCoords,
      timestamp: now,
      hazards,
      shelters,
      safetyStatus,
      nearestShelter: topSafeShelter,
      activeAdvisory: topAdvisory,
    }

    _locationIntelligenceCache = result
    return {
      success: true,
      hasLocation: true,
      ...result,
    }
  } catch (error) {
    console.error('[LocationIntelligence] Error loading location context:', error)
    return {
      success: false,
      hasLocation: isLocationSet,
      hazards: [],
      shelters: [],
      safetyStatus: {
        level: 'NO_DATA',
        badgeText: 'Live Data Reconnecting',
        headline: 'Live alert data is temporarily unavailable.',
        description:
          'Unable to connect to live disaster feeds. Emergency SOS beacon remains active.',
        recommendedAction: 'Stay on elevated ground and monitor local emergency communications.',
        observedAt: new Date().toISOString(),
        evaluatedAt: new Date().toISOString(),
        dataProvenance: 'FALLBACK',
      },
      nearestShelter: null,
      activeAdvisory: null,
    }
  }
}

export default {
  formatRelativeFreshness,
  fetchAreaSafetyStatus,
  loadCitizenLocationContext,
}
