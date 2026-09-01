"""Salvus Places & Facilities Service — Real-World Emergency Context Engine.

Key Architectural Pillars:
- Multi-source provider orchestration (Geoapify Places primary + Google Places / OSM fallback)
- Safe Places 3-tier trust hierarchy (Level 1 Salvus Verified, Level 2 Authority,
  Level 3 OSM Emergency)
- Multi-factor emergency ranking (hospitals, emergency response, verified shelters prioritized)
- Tiered location-bucketed caching with Stale-While-Revalidate fallback (300s fresh / 1800s stale)
- On-demand single-target OSRM routing (straight-line distance on list queries, OSRM on selection)
- Spatial-semantic deduplication (< 25m collocation merge across providers)
- GPS movement threshold checks (> 150m) and in-flight request deduplication
- Strict provenance classification: `SALVUS_VERIFIED`, `OSM_MAPPED`, `SEEDED_DEMO`
- Honest data integrity: null for missing contact or operational attributes (zero fabrication)
- Transparent status reporting: `OK`, `EMPTY`, `PARTIAL`, `PROVIDER_UNAVAILABLE`
"""

from __future__ import annotations

import logging
from datetime import UTC, datetime, timedelta
from typing import Any

import aiosqlite
import httpx

from app.adapters.facilities.orchestrator import FacilityOrchestrator
from app.adapters.nominatim import NominatimPlacesAdapter
from app.adapters.places import (
    NearbyPlacesProvider,
    OverpassPlacesAdapter,
)
from app.models import (
    FacilityCategory,
    FacilityFreshness,
    FacilityModel,
    FacilityResponseState,
    PlaceCategory,
    PlaceFreshness,
    PlaceModel,
    PlaceProvenance,
    PlaceRouteResponse,
    RouteProfile,
)
from app.utils.geospatial import (
    format_straight_line_distance as format_straight_line_distance,
)
from app.utils.geospatial import (
    haversine_distance_km as haversine_distance_km,
)
from app.utils.geospatial import (
    haversine_distance_meters as haversine_distance_meters,
)
from app.utils.geospatial import (
    snap_coordinate_to_grid as snap_coordinate_to_grid,
)

logger = logging.getLogger("salvus.facilities.service")


def format_distance(distance_meters: float) -> str:
    """Format distance in meters to clean straight-line distance string."""
    return format_straight_line_distance(distance_meters)


# ---------------------------------------------------------------------------
# Configuration & Cache TTLs
# ---------------------------------------------------------------------------

FRESH_CACHE_TTL_SECONDS = 300.0  # 5 minutes fresh TTL
STALE_CACHE_TTL_SECONDS = 1800.0  # 30 minutes stale fallback window
MAX_QUERY_RADIUS_METERS = 10000  # 10 km max
MIN_QUERY_RADIUS_METERS = 100  # 100 m min
DEFAULT_QUERY_RADIUS_METERS = 10000  # 10 km default
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

# Global Orchestrator & Legacy Provider Instances for testing overrides
_facility_orchestrator = FacilityOrchestrator()
_default_provider: NearbyPlacesProvider = OverpassPlacesAdapter()
_secondary_provider: NearbyPlacesProvider = NominatimPlacesAdapter()


def get_orchestrator() -> FacilityOrchestrator:
    """Get the active facility orchestrator singleton."""
    return _facility_orchestrator


def get_provider() -> NearbyPlacesProvider:
    """Get the active primary nearby places provider adapter (backward compatibility)."""
    return _default_provider


def set_provider(provider: NearbyPlacesProvider) -> None:
    """Override the active primary provider adapter (useful for testing)."""
    global _default_provider
    _default_provider = provider


def get_secondary_provider() -> NearbyPlacesProvider:
    """Get the active secondary provider adapter (backward compatibility)."""
    return _secondary_provider


def set_secondary_provider(provider: NearbyPlacesProvider) -> None:
    """Override the active secondary provider adapter (useful for testing)."""
    global _secondary_provider
    _secondary_provider = provider


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


def facility_to_place_model(fac: FacilityModel) -> PlaceModel:
    """Convert canonical FacilityModel to PlaceModel with full attribute preservation."""
    provenance = (
        PlaceProvenance.SALVUS_VERIFIED
        if fac.verified
        else (
            PlaceProvenance.SEEDED_DEMO
            if fac.provider == "seeded_demo"
            else PlaceProvenance.OSM_MAPPED
        )
    )

    cat_map = {
        FacilityCategory.HOSPITAL: PlaceCategory.HOSPITAL,
        FacilityCategory.PHARMACY: PlaceCategory.PHARMACY,
        FacilityCategory.POLICE: PlaceCategory.POLICE,
        FacilityCategory.FIRE_STATION: PlaceCategory.FIRE_STATION,
        FacilityCategory.AMBULANCE: PlaceCategory.EMERGENCY_SERVICE,
        FacilityCategory.SAFE_PLACE: PlaceCategory.SHELTER,
        FacilityCategory.OTHER: PlaceCategory.OTHER_RELEVANT,
    }
    place_cat = cat_map.get(fac.category, PlaceCategory.OTHER_RELEVANT)

    source_label = (
        "Geoapify Places"
        if fac.provider == "geoapify"
        else ("Salvus Civil Defense" if fac.verified else "OpenStreetMap")
    )

    return PlaceModel(
        id=fac.id,
        source=source_label,
        source_id=fac.provider_place_id,
        provenance=provenance,
        category=place_cat,
        name=fac.name,
        latitude=fac.latitude,
        longitude=fac.longitude,
        address=fac.formatted_address,
        city=fac.city,
        phone=fac.phone,
        website=fac.website,
        opening_hours=fac.opening_hours,
        distance_km=fac.distance_km,
        route_distance_m=fac.route_distance_m,
        route_duration_s=fac.route_duration_s,
        fetched_at=fac.fetched_at,
        distance_meters=fac.straight_line_distance_meters,
        distance_formatted=fac.distance_formatted,
        amenities=fac.amenities,
        safe_place_details=fac.safe_place_details,
        confidence=fac.confidence,
    )


# ---------------------------------------------------------------------------
# Core Service Multi-Source Fetch API
# ---------------------------------------------------------------------------


async def get_nearby_places(
    lat: float,
    lon: float,
    radius: int = DEFAULT_QUERY_RADIUS_METERS,
    categories: list[str | PlaceCategory | FacilityCategory] | None = None,
    include_verified: bool = True,
    safe_places_priority: bool = False,
    db: aiosqlite.Connection | None = None,
    client: httpx.AsyncClient | None = None,
    force_refresh: bool = False,
) -> tuple[list[PlaceModel], bool, PlaceFreshness, str]:
    """Retrieve nearby emergency facilities with full orchestration, strict distance validation,
    and ranking.

    Returns:
        tuple[list[PlaceModel], bool, PlaceFreshness, str]:
            (places_list, is_cached, freshness, status_code)
            status_code is one of: "OK", "EMPTY", "PARTIAL", "PROVIDER_UNAVAILABLE"
    """
    # 1. Check if mock provider override is set in test environment
    active_provider = get_provider()
    if not isinstance(active_provider, OverpassPlacesAdapter):
        parsed_cats = (
            [
                c if isinstance(c, PlaceCategory) else PlaceCategory.from_str(str(c))
                for c in categories
            ]
            if categories
            else None
        )

        try:
            places = await active_provider.fetch_nearby(
                lat=lat, lon=lon, radius_m=radius, categories=parsed_cats, client=client
            )
            status = "OK" if places else "EMPTY"
            return places, False, PlaceFreshness.FRESH, status
        except Exception:
            return [], False, PlaceFreshness.UNAVAILABLE, "PROVIDER_UNAVAILABLE"

    # 2. Use Master Facility Orchestrator
    orchestrator = get_orchestrator()

    # Convert category strings / PlaceCategory to FacilityCategory
    target_cats: list[FacilityCategory] = []
    if categories:
        for c in categories:
            cat_str = c.value if hasattr(c, "value") else str(c)
            parsed_fac = FacilityCategory.from_str(cat_str)
            if parsed_fac and parsed_fac not in target_cats:
                target_cats.append(parsed_fac)

    (
        facilities,
        is_cached,
        fac_freshness,
        response_state,
        cat_statuses,
    ) = await orchestrator.get_nearby_facilities(
        lat=lat,
        lon=lon,
        radius_m=radius,
        categories=target_cats if target_cats else None,
        include_verified_shelters=include_verified,
        safe_places_priority=safe_places_priority,
        db=db,
        client=client,
        force_refresh=force_refresh,
    )

    # Convert canonical FacilityModel to PlaceModel for backward-compatible response
    places = [facility_to_place_model(f) for f in facilities]

    # Map status code
    if response_state == FacilityResponseState.AVAILABLE:
        status_code = "OK"
    elif response_state == FacilityResponseState.NO_RESULTS:
        status_code = "EMPTY"
    elif response_state == FacilityResponseState.PARTIAL_RESULTS:
        status_code = "PARTIAL"
    elif response_state == FacilityResponseState.STALE:
        status_code = "OK"
    else:
        status_code = "PROVIDER_UNAVAILABLE"

    # Map freshness
    if fac_freshness == FacilityFreshness.STALE:
        place_freshness = PlaceFreshness.STALE
    elif fac_freshness == FacilityFreshness.UNAVAILABLE:
        place_freshness = PlaceFreshness.UNAVAILABLE
    else:
        place_freshness = PlaceFreshness.FRESH

    return places, is_cached, place_freshness, status_code


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


_REVERSE_GEOCODE_CACHE: dict[tuple[float, float], tuple[dict[str, Any], datetime]] = {}


async def reverse_geocode(
    lat: float,
    lon: float,
    client: httpx.AsyncClient | None = None,
) -> dict[str, Any]:
    """Reverse geocode coordinates into a human-readable area name using OSM Nominatim."""
    grid_key = (round(lat, 3), round(lon, 3))
    now = datetime.now(UTC)

    if grid_key in _REVERSE_GEOCODE_CACHE:
        cached_data, expire_dt = _REVERSE_GEOCODE_CACHE[grid_key]
        if now < expire_dt:
            return cached_data

    url = "https://nominatim.openstreetmap.org/reverse"
    params = {
        "format": "jsonv2",
        "lat": lat,
        "lon": lon,
        "zoom": 14,
        "addressdetails": 1,
    }
    headers = {
        "User-Agent": "Salvus-Disaster-Response/1.0 (Emergency Situational Awareness)",
        "Accept": "application/json",
    }

    try:
        if client:
            resp = await client.get(url, params=params, headers=headers, timeout=4.5)
        else:
            async with httpx.AsyncClient(timeout=4.5) as http_c:
                resp = await http_c.get(url, params=params, headers=headers)

        if resp.status_code == 200:
            data = resp.json()
            addr = data.get("address", {})

            suburb = (
                addr.get("suburb")
                or addr.get("neighbourhood")
                or addr.get("residential")
                or addr.get("commercial")
                or addr.get("road")
                or ""
            )
            city = (
                addr.get("city")
                or addr.get("town")
                or addr.get("municipality")
                or addr.get("county")
                or addr.get("state_district")
                or ""
            )
            state = addr.get("state", "")
            country = addr.get("country", "")

            from app.services.geo_service import resolve_district_from_coords

            fallback_dist, fallback_state = resolve_district_from_coords(lat, lon)
            district = (
                addr.get("state_district")
                or addr.get("district")
                or addr.get("county")
                or fallback_dist
                or ""
            )
            state = state or fallback_state or ""

            if suburb and city:
                area_name = f"{suburb}, {city}"
            elif suburb:
                area_name = f"{suburb}, {state}" if state else suburb
            elif city:
                area_name = f"{city}, {state}" if state else city
            else:
                area_name = (
                    data.get("name") or data.get("display_name", "").split(",")[0] or "Local Area"
                )

            display_address = data.get("display_name") or area_name

            result = {
                "success": True,
                "area_name": area_name,
                "suburb": suburb,
                "city": city,
                "district": district,
                "state": state,
                "country": country,
                "display_address": display_address,
                "latitude": lat,
                "longitude": lon,
                "source": "OpenStreetMap Nominatim",
                "fetched_at": now.isoformat(),
            }

            _REVERSE_GEOCODE_CACHE[grid_key] = (result, now + timedelta(hours=2))
            return result

    except Exception as exc:
        logger.warning(f"Reverse geocode lookup failed for ({lat}, {lon}): {exc}")

    # Fallback to coordinate and offline spatial index
    from app.services.geo_service import resolve_district_from_coords

    fallback_dist, fallback_state = resolve_district_from_coords(lat, lon)
    fallback_result = {
        "success": True,
        "area_name": (
            f"{fallback_dist}, {fallback_state}"
            if fallback_dist and fallback_state
            else f"{lat:.3f}° N, {lon:.3f}° E"
        ),
        "suburb": None,
        "city": fallback_dist,
        "district": fallback_dist,
        "state": fallback_state,
        "country": "India" if fallback_state else None,
        "display_address": f"{lat:.4f}° N, {lon:.4f}° E",
        "latitude": lat,
        "longitude": lon,
        "source": "Spatial Fallback",
        "fetched_at": now.isoformat(),
    }
    return fallback_result


def clear_places_cache() -> None:
    """Clear in-memory places and facilities cache (useful for testing)."""
    _facility_orchestrator.clear_cache()
    _REVERSE_GEOCODE_CACHE.clear()
