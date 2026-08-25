"""Unit tests for the Salvus routing service."""

import pytest

from app.models import RouteProfile, RouteStatus
from app.services.routing_service import (
    clear_route_cache,
    format_eta,
    get_route,
    haversine_distance_km,
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
    assert format_eta(45) == "1 min"
    assert format_eta(240) == "4 min"
    assert format_eta(3600) == "1 hr"
    assert format_eta(4500) == "1 hr 15 min"


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
    assert len(route.coordinates) >= 10
    assert route.distance_km > 0
    assert route.duration_minutes > 0
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
        origin_lat=22.5726,
        origin_lon=88.3639,
        dest_lat=22.5800,
        dest_lon=88.4350,
        profile=RouteProfile.BOAT,
    )
    assert route1.coordinates == route2.coordinates
    assert route1.distance_km == route2.distance_km
