"""Salvus Routing Service — Dedicated OSRM integration with resilient fallback.

Provides clean routing abstraction with:
- Async OSRM API integration (driving, walking, emergency watercraft transit)
- In-memory TTL caching to prevent excessive redundant API calls
- Offline resilient vector corridor calculation if OSRM is unreachable
- Normalized distance, duration, ETA, and coordinate arrays [[lat, lon], ...]
"""

from __future__ import annotations

import math
import os
import time
from datetime import UTC, datetime
from typing import Any

import httpx

from app.models import RouteProfile, RouteResponse, RouteStatus

# ---------------------------------------------------------------------------
# Configuration & Constants
# ---------------------------------------------------------------------------

DEFAULT_OSRM_URL = "https://router.project-osrm.org"
REQUEST_TIMEOUT_SECONDS = 3.0
CACHE_TTL_SECONDS = 300.0  # 5-minute route cache


def get_osrm_base_url() -> str:
    """Resolve OSRM base URL dynamically from environment."""
    return os.getenv("OSRM_BASE_URL", DEFAULT_OSRM_URL).rstrip("/")


# In-memory LRU/TTL Route Cache: {(lat1, lon1, lat2, lon2, profile): (RouteResponse, expire_time)}
_ROUTE_CACHE: dict[tuple[float, float, float, float, str], tuple[RouteResponse, float]] = {}


def validate_coordinates(lat1: float, lon1: float, lat2: float, lon2: float) -> None:
    """Validate geographic coordinates bounds."""
    for name, val, min_v, max_v in [
        ("origin_latitude", lat1, -90.0, 90.0),
        ("origin_longitude", lon1, -180.0, 180.0),
        ("destination_latitude", lat2, -90.0, 90.0),
        ("destination_longitude", lon2, -180.0, 180.0),
    ]:
        if not isinstance(val, (int, float)) or math.isnan(val) or val < min_v or val > max_v:
            raise ValueError(f"Invalid coordinate {name}={val}; must be within [{min_v}, {max_v}]")


def haversine_distance_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Calculate great-circle distance between two GPS coordinates in km."""
    radius_km = 6371.0
    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)
    a = (
        math.sin(dlat / 2) ** 2
        + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(dlon / 2) ** 2
    )
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
    return round(radius_km * c, 3)


def format_eta(seconds: float) -> str:
    """Format duration in seconds into clean human-readable ETA (e.g., '4 min', '1 hr 12 min')."""
    if seconds <= 30:
        return "1 min"
    minutes = max(1, round(seconds / 60))
    if minutes < 60:
        return f"{minutes} min"
    hours = minutes // 60
    rem_min = minutes % 60
    if rem_min == 0:
        return f"{hours} hr"
    return f"{hours} hr {rem_min} min"


def _generate_fallback_corridor(
    origin_lat: float,
    origin_lon: float,
    dest_lat: float,
    dest_lon: float,
    profile: str = "driving",
) -> RouteResponse:
    """Generate a realistic curved corridor polyline when OSRM is offline or unreachable."""
    dist_km = haversine_distance_km(origin_lat, origin_lon, dest_lat, dest_lon)
    dist_meters = round(dist_km * 1000, 1)

    # Average operational speeds (km/h) in disaster response environments
    speed_kmh = 35.0  # default driving
    if profile == "walking":
        speed_kmh = 4.8
    elif profile == "boat":
        speed_kmh = 24.0

    duration_hours = dist_km / max(1.0, speed_kmh)
    duration_seconds = max(30.0, round(duration_hours * 3600, 1)) if dist_km > 0.01 else 0.0
    duration_minutes = round(duration_seconds / 60, 1)

    # Handle identical origin and destination
    if dist_km < 0.001:
        coordinates = [[round(origin_lat, 6), round(origin_lon, 6)]]
    else:
        # Generate 15 interpolated waypoints with slight realistic curvature
        num_points = 15
        coordinates = []

        mid_lat = (origin_lat + dest_lat) / 2.0
        mid_lon = (origin_lon + dest_lon) / 2.0
        dlat = dest_lat - origin_lat
        dlon = dest_lon - origin_lon

        perp_scale = 0.08  # 8% arc height
        offset_lat = -dlon * perp_scale
        offset_lon = dlat * perp_scale

        for i in range(num_points):
            t = i / (num_points - 1)
            ctrl_lat = mid_lat + offset_lat
            ctrl_lon = mid_lon + offset_lon

            lat = (1 - t) ** 2 * origin_lat + 2 * (1 - t) * t * ctrl_lat + t**2 * dest_lat
            lon = (1 - t) ** 2 * origin_lon + 2 * (1 - t) * t * ctrl_lon + t**2 * dest_lon
            coordinates.append([round(lat, 6), round(lon, 6)])

    now_iso = datetime.now(UTC).isoformat()

    return RouteResponse(
        distance_km=dist_km,
        distance_meters=dist_meters,
        duration_seconds=duration_seconds,
        duration_minutes=duration_minutes,
        eta_seconds=duration_seconds,
        eta_formatted=format_eta(duration_seconds) if dist_km > 0.001 else "Immediate",
        coordinates=coordinates,
        geometry=coordinates,
        profile=profile,
        status=RouteStatus.FALLBACK_CORRIDOR,
        summary="Emergency Vector Corridor (Offline/Fallback)",
        provider="salvus_fallback",
        calculated_at=now_iso,
        is_fallback=True,
    )


def _get_cache_key(
    lat1: float, lon1: float, lat2: float, lon2: float, profile: str
) -> tuple[float, float, float, float, str]:
    """Round coordinates to 4 decimals (~11m precision) for cache keys."""
    return (round(lat1, 4), round(lon1, 4), round(lat2, 4), round(lon2, 4), profile)


def clear_route_cache() -> None:
    """Clear in-memory route cache (useful for testing)."""
    _ROUTE_CACHE.clear()


async def evaluate_route_hazards(
    coordinates: list[list[float]],
) -> tuple[bool, str | None, list[str]]:
    """Evaluate if route coordinates intersect or approach known active disaster hazards.

    Returns:
        tuple: (is_safe_route, hazard_warning, hazard_intersections)
    """
    try:
        from app.services.hazard_service import get_active_hazards

        active_hazards = await get_active_hazards()
        critical_hazards = [
            hz for hz in active_hazards if hz.severity in ("CRITICAL", "WARNING") and hz.is_active
        ]

        if not critical_hazards or not coordinates:
            return True, None, []

        intersections = []
        is_safe = True
        min_distance_km = 999.0
        nearest_hazard = None

        # Sample waypoints along the route
        step = max(1, len(coordinates) // 25)
        sampled_points = coordinates[::step]
        if coordinates[-1] not in sampled_points:
            sampled_points.append(coordinates[-1])

        for pt in sampled_points:
            pt_lat, pt_lon = pt[0], pt[1]
            for hz in critical_hazards:
                dist = haversine_distance_km(pt_lat, pt_lon, hz.latitude, hz.longitude)
                if dist < min_distance_km:
                    min_distance_km = dist
                    nearest_hazard = hz

                # Intersects if within affected radius or within 400m of critical hazard
                if dist <= max(0.4, hz.affected_radius_km * 0.7):
                    is_safe = False
                    inter_desc = f"{hz.title} (within {int(dist * 1000)}m of route)"
                    if inter_desc not in intersections:
                        intersections.append(inter_desc)

        hazard_warning = None
        if not is_safe and nearest_hazard:
            dist_m = int(min_distance_km * 1000)
            hazard_warning = (
                f"Caution: Route intersects or passes within proximity ({dist_m}m) "
                f"of active hazard zone: {nearest_hazard.title}."
            )

        return is_safe, hazard_warning, intersections
    except Exception as e:
        print(f"[RoutingService] Route hazard evaluation skipped: {e}")
        return True, None, []


async def get_route(
    origin_lat: float,
    origin_lon: float,
    dest_lat: float,
    dest_lon: float,
    profile: RouteProfile | str = RouteProfile.DRIVING,
    client: httpx.AsyncClient | None = None,
) -> RouteResponse:
    """Calculate real-world routing geometry, distance, duration, and safety assessment.

    Queries OSRM service with automatic fallback to vector corridor on timeout/error.
    """
    validate_coordinates(origin_lat, origin_lon, dest_lat, dest_lon)

    profile_str = profile.value if isinstance(profile, RouteProfile) else str(profile).lower()
    cache_key = _get_cache_key(origin_lat, origin_lon, dest_lat, dest_lon, profile_str)

    now = time.time()
    if cache_key in _ROUTE_CACHE:
        cached_resp, expires_at = _ROUTE_CACHE[cache_key]
        if now < expires_at:
            return cached_resp

    # For watercraft boat routes in flood zones without road networks,
    # use specialized fallback corridor
    if profile_str == "boat":
        route_resp = _generate_fallback_corridor(
            origin_lat, origin_lon, dest_lat, dest_lon, profile="boat"
        )
        is_safe, warning, intersections = await evaluate_route_hazards(route_resp.coordinates)
        route_resp = route_resp.model_copy(
            update={
                "is_safe_route": is_safe,
                "hazard_warning": warning,
                "hazard_intersections": intersections,
                "safety_disclaimer": "Recommended route based on current available hazard data.",
            }
        )
        _ROUTE_CACHE[cache_key] = (route_resp, now + CACHE_TTL_SECONDS)
        return route_resp

    # Map profile to OSRM profiles ('driving' or 'walking')
    osrm_profile = "driving" if profile_str in ("driving", "car") else "walking"
    base_url = get_osrm_base_url()

    # OSRM coordinate format: lon,lat;lon,lat
    url = (
        f"{base_url}/route/v1/{osrm_profile}/"
        f"{origin_lon},{origin_lat};{dest_lon},{dest_lat}"
        "?overview=full&geometries=geojson"
    )

    try:
        if client:
            response = await client.get(url, timeout=REQUEST_TIMEOUT_SECONDS)
        else:
            async with httpx.AsyncClient() as http:
                response = await http.get(url, timeout=REQUEST_TIMEOUT_SECONDS)

        if response.status_code == 200:
            data: dict[str, Any] = response.json()
            if data.get("code") == "Ok" and data.get("routes"):
                best_route = data["routes"][0]
                dist_meters = float(best_route.get("distance", 0.0))
                dist_km = round(dist_meters / 1000.0, 2)
                dur_seconds = float(best_route.get("duration", 0.0))
                dur_minutes = round(dur_seconds / 60.0, 1)

                # GeoJSON coordinates are [lon, lat] -> convert to Leaflet standard [lat, lon]
                raw_coords = best_route.get("geometry", {}).get("coordinates", [])
                coordinates: list[list[float]] = [
                    [round(pt[1], 6), round(pt[0], 6)] for pt in raw_coords
                ]

                # If OSRM returned empty coordinates, generate direct segment
                if not coordinates:
                    coordinates = [
                        [origin_lat, origin_lon],
                        [dest_lat, dest_lon],
                    ]

                summary = best_route.get("legs", [{}])[0].get("summary", "OSRM Navigated Route")
                now_iso = datetime.now(UTC).isoformat()

                is_safe, warning, intersections = await evaluate_route_hazards(coordinates)

                route_resp = RouteResponse(
                    distance_km=dist_km,
                    distance_meters=dist_meters,
                    duration_seconds=dur_seconds,
                    duration_minutes=dur_minutes,
                    eta_seconds=dur_seconds,
                    eta_formatted=format_eta(dur_seconds),
                    coordinates=coordinates,
                    geometry=coordinates,
                    profile=profile_str,
                    status=RouteStatus.OPTIMAL_OSRM,
                    summary=summary or "OSRM Optimized Route",
                    provider="osrm",
                    calculated_at=now_iso,
                    is_fallback=False,
                    is_safe_route=is_safe,
                    hazard_warning=warning,
                    hazard_intersections=intersections,
                    safety_disclaimer="Recommended route based on current available hazard data.",
                )

                _ROUTE_CACHE[cache_key] = (route_resp, now + CACHE_TTL_SECONDS)
                return route_resp

    except Exception as exc:
        # Fallback seamlessly on any network error or timeout
        print(f"[RoutingService] OSRM query failed ({exc}). Using resilient fallback corridor.")

    route_resp = _generate_fallback_corridor(
        origin_lat, origin_lon, dest_lat, dest_lon, profile=profile_str
    )
    is_safe, warning, intersections = await evaluate_route_hazards(route_resp.coordinates)
    route_resp = route_resp.model_copy(
        update={
            "is_safe_route": is_safe,
            "hazard_warning": warning,
            "hazard_intersections": intersections,
            "safety_disclaimer": "Recommended route based on current available hazard data.",
        }
    )
    _ROUTE_CACHE[cache_key] = (route_resp, now + CACHE_TTL_SECONDS)
    return route_resp
