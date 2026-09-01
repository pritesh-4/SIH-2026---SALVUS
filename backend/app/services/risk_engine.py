"""SALVUS Risk Interpretation, Thresholds & Alert Generation Engine (Phase 2).

Transforms raw multi-source provider signals into a coherent localized SALVUS alert feed.
Adheres strictly to:
1. Strict Provenance Separation (Provider Said vs Salvus Derived vs Salvus Recommends).
2. Centralized, configurable meteorological thresholds (Rain, Wind, Heat, Cold, Thunderstorm).
3. Deterministic severity normalization across all providers
   (IMD, NDMA, GDACS, USGS, Open-Meteo, OSDMA, WRD).
4. Multi-source consensus confidence boosting & source authority weighting.
5. Spatial & temporal deduplication into canonical consolidated alerts.
6. Honest, safe 3-part citizen guidance (Why It Matters, What To Do, What To Avoid).
"""

from __future__ import annotations

import math
from datetime import datetime

from app.models import (
    HazardSeverity,
    HazardType,
    NormalizedAlert,
    SignalType,
    SourceAuthorityTier,
    SourceType,
)

# ===========================================================================
# 1. Centralized Threshold Configurations (Easily Modifiable)
# ===========================================================================

# Precipitation thresholds (in mm/h or single-event equivalent)
PRECIP_LIGHT_MM_MAX = 5.0
PRECIP_MODERATE_MM_MAX = 15.0
PRECIP_HEAVY_MM_MAX = 50.0  # >= 15 mm/h is Heavy Rain; >= 50 mm/h is Extreme Cloudburst

# Wind gust thresholds (km/h)
WIND_BREEZE_KMH_MAX = 40.0
WIND_HIGH_KMH_MAX = 60.0
WIND_SQUALL_KMH_MAX = 90.0  # >= 90 km/h is Extreme Wind / Destructive Gusts

# Temperature thresholds (°C)
TEMP_EXTREME_HEAT_WARNING = 42.0
TEMP_HEAT_ADVISORY = 40.0
TEMP_EXTREME_COLD_WARNING = 4.0
TEMP_COLD_ADVISORY = 8.0

# Convective CAPE thresholds (J/kg)
CAPE_MODERATE_J_KG = 800.0
CAPE_SEVERE_J_KG = 1500.0


# ===========================================================================
# 2. Source Authority Hierarchy & Weighting
# ===========================================================================

AUTHORITY_WEIGHTS: dict[SourceAuthorityTier, float] = {
    SourceAuthorityTier.OFFICIAL_GOVERNMENT: 1.0,
    SourceAuthorityTier.STATE_DISASTER_AUTHORITY: 0.95,
    SourceAuthorityTier.GLOBAL_NETWORK: 0.90,
    SourceAuthorityTier.FORECAST_MODEL: 0.75,
    SourceAuthorityTier.SALVUS_DERIVED: 0.70,
}


def get_source_authority_tier(source_name: str, source_type: SourceType) -> SourceAuthorityTier:
    """Determine the source authority tier based on provider agency and type."""
    src_upper = (source_name or "").upper()

    if "IMD" in src_upper or "NDMA" in src_upper or "SACHET" in src_upper or "CWC" in src_upper:
        return SourceAuthorityTier.OFFICIAL_GOVERNMENT
    if (
        "OSDMA" in src_upper
        or "SATARK" in src_upper
        or "WATER RESOURCES" in src_upper
        or "WRD" in src_upper
    ):
        return SourceAuthorityTier.STATE_DISASTER_AUTHORITY
    if "USGS" in src_upper or "GDACS" in src_upper or "COPERNICUS" in src_upper:
        return SourceAuthorityTier.GLOBAL_NETWORK
    if "OPEN-METEO" in src_upper or "GFS" in src_upper or "ECMWF" in src_upper:
        return SourceAuthorityTier.FORECAST_MODEL
    return SourceAuthorityTier.SALVUS_DERIVED


# ===========================================================================
# 3. Deterministic Severity & Signal Classification
# ===========================================================================


def classify_signal_type(
    hazard_type: HazardType,
    raw_type: str | None = None,
    weather_code: int | None = None,
    rain_mm: float | None = None,
    wind_gust: float | None = None,
    temp_c: float | None = None,
) -> SignalType:
    """Deterministically classify raw signals into standardized SignalType."""
    raw_upper = (raw_type or "").upper()

    if hazard_type == HazardType.EARTHQUAKE or "EARTHQUAKE" in raw_upper or "SEISMIC" in raw_upper:
        return SignalType.EARTHQUAKE

    if hazard_type == HazardType.FLOOD or "FLOOD" in raw_upper or "INUNDATION" in raw_upper:
        return SignalType.FLOOD

    if hazard_type == HazardType.CYCLONE or "CYCLONE" in raw_upper or "STORM SURGE" in raw_upper:
        return SignalType.CYCLONE

    if "LIGHTNING" in raw_upper or "THUNDERBOLT" in raw_upper:
        return SignalType.LIGHTNING

    if "THUNDERSTORM" in raw_upper or (weather_code is not None and weather_code in (95, 96, 99)):
        return SignalType.THUNDERSTORM

    if (
        "HEAVY RAIN" in raw_upper
        or "CLOUDBURST" in raw_upper
        or (rain_mm is not None and rain_mm >= PRECIP_MODERATE_MM_MAX)
    ):
        return SignalType.HEAVY_RAIN

    if (
        "EXTREME WIND" in raw_upper
        or "GALE" in raw_upper
        or (wind_gust is not None and wind_gust >= WIND_SQUALL_KMH_MAX)
    ):
        return SignalType.EXTREME_WIND

    if "HEAT WAVE" in raw_upper or (temp_c is not None and temp_c >= TEMP_HEAT_ADVISORY):
        return SignalType.EXTREME_HEAT

    if "COLD WAVE" in raw_upper or (temp_c is not None and temp_c <= TEMP_COLD_ADVISORY):
        return SignalType.EXTREME_COLD

    if hazard_type == HazardType.WEATHER:
        if raw_upper and raw_upper not in ("WEATHER", "NORMAL_WEATHER", "NONE"):
            return SignalType.WEATHER_ADVISORY
        return SignalType.NORMAL_WEATHER

    return SignalType.OTHER_OFFICIAL_WARNING


def map_canonical_severity(
    provider_name: str,
    raw_severity: str | None,
    signal_type: SignalType | None = None,
    magnitude: float | None = None,
    rain_mm: float | None = None,
    wind_gust: float | None = None,
    temp_c: float | None = None,
) -> HazardSeverity:
    """Deterministically map provider severity or raw values to canonical HazardSeverity.

    Never randomly infers CRITICAL.
    """
    raw_upper = (raw_severity or "").upper().strip()

    # 1. Official Color/Level Mappings (IMD / NDMA / OSDMA / GDACS)
    if raw_upper in ("RED", "CRITICAL", "EXTREME", "EMERGENCY", "LEVEL 4", "DANGER"):
        return HazardSeverity.CRITICAL

    if raw_upper in ("ORANGE", "AMBER", "WARNING", "SEVERE", "HIGH", "LEVEL 3"):
        return HazardSeverity.WARNING

    if raw_upper in ("YELLOW", "WATCH", "MODERATE", "ADVISORY", "MEDIUM", "LEVEL 2"):
        return HazardSeverity.WATCH

    if raw_upper in ("GREEN", "INFO", "INFORMATIONAL", "LOW", "MINOR", "LEVEL 1"):
        return HazardSeverity.ADVISORY

    # 2. Metric-driven mappings for earthquakes
    if magnitude is not None:
        if magnitude >= 6.5:
            return HazardSeverity.CRITICAL
        if magnitude >= 5.0:
            return HazardSeverity.WARNING
        if magnitude >= 4.0:
            return HazardSeverity.WATCH
        return HazardSeverity.ADVISORY

    # 3. Metric-driven mappings for rain
    if rain_mm is not None:
        if rain_mm >= PRECIP_HEAVY_MM_MAX:
            return HazardSeverity.CRITICAL
        if rain_mm >= PRECIP_MODERATE_MM_MAX:
            return HazardSeverity.WARNING
        if rain_mm >= PRECIP_LIGHT_MM_MAX:
            return HazardSeverity.WATCH
        return HazardSeverity.ADVISORY

    # 4. Metric-driven mappings for wind
    if wind_gust is not None:
        if wind_gust >= WIND_SQUALL_KMH_MAX:
            return HazardSeverity.CRITICAL
        if wind_gust >= WIND_HIGH_KMH_MAX:
            return HazardSeverity.WATCH
        if wind_gust >= WIND_BREEZE_KMH_MAX:
            return HazardSeverity.ADVISORY
        return HazardSeverity.ADVISORY

    # 5. Metric-driven mappings for temperature
    if temp_c is not None:
        if temp_c >= TEMP_EXTREME_HEAT_WARNING or temp_c <= TEMP_EXTREME_COLD_WARNING:
            return HazardSeverity.WARNING
        if temp_c >= TEMP_HEAT_ADVISORY or temp_c <= TEMP_COLD_ADVISORY:
            return HazardSeverity.WATCH
        return HazardSeverity.ADVISORY

    return HazardSeverity.ADVISORY


# ===========================================================================
# 4. Local Context, Direction & Distance Formatting
# ===========================================================================


def compute_cardinal_direction(
    user_lat: float, user_lon: float, target_lat: float, target_lon: float
) -> str:
    """Calculate the cardinal compass direction from user coordinates to target."""
    dlat = target_lat - user_lat
    dlon = (target_lon - user_lon) * math.cos(math.radians((user_lat + target_lat) / 2.0))

    angle = math.degrees(math.atan2(dlon, dlat))
    angle = (angle + 360) % 360

    directions = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"]
    idx = int((angle + 22.5) / 45.0) % 8
    return directions[idx]


def build_local_context_label(
    user_lat: float | None,
    user_lon: float | None,
    alert_lat: float | None,
    alert_lon: float | None,
    distance_km: float | None,
    is_inside: bool,
    affected_area: str | None = None,
) -> tuple[str, str | None]:
    """Generate honest, non-fabricated local context string and direction label."""
    if user_lat is None or user_lon is None:
        area_str = affected_area or "Regional Sector"
        return f"Regional Advisory for {area_str}.", None

    if is_inside or (distance_km is not None and distance_km <= 0.5):
        area_str = f" in {affected_area}" if affected_area else ""
        return f"Affecting your immediate location{area_str}.", None

    if distance_km is not None and alert_lat is not None and alert_lon is not None:
        direction = compute_cardinal_direction(user_lat, user_lon, alert_lat, alert_lon)
        dist_round = round(distance_km, 1)
        area_suffix = f" near {affected_area}" if affected_area else ""
        return f"Within {dist_round} km {direction} of your location{area_suffix}.", direction

    return "Active in your broader administrative sector.", None


# ===========================================================================
# 5. Structured Citizen Guidance (Why It Matters, What To Do, What To Avoid)
# ===========================================================================


def generate_actionable_guidance(
    signal_type: SignalType,
    severity: HazardSeverity,
    affected_area: str | None = None,
    is_derived: bool = False,
) -> tuple[str, str, str]:
    """Generate clear, safe, non-sensational citizen guidance.

    Returns:
        (why_it_matters, what_to_do, what_to_avoid)
    """
    area = affected_area or "your sector"

    if signal_type == SignalType.EARTHQUAKE:
        why = (
            f"Seismic tremors detected near {area}. Structural stress or aftershocks are possible."
        )
        what_to_do = (
            "Drop, Cover, and Hold On. Move away from glass windows, heavy bookcases, "
            "and overhead hazards. Check for gas leaks if safe."
        )
        what_to_avoid = (
            "Do NOT use elevators. Avoid running outdoors during active shaking or "
            "standing beneath tall brick walls."
        )

    elif signal_type == SignalType.FLOOD:
        if severity == HazardSeverity.CRITICAL:
            why = f"Life-threatening river flooding or rapid inundation active in {area}."
            what_to_do = (
                "Evacuate low-lying ground immediately to designated elevated shelters. "
                "Keep mobile devices and emergency go-bags ready."
            )
            what_to_avoid = (
                "Never walk, swim, or drive through moving floodwaters. Avoid electrical poles, "
                "submerged transformers, and drainage canals."
            )
        else:
            why = f"Waterlogging and elevated river stages reported in {area}."
            what_to_do = (
                "Monitor water stage bulletins, safeguard ground-floor valuables, "
                "and plan dry evacuation routes."
            )
            what_to_avoid = (
                "Do not park vehicles in basement structures or drive across flooded culverts."
            )

    elif signal_type == SignalType.CYCLONE:
        why = f"Severe cyclonic circulation and high-velocity gales approaching {area}."
        what_to_do = (
            "Secure loose outdoor objects, board window panes, charge communication devices, "
            "and know your nearest cyclone shelter."
        )
        what_to_avoid = (
            "Do not venture out during the eye of the storm (false calm) "
            "or near coastal seawalls and beaches."
        )

    elif signal_type in (SignalType.THUNDERSTORM, SignalType.LIGHTNING):
        why = (
            f"Convective lightning strikes, localized downpours, and squally gusts "
            f"active near {area}."
        )
        what_to_do = (
            "Seek shelter inside a sturdy building or fully enclosed metal vehicle immediately. "
            "Unplug sensitive electronics."
        )
        what_to_avoid = (
            "Avoid open sports fields, tall isolated trees, water bodies, and metal fences. "
            "Do not use corded landline phones."
        )

    elif signal_type == SignalType.HEAVY_RAIN:
        why = f"Intense precipitation rate expected to cause localized drainage overflow in {area}."
        what_to_do = (
            "Clear household drains, postpone non-essential road travel, "
            "and monitor urban waterlogging updates."
        )
        what_to_avoid = "Avoid underpasses prone to submergence and open storm drains."

    elif signal_type == SignalType.EXTREME_WIND:
        why = (
            f"High-velocity wind gusts capable of dislodging branches, tin roofs, "
            f"and temporary structures in {area}."
        )
        what_to_do = (
            "Stay indoors away from large trees, billboards, and high-tension overhead cables."
        )
        what_to_avoid = (
            "Do not stand near temporary shed structures, tin awnings, or crane construction sites."
        )

    elif signal_type == SignalType.EXTREME_HEAT:
        why = f"Severe thermal heat stress with dangerous heat-index conditions in {area}."
        what_to_do = (
            "Stay hydrated with ORS/water, remain in shaded or ventilated spaces, "
            "and wear light cotton clothing."
        )
        what_to_avoid = (
            "Avoid direct sun exposure between 11:00 AM and 3:30 PM. "
            "Never leave children or pets in parked vehicles."
        )

    elif signal_type == SignalType.EXTREME_COLD:
        why = f"Severe cold wave temperatures significantly below seasonal averages in {area}."
        what_to_do = (
            "Wear layered thermal clothing, keep head and extremities protected, "
            "and ensure adequate shelter for elderly and pets."
        )
        what_to_avoid = (
            "Avoid prolonged outdoor exposure during pre-dawn hours. "
            "Never operate unvented charcoal heaters in enclosed rooms."
        )

    else:
        why = f"Official meteorological or civil safety advisory issued for {area}."
        what_to_do = (
            "Follow standard emergency preparedness instructions from local "
            "administrative authorities."
        )
        what_to_avoid = "Do not circulate unverified rumors. Rely exclusively on official alerts."

    return why, what_to_do, what_to_avoid


def format_clean_title(
    signal_type: SignalType, severity: HazardSeverity, raw_title: str | None = None
) -> str:
    """Generate a simple, clear, non-sensational title."""
    if (
        raw_title
        and len(raw_title) < 60
        and not any(w in raw_title.upper() for w in ("PANIC", "APOCALYPSE", "TERROR", "DISASTER"))
    ):
        return raw_title

    if signal_type == SignalType.EARTHQUAKE:
        return (
            "Earthquake Detected Nearby"
            if severity != HazardSeverity.CRITICAL
            else "Major Earthquake Alert"
        )
    if signal_type == SignalType.FLOOD:
        return (
            "Official Flood Warning"
            if severity in (HazardSeverity.CRITICAL, HazardSeverity.WARNING)
            else "Flood Advisory"
        )
    if signal_type == SignalType.CYCLONE:
        return (
            "Severe Cyclone Warning" if severity == HazardSeverity.CRITICAL else "Cyclone Advisory"
        )
    if signal_type == SignalType.THUNDERSTORM:
        return (
            "Thunderstorm Risk Nearby"
            if severity != HazardSeverity.CRITICAL
            else "Severe Thunderstorm Warning"
        )
    if signal_type == SignalType.LIGHTNING:
        return "Lightning Risk Imminent"
    if signal_type == SignalType.HEAVY_RAIN:
        return (
            "Heavy Rain Expected"
            if severity in (HazardSeverity.CRITICAL, HazardSeverity.WARNING)
            else "Moderate Rain Advisory"
        )
    if signal_type == SignalType.EXTREME_WIND:
        return (
            "High Wind Warning"
            if severity in (HazardSeverity.CRITICAL, HazardSeverity.WARNING)
            else "Wind Advisory"
        )
    if signal_type == SignalType.EXTREME_HEAT:
        return (
            "Severe Heat Wave Warning"
            if severity in (HazardSeverity.CRITICAL, HazardSeverity.WARNING)
            else "Heat Wave Advisory"
        )
    if signal_type == SignalType.EXTREME_COLD:
        return (
            "Severe Cold Wave Warning"
            if severity in (HazardSeverity.CRITICAL, HazardSeverity.WARNING)
            else "Cold Wave Advisory"
        )
    return "Official Hazard Advisory"


# ===========================================================================
# 6. Multi-Source Alert Consolidation & Deduplication
# ===========================================================================


def consolidate_multi_source_alerts(
    alerts: list[NormalizedAlert],
    max_cluster_distance_km: float = 12.0,
    max_time_diff_seconds: float = 7200.0,
) -> list[NormalizedAlert]:
    """Consolidate multiple provider alerts describing the same event into one canonical alert.

    Preserves full multi-source provenance, builds combined evidence sources, and
    boosts consensus confidence.
    """
    if not alerts:
        return []

    # Sort alerts by authority tier:
    # (Official Government > State Authority > Global > Forecast > Derived)
    def sort_key(a: NormalizedAlert) -> tuple[float, float, str]:
        weight = AUTHORITY_WEIGHTS.get(a.authority_tier, 0.5)
        sev_score = (
            4.0
            if a.severity == HazardSeverity.CRITICAL
            else 3.0
            if a.severity == HazardSeverity.WARNING
            else 2.0
            if a.severity == HazardSeverity.WATCH
            else 1.0
        )
        return (-weight, -sev_score, a.issued_at)

    sorted_alerts = sorted(alerts, key=sort_key)
    consolidated: list[NormalizedAlert] = []
    used_indices: set[int] = set()

    for i, primary in enumerate(sorted_alerts):
        if i in used_indices:
            continue

        matched_alerts = [primary]
        used_indices.add(i)

        for j in range(i + 1, len(sorted_alerts)):
            if j in used_indices:
                continue

            candidate = sorted_alerts[j]

            # Same or compatible hazard/signal type
            same_signal = (
                primary.signal_type == candidate.signal_type
                or primary.hazard_type == candidate.hazard_type
            )
            if not same_signal:
                continue

            # Spatial distance check
            if (
                primary.latitude is not None
                and candidate.latitude is not None
                and primary.longitude is not None
                and candidate.longitude is not None
            ):
                dist = (
                    math.hypot(
                        primary.latitude - candidate.latitude,
                        primary.longitude - candidate.longitude,
                    )
                    * 111.0
                )
                if dist > max_cluster_distance_km:
                    continue
            elif primary.affected_area and candidate.affected_area:
                if primary.affected_area.lower() != candidate.affected_area.lower():
                    continue
            else:
                continue

            # Time proximity check (within 2 hours)
            try:
                t1 = datetime.fromisoformat(primary.issued_at.replace("Z", "+00:00"))
                t2 = datetime.fromisoformat(candidate.issued_at.replace("Z", "+00:00"))
                time_diff = abs((t1 - t2).total_seconds())
                if time_diff > max_time_diff_seconds:
                    continue
            except Exception:
                pass

            matched_alerts.append(candidate)
            used_indices.add(j)

        if len(matched_alerts) == 1:
            # Single provider alert
            primary.evidence_sources = [
                {
                    "source": primary.source,
                    "severity": primary.severity.value if primary.severity else None,
                    "observed_at": primary.observed_at,
                    "confidence": primary.confidence,
                    "authority_tier": primary.authority_tier.value,
                }
            ]
            primary.sources_matched = [primary.source]
            consolidated.append(primary)
        else:
            # Multi-source consensus consolidation
            sources = list({a.source for a in matched_alerts})
            evidence_sources = [
                {
                    "source": a.source,
                    "severity": a.severity.value if a.severity else None,
                    "observed_at": a.observed_at,
                    "confidence": a.confidence,
                    "authority_tier": a.authority_tier.value,
                }
                for a in matched_alerts
            ]

            # Highest severity among agreeing sources
            severities = [a.severity for a in matched_alerts]
            highest_sev = (
                HazardSeverity.CRITICAL
                if HazardSeverity.CRITICAL in severities
                else HazardSeverity.WARNING
                if HazardSeverity.WARNING in severities
                else HazardSeverity.WATCH
                if HazardSeverity.WATCH in severities
                else HazardSeverity.ADVISORY
            )

            # Consensus confidence boosting
            base_conf = max(a.confidence for a in matched_alerts)
            boosted_conf = min(1.0, round(base_conf + 0.04 * (len(matched_alerts) - 1), 2))

            # Latest timestamp
            latest_issued = max(a.issued_at for a in matched_alerts)
            latest_observed = max(a.observed_at for a in matched_alerts)

            # Canonical primary clone
            merged = primary.model_copy(
                update={
                    "severity": highest_sev,
                    "confidence": boosted_conf,
                    "sources_matched": sources,
                    "evidence_sources": evidence_sources,
                    "issued_at": latest_issued,
                    "observed_at": latest_observed,
                }
            )
            consolidated.append(merged)

    return consolidated


# ===========================================================================
# 7. Priority Ranking Engine
# ===========================================================================


def rank_alerts_by_priority(alerts: list[NormalizedAlert]) -> list[NormalizedAlert]:
    """Rank alerts in strict operational priority:

    1. Critical official warnings
    2. High-risk local warnings
    3. Moderate advisories
    4. Forecast risks
    5. Normal weather context
    """

    def ranking_score(a: NormalizedAlert) -> tuple[int, float, str]:
        # Tier 1: Severity weight
        sev_rank = 0
        if a.severity == HazardSeverity.CRITICAL:
            sev_rank = 100
        elif a.severity == HazardSeverity.WARNING:
            sev_rank = 70
        elif a.severity == HazardSeverity.WATCH:
            sev_rank = 40
        else:
            sev_rank = 10

        # Tier 2: Authority boost
        auth_weight = AUTHORITY_WEIGHTS.get(a.authority_tier, 0.5) * 20.0

        # Tier 3: Proximity boost (closer = higher)
        dist_bonus = 0.0
        if a.distance_km is not None:
            dist_bonus = max(0.0, 10.0 - min(10.0, a.distance_km / 5.0))
        elif a.is_inside_geometry or a.is_within_affected_area:
            dist_bonus = 10.0

        total_score = sev_rank + auth_weight + dist_bonus
        return (
            -int(total_score),
            a.distance_km if a.distance_km is not None else 999.0,
            a.issued_at,
        )

    return sorted(alerts, key=ranking_score)
