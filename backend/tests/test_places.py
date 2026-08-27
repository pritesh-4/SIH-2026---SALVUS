"""Unit and integration tests for Salvus Real-World Nearby Places (Build 02)."""

from unittest.mock import AsyncMock, patch

import pytest
from httpx import ASGITransport, AsyncClient, Response

from app.main import app
from app.models import PlaceCategory, PlaceProvenance
from app.services.places_service import (
    build_overpass_query,
    clear_places_cache,
    format_distance,
    get_nearby_places,
    haversine_distance_km,
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
    """Verify proximity distance calculations."""
    dist = haversine_distance_km(22.5726, 88.3639, 22.5780, 88.3690)
    assert 0.7 <= dist <= 1.0
    assert haversine_distance_km(22.5726, 88.3639, 22.5726, 88.3639) == 0.0


def test_format_distance():
    """Verify human-readable distance labels."""
    assert format_distance(450.2) == "Approx. 450 m"
    assert format_distance(999.0) == "Approx. 999 m"
    assert format_distance(1200.0) == "Approx. 1.2 km"
    assert format_distance(2800.0) == "Approx. 2.8 km"
    assert format_distance(2850.0) == "Approx. 2.9 km"


def test_snap_coordinate_to_grid():
    """Verify coordinate grid cell snapping."""
    assert snap_coordinate_to_grid(22.572618) == 22.573
    assert snap_coordinate_to_grid(88.363942) == 88.364


def test_build_overpass_query():
    """Verify Overpass QL query construction and category filtering."""
    query = build_overpass_query(22.5726, 88.3639, 2000, ["hospital", "pharmacy"])
    assert "around:2000,22.5726,88.3639" in query
    assert "hospital" in query
    assert "pharmacy" in query


# ---------------------------------------------------------------------------
# 2. OSM Element Normalization & Provenance Tests
# ---------------------------------------------------------------------------


def test_normalize_osm_element():
    """Verify normalized schema mapping and strict OSM_MAPPED provenance."""
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
            "emergency": "yes",
            "wheelchair": "yes",
            "phone": "+91 33 2359 1234",
        },
    }

    place = normalize_osm_element(sample_node, 22.5726, 88.3639, "2026-08-27T18:00:00Z")
    assert place is not None
    assert place.id == "osm-node-12345678"
    assert place.name == "Salt Lake Sub-Divisional Hospital"
    assert place.category == PlaceCategory.HOSPITAL
    assert place.latitude == 22.5740
    assert place.longitude == 88.3650
    assert place.address == "Broadway Road, Salt Lake"
    assert place.source == "OPENSTREETMAP"
    assert place.provenance == PlaceProvenance.OSM_MAPPED
    assert "Emergency Services" in place.amenities
    assert "Wheelchair Accessible" in place.amenities
    assert place.phone == "+91 33 2359 1234"


def test_normalize_osm_shelter_provenance():
    """Verify OSM shelter tag is strictly OSM_MAPPED and not SALVUS_VERIFIED."""
    sample_shelter = {
        "type": "node",
        "id": 888999,
        "lat": 22.5750,
        "lon": 88.3660,
        "tags": {
            "name": "Community Relief Shed",
            "amenity": "shelter",
        },
    }

    place = normalize_osm_element(sample_shelter, 22.5726, 88.3639, "2026-08-27T18:00:00Z")
    assert place is not None
    assert place.category == PlaceCategory.SHELTER
    assert place.provenance == PlaceProvenance.OSM_MAPPED
    assert place.source == "OPENSTREETMAP"


# ---------------------------------------------------------------------------
# 3. Overpass Mocking, Caching & Deduplication Tests
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_get_nearby_places_success_and_caching():
    """Verify external query execution, sorting, and in-memory cache hit."""
    mock_elements = [
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
            "tags": {"name": "Bidhannagar Police Station", "amenity": "police"},
        },
    ]

    mock_resp = Response(200, json={"elements": mock_elements})

    with patch("httpx.AsyncClient.post", new_callable=AsyncMock) as mock_post:
        mock_post.return_value = mock_resp

        # 1. First call -> Cache Miss
        places, is_cached = await get_nearby_places(22.5726, 88.3639, 2000)
        assert is_cached is False
        assert len(places) == 2
        assert places[0].name == "Apollo Clinic"
        assert places[1].name == "Bidhannagar Police Station"
        assert places[0].distance_meters < places[1].distance_meters
        assert mock_post.call_count == 1

        # 2. Second call with near-identical coordinates -> Cache Hit
        places_cached, is_cached_2 = await get_nearby_places(22.57261, 88.36392, 2000)
        assert is_cached_2 is True
        assert len(places_cached) == 2
        # Network post count should remain 1
        assert mock_post.call_count == 1


@pytest.mark.asyncio
async def test_get_nearby_places_provider_failure():
    """Verify graceful empty fallback when all external mirrors fail."""
    with patch("httpx.AsyncClient.post", new_callable=AsyncMock) as mock_post:
        mock_post.side_effect = Exception("Connection timeout to Overpass")

        places, is_cached = await get_nearby_places(22.5726, 88.3639, 2000)
        assert is_cached is False
        assert places == []


# ---------------------------------------------------------------------------
# 4. REST API Endpoint Integration Tests
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_api_places_nearby_validation():
    """Verify coordinate parameter validation and 422 error handling."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # Missing coordinates
        resp = await client.get("/api/places/nearby")
        assert resp.status_code == 422

        # Invalid latitude out of bounds
        resp = await client.get("/api/places/nearby?lat=95.0&lng=88.3639")
        assert resp.status_code == 422

        # Invalid longitude out of bounds
        resp = await client.get("/api/places/nearby?lat=22.5726&lng=195.0")
        assert resp.status_code == 422


@pytest.mark.asyncio
async def test_api_places_nearby_success():
    """Verify successful /api/places/nearby response with merged Salvus shelters."""
    mock_elements = [
        {
            "type": "node",
            "id": 201,
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
            resp = await client.get("/api/places/nearby?lat=22.5726&lng=88.3639&radius=3000")
            assert resp.status_code == 200
            body = resp.json()
            assert body["success"] is True
            assert "data" in body
            assert body["count"] >= 1
            assert body["radius_meters"] == 3000

            # Check that pharmacy has OSM_MAPPED provenance
            pharmacy = next((p for p in body["data"] if p["category"] == "pharmacy"), None)
            assert pharmacy is not None
            assert pharmacy["provenance"] == "OSM_MAPPED"
            assert pharmacy["source"] == "OPENSTREETMAP"
