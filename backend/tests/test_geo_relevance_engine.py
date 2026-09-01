"""Comprehensive Unit & Integration Test Suite for Geo-Relevant Alert Engine (Phase 3).

Tests:
1. User inside alert area (Point-in-Polygon containment & Radius geofence).
2. User near alert (Contextual buffer relevance).
3. User far away (IRRELEVANT tier and strictly filtered out).
4. Expired alerts exclusion (TTL & expires_at in the past).
5. Missing geometry fallback to radius & epicenter coordinates.
6. Missing citizen location (LOCATION_REQUIRED / Overview Mode).
7. Multiple sources describing same event (SACHET + GDACS composite attribution).
8. Area safety semantics: SAFE vs NO_DATA vs LOCATION_REQUIRED.
9. Hazard-specific spatial envelopes (Earthquake magnitude scaling vs Flood vs Cyclone vs Weather).
10. Priority sorting (Immediate life safety -> relevance tier -> severity -> distance -> recency).
11. Fault isolation when one or all external alert providers are unavailable.
12. Dedicated REST API routes: GET /api/hazards and GET /api/alerts with lat & lon.
"""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

import httpx
import pytest
from httpx import ASGITransport, AsyncClient

from app.main import app
from app.models import (
    AlertProvenance,
    AreaSafetyLevel,
    HazardSeverity,
    HazardType,
    NormalizedAlert,
    RelevanceLevel,
    SourceStatus,
    SourceType,
)
from app.services.geo_service import (
    distance_point_to_polygon_km,
    evaluate_alert_relevance,
    format_relative_time,
    is_point_in_polygon,
)
from app.services.hazard_service import (
    clear_hazard_cache,
    deduplicate_alerts,
    evaluate_area_safety,
    get_active_hazards,
    get_source_statuses,
)


@pytest.fixture
def anyio_backend():
    return "asyncio"


@pytest.fixture(autouse=True)
def reset_caches():
    """Clear hazard and adapter caches before and after each test."""
    clear_hazard_cache()
    yield
    clear_hazard_cache()


# ===========================================================================
# 1. Geometry & Point-in-Polygon Tests
# ===========================================================================


def test_point_in_polygon_and_boundary_distance():
    """Verify Ray-Casting algorithm and polygon boundary distance calculations."""
    # Define rectangular polygon around Salt Lake Sector 5
    poly = [
        [22.5650, 88.4250],
        [22.5850, 88.4250],
        [22.5850, 88.4450],
        [22.5650, 88.4450],
    ]

    # Point clearly inside
    assert is_point_in_polygon(22.5750, 88.4350, poly) is True
    assert distance_point_to_polygon_km(22.5750, 88.4350, poly) == 0.0

    # Point clearly outside (west of polygon)
    assert is_point_in_polygon(22.5750, 88.4000, poly) is False
    dist_west = distance_point_to_polygon_km(22.5750, 88.4000, poly)
    assert dist_west > 0.0


# ===========================================================================
# 2. Citizen Inside vs Near vs Far Away Tests
# ===========================================================================


def test_user_inside_polygon_alert():
    """Verify citizen inside alert polygon receives CRITICAL relevance and is_inside=True."""
    now_iso = datetime.now(UTC).isoformat()
    poly = [
        [22.5600, 88.3500],
        [22.5900, 88.3500],
        [22.5900, 88.3800],
        [22.5600, 88.3800],
    ]

    flood_alert = NormalizedAlert(
        id="alt-poly-flood",
        source="SACHET / NDMA India",
        source_event_id="flood-poly-01",
        source_type=SourceType.CIVIL_DEFENSE,
        hazard_type=HazardType.FLOOD,
        severity=HazardSeverity.CRITICAL,
        title="Flash Inundation Red Alert",
        description="Hooghly drainage surge.",
        recommended_action="Evacuate ground floors.",
        latitude=22.5750,
        longitude=88.3650,
        affected_area="Central Salt Lake Sector",
        radius_km=5.0,
        observed_at=now_iso,
        issued_at=now_iso,
        expires_at=(datetime.now(UTC) + timedelta(hours=4)).isoformat(),
        fetched_at=now_iso,
        geometry=poly,
    )

    # Citizen inside the polygon
    cit_lat, cit_lon = 22.5750, 88.3650
    rel, dist, inside = evaluate_alert_relevance(flood_alert, cit_lat, cit_lon)

    assert inside is True
    assert dist == 0.0
    assert rel == RelevanceLevel.CRITICAL


def test_user_inside_radius_alert():
    """Verify citizen inside circular alert zone receives CRITICAL relevance."""
    now_iso = datetime.now(UTC).isoformat()
    flood_alert = NormalizedAlert(
        id="alt-rad-flood",
        source="SACHET / NDMA India",
        source_event_id="flood-rad-01",
        source_type=SourceType.CIVIL_DEFENSE,
        hazard_type=HazardType.FLOOD,
        severity=HazardSeverity.CRITICAL,
        title="Urban Flood Alert",
        description="Drainage canal overflow.",
        recommended_action="Stay on elevated ground.",
        latitude=22.5700,
        longitude=88.3600,
        radius_km=3.0,
        observed_at=now_iso,
        issued_at=now_iso,
        expires_at=(datetime.now(UTC) + timedelta(hours=4)).isoformat(),
        fetched_at=now_iso,
    )

    # Citizen 0.5 km away (well inside 3km radius)
    cit_lat, cit_lon = 22.5740, 88.3620
    rel, dist, inside = evaluate_alert_relevance(flood_alert, cit_lat, cit_lon)

    assert inside is True
    assert dist is not None and dist < 1.0
    assert rel == RelevanceLevel.CRITICAL


def test_user_near_alert_buffer():
    """Verify citizen outside but in proximity buffer receives contextual relevance."""
    now_iso = datetime.now(UTC).isoformat()
    flood_alert = NormalizedAlert(
        id="alt-near-flood",
        source="SACHET / NDMA India",
        source_event_id="flood-near-01",
        source_type=SourceType.CIVIL_DEFENSE,
        hazard_type=HazardType.FLOOD,
        severity=HazardSeverity.CRITICAL,
        title="Flash Flood Alert",
        description="Canal surge.",
        recommended_action="Stay on high ground.",
        latitude=22.5700,
        longitude=88.3600,
        radius_km=2.0,
        observed_at=now_iso,
        issued_at=now_iso,
        expires_at=(datetime.now(UTC) + timedelta(hours=4)).isoformat(),
        fetched_at=now_iso,
    )

    # Citizen 2.8 km away (outside 2km radius, but within 3km buffer)
    cit_lat, cit_lon = 22.5950, 88.3600
    rel, dist, inside = evaluate_alert_relevance(flood_alert, cit_lat, cit_lon)

    assert inside is False
    assert dist is not None and 2.0 < dist < 4.0
    assert rel in (RelevanceLevel.HIGH, RelevanceLevel.MODERATE)


def test_user_far_away_marked_irrelevant():
    """Verify citizen far away receives IRRELEVANT classification."""
    now_iso = datetime.now(UTC).isoformat()
    kolkata_flood = NormalizedAlert(
        id="alt-far-flood",
        source="SACHET / NDMA India",
        source_event_id="flood-far-01",
        source_type=SourceType.CIVIL_DEFENSE,
        hazard_type=HazardType.FLOOD,
        severity=HazardSeverity.CRITICAL,
        title="Kolkata Flood Warning",
        description="Local storm overflow.",
        recommended_action="Evacuate.",
        latitude=22.5726,
        longitude=88.3639,
        radius_km=3.0,
        observed_at=now_iso,
        issued_at=now_iso,
        expires_at=(datetime.now(UTC) + timedelta(hours=4)).isoformat(),
        fetched_at=now_iso,
    )

    # Citizen in New Delhi (~1,300 km away)
    delhi_lat, delhi_lon = 28.6139, 77.2090
    rel, dist, inside = evaluate_alert_relevance(kolkata_flood, delhi_lat, delhi_lon)

    assert inside is False
    assert dist is not None and dist > 1000.0
    assert rel == RelevanceLevel.IRRELEVANT


# ===========================================================================
# 3. Hazard-Type Specific Logic (Part 3)
# ===========================================================================


def test_hazard_specific_logic_earthquake():
    """Verify Earthquake relevance combines magnitude scaling, distance, and severity."""
    now_iso = datetime.now(UTC).isoformat()
    exp_iso = (datetime.now(UTC) + timedelta(hours=6)).isoformat()

    # M6.8 Major Earthquake (Radius = 80km, CRITICAL severity)
    major_quake = NormalizedAlert(
        id="alt-m68-quake",
        source="USGS Earthquake Hazards Program",
        source_event_id="usgs-eq-68",
        source_type=SourceType.SEISMIC_NETWORK,
        hazard_type=HazardType.EARTHQUAKE,
        severity=HazardSeverity.CRITICAL,
        title="M6.8 Major Seismic Event",
        description="Severe shaking.",
        recommended_action="Drop, cover, and hold on.",
        latitude=22.5700,
        longitude=88.3600,
        radius_km=80.0,
        observed_at=now_iso,
        issued_at=now_iso,
        expires_at=exp_iso,
        fetched_at=now_iso,
    )

    # Citizen 30km away (inside radius -> CRITICAL)
    rel_in, dist_in, inside_in = evaluate_alert_relevance(major_quake, 22.8000, 88.3600)
    assert inside_in is True
    assert rel_in == RelevanceLevel.CRITICAL

    # Citizen 100km away (within 1.5 * radius buffer -> HIGH)
    rel_near, dist_near, inside_near = evaluate_alert_relevance(major_quake, 23.4000, 88.3600)
    assert inside_near is False
    assert rel_near == RelevanceLevel.HIGH

    # Citizen 180km away (within 3.0 * radius for CRITICAL earthquake -> LOW awareness)
    rel_dist, dist_dist, inside_dist = evaluate_alert_relevance(major_quake, 24.1000, 88.3600)
    assert inside_dist is False
    assert rel_dist == RelevanceLevel.LOW

    # Citizen 500km away -> IRRELEVANT
    rel_far, dist_far, inside_far = evaluate_alert_relevance(major_quake, 27.0000, 88.3600)
    assert rel_far == RelevanceLevel.IRRELEVANT


def test_hazard_specific_logic_cyclone_and_weather():
    """Verify Cyclone and Weather hazard-specific envelopes."""
    now_iso = datetime.now(UTC).isoformat()
    exp_iso = (datetime.now(UTC) + timedelta(hours=6)).isoformat()

    cyclone = NormalizedAlert(
        id="alt-tc-sagar",
        source="GDACS (UN / EU)",
        source_event_id="tc-sagar-01",
        source_type=SourceType.CIVIL_DEFENSE,
        hazard_type=HazardType.CYCLONE,
        severity=HazardSeverity.CRITICAL,
        title="Cyclone Sagar Red Alert",
        description="Category 3 cyclone approaching.",
        recommended_action="Seek storm shelter.",
        latitude=22.5000,
        longitude=88.3000,
        radius_km=100.0,
        observed_at=now_iso,
        issued_at=now_iso,
        expires_at=exp_iso,
        fetched_at=now_iso,
    )

    # Citizen 40km away (inside -> CRITICAL)
    rel_c1, _, inside_c1 = evaluate_alert_relevance(cyclone, 22.8000, 88.3000)
    assert inside_c1 is True
    assert rel_c1 == RelevanceLevel.CRITICAL

    # Citizen 130km away (buffer <= 1.5*rad -> HIGH)
    rel_c2, _, inside_c2 = evaluate_alert_relevance(cyclone, 23.6000, 88.3000)
    assert inside_c2 is False
    assert rel_c2 == RelevanceLevel.HIGH

    # Citizen 180km away (buffer <= 2.0*rad -> LOW)
    rel_c3, _, inside_c3 = evaluate_alert_relevance(cyclone, 24.1000, 88.3000)
    assert rel_c3 == RelevanceLevel.LOW


# ===========================================================================
# 4. Expired Alerts & Missing Geometry Fallback (Part 11)
# ===========================================================================


@pytest.mark.asyncio
async def test_expired_alert_filtered_out():
    """Verify alerts with expires_at in the past are excluded."""
    now = datetime.now(UTC)
    now_iso = now.isoformat()
    past_iso = (now - timedelta(hours=2)).isoformat()
    future_iso = (now + timedelta(hours=4)).isoformat()

    expired_alert = NormalizedAlert(
        id="alt-exp-flood",
        source="SACHET / NDMA India",
        source_event_id="exp-1",
        source_type=SourceType.CIVIL_DEFENSE,
        hazard_type=HazardType.FLOOD,
        severity=HazardSeverity.CRITICAL,
        title="Expired Flash Flood Alert",
        description="Historical event.",
        recommended_action="None.",
        latitude=22.5726,
        longitude=88.3639,
        radius_km=3.0,
        observed_at=(now - timedelta(hours=6)).isoformat(),
        issued_at=(now - timedelta(hours=6)).isoformat(),
        expires_at=past_iso,
        fetched_at=now_iso,
    )

    active_alert = NormalizedAlert(
        id="alt-active-flood",
        source="SACHET / NDMA India",
        source_event_id="act-1",
        source_type=SourceType.CIVIL_DEFENSE,
        hazard_type=HazardType.FLOOD,
        severity=HazardSeverity.CRITICAL,
        title="Current Flash Flood Alert",
        description="Active inundation.",
        recommended_action="Evacuate.",
        latitude=22.5726,
        longitude=88.3639,
        radius_km=3.0,
        observed_at=now_iso,
        issued_at=now_iso,
        expires_at=future_iso,
        fetched_at=now_iso,
    )

    from app.services.hazard_service import _hazard_grid_cache

    _hazard_grid_cache[(22.57, 88.36)] = (
        [expired_alert, active_alert],
        now + timedelta(minutes=5),
    )

    transport = httpx.MockTransport(
        lambda req: httpx.Response(200, json={"features": [], "alerts": []})
    )
    async with httpx.AsyncClient(transport=transport) as client:
        results = await get_active_hazards(lat=22.5726, lon=88.3639, client=client)

    result_ids = [h.id for h in results]
    assert "alt-exp-flood" not in result_ids
    assert "alt-active-flood" in result_ids


def test_missing_geometry_falls_back_to_radius():
    """Verify alert without geometry smoothly falls back to haversine distance and radius."""
    now_iso = datetime.now(UTC).isoformat()
    alert_no_geom = NormalizedAlert(
        id="alt-no-geom",
        source="USGS Earthquake Hazards Program",
        source_event_id="usgs-nogeom",
        source_type=SourceType.SEISMIC_NETWORK,
        hazard_type=HazardType.EARTHQUAKE,
        severity=HazardSeverity.WARNING,
        title="M5.2 Earthquake",
        description="Epicenter tremor.",
        recommended_action="Inspect structures.",
        latitude=22.5700,
        longitude=88.3600,
        radius_km=40.0,
        observed_at=now_iso,
        issued_at=now_iso,
        expires_at=(datetime.now(UTC) + timedelta(hours=4)).isoformat(),
        fetched_at=now_iso,
        geometry=None,
    )

    # Citizen 10km away
    rel, dist, inside = evaluate_alert_relevance(alert_no_geom, 22.6500, 88.3600)
    assert inside is True
    assert dist is not None and 5.0 < dist < 15.0
    assert rel == RelevanceLevel.HIGH


# ===========================================================================
# 5. Missing Citizen Location / Overview Mode (Part 6 & 11)
# ===========================================================================


@pytest.mark.asyncio
async def test_missing_citizen_location_overview_mode():
    """Verify get_active_hazards with lat=None, lon=None operates in Overview Mode."""
    now = datetime.now(UTC)
    now_iso = now.isoformat()
    future_iso = (now + timedelta(hours=4)).isoformat()

    alert1 = NormalizedAlert(
        id="alt-overview-1",
        source="GDACS (UN / EU)",
        source_event_id="gdacs-ov-1",
        source_type=SourceType.CIVIL_DEFENSE,
        hazard_type=HazardType.CYCLONE,
        severity=HazardSeverity.WARNING,
        title="Cyclone Advisory",
        description="Regional storm alert.",
        recommended_action="Monitor forecasts.",
        latitude=20.0000,
        longitude=85.0000,
        radius_km=100.0,
        observed_at=now_iso,
        issued_at=now_iso,
        expires_at=future_iso,
        fetched_at=now_iso,
    )

    from app.services.hazard_service import _hazard_grid_cache

    _hazard_grid_cache[(22.57, 88.36)] = ([alert1], now + timedelta(minutes=5))

    transport = httpx.MockTransport(
        lambda req: httpx.Response(200, json={"features": [], "alerts": []})
    )
    async with httpx.AsyncClient(transport=transport) as client:
        results = await get_active_hazards(lat=None, lon=None, client=client)

    assert len(results) >= 1
    assert results[0].relevance_level in (RelevanceLevel.UNKNOWN, RelevanceLevel.LOW)
    assert results[0].distance_km is None
    assert results[0].is_within_affected_area is False


# ===========================================================================
# 6. Multi-Source Composite Attribution (Part 8 & 11)
# ===========================================================================


def test_multi_source_deduplication_composite_attribution():
    """Verify deduplication preserves multi-source attribution (e.g. SACHET + GDACS)."""
    now = datetime.now(UTC)
    now_iso = now.isoformat()
    future_iso = (now + timedelta(hours=6)).isoformat()

    alert_sachet = NormalizedAlert(
        id="alt-sachet-tc-1",
        source="SACHET / NDMA India",
        source_event_id="ndma-tc-101",
        source_type=SourceType.CIVIL_DEFENSE,
        hazard_type=HazardType.CYCLONE,
        severity=HazardSeverity.WARNING,
        title="Cyclone Sagar Advisory",
        description="Approaching storm.",
        recommended_action="Secure structures.",
        latitude=22.5700,
        longitude=88.3600,
        radius_km=50.0,
        observed_at=now_iso,
        issued_at=now_iso,
        expires_at=future_iso,
        fetched_at=now_iso,
        confidence=0.90,
    )

    alert_gdacs = NormalizedAlert(
        id="alt-gdacs-tc-1",
        source="GDACS (UN / EU)",
        source_event_id="gdacs-tc-999",
        source_type=SourceType.CIVIL_DEFENSE,
        hazard_type=HazardType.CYCLONE,
        severity=HazardSeverity.CRITICAL,
        title="GDACS Red Alert: Tropical Cyclone Sagar",
        description="Category 3 cyclone.",
        recommended_action="Evacuate low-lying areas.",
        latitude=22.5730,  # 0.4 km away
        longitude=88.3620,
        radius_km=60.0,
        observed_at=(now + timedelta(minutes=5)).isoformat(),
        issued_at=(now + timedelta(minutes=5)).isoformat(),
        expires_at=future_iso,
        fetched_at=now_iso,
        confidence=0.95,
    )

    merged = deduplicate_alerts([alert_sachet, alert_gdacs])
    assert len(merged) == 1

    final_alert = merged[0]
    assert final_alert.severity == HazardSeverity.CRITICAL
    assert "GDACS (UN / EU)" in final_alert.sources_matched
    assert "SACHET / NDMA India" in final_alert.sources_matched
    assert "GDACS (UN / EU) + SACHET / NDMA India" in final_alert.source


# ===========================================================================
# 7. Area Safety Semantics (Part 5 & 11: SAFE vs NO_DATA vs LOCATION_REQUIRED)
# ===========================================================================


@pytest.mark.asyncio
async def test_area_safety_location_required_when_coords_missing():
    """Verify evaluate_area_safety returns LOCATION_REQUIRED when coords are omitted."""
    res = await evaluate_area_safety(lat=None, lon=None)
    assert res.level == AreaSafetyLevel.LOCATION_REQUIRED
    assert res.data_provenance == AlertProvenance.FALLBACK.value
    assert "Location Access Off" in res.headline


@pytest.mark.asyncio
async def test_area_safety_safe_when_no_relevant_hazards():
    """Verify evaluate_area_safety returns SAFE when trusted sources report 0 threats in sector."""
    transport = httpx.MockTransport(
        lambda req: httpx.Response(200, json={"features": [], "alerts": []})
    )
    async with httpx.AsyncClient(transport=transport) as client:
        res = await evaluate_area_safety(lat=22.5726, lon=88.3639, client=client)

    assert res.level == AreaSafetyLevel.SAFE
    assert res.active_hazards_count == 0
    assert "No Known Active Hazards" in res.headline
    assert (
        "Available trusted sources currently report no known active hazard "
        "relevant to this location."
    ) in res.description


@pytest.mark.asyncio
async def test_area_safety_no_data_when_all_providers_fail():
    """Verify evaluate_area_safety returns NO_DATA when all providers fail and no cache exists."""
    transport = httpx.MockTransport(lambda req: httpx.Response(500, text="Server Error"))
    async with httpx.AsyncClient(transport=transport) as client:
        res = await evaluate_area_safety(lat=22.5726, lon=88.3639, client=client)

    assert res.level == AreaSafetyLevel.NO_DATA
    assert "Telemetry Offline" in res.headline


# ===========================================================================
# 8. Provider Fault Isolation (Part 11)
# ===========================================================================


@pytest.mark.asyncio
async def test_provider_unavailable_fault_isolation():
    """Verify failure of one provider does not prevent active feeds from succeeding."""

    def mock_handler(req: httpx.Request) -> httpx.Response:
        url_str = str(req.url)
        # Simulate GDACS failing with 500 error
        if "gdacs.org" in url_str:
            return httpx.Response(500, text="GDACS Server Error")
        # Simulate Open-Meteo returning weather telemetry
        if "open-meteo.com" in url_str:
            return httpx.Response(
                200,
                json={
                    "current": {
                        "precipitation": 0.0,
                        "wind_speed_10m": 12.0,
                        "wind_gusts_10m": 15.0,
                    },
                    "hourly": {"precipitation": [0.0, 0.0, 0.0]},
                },
            )
        # Others return empty features
        return httpx.Response(200, json={"features": []})

    transport = httpx.MockTransport(mock_handler)
    async with httpx.AsyncClient(transport=transport) as client:
        _ = await get_active_hazards(lat=22.5726, lon=88.3639, client=client)

    # Health reports reflect fault isolation
    statuses = get_source_statuses()
    assert statuses["gdacs"] in (SourceStatus.FAILED, SourceStatus.STALE)
    assert statuses["open_meteo"] == SourceStatus.AVAILABLE


# ===========================================================================
# 9. Priority Sorting (Part 9)
# ===========================================================================


@pytest.mark.asyncio
async def test_priority_sorting_and_filtering():
    """Verify priority sorting: life-safety -> relevance -> severity -> distance -> recency."""
    now = datetime.now(UTC)
    now_iso = now.isoformat()
    future_iso = (now + timedelta(hours=4)).isoformat()

    # 1. Nearby Critical Flood (Inside affected area, 0.5km away)
    nearby_flood = NormalizedAlert(
        id="alt-nearby-flood",
        source="SACHET / NDMA India",
        source_event_id="fld-1",
        source_type=SourceType.CIVIL_DEFENSE,
        hazard_type=HazardType.FLOOD,
        severity=HazardSeverity.CRITICAL,
        title="Critical Sector Flood",
        description="Immediate flood.",
        recommended_action="Evacuate.",
        latitude=22.5750,
        longitude=88.3650,
        radius_km=3.0,
        observed_at=now_iso,
        issued_at=now_iso,
        expires_at=future_iso,
        fetched_at=now_iso,
    )

    # 2. Moderate Weather Advisory (2km away)
    nearby_weather = NormalizedAlert(
        id="alt-nearby-weather",
        source="Open-Meteo Weather Service",
        source_event_id="wth-1",
        source_type=SourceType.WEATHER_SERVICE,
        hazard_type=HazardType.WEATHER,
        severity=HazardSeverity.WATCH,
        title="WEATHER CONDITION: Gusty Rain",
        description="Gusts 65km/h.",
        recommended_action="Exercise caution.",
        latitude=22.5850,
        longitude=88.3750,
        radius_km=10.0,
        observed_at=now_iso,
        issued_at=now_iso,
        expires_at=future_iso,
        fetched_at=now_iso,
    )

    # 3. Distant Minor Tremor in Pacific Ocean (10,000km away -> IRRELEVANT)
    distant_quake = NormalizedAlert(
        id="alt-distant-quake",
        source="USGS Earthquake Hazards Program",
        source_event_id="usgs-pac-1",
        source_type=SourceType.SEISMIC_NETWORK,
        hazard_type=HazardType.EARTHQUAKE,
        severity=HazardSeverity.WATCH,
        title="M4.2 Minor Seismic Event - Fiji",
        description="Deep tremor.",
        recommended_action="None.",
        latitude=-18.0000,
        longitude=178.0000,
        radius_km=25.0,
        observed_at=now_iso,
        issued_at=now_iso,
        expires_at=future_iso,
        fetched_at=now_iso,
    )

    from app.services.hazard_service import _hazard_grid_cache

    _hazard_grid_cache[(22.57, 88.36)] = (
        [nearby_flood, nearby_weather, distant_quake],
        now + timedelta(minutes=5),
    )

    transport = httpx.MockTransport(
        lambda req: httpx.Response(200, json={"features": [], "alerts": []})
    )
    async with httpx.AsyncClient(transport=transport) as client:
        results = await get_active_hazards(lat=22.5726, lon=88.3639, client=client)

    alert_ids = [h.id for h in results]
    assert "alt-distant-quake" not in alert_ids
    assert "alt-nearby-flood" in alert_ids
    assert "alt-nearby-weather" in alert_ids

    # Critical flood ranked #1 before moderate weather
    assert results[0].id == "alt-nearby-flood"
    assert results[0].relevance_level == RelevanceLevel.CRITICAL
    assert results[0].is_within_affected_area is True


# ===========================================================================
# 10. REST API Endpoints: GET /api/hazards and GET /api/alerts (Part 10)
# ===========================================================================


@pytest.mark.asyncio
async def test_rest_api_hazards_and_alerts_endpoints():
    """Verify GET /api/hazards and GET /api/alerts endpoints accept lat & lon."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        # Test GET /api/hazards with citizen coordinates
        res_hazards = await ac.get("/api/hazards?lat=22.5726&lon=88.3639")
        assert res_hazards.status_code == 200
        data_h = res_hazards.json()
        assert "data" in data_h
        assert "sources" in data_h
        assert "sources_health" in data_h

        # Test dedicated alias GET /api/alerts
        res_alerts = await ac.get("/api/alerts?lat=22.5726&lon=88.3639")
        assert res_alerts.status_code == 200
        data_a = res_alerts.json()
        assert "data" in data_a

        # Test Area Safety endpoint
        res_area = await ac.get("/api/hazards/area-status?lat=22.5726&lon=88.3639")
        assert res_area.status_code == 200
        data_area = res_area.json()
        assert data_area["level"] in [lvl.value for lvl in AreaSafetyLevel]


# ===========================================================================
# 11. Relative Freshness Formatting (Part 7)
# ===========================================================================


def test_format_relative_time():
    """Verify format_relative_time outputs trustworthy relative age strings."""
    now = datetime.now(UTC)

    # Just now (30s ago)
    t_just_now = (now - timedelta(seconds=30)).isoformat()
    assert format_relative_time(t_just_now) == "Just now"

    # 4 minutes ago
    t_4min = (now - timedelta(minutes=4)).isoformat()
    assert format_relative_time(t_4min) == "Updated 4 min ago"

    # 2 hours ago
    t_2hr = (now - timedelta(hours=2)).isoformat()
    assert format_relative_time(t_2hr) == "Updated 2 hr ago"

    # 3 days ago
    t_3d = (now - timedelta(days=3)).isoformat()
    assert format_relative_time(t_3d) == "Updated 3 days ago"
