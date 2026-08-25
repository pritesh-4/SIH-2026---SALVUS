"""Unit and integration tests for the Salvus routing service and API endpoints."""

from unittest.mock import AsyncMock

import httpx
import pytest
from httpx import Response

from app.models import RouteProfile, RouteStatus
from app.services.routing_service import (
    clear_route_cache,
    format_eta,
    get_route,
    haversine_distance_km,
    validate_coordinates,
)


@pytest.fixture(autouse=True)
def clean_cache():
    clear_route_cache()
    yield
    clear_route_cache()


def test_haversine_distance():
    """Verify great circle distance calculation."""
    # Salt Lake Central (22.5726, 88.3639) to Sector 5 (22.5800, 88.4350) ~ 7.3 km
    dist = haversine_distance_km(22.5726, 88.3639, 22.5800, 88.4350)
    assert 7.0 <= dist <= 7.8
    assert haversine_distance_km(22.5726, 88.3639, 22.5726, 88.3639) == 0.0


def test_format_eta():
    """Verify duration formatting."""
    assert format_eta(15) == "1 min"
    assert format_eta(45) == "1 min"
    assert format_eta(240) == "4 min"
    assert format_eta(3600) == "1 hr"
    assert format_eta(4500) == "1 hr 15 min"


def test_validate_coordinates():
    """Verify geographic bounds validation."""
    validate_coordinates(22.5726, 88.3639, 22.5800, 88.4350)

    with pytest.raises(ValueError, match="origin_latitude"):
        validate_coordinates(95.0, 88.3639, 22.5800, 88.4350)

    with pytest.raises(ValueError, match="origin_longitude"):
        validate_coordinates(22.5726, -185.0, 22.5800, 88.4350)

    with pytest.raises(ValueError, match="destination_latitude"):
        validate_coordinates(22.5726, 88.3639, -91.0, 88.4350)

    with pytest.raises(ValueError, match="destination_longitude"):
        validate_coordinates(22.5726, 88.3639, 22.5800, 185.0)


@pytest.mark.asyncio
async def test_fallback_corridor_generation():
    """Verify fallback vector corridor generates smooth interpolated waypoints."""
    route = await get_route(
        origin_lat=22.5726,
        origin_lon=88.3639,
        dest_lat=22.5800,
        dest_lon=88.4350,
        profile=RouteProfile.BOAT,
    )
    assert route.status == RouteStatus.FALLBACK_CORRIDOR
    assert route.is_fallback is True
    assert route.provider == "salvus_fallback"
    assert route.calculated_at is not None
    assert len(route.coordinates) >= 10
    assert route.geometry == route.coordinates
    assert route.distance_km > 0
    assert route.distance_meters > 0
    assert route.duration_seconds > 0
    assert route.eta_seconds == route.duration_seconds
    assert "min" in route.eta_formatted


@pytest.mark.asyncio
async def test_route_caching():
    """Verify identical coordinate queries return cached results."""
    route1 = await get_route(
        origin_lat=22.5726,
        origin_lon=88.3639,
        dest_lat=22.5800,
        dest_lon=88.4350,
        profile=RouteProfile.BOAT,
    )
    route2 = await get_route(
        origin_lat=22.572601,  # Micro-variation rounds to same cache key
        origin_lon=88.363901,
        dest_lat=22.580002,
        dest_lon=88.435003,
        profile=RouteProfile.BOAT,
    )
    assert route1.coordinates == route2.coordinates
    assert route1.distance_km == route2.distance_km


@pytest.mark.asyncio
async def test_osrm_optimal_route_mock():
    """Verify successful OSRM query parsing and normalization."""
    mock_osrm_payload = {
        "code": "Ok",
        "routes": [
            {
                "distance": 4200.5,
                "duration": 540.0,
                "geometry": {
                    "coordinates": [
                        [88.3639, 22.5726],
                        [88.3900, 22.5750],
                        [88.4350, 22.5800],
                    ]
                },
                "legs": [{"summary": "Sector V Expressway"}],
            }
        ],
    }

    mock_response = Response(
        status_code=200,
        json=mock_osrm_payload,
        request=httpx.Request("GET", "http://test"),
    )

    mock_client = AsyncMock(spec=httpx.AsyncClient)
    mock_client.get.return_value = mock_response

    route = await get_route(
        origin_lat=22.5726,
        origin_lon=88.3639,
        dest_lat=22.5800,
        dest_lon=88.4350,
        profile=RouteProfile.DRIVING,
        client=mock_client,
    )

    assert route.status == RouteStatus.OPTIMAL_OSRM
    assert route.is_fallback is False
    assert route.provider == "osrm"
    assert route.distance_meters == 4200.5
    assert route.distance_km == 4.2
    assert route.duration_seconds == 540.0
    assert route.eta_seconds == 540.0
    assert route.eta_formatted == "9 min"
    assert route.summary == "Sector V Expressway"
    # Verify coordinates converted from GeoJSON [lon, lat] to Leaflet [lat, lon]
    assert route.coordinates[0] == [22.5726, 88.3639]
    assert route.coordinates[-1] == [22.5800, 88.4350]


@pytest.mark.asyncio
async def test_osrm_timeout_resilience():
    """Verify graceful fallback corridor on OSRM timeout."""
    mock_client = AsyncMock(spec=httpx.AsyncClient)
    mock_client.get.side_effect = httpx.TimeoutException("OSRM server timeout")

    route = await get_route(
        origin_lat=22.5726,
        origin_lon=88.3639,
        dest_lat=22.5800,
        dest_lon=88.4350,
        profile=RouteProfile.DRIVING,
        client=mock_client,
    )

    assert route.status == RouteStatus.FALLBACK_CORRIDOR
    assert route.is_fallback is True
    assert route.provider == "salvus_fallback"
    assert len(route.coordinates) >= 2


@pytest.mark.asyncio
async def test_short_route_identical_coordinates():
    """Verify routing between identical coordinates handles 0 distance gracefully."""
    route = await get_route(
        origin_lat=22.5726,
        origin_lon=88.3639,
        dest_lat=22.5726,
        dest_lon=88.3639,
        profile=RouteProfile.BOAT,
    )
    assert route.distance_km == 0.0
    assert route.distance_meters == 0.0
    assert len(route.coordinates) >= 1
    assert route.coordinates[0] == [22.5726, 88.3639]


@pytest.mark.asyncio
async def test_api_routes_endpoints(client):
    """Verify REST API endpoints /api/routing/route and /api/routes."""
    # Test GET /api/routing/route with lat/lng
    resp1 = await client.get(
        "/api/routing/route",
        params={
            "origin_lat": 22.5726,
            "origin_lng": 88.3639,
            "dest_lat": 22.5800,
            "dest_lng": 88.4350,
            "profile": "boat",
        },
    )
    assert resp1.status_code == 200
    data1 = resp1.json()["data"]
    assert "distance_meters" in data1
    assert "duration_seconds" in data1
    assert "eta_formatted" in data1
    assert "coordinates" in data1
    assert data1["provider"] == "salvus_fallback"

    # Test GET /api/routes alias with comma strings
    resp2 = await client.get(
        "/api/routes",
        params={
            "origin": "22.5726,88.3639",
            "destination": "22.5800,88.4350",
            "profile": "boat",
        },
    )
    assert resp2.status_code == 200
    data2 = resp2.json()["data"]
    assert data2["distance_km"] == data1["distance_km"]

    # Test POST /api/routes
    resp3 = await client.post(
        "/api/routes",
        json={
            "origin_latitude": 22.5726,
            "origin_longitude": 88.3639,
            "destination_latitude": 22.5800,
            "destination_longitude": 88.4350,
            "profile": "boat",
        },
    )
    assert resp3.status_code == 200
    assert resp3.json()["success"] is True

    # Test Invalid coordinates return 422 with code INVALID_COORDINATES
    resp_err = await client.get(
        "/api/routes",
        params={
            "origin_lat": 120.0,  # Invalid latitude
            "origin_lng": 88.3639,
            "dest_lat": 22.5800,
            "dest_lng": 88.4350,
        },
    )
    assert resp_err.status_code == 422
    err_body = resp_err.json()
    assert err_body["detail"]["error"]["code"] == "INVALID_COORDINATES"
