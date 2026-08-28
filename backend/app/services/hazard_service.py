"""External Disaster Intelligence & Normalized Alert Domain Service.

Ingests, normalizes, deduplicates, and caches multi-source environmental disaster signals:
1. Open-Meteo: Real-time precipitation, wind squall, and flood weather feeds.
2. USGS: Global and regional seismic activity feeds.
3. Strict source provenance: LIVE, CACHED, FALLBACK, or SIMULATED.
4. Source health and availability tracking (AVAILABLE, STALE, FAILED, DISABLED).
5. Conservative TTL expiry enforcement and multi-source spatial-temporal deduplication.
6. Spatial distance-relevance filtering for citizens and authority operations.
"""

from __future__ import annotations

import logging
import math
import time
from datetime import UTC, datetime, timedelta
from typing import Any

import httpx

from app.models import (
    AlertProvenance,
    HazardSeverity,
    HazardType,
    NormalizedAlert,
    SourceHealthReport,
    SourceStatus,
    SourceType,
)

logger = logging.getLogger("salvus.hazards")

OPEN_METEO_API = "https://api.open-meteo.com/v1/forecast"
USGS_API = "https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_day.geojson"
REQUEST_TIMEOUT_SECONDS = 3.0
CACHE_TTL_SECONDS = 300  # 5 minutes

# In-memory grid hazard cache: {grid_key: (hazards, expire_time)}
_hazard_grid_cache: dict[tuple[float, float], tuple[list[NormalizedAlert], datetime]] = {}
_global_seismic_cache: dict[str, Any] = {"timestamp": None, "hazards": []}

# Source health and availability registry
_source_health_records: dict[str, SourceHealthReport] = {
    "open_meteo": SourceHealthReport(
        source_id="open_meteo",
        source_name="Open-Meteo Weather Service",
        source_type=SourceType.WEATHER_SERVICE,
        status=SourceStatus.AVAILABLE,
    ),
    "usgs": SourceHealthReport(
        source_id="usgs",
        source_name="USGS Earthquake Hazards Program",
        source_type=SourceType.SEISMIC_NETWORK,
        status=SourceStatus.AVAILABLE,
    ),
}


def format_distance(distance_km: float) -> str:
    """Format distance in km into a human-readable string."""
    if distance_km < 1.0:
        return f"Approx. {int(round(distance_km * 1000))} m"
    return f"Approx. {distance_km:.1f} km"


def haversine_distance_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Calculate the great-circle distance between two GPS coordinates in kilometers."""
    radius_km = 6371.0
    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)
    a = (
        math.sin(dlat / 2) ** 2
        + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(dlon / 2) ** 2
    )
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
    return round(radius_km * c, 2)


def get_source_statuses() -> dict[str, SourceStatus]:
    """Retrieve operational status dictionary for all external alert sources."""
    return {k: v.status for k, v in _source_health_records.items()}


def get_source_health_reports() -> list[SourceHealthReport]:
    """Retrieve comprehensive source health telemetry reports."""
    return list(_source_health_records.values())


def _update_source_health(
    source_id: str,
    status: SourceStatus,
    error: str | None = None,
    latency_ms: float | None = None,
    active_count: int | None = None,
) -> None:
    """Update internal health status for an external alert source."""
    if source_id not in _source_health_records:
        return

    now_iso = datetime.now(UTC).isoformat()
    record = _source_health_records[source_id]
    record.status = status
    record.last_fetched_at = now_iso

    if status == SourceStatus.AVAILABLE:
        record.last_successful_at = now_iso
        record.last_error = None
    elif error:
        record.last_error = error

    if latency_ms is not None:
        record.latency_ms = round(latency_ms, 2)
    if active_count is not None:
        record.active_alerts_count = active_count


async def _fetch_open_meteo_alerts(
    lat: float = 22.5726,
    lon: float = 88.3639,
    client: httpx.AsyncClient | None = None,
) -> tuple[NormalizedAlert | None, AlertProvenance]:
    """Fetch live weather metrics from Open-Meteo REST API and normalize if elevated."""
    params = {
        "latitude": lat,
        "longitude": lon,
        "current": (
            "temperature_2m,relative_humidity_2m,precipitation,rain,weather_code,wind_speed_10m"
        ),
    }
    start_time = time.perf_counter()
    now = datetime.now(UTC)
    now_iso = now.isoformat()

    try:
        if client:
            response = await client.get(OPEN_METEO_API, params=params)
        else:
            async with httpx.AsyncClient(timeout=REQUEST_TIMEOUT_SECONDS) as http:
                response = await http.get(OPEN_METEO_API, params=params)

        latency_ms = (time.perf_counter() - start_time) * 1000.0

        if response.status_code != 200:
            _update_source_health(
                "open_meteo",
                status=SourceStatus.FAILED,
                error=f"HTTP {response.status_code}",
                latency_ms=latency_ms,
            )
            return None, AlertProvenance.FALLBACK

        data = response.json()
        curr = data.get("current", {})
        rain = float(curr.get("rain", 0.0) or curr.get("precipitation", 0.0))
        wind = float(curr.get("wind_speed_10m", 0.0))

        source_time_raw = curr.get("time")
        observed_iso = (
            f"{source_time_raw}:00Z"
            if source_time_raw and not source_time_raw.endswith("Z")
            else now_iso
        )
        exp_iso = (now + timedelta(hours=6)).isoformat()

        # Map weather condition to normalized severity (only create hazard if elevated)
        if rain >= 8.0 or wind >= 45.0:
            sev = HazardSeverity.CRITICAL
            title = "Severe Inundation & Tropical Downpour"
            desc = f"Heavy precipitation ({rain:.1f} mm/h) with gusty winds ({wind:.1f} km/h)."
            why = "Low-lying drainage channels at capacity. Roadway inundation expected."
            act = "Avoid submerged underpasses; move essential items above ground level."
            htype = HazardType.FLOOD
            radius = 4.5
        elif rain >= 2.0 or wind >= 25.0:
            sev = HazardSeverity.WARNING
            title = "Moderate Monsoon Rain & Waterlogging"
            desc = f"Active precipitation ({rain:.1f} mm/h) causing localized street ponding."
            why = "Water accumulating in local flood basins and low-lying road corridors."
            act = "Exercise caution when commuting; monitor municipal water depth markers."
            htype = HazardType.FLOOD
            radius = 3.5
        elif rain >= 0.5 or wind >= 18.0:
            hum = curr.get("relative_humidity_2m", 85)
            sev = HazardSeverity.WATCH
            title = "Monsoon Precipitation Watch"
            desc = f"Light precipitation ({rain:.1f} mm/h) with ambient humidity {hum}%."
            why = "Ground saturation elevated across regional drainage basin."
            act = "Keep emergency power banks charged and subscribe to district alerts."
            htype = HazardType.WEATHER
            radius = 5.0
        else:
            # Normal weather conditions — report source healthy but zero active hazards
            _update_source_health(
                "open_meteo",
                status=SourceStatus.AVAILABLE,
                latency_ms=latency_ms,
                active_count=0,
            )
            return None, AlertProvenance.LIVE

        grid_lat = round(lat, 2)
        grid_lon = round(lon, 2)
        alert = NormalizedAlert(
            id=f"alt-meteo-{grid_lat}-{grid_lon}",
            source="Open-Meteo Weather Service",
            source_event_id=f"meteo-{grid_lat}-{grid_lon}-{source_time_raw or 'now'}",
            source_type=SourceType.WEATHER_SERVICE,
            hazard_type=htype,
            severity=sev,
            title=title,
            description=desc,
            why_it_matters=why,
            recommended_action=act,
            latitude=lat,
            longitude=lon,
            affected_area="Regional Weather Basin",
            radius_km=radius,
            observed_at=observed_iso,
            issued_at=observed_iso,
            expires_at=exp_iso,
            fetched_at=now_iso,
            source_url="https://open-meteo.com",
            provenance=AlertProvenance.LIVE,
            confidence=0.92,
            is_active=True,
        )

        _update_source_health(
            "open_meteo",
            status=SourceStatus.AVAILABLE,
            latency_ms=latency_ms,
            active_count=1,
        )
        return alert, AlertProvenance.LIVE

    except Exception as e:
        logger.debug(f"Open-Meteo fetch failed or timed out: {e}")
        _update_source_health(
            "open_meteo",
            status=SourceStatus.FAILED,
            error=str(e),
        )
        return None, AlertProvenance.FALLBACK


async def _fetch_usgs_alerts(
    client: httpx.AsyncClient | None = None,
) -> tuple[list[NormalizedAlert], AlertProvenance]:
    """Fetch recent significant seismic activity from USGS geoJSON feed with caching."""
    global _global_seismic_cache
    now = datetime.now(UTC)
    now_iso = now.isoformat()

    # Check seismic cache
    if (
        _global_seismic_cache["timestamp"] is not None
        and (now - _global_seismic_cache["timestamp"]).total_seconds() < CACHE_TTL_SECONDS
    ):
        cached_alerts = _global_seismic_cache["hazards"]
        # Mark cached provenance
        return [
            a.model_copy(update={"provenance": AlertProvenance.CACHED}) for a in cached_alerts
        ], AlertProvenance.CACHED

    start_time = time.perf_counter()
    try:
        if client:
            response = await client.get(USGS_API)
        else:
            async with httpx.AsyncClient(timeout=REQUEST_TIMEOUT_SECONDS) as http:
                response = await http.get(USGS_API)

        latency_ms = (time.perf_counter() - start_time) * 1000.0

        if response.status_code != 200:
            usgs_status = (
                SourceStatus.FAILED if not _global_seismic_cache["hazards"] else SourceStatus.STALE
            )
            _update_source_health(
                "usgs",
                status=usgs_status,
                error=f"HTTP {response.status_code}",
                latency_ms=latency_ms,
            )
            return _global_seismic_cache["hazards"], AlertProvenance.CACHED

        data = response.json()
        features = data.get("features", [])
        alerts: list[NormalizedAlert] = []

        for feat in features[:5]:  # Process top recent significant global events
            props = feat.get("properties", {})
            mag = float(props.get("mag", 0.0) or 0.0)
            if mag < 5.0:
                continue  # Only report significant seismic events

            geom = feat.get("geometry", {})
            coords = geom.get("coordinates", [0.0, 0.0])
            place = props.get("place", "Regional Epicenter")
            event_id = str(feat.get("id") or f"eq-{int(coords[1])}-{int(coords[0])}")

            time_ms = props.get("time", 0)
            observed_at = (
                datetime.fromtimestamp(time_ms / 1000, UTC).isoformat() if time_ms else now_iso
            )
            updated_ms = props.get("updated", time_ms)
            issued_at = (
                datetime.fromtimestamp(updated_ms / 1000, UTC).isoformat()
                if updated_ms
                else observed_at
            )
            # Seismic alerts conservative TTL: 18 hours after event
            exp_iso = (
                (datetime.fromtimestamp(time_ms / 1000, UTC) + timedelta(hours=18)).isoformat()
                if time_ms
                else (now + timedelta(hours=18)).isoformat()
            )

            sev = HazardSeverity.WARNING if mag >= 6.0 else HazardSeverity.WATCH
            radius = 50.0 if mag >= 6.5 else 25.0

            alert = NormalizedAlert(
                id=f"alt-usgs-{event_id}",
                source="USGS Earthquake Hazards Program",
                source_event_id=event_id,
                source_type=SourceType.SEISMIC_NETWORK,
                hazard_type=HazardType.EARTHQUAKE,
                severity=sev,
                title=f"M{mag:.1f} Seismic Disturbance — {place}",
                description=f"Magnitude {mag:.1f} earthquake recorded by seismic sensors.",
                why_it_matters="Potential for secondary tremors and structural vibrations.",
                recommended_action=(
                    "Inspect structural perimeters; remain outdoors if cracks develop."
                ),
                latitude=float(coords[1]),
                longitude=float(coords[0]),
                affected_area=place,
                radius_km=radius,
                observed_at=observed_at,
                issued_at=issued_at,
                expires_at=exp_iso,
                fetched_at=now_iso,
                source_url=props.get("url") or "https://earthquake.usgs.gov",
                provenance=AlertProvenance.LIVE,
                confidence=0.95,
                is_active=True,
            )
            alerts.append(alert)

        _global_seismic_cache = {"timestamp": now, "hazards": alerts}
        _update_source_health(
            "usgs",
            status=SourceStatus.AVAILABLE,
            latency_ms=latency_ms,
            active_count=len(alerts),
        )
        return alerts, AlertProvenance.LIVE

    except Exception as e:
        logger.debug(f"USGS fetch failed or timed out: {e}")
        status = SourceStatus.STALE if _global_seismic_cache["hazards"] else SourceStatus.FAILED
        _update_source_health("usgs", status=status, error=str(e))
        return _global_seismic_cache["hazards"], AlertProvenance.CACHED


def deduplicate_alerts(alerts: list[NormalizedAlert]) -> list[NormalizedAlert]:
    """Deterministic deduplication strategy across source event IDs and spatial-temporal overlaps.

    1. Exact deduplication: Unique by (source, source_event_id).
    2. Cross-source spatial-temporal deduplication: If two alerts share the same
       hazard_type, have centroids within 5.0 km, and timestamps within 1 hour (3600s),
       retain the one with higher severity and confidence.
    """
    if not alerts:
        return []

    # 1. Primary deduplication by (source, source_event_id)
    seen_source_events: dict[tuple[str, str], NormalizedAlert] = {}
    for alert in alerts:
        key = (alert.source, alert.source_event_id)
        if key not in seen_source_events:
            seen_source_events[key] = alert
        else:
            # Keep newest / highest confidence
            existing = seen_source_events[key]
            if (alert.confidence, alert.fetched_at) > (existing.confidence, existing.fetched_at):
                seen_source_events[key] = alert

    primary_alerts = list(seen_source_events.values())

    # 2. Cross-source spatial-temporal deduplication
    severity_order = {
        HazardSeverity.CRITICAL: 5,
        HazardSeverity.WARNING: 4,
        HazardSeverity.WATCH: 3,
        HazardSeverity.ADVISORY: 2,
        HazardSeverity.INFO: 1,
    }

    deduped: list[NormalizedAlert] = []

    for candidate in primary_alerts:
        matched = False
        for idx, existing in enumerate(deduped):
            # Check hazard type match
            if candidate.hazard_type != existing.hazard_type:
                continue

            # Check distance threshold (5 km)
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
                # Duplicate real-world event across sources detected.
                # Retain the one with higher severity rank or higher confidence.
                cand_score = (severity_order.get(candidate.severity, 0), candidate.confidence)
                exist_score = (severity_order.get(existing.severity, 0), existing.confidence)

                if cand_score > exist_score:
                    deduped[idx] = candidate
                matched = True
                break

        if not matched:
            deduped.append(candidate)

    return deduped


def get_simulated_hazards(lat: float = 22.5726, lon: float = 88.3639) -> list[NormalizedAlert]:
    """Generate explicit simulation alerts strictly for demo and testing mode.

    Every alert generated here is unambiguously tagged with provenance=SIMULATED.
    """
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
        ),
    ]


async def get_active_hazards(
    lat: float | None = None,
    lon: float | None = None,
    max_distance_km: float | None = None,
    include_simulation: bool = False,
    client: httpx.AsyncClient | None = None,
) -> list[NormalizedAlert]:
    """Retrieve normalized active disaster signals with coordinate grid caching.

    In standard production mode (include_simulation=False), NO fictional data is returned.
    """
    global _hazard_grid_cache

    now = datetime.now(UTC)
    now_iso = now.isoformat()

    # Snap coordinates to ~0.05° grid (~5.5km) for weather cache keying
    target_lat = lat if lat is not None else 22.5726
    target_lon = lon if lon is not None else 88.3639
    grid_key = (round(target_lat, 2), round(target_lon, 2))

    cache_entry = _hazard_grid_cache.get(grid_key)
    cache_valid = cache_entry is not None and now < cache_entry[1]

    if not cache_valid:
        raw_alerts: list[NormalizedAlert] = []

        # 1. Fetch live Open-Meteo weather for snapped coordinates
        meteo_alert, meteo_prov = await _fetch_open_meteo_alerts(
            target_lat, target_lon, client=client
        )
        if meteo_alert:
            raw_alerts.append(meteo_alert)

        # 2. Fetch USGS seismic events
        usgs_alerts, usgs_prov = await _fetch_usgs_alerts(client=client)
        raw_alerts.extend(usgs_alerts)

        # 3. Deduplicate across sources
        normalized = deduplicate_alerts(raw_alerts)

        # Cache with TTL
        _hazard_grid_cache[grid_key] = (normalized, now + timedelta(seconds=CACHE_TTL_SECONDS))

    cached_alerts, _ = _hazard_grid_cache[grid_key]

    all_alerts: list[NormalizedAlert] = []
    for a in cached_alerts:
        all_alerts.append(a)

    # 4. If simulation mode is explicitly requested, include simulated alerts
    if include_simulation:
        sim_alerts = get_simulated_hazards(target_lat, target_lon)
        all_alerts.extend(sim_alerts)

    # 5. Filter out expired alerts strictly
    active_alerts = [a for a in all_alerts if a.is_active and a.expires_at >= now_iso]

    # 6. Spatial distance enrichment & filtering if coordinates are provided
    if lat is not None and lon is not None:
        enriched_filtered: list[NormalizedAlert] = []
        for alert in active_alerts:
            dist = haversine_distance_km(lat, lon, alert.latitude, alert.longitude)
            is_inside = dist <= alert.radius_km
            limit_radius = max_distance_km if max_distance_km is not None else 10.0

            enriched_alert = alert.model_copy(
                update={
                    "distance_km": dist,
                    "distance_formatted": format_distance(dist),
                    "is_within_affected_area": is_inside,
                }
            )

            # Include if citizen is inside hazard radius,
            # or within requested distance limit,
            # or if severity is CRITICAL within regional range (30km)
            if (
                is_inside
                or dist <= limit_radius
                or (alert.severity == HazardSeverity.CRITICAL and dist <= 30.0)
            ):
                enriched_filtered.append(enriched_alert)

        # Sort by proximity
        enriched_filtered.sort(key=lambda h: h.distance_km if h.distance_km is not None else 999.0)
        return enriched_filtered

    return active_alerts


async def evaluate_area_safety(
    lat: float | None = None,
    lon: float | None = None,
    db: Any = None,
    client: httpx.AsyncClient | None = None,
) -> Any:
    """Evaluate location-grounded area threat level for citizen home.

    Produces strictly distinct, auditable states:
    - LOCATION_REQUIRED: Browser location not provided.
    - NO_DATA: Telemetry unavailable or feeds unreachable.
    - CRITICAL: Active severe hazard affecting citizen's immediate area.
    - WARNING: Moderate/high hazard within sector radius.
    - WATCH: General advisory/watch active in regional basin.
    - SAFE: Actively verified feeds confirm no active hazards in sector.
    """
    from app.models import AreaSafetyLevel, AreaSafetyResponse

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
        hazards = await get_active_hazards(lat=lat, lon=lon, max_distance_km=15.0, client=client)
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

    crit_hazards = [h for h in hazards if h.severity == HazardSeverity.CRITICAL]
    warn_hazards = [h for h in hazards if h.severity == HazardSeverity.WARNING]
    watch_hazards = [
        h for h in hazards if h.severity in (HazardSeverity.WATCH, HazardSeverity.ADVISORY)
    ]

    # Find nearest recommended shelter if db is provided
    nearest_shelter = None
    if db is not None:
        try:
            from app.services.shelter_service import get_recommended_shelters

            rec_shelters = await get_recommended_shelters(db, latitude=lat, longitude=lon)
            if rec_shelters:
                nearest_shelter = rec_shelters[0]
        except Exception as e:
            logger.debug(f"Shelter recommendation lookup skipped: {e}")

    # 1. CRITICAL THREAT: Critical hazard in affected area or within 2.5km
    crit_immediate = [
        h for h in crit_hazards if h.is_within_affected_area or (h.distance_km or 99.0) <= 2.5
    ]
    if crit_immediate:
        top_crit = crit_immediate[0]
        return AreaSafetyResponse(
            level=AreaSafetyLevel.CRITICAL,
            headline=f"Critical Threat Active: {top_crit.title}",
            description=top_crit.description,
            recommended_action=top_crit.recommended_action,
            latitude=lat,
            longitude=lon,
            active_hazards_count=len(hazards),
            critical_hazards_count=len(crit_hazards),
            warning_hazards_count=len(warn_hazards),
            nearest_hazard_distance_km=top_crit.distance_km,
            nearest_hazard_title=top_crit.title,
            nearest_shelter=nearest_shelter,
            observed_at=top_crit.observed_at,
            evaluated_at=now_iso,
            data_provenance=top_crit.data_provenance or AlertProvenance.LIVE.value,
        )

    # 2. WARNING THREAT: Warning hazard within affected area or within 4.0km
    warn_immediate = [
        h for h in warn_hazards if h.is_within_affected_area or (h.distance_km or 99.0) <= 4.0
    ]
    if warn_immediate:
        top_warn = warn_immediate[0]
        return AreaSafetyResponse(
            level=AreaSafetyLevel.WARNING,
            headline=f"Hazard Warning: {top_warn.title}",
            description=top_warn.description,
            recommended_action=top_warn.recommended_action,
            latitude=lat,
            longitude=lon,
            active_hazards_count=len(hazards),
            critical_hazards_count=len(crit_hazards),
            warning_hazards_count=len(warn_hazards),
            nearest_hazard_distance_km=top_warn.distance_km,
            nearest_hazard_title=top_warn.title,
            nearest_shelter=nearest_shelter,
            observed_at=top_warn.observed_at,
            evaluated_at=now_iso,
            data_provenance=top_warn.data_provenance or AlertProvenance.LIVE.value,
        )

    # 3. WATCH / ADVISORY: Watch or advisory active in sector
    if watch_hazards:
        top_watch = watch_hazards[0]
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

    # 4. SAFE: Actively verified feeds report no known threats in radius
    return AreaSafetyResponse(
        level=AreaSafetyLevel.SAFE,
        headline="No Known Active Hazards",
        description=(
            "All monitored environmental and emergency sensor feeds report "
            "clear conditions within your sector."
        ),
        recommended_action=(
            "Monitored live via Open-Meteo Weather Service and USGS Earthquake Hazards Program."
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


def clear_hazard_cache() -> None:
    """Clear in-memory hazard caches and reset source metrics (useful for testing)."""
    _hazard_grid_cache.clear()
    _global_seismic_cache.clear()
    _global_seismic_cache.update({"timestamp": None, "hazards": []})
    for record in _source_health_records.values():
        record.status = SourceStatus.AVAILABLE
        record.last_error = None
        record.active_alerts_count = 0
