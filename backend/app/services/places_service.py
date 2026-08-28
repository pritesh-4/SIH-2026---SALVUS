"""Salvus Places Service — Real-world nearby geographic context via OSM & Civil Defense.

Key Architectural Pillars:
- Modular `NearbyPlacesProvider` adapter layer (OverpassPlacesAdapter by default)
- In-memory TTL cache with ~100m grid cell coordinate snapping
- In-flight request deduplication to prevent hammering public OSM infrastructure
- Strict provenance classification: `OSM_MAPPED` vs `SALVUS_VERIFIED`
- High-performance straight-line Haversine distance calculation and human-friendly formatting
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
    format_distance,
    haversine_distance_km,
)
from app.models import PlaceCategory, PlaceModel, PlaceProvenance

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Configuration & Thresholds
# ---------------------------------------------------------------------------

CACHE_TTL_SECONDS = 300.0  # 5-minute TTL cache
MAX_QUERY_RADIUS_METERS = 10000  # 10 km upper bound
MIN_QUERY_RADIUS_METERS = 100  # 100 m lower bound
DEFAULT_QUERY_RADIUS_METERS = 2000  # 2 km default

# Default Provider Instance
_default_provider: NearbyPlacesProvider = OverpassPlacesAdapter()

# In-memory TTL Cache: {cache_key: (list[PlaceModel], expire_timestamp)}
_PLACES_CACHE: dict[tuple[float, float, int, tuple[str, ...]], tuple[list[PlaceModel], float]] = {}

# In-flight request deduplication mapping
_IN_FLIGHT_TASKS: dict[
    tuple[float, float, int, tuple[str, ...]], asyncio.Task[list[PlaceModel]]
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
    include_verified: bool = False,
    db: aiosqlite.Connection | None = None,
    client: httpx.AsyncClient | None = None,
) -> tuple[list[PlaceModel], bool]:
    """Retrieve nearby geographic places with caching, deduplication, and shelter integration.

    Returns:
        tuple[list[PlaceModel], bool]: (places_list, is_cached)
    """
    # 1. Validate and clamp radius
    clamped_radius = max(MIN_QUERY_RADIUS_METERS, min(MAX_QUERY_RADIUS_METERS, radius))

    # 2. Parse category filters to controlled PlaceCategory enums
    parsed_categories: list[PlaceCategory] | None = None
    if categories:
        clean_cats = [
            c if isinstance(c, PlaceCategory) else PlaceCategory.from_str(c)
            for c in categories
            if str(c).strip()
        ]
        if clean_cats:
            parsed_categories = list(dict.fromkeys(clean_cats))  # deduplicate preserving order

    cat_key = tuple(sorted([c.value for c in parsed_categories])) if parsed_categories else ("ALL",)

    # 3. Snap coordinates to ~100m grid for cache lookup
    grid_lat = snap_coordinate_to_grid(lat, 3)
    grid_lon = snap_coordinate_to_grid(lon, 3)
    cache_key = (grid_lat, grid_lon, clamped_radius, cat_key)

    now = time.time()
    is_cached = False
    osm_places: list[PlaceModel] = []

    # 4. Cache check
    if cache_key in _PLACES_CACHE:
        cached_places, expire_time = _PLACES_CACHE[cache_key]
        if now < expire_time:
            is_cached = True
            # Re-compute exact distances from actual user GPS coordinates
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
                osm_places = await task
                _PLACES_CACHE[cache_key] = (osm_places, now + CACHE_TTL_SECONDS)
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
                        # Extract verified amenities or designate safe refuge
                        shelter_amenities = getattr(sh, "amenities", []) or []
                        contact_phone = getattr(sh, "contact_phone", None)

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

    # 7. Sort combined list ascending by straight-line distance
    all_places.sort(key=lambda p: p.distance_km if p.distance_km is not None else 9999.0)
    return all_places, is_cached


def clear_places_cache() -> None:
    """Clear in-memory places cache (useful for testing)."""
    _PLACES_CACHE.clear()
    _IN_FLIGHT_TASKS.clear()
