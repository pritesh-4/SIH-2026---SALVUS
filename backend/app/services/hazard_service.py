"""External Disaster Intelligence & Normalized Alert Domain Service (Phase 3).

Orchestrates multi-source verified alert ingestion across decoupled adapters:
1. SACHET / NDMA: India-focused civil defense CAP/JSON alerts with ETag queries.
2. GDACS: Global disaster awareness and major multi-hazard coordination (TC, EQ, FL).
3. USGS: Real-time seismic network feeds with magnitude-scaled severity & radius.
4. Open-Meteo: Contextual meteorological telemetry with non-alarmist thresholds.
5. Strict source provenance: LIVE, CACHED, FALLBACK, or SIMULATED.
6. Fault isolation: Single provider outages never degrade other active feeds.
7. Geo-Relevance Engine: Hazard-specific spatial envelopes & point-in-polygon containment.
8. Citizen location relevance filtering, priority sorting, and Area Safety Level evaluations.
"""

from __future__ import annotations

import asyncio
import logging
from datetime import UTC, datetime, timedelta
from typing import Any

import httpx

from app.adapters import (
    GDACSAdapter,
    OpenMeteoAdapter,
    SachetAdapter,
    USGSAdapter,
)
from app.models import (
    AlertProvenance,
    AreaSafetyLevel,
    AreaSafetyResponse,
    HazardSeverity,
    HazardType,
    NormalizedAlert,
    RelevanceLevel,
    SourceHealthReport,
    SourceStatus,
    SourceType,
    WeatherIntelligenceResponse,
)
from app.services.geo_service import (
    evaluate_alert_relevance,
    format_relative_time,
    haversine_distance_km,
)

logger = logging.getLogger("salvus.hazards")

# Adapter instances
sachet_adapter = SachetAdapter()
gdacs_adapter = GDACSAdapter()
usgs_adapter = USGSAdapter()
open_meteo_adapter = OpenMeteoAdapter()

# Backward-compatible in-memory grid hazard cache reference
_hazard_grid_cache: dict[tuple[float, float], tuple[list[NormalizedAlert], datetime]] = {}


def clear_hazard_cache() -> None:
    """Clear all in-memory adapter and grid caches (useful for tests)."""
    global _hazard_grid_cache
    _hazard_grid_cache.clear()
    sachet_adapter.clear_cache()
    gdacs_adapter.clear_cache()
    usgs_adapter.clear_cache()
    open_meteo_adapter.clear_cache()


def format_distance(distance_km: float) -> str:
    """Format distance in km into a human-readable string."""
    if distance_km < 1.0:
        return f"Approx. {int(round(distance_km * 1000))} m"
    return f"Approx. {distance_km:.1f} km"


def get_source_statuses() -> dict[str, SourceStatus]:
    """Retrieve operational status dictionary for all external alert sources."""
    return {
        sachet_adapter.source_id: sachet_adapter.get_health().status,
        gdacs_adapter.source_id: gdacs_adapter.get_health().status,
        usgs_adapter.source_id: usgs_adapter.get_health().status,
        open_meteo_adapter.source_id: open_meteo_adapter.get_health().status,
    }


def get_source_health_reports() -> list[SourceHealthReport]:
    """Retrieve comprehensive source health telemetry reports across all adapters."""
    return [
        sachet_adapter.get_health(),
        gdacs_adapter.get_health(),
        usgs_adapter.get_health(),
        open_meteo_adapter.get_health(),
    ]


async def get_weather_intelligence(
    lat: float, lon: float, client: httpx.AsyncClient | None = None
) -> WeatherIntelligenceResponse:
    """Retrieve normalized weather telemetry and hourly forecast from Open-Meteo adapter."""
    return await open_meteo_adapter.fetch_weather_intelligence(lat=lat, lon=lon, client=client)


# Backward compatibility helper for legacy unit test calls
async def _fetch_open_meteo_alerts(
    lat: float, lon: float, client: httpx.AsyncClient | None = None
) -> tuple[NormalizedAlert | None, AlertProvenance]:
    """Backward compatibility wrapper delegating to OpenMeteoAdapter."""
    alerts, prov = await open_meteo_adapter.fetch_alerts(lat=lat, lon=lon, client=client)
    return (alerts[0] if alerts else None), prov


async def _fetch_usgs_alerts(
    client: httpx.AsyncClient | None = None,
) -> tuple[list[NormalizedAlert], AlertProvenance]:
    """Backward compatibility wrapper delegating to USGSAdapter."""
    return await usgs_adapter.fetch_alerts(client=client)


def deduplicate_alerts(alerts: list[NormalizedAlert]) -> list[NormalizedAlert]:
    """Deduplicate raw alerts by (source, event_id) and spatial-temporal overlap."""
    if not alerts:
        return []

    # 1. Primary deduplication by (source, source_event_id)
    seen_events: dict[tuple[str, str], NormalizedAlert] = {}
    for a in alerts:
        key = (a.source, a.source_event_id)
        if key not in seen_events:
            # Initialize sources_matched with primary source
            if not a.sources_matched:
                a.sources_matched = [a.source]
            seen_events[key] = a
        else:
            # If duplicate event ID from same provider, retain the higher-confidence one
            existing = seen_events[key]
            if a.confidence > existing.confidence:
                seen_events[key] = a

    deduped_primary = list(seen_events.values())

    # 2. Cross-source spatial-temporal deduplication
    severity_order = {
        HazardSeverity.CRITICAL: 4,
        HazardSeverity.WARNING: 3,
        HazardSeverity.WATCH: 2,
        HazardSeverity.ADVISORY: 1,
        HazardSeverity.INFO: 0,
    }

    final_alerts: list[NormalizedAlert] = []
    for candidate in deduped_primary:
        duplicate_found = False
        for i, existing in enumerate(final_alerts):
            if candidate.hazard_type != existing.hazard_type:
                continue

            # Check spatial distance (within 5km)
            dist = haversine_distance_km(
                candidate.latitude, candidate.longitude, existing.latitude, existing.longitude
            )
            if dist > 5.0:
                continue

            # Check time threshold (within 1 hour / 3600s)
            try:
                obs1 = candidate.observed_at.replace("Z", "+00:00")
                obs2 = existing.observed_at.replace("Z", "+00:00")
                t1 = datetime.fromisoformat(obs1).timestamp()
                t2 = datetime.fromisoformat(obs2).timestamp()
                time_diff = abs(t1 - t2)
            except Exception:
                time_diff = 0

            if time_diff <= 3600:
                # Merge multi-source report preserving composite provenance
                sources = set(existing.sources_matched or [existing.source])
                sources.update(candidate.sources_matched or [candidate.source])
                sorted_sources = sorted(sources)

                cand_score = (severity_order.get(candidate.severity, 0), candidate.confidence)
                exist_score = (severity_order.get(existing.severity, 0), existing.confidence)

                chosen = candidate if cand_score > exist_score else existing
                chosen_dict = chosen.model_dump()
                chosen_dict["sources_matched"] = sorted_sources
                if len(sorted_sources) > 1:
                    chosen_dict["source"] = " + ".join(sorted_sources)

                final_alerts[i] = NormalizedAlert.model_validate(chosen_dict)
                duplicate_found = True
                break

        if not duplicate_found:
            final_alerts.append(candidate)

    return final_alerts


def get_simulated_hazards(lat: float = 22.5726, lon: float = 88.3639) -> list[NormalizedAlert]:
    """Generate explicitly marked simulated alerts for training drills and testing."""
    now = datetime.now(UTC)
    now_iso = now.isoformat()
    exp_iso = (now + timedelta(hours=4)).isoformat()

    return [
        NormalizedAlert(
            id="sim-hz-flood-01",
            source="Salvus Disaster Simulation Engine",
            source_event_id="sim-flood-sector12",
            source_type=SourceType.SIMULATION_ENGINE,
            hazard_type=HazardType.FLOOD,
            severity=HazardSeverity.CRITICAL,
            title="[SIMULATION] Urban Inundation Surge — Sector 12",
            description="Simulated storm runoff canal surge with simulated depth 1.1m.",
            why_it_matters="Ground level flooding blocking access along primary arterial routes.",
            recommended_action="Follow designated elevated evacuation corridor to nearest refuge.",
            latitude=lat + 0.0054,
            longitude=lon + 0.0071,
            affected_area="Sector 12 Low-Lying Drainage Corridor",
            radius_km=2.2,
            observed_at=now_iso,
            issued_at=now_iso,
            expires_at=exp_iso,
            fetched_at=now_iso,
            source_url="https://salvus.emergency/simulation",
            provenance=AlertProvenance.SIMULATED,
            confidence=1.0,
            is_active=True,
            sources_matched=["Salvus Disaster Simulation Engine"],
        ),
        NormalizedAlert(
            id="sim-hz-power-02",
            source="Salvus Disaster Simulation Engine",
            source_event_id="sim-power-karunamoyee",
            source_type=SourceType.SIMULATION_ENGINE,
            hazard_type=HazardType.INFRASTRUCTURE,
            severity=HazardSeverity.WARNING,
            title="[SIMULATION] De-energized Feeder Cable Alert",
            description="Simulated downed distribution line undergoing isolation by utility teams.",
            why_it_matters="Potential electrocution hazard within immediate 200m perimeter.",
            recommended_action="Do not enter standing water near Karunamoyee junction.",
            latitude=lat + 0.0115,
            longitude=lon + 0.0481,
            affected_area="Karunamoyee Block C",
            radius_km=0.8,
            observed_at=now_iso,
            issued_at=now_iso,
            expires_at=exp_iso,
            fetched_at=now_iso,
            source_url="https://salvus.emergency/simulation",
            provenance=AlertProvenance.SIMULATED,
            confidence=1.0,
            is_active=True,
            sources_matched=["Salvus Disaster Simulation Engine"],
        ),
    ]


async def get_active_hazards(
    lat: float | None = None,
    lon: float | None = None,
    max_distance_km: float | None = None,
    include_simulation: bool = False,
    client: httpx.AsyncClient | None = None,
) -> list[NormalizedAlert]:
    """Retrieve normalized active disaster signals with Geo-Relevant Alert Engine filtering.

    In standard production mode (include_simulation=False), NO fictional data is returned.
    """
    now = datetime.now(UTC)
    now_iso = now.isoformat()

    # Ingest in parallel with fault isolation across all 4 adapters
    results = await asyncio.gather(
        sachet_adapter.fetch_alerts(lat=lat, lon=lon, client=client),
        gdacs_adapter.fetch_alerts(lat=lat, lon=lon, client=client),
        usgs_adapter.fetch_alerts(lat=lat, lon=lon, client=client),
        open_meteo_adapter.fetch_alerts(lat=lat, lon=lon, client=client),
        return_exceptions=True,
    )

    raw_alerts: list[NormalizedAlert] = []

    # Check SACHET
    if isinstance(results[0], tuple):
        raw_alerts.extend(results[0][0])
    elif isinstance(results[0], Exception):
        logger.warning(f"SACHET adapter execution error: {results[0]}")

    # Check GDACS
    if isinstance(results[1], tuple):
        raw_alerts.extend(results[1][0])
    elif isinstance(results[1], Exception):
        logger.warning(f"GDACS adapter execution error: {results[1]}")

    # Check USGS
    if isinstance(results[2], tuple):
        raw_alerts.extend(results[2][0])
    elif isinstance(results[2], Exception):
        logger.warning(f"USGS adapter execution error: {results[2]}")

    # Check Open-Meteo
    if isinstance(results[3], tuple):
        raw_alerts.extend(results[3][0])
    elif isinstance(results[3], Exception):
        logger.warning(f"Open-Meteo adapter execution error: {results[3]}")

    # Also check legacy cache if populated in tests
    if lat is not None and lon is not None:
        grid_key = (round(lat, 2), round(lon, 2))
        if grid_key in _hazard_grid_cache:
            cached_list, expire_dt = _hazard_grid_cache[grid_key]
            if now < expire_dt:
                raw_alerts.extend(cached_list)
    else:
        for _grid_key, (cached_list, expire_dt) in _hazard_grid_cache.items():
            if now < expire_dt:
                raw_alerts.extend(cached_list)

    # Deduplicate across all active feeds
    authentic_alerts = deduplicate_alerts(raw_alerts)

    # Strict isolation: Only append simulation alerts if explicitly requested
    all_hazards: list[NormalizedAlert] = list(authentic_alerts)
    if include_simulation:
        sim_lat = lat if lat is not None else 22.5726
        sim_lon = lon if lon is not None else 88.3639
        all_hazards.extend(get_simulated_hazards(lat=sim_lat, lon=sim_lon))

    # TTL & Expiry enforcement: Filter out expired or inactive alerts
    active_hazards: list[NormalizedAlert] = []
    for h in all_hazards:
        if not h.is_active:
            continue
        if h.expires_at and h.expires_at < now_iso:
            continue
        active_hazards.append(h)

    # Geo-Relevance Enrichment & Spatial Filtering (Phase 3)
    enriched_hazards: list[NormalizedAlert] = []
    for hz in active_hazards:
        rel_level, dist_km, is_inside = evaluate_alert_relevance(hz, lat, lon)
        rel_time = format_relative_time(hz.observed_at)

        # In citizen location mode (lat/lon provided), strictly filter out IRRELEVANT alerts
        if lat is not None and lon is not None:
            if rel_level == RelevanceLevel.IRRELEVANT:
                continue
            if max_distance_km is not None and dist_km is not None and dist_km > max_distance_km:
                if rel_level != RelevanceLevel.CRITICAL:
                    continue

        hz_dict = hz.model_dump()
        hz_dict["relevance_level"] = rel_level
        hz_dict["distance_km"] = dist_km
        hz_dict["distance_formatted"] = format_distance(dist_km) if dist_km is not None else None
        hz_dict["is_within_affected_area"] = is_inside
        hz_dict["is_inside_geometry"] = is_inside
        hz_dict["relative_time_label"] = rel_time
        if not hz_dict.get("sources_matched"):
            hz_dict["sources_matched"] = [hz.source]

        enriched_hazards.append(NormalizedAlert.model_validate(hz_dict))

    # Priority Sorting (Phase 3):
    # 1. Immediate life safety (Inside affected area + CRITICAL severity) -> Rank 0
    # 2. Relevance Level (CRITICAL -> 0, HIGH -> 1, MODERATE -> 2, LOW -> 3)
    # 3. Hazard Severity (CRITICAL -> 0, WARNING -> 1, WATCH -> 2, ADVISORY -> 3, INFO -> 4)
    # 4. Distance (closest first)
    # 5. Recency (descending observed_at)
    relevance_rank = {
        RelevanceLevel.CRITICAL: 0,
        RelevanceLevel.HIGH: 1,
        RelevanceLevel.MODERATE: 2,
        RelevanceLevel.LOW: 3,
        RelevanceLevel.IRRELEVANT: 4,
    }
    severity_rank = {
        HazardSeverity.CRITICAL: 0,
        HazardSeverity.WARNING: 1,
        HazardSeverity.WATCH: 2,
        HazardSeverity.ADVISORY: 3,
        HazardSeverity.INFO: 4,
    }

    def sort_key(alert: NormalizedAlert):
        life_safety = (
            0
            if (alert.is_within_affected_area and alert.severity == HazardSeverity.CRITICAL)
            else 1
        )
        rel_score = relevance_rank.get(alert.relevance_level or RelevanceLevel.LOW, 3)
        sev_score = severity_rank.get(alert.severity, 4)
        dist_score = alert.distance_km if alert.distance_km is not None else 9999.0
        time_score = alert.observed_at or ""
        return (life_safety, rel_score, sev_score, dist_score, time_score)

    enriched_hazards.sort(key=sort_key)
    return enriched_hazards


async def evaluate_area_safety(
    lat: float | None = None,
    lon: float | None = None,
    db: Any | None = None,
    client: httpx.AsyncClient | None = None,
) -> AreaSafetyResponse:
    """Evaluate location-grounded citizen threat level based on active authentic feeds."""
    now_iso = datetime.now(UTC).isoformat()

    if lat is None or lon is None:
        return AreaSafetyResponse(
            level=AreaSafetyLevel.LOCATION_REQUIRED,
            headline="Location Access Off · Overview Mode",
            description=(
                "Enable location to assess local flood corridors, seismic risks, and safe shelters."
            ),
            recommended_action="Turn on browser location or select a landmark fallback.",
            observed_at=now_iso,
            evaluated_at=now_iso,
            data_provenance=AlertProvenance.FALLBACK.value,
        )

    try:
        hazards = await get_active_hazards(lat=lat, lon=lon, max_distance_km=25.0, client=client)
    except Exception as e:
        logger.warning(f"Failed to evaluate active hazards: {e}")
        return AreaSafetyResponse(
            level=AreaSafetyLevel.NO_DATA,
            headline="Status Unconfirmed · Telemetry Offline",
            description=(
                "Disaster intelligence feeds are temporarily unreachable. "
                "Exercise standard precautions."
            ),
            recommended_action=(
                "Stay on high ground and check official emergency radio frequencies."
            ),
            latitude=lat,
            longitude=lon,
            observed_at=now_iso,
            evaluated_at=now_iso,
            data_provenance=AlertProvenance.FALLBACK.value,
        )

    # Filter by geo-relevance levels
    crit_hazards = [
        h
        for h in hazards
        if h.relevance_level == RelevanceLevel.CRITICAL
        or (
            h.severity == HazardSeverity.CRITICAL
            and (h.is_within_affected_area or (h.distance_km or 99.0) <= 2.5)
        )
    ]
    high_hazards = [
        h
        for h in hazards
        if h.relevance_level == RelevanceLevel.HIGH
        or (
            h.severity == HazardSeverity.WARNING
            and (h.is_within_affected_area or (h.distance_km or 99.0) <= 4.0)
        )
    ]
    mod_hazards = [h for h in hazards if h.relevance_level == RelevanceLevel.MODERATE]

    # Find nearest recommended shelter if db is provided
    nearest_shelter = None
    if db is not None:
        try:
            from app.services.shelter_service import get_recommended_shelters

            rec_shelters = await get_recommended_shelters(
                db, latitude=lat, longitude=lon, max_radius_km=25.0
            )
            if rec_shelters:
                nearest_shelter = rec_shelters[0]
        except Exception as e:
            logger.debug(f"Shelter recommendation lookup skipped: {e}")

    # 1. CRITICAL THREAT: Immediate life safety risk at location
    if crit_hazards:
        top_crit = crit_hazards[0]
        return AreaSafetyResponse(
            level=AreaSafetyLevel.CRITICAL,
            headline=f"Critical Threat Active: {top_crit.title}",
            description=top_crit.description,
            recommended_action=top_crit.recommended_action,
            latitude=lat,
            longitude=lon,
            active_hazards_count=len(hazards),
            critical_hazards_count=len(crit_hazards),
            warning_hazards_count=len(high_hazards),
            nearest_hazard_distance_km=top_crit.distance_km,
            nearest_hazard_title=top_crit.title,
            nearest_shelter=nearest_shelter,
            observed_at=top_crit.observed_at,
            evaluated_at=now_iso,
            data_provenance=top_crit.data_provenance or AlertProvenance.LIVE.value,
        )

    # 2. WARNING THREAT: High relevance hazard in sector
    if high_hazards:
        top_warn = high_hazards[0]
        return AreaSafetyResponse(
            level=AreaSafetyLevel.WARNING,
            headline=f"Hazard Warning: {top_warn.title}",
            description=top_warn.description,
            recommended_action=top_warn.recommended_action,
            latitude=lat,
            longitude=lon,
            active_hazards_count=len(hazards),
            critical_hazards_count=0,
            warning_hazards_count=len(high_hazards),
            nearest_hazard_distance_km=top_warn.distance_km,
            nearest_hazard_title=top_warn.title,
            nearest_shelter=nearest_shelter,
            observed_at=top_warn.observed_at,
            evaluated_at=now_iso,
            data_provenance=top_warn.data_provenance or AlertProvenance.LIVE.value,
        )

    # 3. WATCH / ADVISORY: Moderate relevance advisory active in sector
    if mod_hazards:
        top_watch = mod_hazards[0]
        return AreaSafetyResponse(
            level=AreaSafetyLevel.WATCH,
            headline=f"Active Advisory: {top_watch.title}",
            description=top_watch.description,
            recommended_action=top_watch.recommended_action,
            latitude=lat,
            longitude=lon,
            active_hazards_count=len(hazards),
            critical_hazards_count=0,
            warning_hazards_count=0,
            nearest_hazard_distance_km=top_watch.distance_km,
            nearest_hazard_title=top_watch.title,
            nearest_shelter=nearest_shelter,
            observed_at=top_watch.observed_at,
            evaluated_at=now_iso,
            data_provenance=top_watch.data_provenance or AlertProvenance.LIVE.value,
        )

    # 4. Check if feeds are reachable vs completely offline
    statuses = get_source_statuses()
    has_accessible_source = any(
        st in (SourceStatus.AVAILABLE, SourceStatus.STALE) for st in statuses.values()
    )
    if not has_accessible_source and not hazards:
        return AreaSafetyResponse(
            level=AreaSafetyLevel.NO_DATA,
            headline="Status Unconfirmed · Telemetry Offline",
            description=(
                "Disaster intelligence feeds are temporarily unreachable. "
                "Exercise standard precautions."
            ),
            recommended_action=(
                "Stay on high ground and check official emergency radio frequencies."
            ),
            latitude=lat,
            longitude=lon,
            active_hazards_count=0,
            critical_hazards_count=0,
            warning_hazards_count=0,
            nearest_hazard_distance_km=None,
            nearest_hazard_title=None,
            nearest_shelter=nearest_shelter,
            observed_at=now_iso,
            evaluated_at=now_iso,
            data_provenance=AlertProvenance.FALLBACK.value,
        )

    # 5. SAFE: Actively verified feeds report no known threats in sector
    return AreaSafetyResponse(
        level=AreaSafetyLevel.SAFE,
        headline="No Known Active Hazards",
        description=(
            "Available trusted sources currently report no known active hazard "
            "relevant to this location."
        ),
        recommended_action=(
            "Monitored live via Open-Meteo Weather Service, USGS Earthquakes, "
            "GDACS, and SACHET NDMA."
        ),
        latitude=lat,
        longitude=lon,
        active_hazards_count=0,
        critical_hazards_count=0,
        warning_hazards_count=0,
        nearest_hazard_distance_km=None,
        nearest_hazard_title=None,
        nearest_shelter=nearest_shelter,
        observed_at=now_iso,
        evaluated_at=now_iso,
        data_provenance=AlertProvenance.LIVE.value,
    )
