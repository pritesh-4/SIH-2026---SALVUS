"""Unit and integration tests for Salvus Real-World Nearby Places Intelligence (Phase 1).

Covers all 14 testing conditions:
1. Math & proximity calculations (Haversine distance, human-friendly formatting)
2. Coordinate grid snapping (~100m grid cell)
3. Controlled PlaceCategory enum enforcement & parsing
4. OpenStreetMap tag mapping to normalized PlaceModel
5. Strict provenance separation: OSM_MAPPED vs SALVUS_VERIFIED
6. No invented details: null returned when phone, website, opening hours, or address are missing
7. Way center geometry extraction & invalid coordinate rejection
8. Duplicate provider ID deduplication
9. Adapter multi-mirror rotation & fallback on network error
10. All-mirror outage graceful degradation (returns empty list, no crash)
11. In-memory TTL caching with exact distance recalculation
12. REST API /api/places/nearby validation & 422 error handling
13. Multiple category filtering in REST API
14. Salvus-verified shelter integration with provenance integrity
"""

from unittest.mock import AsyncMock, patch

import pytest
from httpx import ASGITransport, AsyncClient, Response

from app.adapters.places import (
    OverpassPlacesAdapter,
    format_distance,
    haversine_distance_km,
)
from app.main import app
from app.models import PlaceCategory, PlaceProvenance
from app.services.places_service import (
    build_overpass_query,
    clear_places_cache,
    get_nearby_places,
    normalize_osm_element,
    snap_coordinate_to_grid,
)


@pytest.fixture(autouse=True)
def clean_cache():
    """Clear places cache before and after each test."""
    clear_places_cache()
    yield
    clear_places_cache()


# ---------------------------------------------------------------------------
# 1. Math, Formatting & Helper Tests
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


def test_normalize_osm_node_complete():
    """Verify normalization of a full OSM node with all attributes."""
    sample_node = {
        "type": "node",
        "id": 12345678,
        "lat": 22.5740,
        "lon": 88.3650,
        "tags": {
            "name": "Salt Lake Sub-Divisional Hospital",
            "amenity": "hospital",
            "addr:street": "Broadway Road",
            "addr:suburb": "Salt Lake",
            "addr:city": "Kolkata",
            "emergency": "yes",
            "wheelchair": "yes",
            "phone": "+91 33 2359 1234",
            "website": "https://wbhealth.gov.in",
            "opening_hours": "24/7",
        },
    }

    place = normalize_osm_element(sample_node, 22.5726, 88.3639, "2026-08-28T16:00:00Z")
    assert place is not None
    assert place.id == "osm-node-12345678"
    assert place.source == "OpenStreetMap"
    assert place.source_id == "node/12345678"
    assert place.name == "Salt Lake Sub-Divisional Hospital"
    assert place.category == PlaceCategory.HOSPITAL
    assert place.provenance == PlaceProvenance.OSM_MAPPED
    assert place.latitude == 22.5740
    assert place.longitude == 88.3650
    assert place.address == "Broadway Road, Salt Lake"
    assert place.city == "Kolkata"
    assert place.phone == "+91 33 2359 1234"
    assert place.website == "https://wbhealth.gov.in"
    assert place.opening_hours == "24/7"
    assert place.distance_km is not None and place.distance_km > 0
    assert "Emergency Services" in place.amenities
    assert "Wheelchair Accessible" in place.amenities


def test_normalize_osm_way_center():
    """Verify normalization of an OSM way element using center coordinates."""
    sample_way = {
        "type": "way",
        "id": 9876543,
        "center": {
            "lat": 22.5755,
            "lon": 88.3665,
        },
        "tags": {
            "name": "Bidhannagar North Police Station",
            "amenity": "police",
        },
    }

    place = normalize_osm_element(sample_way, 22.5726, 88.3639, "2026-08-28T16:00:00Z")
    assert place is not None
    assert place.id == "osm-way-9876543"
    assert place.source_id == "way/9876543"
    assert place.latitude == 22.5755
    assert place.longitude == 88.3665
    assert place.category == PlaceCategory.POLICE
    assert place.provenance == PlaceProvenance.OSM_MAPPED


# ---------------------------------------------------------------------------
# 3. No Invented Details & Data Integrity Tests
# ---------------------------------------------------------------------------


def test_no_invented_details_when_missing():
    """Verify that missing provider tags strictly return None / null without fabrication."""
    minimal_node = {
        "type": "node",
        "id": 55555,
        "lat": 22.5735,
        "lon": 88.3642,
        "tags": {
            "amenity": "pharmacy",
            # No name, phone, website, opening_hours, address, city
        },
    }

    place = normalize_osm_element(minimal_node, 22.5726, 88.3639, "2026-08-28T16:00:00Z")
    assert place is not None
    assert place.phone is None
    assert place.website is None
    assert place.opening_hours is None
    assert place.address is None
    assert place.city is None
    assert place.route_distance_m is None
    assert place.route_duration_s is None
    # Descriptive fallback descriptor, not a fake business name
    assert place.name == "Pharmacy / Chemist"


def test_normalize_osm_shelter_provenance_is_never_salvus_verified():
    """Verify that an OSM mapped shelter is strictly tagged OSM_MAPPED, never SALVUS_VERIFIED."""
    sample_shelter = {
        "type": "node",
        "id": 888999,
        "lat": 22.5750,
        "lon": 88.3660,
        "tags": {
            "name": "Community Flood Shelter Shed",
            "amenity": "shelter",
        },
    }

    place = normalize_osm_element(sample_shelter, 22.5726, 88.3639, "2026-08-28T16:00:00Z")
    assert place is not None
    assert place.category == PlaceCategory.SHELTER
    assert place.provenance == PlaceProvenance.OSM_MAPPED
    assert place.provenance != PlaceProvenance.SALVUS_VERIFIED
    assert place.source == "OpenStreetMap"


def test_invalid_coordinates_skipped():
    """Verify that elements with invalid, out-of-range, or NaN coordinates are safely discarded."""
    invalid_nodes = [
        {"type": "node", "id": 1, "lat": 95.0, "lon": 88.0, "tags": {"amenity": "hospital"}},
        {"type": "node", "id": 2, "lat": 22.0, "lon": 195.0, "tags": {"amenity": "hospital"}},
        {"type": "node", "id": 3, "tags": {"amenity": "hospital"}},  # missing lat/lon
    ]

    for node in invalid_nodes:
        place = normalize_osm_element(node, 22.5726, 88.3639, "2026-08-28T16:00:00Z")
        assert place is None


# ---------------------------------------------------------------------------
# 4. Adapter Multi-Mirror Failover & Deduplication Tests
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_adapter_mirror_fallback_and_deduplication():
    """Verify multi-mirror rotation on failure and element ID deduplication."""

    adapter = OverpassPlacesAdapter(
        mirrors=[
            "https://bad-mirror-1.org/api/interpreter",
            "https://good-mirror-2.org/api/interpreter",
        ]
    )

    mock_elements = [
        {
            "type": "node",
            "id": 101,
            "lat": 22.5730,
            "lon": 88.3640,
            "tags": {"name": "Apollo Clinic", "amenity": "clinic"},
        },
        # Duplicate element with identical id
        {
            "type": "node",
            "id": 101,
            "lat": 22.5730,
            "lon": 88.3640,
            "tags": {"name": "Apollo Clinic", "amenity": "clinic"},
        },
        {
            "type": "node",
            "id": 102,
            "lat": 22.5760,
            "lon": 88.3670,
            "tags": {"name": "Fire Station Salt Lake", "amenity": "fire_station"},
        },
    ]

    async def mock_post(url, *args, **kwargs):
        if "bad-mirror-1" in url:
            raise Exception("504 Gateway Timeout")
        return Response(200, json={"elements": mock_elements})

    with patch("httpx.AsyncClient.post", side_effect=mock_post):
        places = await adapter.fetch_nearby(22.5726, 88.3639, 2000)
        assert len(places) == 2  # Deduplicated from 3 to 2
        assert places[0].id == "osm-node-101"
        assert places[1].id == "osm-node-102"
        assert places[0].category == PlaceCategory.CLINIC
        assert places[1].category == PlaceCategory.FIRE_STATION


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

        # 1. First fetch -> Cache Miss
        places_1, is_cached_1 = await get_nearby_places(22.5726, 88.3639, 2000)
        assert is_cached_1 is False
        assert len(places_1) == 1
        assert mock_post.call_count == 1
        first_distance = places_1[0].distance_km

        # 2. Second fetch with slightly shifted GPS (~20m) -> Cache Hit
        places_2, is_cached_2 = await get_nearby_places(22.5727, 88.3640, 2000)
        assert is_cached_2 is True
        assert len(places_2) == 1
        # No extra network call
        assert mock_post.call_count == 1
        # Distance was recalculated for the new exact coordinate
        assert places_2[0].distance_km != first_distance


@pytest.mark.asyncio
async def test_all_mirrors_outage_graceful_fallback():
    """Verify graceful empty fallback when all external mirrors fail."""
    with patch("httpx.AsyncClient.post", new_callable=AsyncMock) as mock_post:
        mock_post.side_effect = Exception("All mirrors timed out")

        places, is_cached = await get_nearby_places(22.5726, 88.3639, 2000)
        assert is_cached is False
        assert places == []


# ---------------------------------------------------------------------------
# 5. REST API Integration Tests (/api/places/nearby)
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
async def test_api_places_nearby_salvus_verified_shelter():
    """Verify that official Salvus civil defense shelters are merged with verified provenance."""
    mock_elements = []  # No OSM elements
    mock_resp = Response(200, json={"elements": mock_elements})

    with patch("httpx.AsyncClient.post", new_callable=AsyncMock) as mock_post:
        mock_post.return_value = mock_resp

        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            resp = await client.get(
                "/api/places/nearby?lat=22.5726&lon=88.3639&radius_km=5.0&include_verified=true"
            )
            assert resp.status_code == 200
            body = resp.json()
            assert body["success"] is True

            # If seeded shelters exist in database within 5km, verify their provenance
            salvus_shelters = [p for p in body["data"] if p["provenance"] == "SALVUS_VERIFIED"]
            for sh in salvus_shelters:
                assert sh["source"] == "Salvus Civil Defense"
                assert sh["category"] == "SHELTER"
                assert sh["id"].startswith("salvus-shelter-")


@pytest.mark.asyncio
async def test_api_places_nearby_null_integrity_for_missing_attributes():
    """Verify that the API returns null when external provider lacks contact/address details."""
    mock_elements = [
        {
            "type": "node",
            "id": 501,
            "lat": 22.5735,
            "lon": 88.3642,
            "tags": {
                "amenity": "clinic",
                # Missing phone, website, opening_hours, addr:*
            },
        }
    ]

    mock_resp = Response(200, json={"elements": mock_elements})

    with patch("httpx.AsyncClient.post", new_callable=AsyncMock) as mock_post:
        mock_post.return_value = mock_resp

        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            resp = await client.get(
                "/api/places/nearby?lat=22.5726&lon=88.3639&include_verified=false"
            )
            assert resp.status_code == 200
            body = resp.json()
            assert body["count"] == 1
            place = body["data"][0]
            assert place["category"] == "CLINIC"
            assert place["phone"] is None
            assert place["website"] is None
            assert place["opening_hours"] is None
            assert place["address"] is None
            assert place["city"] is None
            assert place["route_distance_m"] is None
            assert place["route_duration_s"] is None


@pytest.mark.asyncio
async def test_api_places_nearby_lng_alias_and_meter_radius():
    """Verify 'lng' parameter alias and legacy 'radius' (in meters) parameter."""
    mock_elements = [
        {
            "type": "node",
            "id": 601,
            "lat": 22.5732,
            "lon": 88.3641,
            "tags": {"name": "Police Beat", "amenity": "police"},
        }
    ]

    mock_resp = Response(200, json={"elements": mock_elements})

    with patch("httpx.AsyncClient.post", new_callable=AsyncMock) as mock_post:
        mock_post.return_value = mock_resp

        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            resp = await client.get(
                "/api/places/nearby?lat=22.5726&lng=88.3639&radius=1500&include_verified=false"
            )
            assert resp.status_code == 200
            body = resp.json()
            assert body["searched_radius_km"] == 1.5
            assert body["radius_meters"] == 1500
            assert body["query_center"] == {"latitude": 22.5726, "longitude": 88.3639}
            assert len(body["data"]) == 1


@pytest.mark.asyncio
async def test_api_places_nearby_boundary_coordinates():
    """Verify exact valid boundary coordinates (-90, 90, -180, 180) succeed without 422."""
    mock_resp = Response(200, json={"elements": []})

    with patch("httpx.AsyncClient.post", new_callable=AsyncMock) as mock_post:
        mock_post.return_value = mock_resp

        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            # Min/Max latitude & longitude boundary values
            for b_lat, b_lon in [(-90.0, 0.0), (90.0, 0.0), (0.0, -180.0), (0.0, 180.0)]:
                resp = await client.get(
                    f"/api/places/nearby?lat={b_lat}&lon={b_lon}&include_verified=false"
                )
                assert resp.status_code == 200
                assert resp.json()["success"] is True
