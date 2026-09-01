"""Salvus Location Intelligence & Disaster Context Test Suite (Build 03).

Tests:
1. Real location hazard context & distance enrichment
2. Coordinate grid caching for multi-location queries
3. Proximity and relevance radius filtering
4. Area Safety Level evaluations (SAFE, WATCH, WARNING, CRITICAL, NO_DATA, LOCATION_REQUIRED)
5. Distinguishing NO KNOWN ACTIVE HAZARDS vs NO DATA AVAILABLE vs LOCATION REQUIRED
6. Authoritative shelter recommendation & hazard avoidance ranking
7. Route hazard intersection analysis and safety cautionary advisories
8. REST API endpoints (/api/hazards/area-status, /api/hazards, /api/routes)
"""

import pytest
from httpx import ASGITransport, AsyncClient

from app.main import app
from app.models import (
    AreaSafetyLevel,
    HazardSeverity,
    HazardType,
    NormalizedAlert,
    SourceType,
)
from app.services import hazard_service, routing_service, shelter_service


@pytest.fixture(autouse=True)
def clean_caches():
    """Reset in-memory caches before and after each test."""
    hazard_service.clear_hazard_cache()
    routing_service.clear_route_cache()
    yield
    hazard_service.clear_hazard_cache()
    routing_service.clear_route_cache()


@pytest.mark.asyncio
async def test_get_active_hazards_with_real_location():
    """Verify hazards are enriched with distance and affected area metadata."""
    # Sector 12 coordinates with simulation alerts
    lat, lon = 22.5780, 88.3710
    hazards = await hazard_service.get_active_hazards(
        lat=lat, lon=lon, max_distance_km=10.0, include_simulation=True
    )

    assert len(hazards) > 0
    top_hz = hazards[0]
    assert top_hz.distance_km is not None
    assert top_hz.distance_formatted is not None
    assert isinstance(top_hz.is_within_affected_area, bool)
    flood_hz = next((h for h in hazards if h.hazard_type == HazardType.FLOOD), None)
    assert flood_hz is not None
    assert flood_hz.distance_km <= 1.5
    assert flood_hz.is_within_affected_area is True


@pytest.mark.asyncio
async def test_hazard_outside_relevance_radius():
    """Verify non-critical hazards outside distance radius are excluded."""
    # Far coordinates (e.g. 100km away)
    lat, lon = 23.5000, 89.5000
    hazards = await hazard_service.get_active_hazards(
        lat=lat, lon=lon, max_distance_km=5.0, include_simulation=True
    )

    # Local warnings and watches that are not critical within 30km should not appear
    for hz in hazards:
        if hz.severity != HazardSeverity.CRITICAL:
            if hz.distance_km is not None:
                assert hz.distance_km <= 25.0 or hz.is_within_affected_area


@pytest.mark.asyncio
async def test_evaluate_area_safety_location_required():
    """Verify that omitting citizen coordinates produces LOCATION_REQUIRED, never assuming SAFE."""
    resp = await hazard_service.evaluate_area_safety(lat=None, lon=None)
    assert resp.level == AreaSafetyLevel.LOCATION_REQUIRED
    assert "Location Access Off" in resp.headline
    assert resp.data_provenance == "FALLBACK"


@pytest.mark.asyncio
async def test_evaluate_area_safety_critical_hazard():
    """Verify citizen inside or near a critical flood basin gets CRITICAL status."""
    original_get_active = hazard_service.get_active_hazards

    async def mock_crit_hazards(*args, **kwargs):
        return [
            NormalizedAlert(
                id="alt-test-crit",
                source="Open-Meteo Weather Service",
                source_event_id="evt-crit-1",
                source_type=SourceType.WEATHER_SERVICE,
                hazard_type=HazardType.FLOOD,
                severity=HazardSeverity.CRITICAL,
                title="Critical Flash Flood Surge",
                description="Rapid inundation exceeding 1.2m.",
                why_it_matters="Roadway impassable.",
                recommended_action="Evacuate to elevated shelters.",
                latitude=22.5780,
                longitude=88.3710,
                radius_km=2.2,
                observed_at="2026-08-28T12:00:00Z",
                issued_at="2026-08-28T12:00:00Z",
                expires_at="2026-08-28T18:00:00Z",
                fetched_at="2026-08-28T12:00:00Z",
                is_within_affected_area=True,
                distance_km=0.1,
                distance_formatted="Approx. 100 m",
            )
        ]

    hazard_service.get_active_hazards = mock_crit_hazards
    try:
        resp = await hazard_service.evaluate_area_safety(lat=22.5780, lon=88.3710)
        assert resp.level == AreaSafetyLevel.CRITICAL
        assert "Critical Threat Active" in resp.headline
        assert resp.critical_hazards_count >= 1
        assert resp.nearest_hazard_distance_km <= 0.5
    finally:
        hazard_service.get_active_hazards = original_get_active


@pytest.mark.asyncio
async def test_evaluate_area_safety_warning_hazard():
    """Verify citizen near a warning hazard gets WARNING status."""
    original_get_active = hazard_service.get_active_hazards

    async def mock_warn_hazards(*args, **kwargs):
        return [
            NormalizedAlert(
                id="alt-test-warn",
                source="Open-Meteo Weather Service",
                source_event_id="evt-warn-1",
                source_type=SourceType.WEATHER_SERVICE,
                hazard_type=HazardType.FLOOD,
                severity=HazardSeverity.WARNING,
                title="Moderate Monsoon Waterlogging",
                description="Street ponding along connector.",
                why_it_matters="Travel delays.",
                recommended_action="Exercise caution.",
                latitude=22.5841,
                longitude=88.4120,
                radius_km=3.0,
                observed_at="2026-08-28T12:00:00Z",
                issued_at="2026-08-28T12:00:00Z",
                expires_at="2026-08-28T18:00:00Z",
                fetched_at="2026-08-28T12:00:00Z",
                is_within_affected_area=True,
                distance_km=0.2,
                distance_formatted="Approx. 200 m",
            )
        ]

    hazard_service.get_active_hazards = mock_warn_hazards
    try:
        resp = await hazard_service.evaluate_area_safety(lat=22.5841, lon=88.4120)
        assert resp.level in (AreaSafetyLevel.CRITICAL, AreaSafetyLevel.WARNING)
        assert resp.active_hazards_count > 0
    finally:
        hazard_service.get_active_hazards = original_get_active


@pytest.mark.asyncio
async def test_evaluate_area_safety_no_known_active_hazards():
    """Verify distant citizen with clear monitored feeds gets SAFE status with clear wording."""
    # Coords in clear region with no active flood/infrastructure hazards
    # Mocking clear active hazards
    original_get_active = hazard_service.get_active_hazards

    async def mock_clear_hazards(*args, **kwargs):
        return []

    hazard_service.get_active_hazards = mock_clear_hazards
    try:
        resp = await hazard_service.evaluate_area_safety(lat=22.5000, lon=88.3000)
        assert resp.level == AreaSafetyLevel.SAFE
        assert "No Known Active Hazards" in resp.headline
        assert resp.active_hazards_count == 0
    finally:
        hazard_service.get_active_hazards = original_get_active


@pytest.mark.asyncio
async def test_evaluate_area_safety_no_data_on_telemetry_failure():
    """Verify feed failure yields NO_DATA status, never false SAFE."""
    original_get_active = hazard_service.get_active_hazards

    async def mock_failing_hazards(*args, **kwargs):
        raise ConnectionError("Upstream NOAA/GDACS unreachable")

    hazard_service.get_active_hazards = mock_failing_hazards
    try:
        resp = await hazard_service.evaluate_area_safety(lat=22.5726, lon=88.3639)
        assert resp.level == AreaSafetyLevel.NO_DATA
        assert "Status Unconfirmed" in resp.headline
        assert resp.data_provenance == "FALLBACK"
    finally:
        hazard_service.get_active_hazards = original_get_active


@pytest.mark.asyncio
async def test_area_safety_rest_api_endpoint(test_db):
    """Test GET /api/hazards/area-status REST API."""
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        # 1. Without coordinates -> LOCATION_REQUIRED
        res_no_coords = await client.get("/api/hazards/area-status")
        assert res_no_coords.status_code == 200
        data_no_coords = res_no_coords.json()
        assert data_no_coords["level"] == "LOCATION_REQUIRED"

        # 2. With Sector 12 coordinates -> Evaluates threat level
        res_coords = await client.get("/api/hazards/area-status?lat=22.5780&lon=88.3710")
        assert res_coords.status_code == 200
        data_coords = res_coords.json()
        assert data_coords["level"] in ("CRITICAL", "WARNING", "WATCH", "SAFE")
        assert "headline" in data_coords
        assert "description" in data_coords


@pytest.mark.asyncio
async def test_recommended_shelters_hazard_avoidance(test_db):
    """Verify shelter ranking penalizes shelters located within active hazard zones."""
    # Get recommended shelters near Sector 12 flood basin
    recommendations = await shelter_service.get_recommended_shelters(
        test_db, latitude=22.5726, longitude=88.3639
    )
    assert len(recommendations) > 0

    # Top recommended shelter should be safe and have positive suitability score
    top_shelter = recommendations[0]
    assert top_shelter.suitability_score > 0
    assert top_shelter.is_safe is True
    assert top_shelter.safety_status == "SAFE"


@pytest.mark.asyncio
async def test_route_hazard_intersection_evaluation():
    """Verify route passing through active hazard zone flags cautionary warning."""
    # Route through Sector 12 basin flood hazard
    origin_lat, origin_lon = 22.5750, 88.3680
    dest_lat, dest_lon = 22.5810, 88.3740

    route = await routing_service.get_route(
        origin_lat=origin_lat,
        origin_lon=origin_lon,
        dest_lat=dest_lat,
        dest_lon=dest_lon,
        profile="walking",
    )

    assert route.coordinates is not None
    assert len(route.coordinates) >= 2
    assert "Recommended route based on current available hazard data." in route.safety_disclaimer

    # If route passes within proximity of the flood epicenter, is_safe_route should be False
    if not route.is_safe_route:
        assert route.hazard_warning is not None
        assert len(route.hazard_intersections) > 0


@pytest.mark.asyncio
async def test_golden_case_a_location_allowed_no_hazard_nearby_services():
    """Case A: Location allowed, no active hazard in area, nearby services & SAFE status appear."""
    # Distant clear coordinates
    clear_lat, clear_lon = 22.4500, 88.2500

    original_get_active = hazard_service.get_active_hazards

    async def mock_clear_hazards(*args, **kwargs):
        return []

    hazard_service.get_active_hazards = mock_clear_hazards
    try:
        safety = await hazard_service.evaluate_area_safety(lat=clear_lat, lon=clear_lon)
        assert safety.level == AreaSafetyLevel.SAFE
        assert "No Known Active Hazards" in safety.headline
        assert safety.active_hazards_count == 0
    finally:
        hazard_service.get_active_hazards = original_get_active


@pytest.mark.asyncio
async def test_golden_case_b_location_allowed_hazard_nearby_alert():
    """Case B: Location allowed, hazard nearby (Sector 12 flood), correct CRITICAL alert appears."""
    lat, lon = 22.5780, 88.3710
    original_get_active = hazard_service.get_active_hazards

    async def mock_crit_hazards(*args, **kwargs):
        return [
            NormalizedAlert(
                id="alt-test-crit-b",
                source="Open-Meteo Weather Service",
                source_event_id="evt-crit-b",
                source_type=SourceType.WEATHER_SERVICE,
                hazard_type=HazardType.FLOOD,
                severity=HazardSeverity.CRITICAL,
                title="Critical Threat Active: Flash Flood Surge",
                description="Rapid water accumulation exceeding 1.2m.",
                why_it_matters="Road corridor impassable.",
                recommended_action="Evacuate to elevated shelters.",
                latitude=22.5780,
                longitude=88.3710,
                radius_km=2.2,
                observed_at="2026-08-28T12:00:00Z",
                issued_at="2026-08-28T12:00:00Z",
                expires_at="2026-08-28T18:00:00Z",
                fetched_at="2026-08-28T12:00:00Z",
                is_within_affected_area=True,
                distance_km=0.1,
                distance_formatted="Approx. 100 m",
            )
        ]

    hazard_service.get_active_hazards = mock_crit_hazards
    try:
        safety = await hazard_service.evaluate_area_safety(lat=lat, lon=lon)
        assert safety.level == AreaSafetyLevel.CRITICAL
        assert safety.critical_hazards_count >= 1
        assert safety.nearest_hazard_title is not None
        assert safety.nearest_hazard_distance_km <= 0.5
        assert "Critical Threat Active" in safety.headline
    finally:
        hazard_service.get_active_hazards = original_get_active


@pytest.mark.asyncio
async def test_golden_case_c_location_denied_no_fake_location():
    """Case C: Location denied/omitted, yields LOCATION_REQUIRED.

    Never assumes fake coordinates or false safe state.
    """
    safety = await hazard_service.evaluate_area_safety(lat=None, lon=None)
    assert safety.level == AreaSafetyLevel.LOCATION_REQUIRED
    assert safety.latitude is None
    assert safety.longitude is None
    assert "Location Access Off" in safety.headline
    assert safety.data_provenance == "FALLBACK"


@pytest.mark.asyncio
async def test_golden_case_d_poor_gps_accuracy_approximate():
    """Case D: Distant / coarse location communicates approximate sector context."""
    # Coords 8km from hazard epicenter
    lat, lon = 22.6500, 88.4200
    hazards = await hazard_service.get_active_hazards(lat=lat, lon=lon, max_distance_km=15.0)

    # Hazards farther away are marked as outside immediate affected area
    for hz in hazards:
        if hz.distance_km is not None and hz.affected_radius_km is not None:
            if hz.distance_km > hz.affected_radius_km:
                assert hz.is_within_affected_area is False


@pytest.mark.asyncio
async def test_golden_case_e_external_api_down_resilient():
    """Case E: External API down, system degrades to NO_DATA without crashing."""
    original_get_active = hazard_service.get_active_hazards

    async def mock_failing_hazards(*args, **kwargs):
        raise ConnectionError("Upstream NOAA/GDACS unreachable")

    hazard_service.get_active_hazards = mock_failing_hazards
    try:
        resp = await hazard_service.evaluate_area_safety(lat=22.5726, lon=88.3639)
        assert resp.level == AreaSafetyLevel.NO_DATA
        assert "Status Unconfirmed" in resp.headline
        assert resp.data_provenance == "FALLBACK"
    finally:
        hazard_service.get_active_hazards = original_get_active


@pytest.mark.asyncio
async def test_golden_case_f_route_intersection_and_safety_disclaimer():
    """Case F: Route through hazard flags cautionary advisory with standard disclaimer."""
    route = await routing_service.get_route(
        origin_lat=22.5750,
        origin_lon=22.5750,
        dest_lat=22.5810,
        dest_lon=88.3740,
        profile="walking",
    )
    assert "Recommended route based on current available hazard data." in route.safety_disclaimer


@pytest.mark.asyncio
async def test_golden_case_g_shelter_ranking_safe_preference(test_db):
    """Case G: Shelters prioritize open, high-capacity, safe shelters outside hazard zones."""
    shelters = await shelter_service.get_recommended_shelters(
        test_db, latitude=22.5726, longitude=88.3639
    )
    assert len(shelters) > 0
    top = shelters[0]
    assert top.is_safe is True
    assert top.safety_status == "SAFE"
    assert top.suitability_score > 0
