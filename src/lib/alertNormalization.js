/**
 * Salvus Canonical Alert Normalization & State Intelligence Pipeline (Build 05)
 *
 * Implements:
 * 1. Canonical alert model normalization from heterogeneous external providers
 * 2. Deterministic, stable alert identity generation
 * 3. Active status & expiry verification (filters expired / cancelled alerts)
 * 4. Deduplication by primary event identifier and spatial-temporal clustering
 * 5. Location relevance evaluation and proximity categorization
 * 6. User interaction state persistence (UNSEEN / READ / ACKNOWLEDGED / DISMISSED) in localStorage
 * 7. Live badge count calculation (Active + Relevant + Unexpired + Uncancelled + Unseen)
 */

import { formatRelativeFreshness } from './freshness.js'

export const ALERT_STORAGE_KEY = 'salvus_alerts_interaction_state_v1'

export const AlertInteractionStatus = {
  UNSEEN: 'UNSEEN',
  READ: 'READ',
  ACKNOWLEDGED: 'ACKNOWLEDGED',
  DISMISSED: 'DISMISSED',
}

export const SeverityRank = {
  CRITICAL: 4,
  WARNING: 3,
  WATCH: 2,
  ADVISORY: 1,
  INFO: 0,
}

/**
 * Generate a deterministic stable identifier for an alert.
 * Ensures read status and deduplication persist consistently across renders and reloads.
 */
export const getStableAlertId = (alert) => {
  if (!alert) return `alert-unknown-${Date.now()}`
  if (alert.id && typeof alert.id === 'string' && alert.id.trim().length > 0) {
    return alert.id.trim()
  }

  const provider = (alert.source || alert.provider || 'unknown').toLowerCase().replace(/\s+/g, '-')
  const eventId = alert.source_event_id || alert.providerAlertId || alert.hazard_id || ''

  if (eventId) {
    return `${provider}:${eventId}`
  }

  // Deterministic fallback hash based on title, severity, coordinates
  const titlePart = (alert.title || 'untitled')
    .slice(0, 24)
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
  const latPart = typeof alert.latitude === 'number' ? alert.latitude.toFixed(3) : 'nolat'
  const lonPart = typeof alert.longitude === 'number' ? alert.longitude.toFixed(3) : 'nolon'
  const obsPart = alert.observed_at || alert.issued_at || 'noobs'

  return `${provider}:${titlePart}:${latPart}:${lonPart}:${obsPart}`
}

export const isAlertActiveAndUnexpired = (alert, referenceTime = null) => {
  if (!alert) return false

  // 1. Explicit active flag check
  if (alert.is_active === false || alert.isActive === false) {
    return false
  }

  // 2. Status check
  const status = (alert.status || '').toUpperCase()
  if (status === 'CANCELLED' || status === 'EXPIRED' || status === 'RESOLVED') {
    return false
  }

  // 3. Expiry timestamp check
  const expiresAt = alert.expires_at || alert.expiresAt || alert.expiresAtIso
  if (expiresAt) {
    const expireMs = new Date(expiresAt).getTime()
    let nowMs = Date.now()
    if (
      typeof referenceTime === 'string' ||
      (typeof referenceTime === 'number' && referenceTime > 1000000000)
    ) {
      nowMs = typeof referenceTime === 'number' ? referenceTime : new Date(referenceTime).getTime()
    }
    if (!isNaN(expireMs) && expireMs <= nowMs) {
      return false
    }
  }

  return true
}

/**
 * Calculate Haversine distance in kilometers between two coordinates.
 */
export const haversineDistanceKm = (lat1, lon1, lat2, lon2) => {
  if (lat1 == null || lon1 == null || lat2 == null || lon2 == null) return null
  const R = 6371.0 // Earth radius in km
  const dLat = ((lat2 - lat1) * Math.PI) / 180
  const dLon = ((lon2 - lon1) * Math.PI) / 180
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2)
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  return R * c
}

/**
 * Format distance in km into human-friendly label.
 */
export const formatAlertDistance = (distanceKm) => {
  if (distanceKm == null || isNaN(distanceKm)) return null
  if (distanceKm < 1.0) {
    return `Approx. ${Math.max(50, Math.round(distanceKm * 1000))} m away`
  }
  return `${distanceKm.toFixed(1)} km away`
}

/**
 * Normalize an incoming raw alert into the canonical Salvus Alert structure.
 */
export const normalizeAlert = (rawAlert, userLocation = null, nearestSafeShelter = null) => {
  if (!rawAlert) return null

  const stableId = getStableAlertId(rawAlert)
  const severity = (rawAlert.severity || 'INFO').toUpperCase()
  const source = rawAlert.source || rawAlert.provider || 'Verified Disaster Feed'
  const provenance = rawAlert.provenance || rawAlert.data_provenance || 'LIVE'

  const rawLat = rawAlert.latitude ?? rawAlert.lat ?? null
  const rawLon = rawAlert.longitude ?? rawAlert.lon ?? null
  const lat = typeof rawLat === 'number' && !isNaN(rawLat) ? rawLat : null
  const lon = typeof rawLon === 'number' && !isNaN(rawLon) ? rawLon : null

  // User location distance calculation if not provided by backend
  let distanceKm = rawAlert.distance_km ?? rawAlert.distanceKm ?? null
  if (
    distanceKm == null &&
    lat !== null &&
    lon !== null &&
    userLocation?.latitude != null &&
    userLocation?.longitude != null
  ) {
    distanceKm = haversineDistanceKm(userLocation.latitude, userLocation.longitude, lat, lon)
  }

  const radiusKm = rawAlert.radius_km ?? rawAlert.radiusKm ?? rawAlert.affected_radius_km ?? null
  const isWithinArea = Boolean(
    rawAlert.is_within_affected_area ??
    rawAlert.isWithinAffectedArea ??
    (distanceKm !== null && radiusKm !== null ? distanceKm <= radiusKm : false)
  )

  let relevanceLevel = rawAlert.relevance_level ?? rawAlert.relevanceLevel ?? null
  if (!relevanceLevel) {
    if (isWithinArea && (severity === 'CRITICAL' || severity === 'WARNING')) {
      relevanceLevel = 'CRITICAL'
    } else if (isWithinArea || (distanceKm !== null && distanceKm <= 15.0)) {
      relevanceLevel = 'HIGH'
    } else if (distanceKm !== null && distanceKm <= 35.0) {
      relevanceLevel = 'MODERATE'
    } else if (distanceKm !== null && distanceKm <= 75.0) {
      relevanceLevel = 'LOW'
    } else if (distanceKm !== null && distanceKm > 75.0) {
      relevanceLevel = 'IRRELEVANT'
    } else {
      relevanceLevel = 'MODERATE'
    }
  }

  const actions =
    Array.isArray(rawAlert.actions) && rawAlert.actions.length > 0
      ? rawAlert.actions
      : rawAlert.recommended_action || rawAlert.recommendedAction
        ? [rawAlert.recommended_action || rawAlert.recommendedAction]
        : ['Follow official civil defense directives.']

  const observedAt =
    rawAlert.observed_at ||
    rawAlert.observedAt ||
    rawAlert.issued_at ||
    rawAlert.issuedAt ||
    new Date().toISOString()
  const issuedAt = rawAlert.issued_at || rawAlert.issuedAt || observedAt
  const expiresAt = rawAlert.expires_at || rawAlert.expiresAt || null
  const fetchedAt = rawAlert.fetched_at || rawAlert.fetchedAt || new Date().toISOString()

  let distanceFormatted = rawAlert.distance_formatted || rawAlert.distanceFormatted
  if (!distanceFormatted) {
    if (distanceKm !== null) {
      distanceFormatted = formatAlertDistance(distanceKm)
    } else if (radiusKm !== null) {
      distanceFormatted = `${radiusKm} km radius`
    } else if (isWithinArea) {
      distanceFormatted = 'Within affected area'
    } else {
      distanceFormatted = 'Monitored sector'
    }
  }

  return {
    id: stableId,
    provider: source,
    providerAlertId: rawAlert.source_event_id || rawAlert.providerAlertId || stableId,
    source,
    sourceType: rawAlert.source_type || rawAlert.sourceType || 'FEED',
    sourcesMatched: rawAlert.sources_matched || rawAlert.sourcesMatched || [source],
    sourceUrl: rawAlert.source_url || rawAlert.sourceUrl || null,
    title: rawAlert.title || 'Emergency Advisory',
    description:
      rawAlert.description ||
      rawAlert.summary ||
      'Monitored hazard advisory active in your sector.',
    summary:
      rawAlert.description ||
      rawAlert.summary ||
      'Monitored hazard advisory active in your sector.',
    whyItMatters:
      rawAlert.why_it_matters ||
      rawAlert.whyItMatters ||
      rawAlert.description ||
      'Direct proximity hazard affecting current sector travel and safety.',
    recommendedAction: rawAlert.recommended_action || rawAlert.recommendedAction || actions[0],
    actions,
    severity,
    category: rawAlert.hazard_type || rawAlert.category || 'weather',
    status: (rawAlert.status || 'ACTIVE').toUpperCase(),
    isActive: rawAlert.is_active !== false && rawAlert.isActive !== false,
    is_active: rawAlert.is_active !== false && rawAlert.isActive !== false,
    issuedAt,
    issued_at: issuedAt,
    expiresAt,
    expires_at: expiresAt,
    observedAt,
    observed_at: observedAt,
    fetchedAt,
    fetched_at: fetchedAt,
    observedTime: formatRelativeFreshness(observedAt, 'Observed'),
    updatedTime: formatRelativeFreshness(fetchedAt || observedAt, 'Updated'),
    latitude: lat,
    longitude: lon,
    affectedArea: rawAlert.affected_area || rawAlert.affectedArea || 'Regional Disaster Corridor',
    affected_area: rawAlert.affected_area || rawAlert.affectedArea || 'Regional Disaster Corridor',
    radiusKm,
    radius_km: radiusKm,
    distanceKm,
    distance_km: distanceKm,
    distance: distanceFormatted,
    distanceFormatted,
    distance_formatted: distanceFormatted,
    isWithinAffectedArea: isWithinArea,
    is_within_affected_area: isWithinArea,
    relevanceLevel,
    relevance_level: relevanceLevel,
    provenance,
    confidence: typeof rawAlert.confidence === 'number' ? rawAlert.confidence : 1.0,
    verified: provenance === 'LIVE' || provenance === 'CACHED',
    nearestShelter: nearestSafeShelter || rawAlert.nearestShelter || null,
    is_derived: Boolean(rawAlert.is_derived ?? rawAlert.isDerived ?? false),
    isDerived: Boolean(rawAlert.is_derived ?? rawAlert.isDerived ?? false),
    derived_classification:
      rawAlert.derived_classification || rawAlert.derivedClassification || null,
    derivedClassification:
      rawAlert.derived_classification || rawAlert.derivedClassification || null,
    authority_tier: rawAlert.authority_tier || rawAlert.authorityTier || 'GLOBAL_NETWORK',
    authorityTier: rawAlert.authority_tier || rawAlert.authorityTier || 'GLOBAL_NETWORK',
    signal_type: rawAlert.signal_type || rawAlert.signalType || null,
    signalType: rawAlert.signal_type || rawAlert.signalType || null,
    what_to_do: rawAlert.what_to_do || rawAlert.whatToDo || actions[0],
    whatToDo: rawAlert.what_to_do || rawAlert.whatToDo || actions[0],
    what_to_avoid: rawAlert.what_to_avoid || rawAlert.whatToAvoid || null,
    whatToAvoid: rawAlert.what_to_avoid || rawAlert.whatToAvoid || null,
    local_context: rawAlert.local_context || rawAlert.localContext || null,
    localContext: rawAlert.local_context || rawAlert.localContext || null,
    direction_label: rawAlert.direction_label || rawAlert.directionLabel || null,
    directionLabel: rawAlert.direction_label || rawAlert.directionLabel || null,
    sources_matched: rawAlert.sources_matched || rawAlert.sourcesMatched || [source],
    evidence_sources: rawAlert.evidence_sources || rawAlert.evidenceSources || [source],
    evidenceSources: rawAlert.evidence_sources || rawAlert.evidenceSources || [source],
  }
}

/**
 * Deduplicate raw/normalized alerts by:
 * 1. Primary stable ID / (source, event_id)
 * 2. Cross-source spatial-temporal overlap (within 5km and within 1 hour for same category)
 */
export const deduplicateAlertsList = (alerts) => {
  if (!Array.isArray(alerts) || alerts.length === 0) return []

  // 1. Primary deduplication by ID
  const primaryMap = new Map()
  for (const a of alerts) {
    if (!a || !a.id) continue
    if (!primaryMap.has(a.id)) {
      primaryMap.set(a.id, a)
    } else {
      const existing = primaryMap.get(a.id)
      const candSev = SeverityRank[a.severity] || 0
      const existSev = SeverityRank[existing.severity] || 0
      if (candSev > existSev || (a.confidence || 0) > (existing.confidence || 0)) {
        primaryMap.set(a.id, a)
      }
    }
  }

  const primaryDeduped = Array.from(primaryMap.values())

  // 2. Spatial-temporal cross-provider deduplication
  const finalAlerts = []
  for (const candidate of primaryDeduped) {
    let duplicateIndex = -1

    for (let i = 0; i < finalAlerts.length; i++) {
      const existing = finalAlerts[i]

      // Must be same general category or severe disaster type
      if (candidate.category && existing.category && candidate.category !== existing.category) {
        continue
      }

      // Check distance if both have coordinates
      if (
        candidate.latitude !== null &&
        candidate.longitude !== null &&
        existing.latitude !== null &&
        existing.longitude !== null
      ) {
        const dist = haversineDistanceKm(
          candidate.latitude,
          candidate.longitude,
          existing.latitude,
          existing.longitude
        )
        if (dist !== null && dist > 5.0) {
          continue
        }
      }

      // Check timestamp overlap (within 3600s)
      try {
        const t1 = new Date(candidate.observedAt || candidate.issuedAt).getTime()
        const t2 = new Date(existing.observedAt || existing.issuedAt).getTime()
        if (!isNaN(t1) && !isNaN(t2) && Math.abs(t1 - t2) > 3600 * 1000) {
          continue
        }
      } catch {
        // ignore timestamp parse failure
      }

      duplicateIndex = i
      break
    }

    if (duplicateIndex >= 0) {
      const existing = finalAlerts[duplicateIndex]
      const candSev = SeverityRank[candidate.severity] || 0
      const existSev = SeverityRank[existing.severity] || 0

      const mergedSources = Array.from(
        new Set([
          ...(existing.sourcesMatched || [existing.source]),
          ...(candidate.sourcesMatched || [candidate.source]),
        ])
      )

      const higherAlert = candSev >= existSev ? candidate : existing
      finalAlerts[duplicateIndex] = {
        ...higherAlert,
        sourcesMatched: mergedSources,
        source: mergedSources.length > 1 ? mergedSources.join(' + ') : higherAlert.source,
      }
    } else {
      finalAlerts.push(candidate)
    }
  }

  return finalAlerts
}

/**
 * Filter alerts by location relevance and maximum distance.
 */
export const filterAlertsByLocation = (alerts, userLocation, maxDistanceKm = null) => {
  if (!Array.isArray(alerts)) return []
  if (
    !userLocation ||
    typeof userLocation.latitude !== 'number' ||
    typeof userLocation.longitude !== 'number'
  ) {
    return alerts
  }

  return alerts.filter((a) => {
    if (!a) return false
    // Irrelevant distant alerts are excluded
    if (a.relevanceLevel === 'IRRELEVANT') return false

    // Critical alerts inside affected area are always kept
    if (a.isWithinAffectedArea && a.severity === 'CRITICAL') return true

    if (maxDistanceKm != null && a.distanceKm != null) {
      if (a.distanceKm > maxDistanceKm && a.severity !== 'CRITICAL') {
        return false
      }
    }

    return true
  })
}

// ---------------------------------------------------------------------------
// LocalStorage User Read & Interaction State Management
// ---------------------------------------------------------------------------

/**
 * Load user alert interaction state map from localStorage.
 * Format: { [alertId]: { status: 'READ' | 'ACKNOWLEDGED' | 'DISMISSED', updatedAt: number } }
 */
export const loadAlertInteractions = () => {
  if (typeof window === 'undefined' || !window.localStorage) return {}
  try {
    const raw = localStorage.getItem(ALERT_STORAGE_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw)
    return typeof parsed === 'object' && parsed !== null ? parsed : {}
  } catch (err) {
    console.warn('[Salvus Alert State] Failed to load alert interactions from localStorage:', err)
    return {}
  }
}

/**
 * Save user alert interaction state map to localStorage.
 */
export const saveAlertInteractions = (interactions) => {
  if (typeof window === 'undefined' || !window.localStorage) return
  try {
    localStorage.setItem(ALERT_STORAGE_KEY, JSON.stringify(interactions))
  } catch (err) {
    console.warn('[Salvus Alert State] Failed to persist alert interactions to localStorage:', err)
  }
}

/**
 * Record a user interaction for a specific alert (e.g. READ, ACKNOWLEDGED, DISMISSED).
 */
export const recordAlertInteraction = (alertId, status = AlertInteractionStatus.READ) => {
  if (!alertId) return loadAlertInteractions()
  const current = loadAlertInteractions()
  const updated = {
    ...current,
    [alertId]: {
      status,
      updatedAt: Date.now(),
    },
  }
  saveAlertInteractions(updated)
  return updated
}

/**
 * Calculate the authoritative notification badge count.
 *
 * Badge Count =
 *   Number of active, unexpired, location-relevant, non-cancelled alerts
 *   that are NOT dismissed and whose user interaction state is UNSEEN.
 */
export const computeBadgeCount = (activeRelevantAlerts, userInteractions = null) => {
  if (!Array.isArray(activeRelevantAlerts) || activeRelevantAlerts.length === 0) {
    return 0
  }

  const interactions = userInteractions || loadAlertInteractions()

  let count = 0
  for (const alert of activeRelevantAlerts) {
    if (!alert || !alert.id) continue
    if (!isAlertActiveAndUnexpired(alert)) continue

    const interaction = interactions[alert.id]
    if (interaction) {
      if (interaction.status === AlertInteractionStatus.DISMISSED) {
        continue
      }
      if (
        interaction.status === AlertInteractionStatus.READ ||
        interaction.status === AlertInteractionStatus.ACKNOWLEDGED
      ) {
        continue
      }
    }

    count++
  }

  return count
}
