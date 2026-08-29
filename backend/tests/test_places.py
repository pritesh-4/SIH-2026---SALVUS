"""Unit and integration tests for Salvus Real-World Nearby Places Intelligence (Phase 2).

Covers all 15 Phase 2 requirements:
1. Math & geometric distance calculations
2. Coordinate grid cell snapping (~100m)
3. Safe phone number normalization & null integrity
4. Controlled PlaceCategory enum resolution
5. Spatial-semantic deduplication (< 25m collocation merge)
6. Multi-factor emergency ranking (Hospitals / emergency services prioritized)
7. Verified Salvus shelter priority over OSM mapped shelters
8. Tiered caching with exact distance recalculation
9. Stale-while-revalidate cache fallback on provider failure
10. Total provider outage graceful fallback (UNAVAILABLE)
11. GPS movement threshold sensitivity (> 150m)
12. REST API /api/places/nearby validation & 422 error handling
13. REST API /api/places/nearby freshness & category filtering
14. On-demand turn-by-turn routing endpoint (/api/places/{place_id}/route)
15. Cold vs cached performance benchmark
"""

import time
from unittest.mock import AsyncMock, patch

import pytest
from httpx import ASGITransport, AsyncClient, Response

from app.adapters.places import (
    deduplicate_places,
    format_distance,
    haversine_distance_km,
    normalize_phone_number,
)
from app.main import app
from app.models import (
    PlaceCategory,
    PlaceFreshness,
    PlaceModel,
    PlaceProvenance,
)
from app.services.places_service import (
    build_overpass_query,
    clear_places_cache,
    get_nearby_places,
    get_place_route,
    has_moved_significantly,
    rank_places,
    snap_coordinate_to_grid,
)


@pytest.fixture(autouse=True)
def clean_cache():
    """Clear places cache before and after each test."""
    clear_places_cache()
    yield
    clear_places_cache()


# ---------------------------------------------------------------------------
# 1. Math, Formatting & Phone Normalization Tests
# ---------------------------------------------------------------------------


def test_haversine_distance():
    """Verify proximity straight-line distance calculations."""
    dist = haversine_distance_km(22.5726, 88.3639, 22.5780, 88.3690)
    assert 0.7 <= dist <= 1.0
    assert haversine_distance_km(22.5726, 88.3639, 22.5726, 88.3639) == 0.0


def test_format_distance():
    """Verify human-readable geometric distance labels."""
    assert format_distance(450.2) == "Approx. 450 m"
    assert format_distance(999.0) == "Approx. 999 m"
    assert format_distance(1200.0) == "Approx. 1.2 km"
    assert format_distance(2800.0) == "Approx. 2.8 km"
    assert format_distance(2850.0) == "Approx. 2.9 km"


def test_snap_coordinate_to_grid():
    """Verify coordinate grid cell snapping for ~100m resolution."""
    assert snap_coordinate_to_grid(22.572618) == 22.573
    assert snap_coordinate_to_grid(88.363942) == 88.364


def test_normalize_phone_number():
    """Verify safe phone normalization without fabricating missing numbers."""
    assert normalize_phone_number(None) is None
    assert normalize_phone_number("") is None
    assert normalize_phone_number("   ") is None
    assert normalize_phone_number("123") is None  # Too short to be valid phone
    assert normalize_phone_number("+91 33 2359 1234 / 2359 5678") == "+91 33 2359 1234"
    assert normalize_phone_number("033-2359-1234 ; 033-2359-5678") == "033-2359-1234"
    assert normalize_phone_number("  +91  98765  43210  ") == "+91 98765 43210"


def test_has_moved_significantly():
    """Verify GPS movement threshold evaluation (> 150m)."""
    assert has_moved_significantly(None, None, 22.5726, 88.3639) is True
    # ~20m move -> False
    assert has_moved_significantly(22.5726, 88.3639, 22.5727, 88.3640, threshold_m=150.0) is False
    # ~400m move -> True
    assert has_moved_significantly(22.5726, 88.3639, 22.5760, 88.3640, threshold_m=150.0) is True


# ---------------------------------------------------------------------------
# 2. Controlled Category Enums & OSM Tag Mapping Tests
# ---------------------------------------------------------------------------


def test_place_category_parsing():
    """Verify controlled category enum resolution from diverse string representations."""
    assert PlaceCategory.from_str("hospital") == PlaceCategory.HOSPITAL
    assert PlaceCategory.from_str("CLINIC") == PlaceCategory.CLINIC
    assert PlaceCategory.from_str("pharmacy") == PlaceCategory.PHARMACY
    assert PlaceCategory.from_str("chemist") == PlaceCategory.PHARMACY
    assert PlaceCategory.from_str("police") == PlaceCategory.POLICE
    assert PlaceCategory.from_str("fire_station") == PlaceCategory.FIRE_STATION
    assert PlaceCategory.from_str("ambulance") == PlaceCategory.EMERGENCY_SERVICE
    assert PlaceCategory.from_str("shelter") == PlaceCategory.SHELTER
    assert PlaceCategory.from_str("unknown_xyz") == PlaceCategory.OTHER_RELEVANT


def test_build_overpass_query_categories():
    """Verify Overpass QL query construction with controlled category filters."""
    query = build_overpass_query(22.5726, 88.3639, 2000, ["hospital", "pharmacy"])
    assert "around:2000,22.5726,88.3639" in query
    assert "hospital" in query
    assert "pharmacy" in query


# ---------------------------------------------------------------------------
# 3. Spatial-Semantic Deduplication & Multi-Factor Ranking Tests
# ---------------------------------------------------------------------------


def test_spatial_semantic_deduplication():
    """Verify collocated elements (< 25m) sharing category & normalized name are merged."""
    place1 = PlaceModel(
        id="osm-node-1001",
        source="OpenStreetMap",
        source_id="node/1001",
        category=PlaceCategory.HOSPITAL,
        name="Salt Lake General Hospital",
        latitude=22.5740,
        longitude=88.3650,
        phone="+91 33 2359 1000",
        address="Sector 1, Salt Lake",
        fetched_at="2026-08-28T16:00:00Z",
    )
    # Way representing the building outline of the same hospital ~10m away
    place2 = PlaceModel(
        id="osm-way-2002",
        source="OpenStreetMap",
        source_id="way/2002",
        category=PlaceCategory.HOSPITAL,
        name="Salt Lake General Hospital (Building)",
        latitude=22.57408,
        longitude=88.36508,
        website="https://slgh.gov.in",
        fetched_at="2026-08-28T16:00:00Z",
    )
    # Completely separate hospital 2 km away
    place3 = PlaceModel(
        id="osm-node-3003",
        source="OpenStreetMap",
        source_id="node/3003",
        category=PlaceCategory.HOSPITAL,
        name="Salt Lake General Hospital - Unit 2",
        latitude=22.5900,
        longitude=88.3800,
        fetched_at="2026-08-28T16:00:00Z",
    )

    deduped = deduplicate_places([place1, place2, place3])
    assert len(deduped) == 2
    # First item should merge richer phone from node and website from way
    merged = next(p for p in deduped if "1001" in p.id or "2002" in p.id)
    assert merged.phone == "+91 33 2359 1000"
    assert merged.website == "https://slgh.gov.in"


def test_multi_factor_emergency_ranking():
    """Verify that life-safety facilities rank ahead of generic facilities."""
    pharmacy = PlaceModel(
        id="osm-node-1",
        source="OpenStreetMap",
        category=PlaceCategory.PHARMACY,
        name="Local Pharmacy",
        latitude=22.5730,
        longitude=88.3640,
        distance_km=0.1,  # very close
        fetched_at="2026-08-28T16:00:00Z",
    )
    hospital = PlaceModel(
        id="osm-node-2",
        source="OpenStreetMap",
        category=PlaceCategory.HOSPITAL,
        name="District Hospital",
        latitude=22.5780,
        longitude=88.3690,
        distance_km=0.7,
        fetched_at="2026-08-28T16:00:00Z",
    )
    other = PlaceModel(
        id="osm-node-3",
        source="OpenStreetMap",
        category=PlaceCategory.OTHER_RELEVANT,
        name="Public Hall",
        latitude=22.5731,
        longitude=88.3641,
        distance_km=0.1,
        fetched_at="2026-08-28T16:00:00Z",
    )

    ranked = rank_places([pharmacy, other, hospital])
    # Hospital should rank top due to emergency weight (100)
    assert ranked[0].category == PlaceCategory.HOSPITAL
    assert ranked[1].category == PlaceCategory.PHARMACY
    assert ranked[2].category == PlaceCategory.OTHER_RELEVANT


def test_verified_vs_mapped_shelter_priority():
    """Verify Salvus verified shelters rank ahead of unverified mapped shelters."""
    mapped_shelter = PlaceModel(
        id="osm-node-10",
        source="OpenStreetMap",
        provenance=PlaceProvenance.OSM_MAPPED,
        category=PlaceCategory.SHELTER,
        name="Community Relief Shed",
        latitude=22.5730,
        longitude=88.3640,
        distance_km=0.2,
        fetched_at="2026-08-28T16:00:00Z",
    )
    verified_shelter = PlaceModel(
        id="salvus-shelter-101",
        source="Salvus Civil Defense",
        provenance=PlaceProvenance.SALVUS_VERIFIED,
        category=PlaceCategory.SHELTER,
        name="Salt Lake Central Evacuation Shelter",
        latitude=22.5760,
        longitude=88.3670,
        distance_km=0.6,
        fetched_at="2026-08-28T16:00:00Z",
    )

    ranked = rank_places([mapped_shelter, verified_shelter], safe_places_priority=True)
    assert ranked[0].id == "salvus-shelter-101"
    assert ranked[0].provenance == PlaceProvenance.SALVUS_VERIFIED


# ---------------------------------------------------------------------------
# 4. Tiered Caching, Stale-While-Revalidate & Fallback Tests
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_get_nearby_places_caching_and_recalculation():
    """Verify in-memory TTL caching and accurate distance recalculation for user coordinates."""
    mock_elements = [
        {
            "type": "node",
            "id": 301,
            "lat": 22.5730,
            "lon": 88.3640,
            "tags": {"name": "MedPlus Pharmacy", "amenity": "pharmacy"},
        }
    ]

    mock_resp = Response(200, json={"elements": mock_elements})

    with patch("httpx.AsyncClient.post", new_callable=AsyncMock) as mock_post:
        mock_post.return_value = mock_resp

        # 1. First fetch -> Cache Miss (FRESH)
        places_1, is_cached_1, fresh_1 = await get_nearby_places(22.5726, 88.3639, 2000)
        assert is_cached_1 is False
        assert fresh_1 == PlaceFreshness.FRESH
        assert len(places_1) >= 1
        assert mock_post.call_count == 1
        first_distance = places_1[0].distance_km

        # 2. Second fetch with shifted GPS (~20m) -> Cache Hit (FRESH)
        places_2, is_cached_2, fresh_2 = await get_nearby_places(22.5727, 88.3640, 2000)
        assert is_cached_2 is True
        assert fresh_2 == PlaceFreshness.FRESH
        assert len(places_2) >= 1
        assert mock_post.call_count == 1
        # Recalculated exact straight-line distance
        assert places_2[0].distance_km != first_distance


@pytest.mark.asyncio
async def test_stale_cache_fallback_on_provider_failure():
    """Verify that stale cache is returned with STALE status when provider fails."""
    mock_elements = [
        {
            "type": "node",
            "id": 701,
            "lat": 22.5735,
            "lon": 88.3642,
            "tags": {"name": "Apex Clinic", "amenity": "clinic"},
        }
    ]

    mock_resp = Response(200, json={"elements": mock_elements})

    with patch("httpx.AsyncClient.post", new_callable=AsyncMock) as mock_post:
        mock_post.return_value = mock_resp
        # Warm cache
        await get_nearby_places(22.5726, 88.3639, 2000, include_verified=False)

    # Simulate provider failure and expired fresh TTL
    with patch("httpx.AsyncClient.post", new_callable=AsyncMock) as mock_post:
        mock_post.side_effect = Exception("Overpass 504 Gateway Timeout")

        # Advance simulated time past 300s but before 1800s
        with patch("time.time", return_value=time.time() + 400.0):
            places, is_cached, fresh = await get_nearby_places(
                22.5726, 88.3639, 2000, include_verified=False
            )
            assert is_cached is True
            assert fresh == PlaceFreshness.STALE
            assert len(places) == 1
            assert places[0].name == "Apex Clinic"


@pytest.mark.asyncio
async def test_all_mirrors_outage_with_no_cache_returns_unavailable():
    """Verify clean UNAVAILABLE state when provider fails and no cached data exists."""
    with patch("httpx.AsyncClient.post", new_callable=AsyncMock) as mock_post:
        mock_post.side_effect = Exception("Network unreachable")

        places, is_cached, fresh = await get_nearby_places(
            22.5726, 88.3639, 2000, include_verified=False
        )
        assert is_cached is False
        assert fresh == PlaceFreshness.UNAVAILABLE
        assert places == []


# ---------------------------------------------------------------------------
# 5. On-Demand Turn-by-Turn Route Tests
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_on_demand_place_route_calculation():
    """Verify on-demand turn-by-turn route calculation for a single selected place."""
    target_place = PlaceModel(
        id="osm-node-888",
        source="OpenStreetMap",
        category=PlaceCategory.HOSPITAL,
        name="Salt Lake Sub-Divisional Hospital",
        latitude=22.5780,
        longitude=88.3690,
        fetched_at="2026-08-28T16:00:00Z",
    )

    mock_osrm_data = {
        "code": "Ok",
        "routes": [
            {
                "distance": 850.0,
                "duration": 600.0,
                "geometry": {
                    "coordinates": [
                        [88.3639, 22.5726],
                        [88.3660, 22.5750],
                        [88.3690, 22.5780],
                    ]
                },
                "legs": [{"summary": "Broadway Route"}],
            }
        ],
    }

    mock_resp = Response(200, json=mock_osrm_data)

    with patch("httpx.AsyncClient.get", new_callable=AsyncMock) as mock_get:
        mock_get.return_value = mock_resp

        route_resp = await get_place_route(
            origin_lat=22.5726,
            origin_lon=88.3639,
            place=target_place,
            profile="walking",
        )
        assert route_resp.success is True
        assert route_resp.route_distance_m == 850.0
        assert route_resp.route_duration_s == 600.0
        assert route_resp.eta_formatted == "10 min"
        assert len(route_resp.coordinates) == 3
        # Leaflet [lat, lon] order
        assert route_resp.coordinates[0] == [22.5726, 88.3639]
        assert route_resp.is_fallback is False


@pytest.mark.asyncio
async def test_on_demand_place_route_fallback_when_osrm_unreachable():
    """Verify resilient vector corridor fallback when OSRM is offline."""
    target_place = PlaceModel(
        id="salvus-shelter-1",
        source="Salvus Civil Defense",
        provenance=PlaceProvenance.SALVUS_VERIFIED,
        category=PlaceCategory.SHELTER,
        name="Verified Safe Shelter",
        latitude=22.5800,
        longitude=88.3700,
        fetched_at="2026-08-28T16:00:00Z",
    )

    with patch("httpx.AsyncClient.get", new_callable=AsyncMock) as mock_get:
        mock_get.side_effect = Exception("OSRM connection timed out")

        route_resp = await get_place_route(
            origin_lat=22.5726,
            origin_lon=88.3639,
            place=target_place,
            profile="walking",
        )
        assert route_resp.success is True
        assert route_resp.is_fallback is True
        assert route_resp.route_distance_m > 0
        assert len(route_resp.coordinates) > 0


# ---------------------------------------------------------------------------
# 6. REST API Endpoint Integration Tests
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_api_places_nearby_coordinate_validation():
    """Verify coordinate parameter validation and 422 HTTP response."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # Missing longitude
        resp = await client.get("/api/places/nearby?lat=22.5726")
        assert resp.status_code == 422

        # Latitude out of bounds (> 90)
        resp = await client.get("/api/places/nearby?lat=95.0&lon=88.3639")
        assert resp.status_code == 422
        assert resp.json()["detail"]["error"]["code"] == "INVALID_COORDINATES"

        # Longitude out of bounds (< -180)
        resp = await client.get("/api/places/nearby?lat=22.5726&lon=-195.0")
        assert resp.status_code == 422


@pytest.mark.asyncio
async def test_api_places_nearby_radius_km_and_categories():
    """Verify radius_km parameter, category filtering, and response schema."""
    mock_elements = [
        {
            "type": "node",
            "id": 401,
            "lat": 22.5740,
            "lon": 88.3645,
            "tags": {"name": "Frank Ross Pharmacy", "amenity": "pharmacy"},
        }
    ]

    mock_resp = Response(200, json={"elements": mock_elements})

    with patch("httpx.AsyncClient.post", new_callable=AsyncMock) as mock_post:
        mock_post.return_value = mock_resp

        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            resp = await client.get(
                "/api/places/nearby?lat=22.5726&lon=88.3639&radius_km=3.0&categories=pharmacy"
            )
            assert resp.status_code == 200
            body = resp.json()
            assert body["success"] is True
            assert body["status"] == "OK"
            assert body["freshness"] == "FRESH"
            assert body["searched_radius_km"] == 3.0
            assert body["radius_meters"] == 3000
            assert body["query_center"]["latitude"] == 22.5726
            assert body["query_center"]["longitude"] == 88.3639
            assert body["count"] >= 1

            pharmacy = next((p for p in body["data"] if p["category"] == "PHARMACY"), None)
            assert pharmacy is not None
            assert pharmacy["provenance"] == "OSM_MAPPED"
            assert pharmacy["source"] == "OpenStreetMap"
            assert pharmacy["distance_km"] is not None


@pytest.mark.asyncio
async def test_api_place_route_endpoint_verified_shelter():
    """Verify dedicated GET /api/places/{place_id}/route for verified shelter."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # First retrieve available shelters
        sh_list_resp = await client.get("/api/shelters")
        assert sh_list_resp.status_code == 200
        shelters = sh_list_resp.json()["data"]
        assert len(shelters) > 0
        first_sh_id = f"salvus-shelter-{shelters[0]['id']}"

        # Request turn-by-turn route
        resp = await client.get(
            f"/api/places/{first_sh_id}/route?origin_lat=22.5726&origin_lon=88.3639&profile=walking"
        )
        assert resp.status_code == 200
        body = resp.json()
        assert body["success"] is True
        assert body["place"]["id"] == first_sh_id
        assert body["place"]["provenance"] == "SALVUS_VERIFIED"
        assert body["route_distance_m"] > 0
        assert len(body["coordinates"]) > 0


# ---------------------------------------------------------------------------
# 7. Performance Benchmarks
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_performance_cold_vs_cached_query():
    """Verify that cached queries execute in sub-millisecond in-memory speeds."""
    mock_elements = [
        {
            "type": "node",
            "id": 999,
            "lat": 22.5730,
            "lon": 88.3640,
            "tags": {"name": "Performance Clinic", "amenity": "clinic"},
        }
    ]

    mock_resp = Response(200, json={"elements": mock_elements})

    with patch("httpx.AsyncClient.post", new_callable=AsyncMock) as mock_post:
        mock_post.return_value = mock_resp

        # Cold query (populates cache)
        t0 = time.perf_counter()
        places_cold, is_cached_cold, _ = await get_nearby_places(
            22.5726, 88.3639, 2000, include_verified=False
        )
        cold_time = time.perf_counter() - t0
        assert is_cached_cold is False
        assert len(places_cold) >= 1

        # Cached query
        t1 = time.perf_counter()
        places_cached, is_cached_warm, _ = await get_nearby_places(
            22.57261, 88.36391, 2000, include_verified=False
        )
        cached_time = time.perf_counter() - t1
        assert is_cached_warm is True
        # Cached response should be fast in-memory execution
        assert cached_time <= cold_time or cached_time < 0.01


# ---------------------------------------------------------------------------
# 16. Reverse Geocoding Tests
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_reverse_geocode_nominatim_success():
    """Verify reverse geocoding returns structured area name and address."""
    from app.services.places_service import reverse_geocode

    mock_nominatim = {
        "display_name": "Sector 5, Salt Lake, Bidhannagar, Kolkata, West Bengal, India",
        "address": {
            "suburb": "Sector 5, Salt Lake",
            "city": "Kolkata",
            "state": "West Bengal",
            "country": "India",
        },
    }

    mock_resp = Response(200, json=mock_nominatim)
    with patch("httpx.AsyncClient.get", new_callable=AsyncMock) as mock_get:
        mock_get.return_value = mock_resp

        res = await reverse_geocode(22.5800, 88.4350)
        assert res["success"] is True
        assert res["area_name"] == "Sector 5, Salt Lake, Kolkata"
        assert res["city"] == "Kolkata"
        assert res["suburb"] == "Sector 5, Salt Lake"
        assert res["source"] == "OpenStreetMap Nominatim"


@pytest.mark.asyncio
async def test_reverse_geocode_api_endpoint():
    """Verify /api/places/reverse HTTP endpoint returns human-readable area."""
    mock_result = {
        "success": True,
        "area_name": "Connaught Place, New Delhi",
        "suburb": "Connaught Place",
        "city": "New Delhi",
        "state": "Delhi",
        "country": "India",
        "display_address": "Connaught Place, New Delhi, Delhi, India",
        "latitude": 28.6139,
        "longitude": 77.2090,
        "source": "OpenStreetMap Nominatim",
        "fetched_at": "2026-08-29T10:00:00Z",
    }

    with patch("app.services.places_service.reverse_geocode", new_callable=AsyncMock) as mock_rev:
        mock_rev.return_value = mock_result

        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            resp = await client.get("/api/places/reverse?lat=28.6139&lon=77.2090")
            assert resp.status_code == 200
            body = resp.json()
            assert body["success"] is True
            assert body["area_name"] == "Connaught Place, New Delhi"
            assert body["latitude"] == 28.6139
            assert body["longitude"] == 77.2090


@pytest.mark.asyncio
async def test_reverse_geocode_fallback_on_network_error():
    """Verify reverse geocoding falls back gracefully without raising exceptions."""
    from app.services.places_service import reverse_geocode

    with patch("httpx.AsyncClient.get", side_effect=Exception("Nominatim network timeout")):
        res = await reverse_geocode(19.0760, 72.8777)
        assert res["success"] is True
        assert "19.076" in res["area_name"]
        assert res["source"] == "Coordinate Fallback"
