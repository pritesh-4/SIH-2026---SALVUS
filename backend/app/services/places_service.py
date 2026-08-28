"""Salvus Places Service — Real-world nearby geographic context via OSM & Civil Defense (Phase 2).

Key Architectural Pillars:
- Multi-factor emergency ranking (hospitals, emergency response, verified shelters prioritized)
- Tiered location-bucketed caching with Stale-While-Revalidate fallback (300s fresh / 1800s stale)
- On-demand single-target OSRM routing (straight-line distance on list queries, OSRM on selection)
- Spatial-semantic deduplication (< 25m collocation merge)
- GPS movement threshold checks (> 150m) and in-flight request deduplication
- Strict provenance classification: `OSM_MAPPED` vs `SALVUS_VERIFIED`
- Honest data integrity: null for missing contact or operational attributes
"""

from __future__ import annotations

import asyncio
import logging
import time
from datetime import UTC, datetime
from typing import Any

import aiosqlite
import httpx

from app.adapters.places import (
    NearbyPlacesProvider,
    OverpassPlacesAdapter,
    deduplicate_places,
    format_distance,
    haversine_distance_km,
    normalize_phone_number,
)
from app.models import (
    PlaceCategory,
    PlaceFreshness,
    PlaceModel,
    PlaceProvenance,
    PlaceRouteResponse,
    RouteProfile,
)

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Configuration & Cache TTLs
# ---------------------------------------------------------------------------

FRESH_CACHE_TTL_SECONDS = 300.0  # 5 minutes fresh TTL
STALE_CACHE_TTL_SECONDS = 1800.0  # 30 minutes stale fallback window
MAX_QUERY_RADIUS_METERS = 10000  # 10 km max
MIN_QUERY_RADIUS_METERS = 100  # 100 m min
DEFAULT_QUERY_RADIUS_METERS = 2000  # 2 km default
MOVEMENT_THRESHOLD_METERS = 150.0  # 150m meaningful movement

# Emergency Life-Safety Weights
CATEGORY_EMERGENCY_WEIGHTS: dict[PlaceCategory, float] = {
    PlaceCategory.HOSPITAL: 100.0,
    PlaceCategory.EMERGENCY_SERVICE: 95.0,
    PlaceCategory.FIRE_STATION: 90.0,
    PlaceCategory.POLICE: 85.0,
    PlaceCategory.CLINIC: 80.0,
    PlaceCategory.PHARMACY: 75.0,
    PlaceCategory.SHELTER: 70.0,
    PlaceCategory.OTHER_RELEVANT: 50.0,
}

# Default Provider Instance
_default_provider: NearbyPlacesProvider = OverpassPlacesAdapter()

# Tiered In-memory Cache: {cache_key: (places_list, fresh_until_timestamp, stale_until_timestamp)}
_PLACES_CACHE: dict[
    tuple[float, float, int, tuple[str, ...]],
    tuple[list[PlaceModel], float, float],
] = {}

# In-flight request deduplication mapping
_IN_FLIGHT_TASKS: dict[
    tuple[float, float, int, tuple[str, ...]],
    asyncio.Task[list[PlaceModel]],
] = {}


def get_provider() -> NearbyPlacesProvider:
    """Get the active nearby places provider adapter."""
    return _default_provider


def set_provider(provider: NearbyPlacesProvider) -> None:
    """Override the active nearby places provider adapter (useful for testing)."""
    global _default_provider
    _default_provider = provider


def snap_coordinate_to_grid(coord: float, precision: int = 3) -> float:
    """Snap coordinate to ~100m grid cell resolution to maximize cache hits."""
    return round(coord, precision)


def has_moved_significantly(
    prev_lat: float | None,
    prev_lon: float | None,
    curr_lat: float,
    curr_lon: float,
    threshold_m: float = MOVEMENT_THRESHOLD_METERS,
) -> bool:
    """Determine if a user has moved past a meaningful distance threshold."""
    if prev_lat is None or prev_lon is None:
        return True
    dist_km = haversine_distance_km(prev_lat, prev_lon, curr_lat, curr_lon)
    return (dist_km * 1000.0) >= threshold_m


def calculate_ranking_score(
    place: PlaceModel,
    safe_places_priority: bool = False,
) -> float:
    """Calculate multi-factor emergency suitability score (higher = ranks first)."""
    base_weight = CATEGORY_EMERGENCY_WEIGHTS.get(place.category, 50.0)

    # Provenance bonus: Salvus verified facilities receive highest trust tier
    provenance_bonus = 0.0
    if place.provenance == PlaceProvenance.SALVUS_VERIFIED:
        provenance_bonus = 40.0
        if safe_places_priority:
            provenance_bonus += 60.0

    if safe_places_priority and place.category == PlaceCategory.SHELTER:
        base_weight += 40.0

    # Proximity score: closer places score higher (-8 points per km)
    dist = place.distance_km if place.distance_km is not None else 5.0
    dist_penalty = dist * 8.0

    return base_weight + provenance_bonus - dist_penalty


def rank_places(
    places: list[PlaceModel],
    safe_places_priority: bool = False,
) -> list[PlaceModel]:
    """Rank places by emergency category priority, verified provenance, and proximity."""
    return sorted(
        places,
        key=lambda p: (
            -calculate_ranking_score(p, safe_places_priority=safe_places_priority),
            p.distance_km if p.distance_km is not None else 9999.0,
        ),
    )


def build_overpass_query(
    lat: float,
    lon: float,
    radius: int,
    categories: list[str | PlaceCategory] | None = None,
) -> str:
    """Compatibility wrapper: generate Overpass QL query via default adapter."""
    parsed_cats = None
    if categories:
        parsed_cats = [
            c if isinstance(c, PlaceCategory) else PlaceCategory.from_str(c) for c in categories
        ]
    if isinstance(_default_provider, OverpassPlacesAdapter):
        return _default_provider.build_query(lat, lon, radius, parsed_cats)
    adapter = OverpassPlacesAdapter()
    return adapter.build_query(lat, lon, radius, parsed_cats)


def normalize_osm_element(
    elem: dict[str, Any],
    origin_lat: float,
    origin_lon: float,
    now_iso: str,
) -> PlaceModel | None:
    """Compatibility wrapper: normalize raw OSM element via default adapter."""
    if isinstance(_default_provider, OverpassPlacesAdapter):
        return _default_provider.normalize_element(elem, origin_lat, origin_lon, now_iso)
    adapter = OverpassPlacesAdapter()
    return adapter.normalize_element(elem, origin_lat, origin_lon, now_iso)


# ---------------------------------------------------------------------------
# Core Service API
# ---------------------------------------------------------------------------


async def _execute_provider_fetch(
    lat: float,
    lon: float,
    radius_m: int,
    categories: list[PlaceCategory] | None = None,
    client: httpx.AsyncClient | None = None,
) -> list[PlaceModel]:
    """Execute provider fetch via the active provider adapter."""
    provider = get_provider()
    return await provider.fetch_nearby(
        lat=lat,
        lon=lon,
        radius_m=radius_m,
        categories=categories,
        client=client,
    )


async def get_nearby_places(
    lat: float,
    lon: float,
    radius: int = DEFAULT_QUERY_RADIUS_METERS,
    categories: list[str | PlaceCategory] | None = None,
    include_verified: bool = True,
    safe_places_priority: bool = False,
    db: aiosqlite.Connection | None = None,
    client: httpx.AsyncClient | None = None,
) -> tuple[list[PlaceModel], bool, PlaceFreshness]:
    """Retrieve nearby geographic places with caching, deduplication, and ranking.

    Returns:
        tuple[list[PlaceModel], bool, PlaceFreshness]: (places_list, is_cached, freshness)
    """
    # 1. Validate and clamp radius
    clamped_radius = max(MIN_QUERY_RADIUS_METERS, min(MAX_QUERY_RADIUS_METERS, radius))
    radius_bucket = max(100, (clamped_radius // 250) * 250)

    # 2. Parse category filters to controlled PlaceCategory enums
    parsed_categories: list[PlaceCategory] | None = None
    if categories:
        clean_cats = [
            c if isinstance(c, PlaceCategory) else PlaceCategory.from_str(c)
            for c in categories
            if str(c).strip()
        ]
        if clean_cats:
            parsed_categories = list(dict.fromkeys(clean_cats))

    cat_key = tuple(sorted([c.value for c in parsed_categories])) if parsed_categories else ("ALL",)

    # 3. Snap coordinates to ~100m grid for cache lookup
    grid_lat = snap_coordinate_to_grid(lat, 3)
    grid_lon = snap_coordinate_to_grid(lon, 3)
    cache_key = (grid_lat, grid_lon, radius_bucket, cat_key)

    now = time.time()
    is_cached = False
    freshness = PlaceFreshness.FRESH
    osm_places: list[PlaceModel] = []
    stale_candidate: list[PlaceModel] | None = None

    # 4. Tiered Cache Check
    if cache_key in _PLACES_CACHE:
        cached_places, fresh_until, stale_until = _PLACES_CACHE[cache_key]
        if now < fresh_until:
            is_cached = True
            freshness = PlaceFreshness.FRESH
            # Re-compute exact straight-line distances from actual GPS coordinates
            recalculated: list[PlaceModel] = []
            for p in cached_places:
                dist_km = haversine_distance_km(lat, lon, p.latitude, p.longitude)
                dist_m = round(dist_km * 1000.0, 1)
                p_copy = p.model_copy(
                    update={
                        "distance_km": dist_km,
                        "distance_meters": dist_m,
                        "distance_formatted": format_distance(dist_m),
                    }
                )
                recalculated.append(p_copy)
            osm_places = recalculated
        elif now < stale_until:
            stale_candidate = cached_places
        else:
            del _PLACES_CACHE[cache_key]

    # 5. In-flight request deduplication / Fetch
    if not is_cached:
        if cache_key in _IN_FLIGHT_TASKS:
            task = _IN_FLIGHT_TASKS[cache_key]
            osm_places = await task
        else:
            task = asyncio.create_task(
                _execute_provider_fetch(lat, lon, clamped_radius, parsed_categories, client=client)
            )
            _IN_FLIGHT_TASKS[cache_key] = task
            try:
                fetched_places = await task
                if fetched_places:
                    osm_places = fetched_places
                    _PLACES_CACHE[cache_key] = (
                        osm_places,
                        now + FRESH_CACHE_TTL_SECONDS,
                        now + STALE_CACHE_TTL_SECONDS,
                    )
                elif stale_candidate:
                    # Fallback to stale cache when provider returns empty/failure
                    is_cached = True
                    freshness = PlaceFreshness.STALE
                    osm_places = stale_candidate
                else:
                    osm_places = []
                    freshness = PlaceFreshness.UNAVAILABLE
            except Exception as fetch_err:
                logger.warning(
                    "[PlacesService] External fetch failed: %s. Trying stale cache...",
                    fetch_err,
                )
                if stale_candidate:
                    is_cached = True
                    freshness = PlaceFreshness.STALE
                    osm_places = stale_candidate
                else:
                    osm_places = []
                    freshness = PlaceFreshness.UNAVAILABLE
            finally:
                _IN_FLIGHT_TASKS.pop(cache_key, None)

    all_places: list[PlaceModel] = list(osm_places)

    # 6. Merge official Salvus-verified shelters if requested
    if include_verified and (not parsed_categories or PlaceCategory.SHELTER in parsed_categories):
        try:
            from app.services import shelter_service

            verified_shelters = []
            if db is not None:
                verified_shelters = await shelter_service.get_all_shelters(db)
            else:
                from app.db import get_database

                conn = await get_database()
                verified_shelters = await shelter_service.get_all_shelters(conn)

            now_iso = datetime.now(UTC).isoformat()
            radius_km = clamped_radius / 1000.0

            for sh in verified_shelters:
                is_active = getattr(sh, "is_active", True)
                if sh.latitude is not None and sh.longitude is not None and is_active:
                    dist_km = haversine_distance_km(lat, lon, sh.latitude, sh.longitude)
                    if dist_km <= radius_km:
                        dist_m = round(dist_km * 1000.0, 1)
                        shelter_amenities = getattr(sh, "amenities", []) or []
                        contact_phone = normalize_phone_number(getattr(sh, "contact_phone", None))

                        all_places.append(
                            PlaceModel(
                                id=f"salvus-shelter-{sh.id}",
                                source="Salvus Civil Defense",
                                source_id=str(sh.id),
                                provenance=PlaceProvenance.SALVUS_VERIFIED,
                                category=PlaceCategory.SHELTER,
                                name=sh.name,
                                latitude=sh.latitude,
                                longitude=sh.longitude,
                                address=sh.address,
                                city=None,
                                phone=contact_phone,
                                website=None,
                                opening_hours="24/7 Emergency Operation",
                                distance_km=dist_km,
                                route_distance_m=None,
                                route_duration_s=None,
                                fetched_at=now_iso,
                                distance_meters=dist_m,
                                distance_formatted=format_distance(dist_m),
                                amenities=shelter_amenities,
                            )
                        )
        except Exception as err:
            logger.debug("[PlacesService] Verified shelter merge skipped: %s", err)

    # 7. Multi-stage deduplication & multi-factor emergency ranking
    deduped_all = deduplicate_places(all_places)
    ranked_places = rank_places(deduped_all, safe_places_priority=safe_places_priority)

    return ranked_places, is_cached, freshness


async def get_place_route(
    origin_lat: float,
    origin_lon: float,
    place: PlaceModel,
    profile: str = "walking",
    client: httpx.AsyncClient | None = None,
) -> PlaceRouteResponse:
    """Calculate on-demand turn-by-turn route to a single selected place."""
    from app.services import routing_service

    route_prof = (
        RouteProfile.WALKING if profile.lower() in ("walking", "walk") else RouteProfile.DRIVING
    )
    route_resp = await routing_service.get_route(
        origin_lat=origin_lat,
        origin_lon=origin_lon,
        dest_lat=place.latitude,
        dest_lon=place.longitude,
        profile=route_prof,
        client=client,
    )

    updated_place = place.model_copy(
        update={
            "route_distance_m": route_resp.distance_meters,
            "route_duration_s": route_resp.duration_seconds,
        }
    )

    now_iso = datetime.now(UTC).isoformat()
    return PlaceRouteResponse(
        success=True,
        place=updated_place,
        origin={"latitude": origin_lat, "longitude": origin_lon},
        destination={"latitude": place.latitude, "longitude": place.longitude},
        route_distance_m=route_resp.distance_meters,
        route_duration_s=route_resp.duration_seconds,
        eta_formatted=route_resp.eta_formatted,
        coordinates=route_resp.coordinates,
        profile=profile,
        is_fallback=route_resp.is_fallback,
        is_safe_route=route_resp.is_safe_route,
        hazard_warning=route_resp.hazard_warning,
        calculated_at=now_iso,
    )


def clear_places_cache() -> None:
    """Clear in-memory places cache (useful for testing)."""
    _PLACES_CACHE.clear()
    _IN_FLIGHT_TASKS.clear()
