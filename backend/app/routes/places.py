"""Places REST API routes (Phase 2: Proximity, Routing, Cache & Trust).

Provides endpoints for querying real-world geographic context (hospitals,
clinics, pharmacies, police stations, fire stations, emergency facilities,
and emergency shelters) around citizen GPS coordinates with strict provenance separation,
multi-factor ranking, and on-demand turn-by-turn routing.

Endpoints:
    GET  /api/places/nearby          — Query ranked nearby real-world places
    GET  /api/places                 — Architectural alias endpoint
    GET  /api/places/{place_id}/route — On-demand single-target route calculation
"""

from __future__ import annotations

import math
from datetime import UTC, datetime

from fastapi import APIRouter, HTTPException, Query

from app.db import get_database
from app.models import (
    PlaceCategory,
    PlaceFreshness,
    PlaceModel,
    PlaceProvenance,
    PlaceRouteResponse,
    PlacesResponse,
)
from app.services import places_service

router = APIRouter(tags=["places"])


def validate_coordinates(lat: float, lon: float) -> None:
    """Validate latitude and longitude ranges."""
    if math.isnan(lat) or lat < -90.0 or lat > 90.0:
        raise ValueError(f"Invalid latitude={lat}; must be within [-90, 90]")
    if math.isnan(lon) or lon < -180.0 or lon > 180.0:
        raise ValueError(f"Invalid longitude={lon}; must be within [-180, 180]")


@router.get("/api/places/nearby", response_model=PlacesResponse)
@router.get("/api/places", response_model=PlacesResponse)
async def get_nearby_places_endpoint(
    lat: float = Query(..., description="Citizen latitude (-90 to 90)"),
    lon: float | None = Query(None, description="Citizen longitude (-180 to 180)"),
    lng: float | None = Query(None, description="Citizen longitude alias (-180 to 180)"),
    radius_km: float | None = Query(
        None, ge=0.1, le=10.0, description="Query radius in kilometers (default 2.0)"
    ),
    radius: int | None = Query(None, description="Query radius in meters (legacy parameter)"),
    categories: str | None = Query(None, description="Comma-separated category filters"),
    include_verified: bool = Query(True, description="Include official Salvus-verified shelters"),
    safe_places_only: bool = Query(False, description="Prioritize safe evacuation facilities"),
) -> PlacesResponse:
    """Retrieve nearby geographic places with provenance distinction and multi-factor ranking.

    - Real-world external OpenStreetMap facilities are tagged OSM_MAPPED.

    - Official Salvus civil defense shelters are tagged SALVUS_VERIFIED.
    - Missing contact or operational details return null (no fabrication).
    - Ranked by life-safety emergency suitability and proximity.
    """
    target_lon = lon if lon is not None else lng
    if target_lon is None:
        raise HTTPException(
            status_code=422,
            detail={
                "success": False,
                "error": {
                    "code": "MISSING_COORDINATES",
                    "message": "Missing required longitude (provide 'lon' or 'lng' parameter)",
                },
            },
        )

    try:
        validate_coordinates(lat, target_lon)
    except ValueError as ve:
        raise HTTPException(
            status_code=422,
            detail={
                "success": False,
                "error": {
                    "code": "INVALID_COORDINATES",
                    "message": str(ve),
                },
            },
        ) from ve

    # Resolve radius (strict 10km ceiling)
    if radius_km is not None:
        effective_radius_m = min(10000, max(100, int(round(radius_km * 1000.0))))
        effective_radius_km = round(effective_radius_m / 1000.0, 2)
    elif radius is not None:
        effective_radius_m = min(10000, max(100, radius))
        effective_radius_km = round(effective_radius_m / 1000.0, 2)
    else:
        effective_radius_m = 10000
        effective_radius_km = 10.0

    cat_list = [c.strip() for c in categories.split(",") if c.strip()] if categories else None
    now_iso = datetime.now(UTC).isoformat()

    try:
        db = await get_database()
        places, is_cached, freshness, status = await places_service.get_nearby_places(
            lat=lat,
            lon=target_lon,
            radius=effective_radius_m,
            categories=cat_list,
            include_verified=include_verified,
            safe_places_priority=safe_places_only,
            db=db,
        )

        return PlacesResponse(
            success=True,
            status=status,
            freshness=freshness,
            data=places,
            count=len(places),
            searched_radius_km=effective_radius_km,
            radius_meters=effective_radius_m,
            query_center={"latitude": lat, "longitude": target_lon},
            cached=is_cached,
            fetched_at=now_iso,
        )
    except Exception:
        # Graceful degradation on unexpected provider failure so citizen UI never crashes
        return PlacesResponse(
            success=True,
            status="PROVIDER_UNAVAILABLE",
            freshness=PlaceFreshness.UNAVAILABLE,
            data=[],
            count=0,
            searched_radius_km=effective_radius_km,
            radius_meters=effective_radius_m,
            query_center={"latitude": lat, "longitude": target_lon},
            cached=False,
            fetched_at=now_iso,
        )


@router.get("/api/places/{place_id}/route", response_model=PlaceRouteResponse)
async def get_place_route_endpoint(
    place_id: str,
    origin_lat: float = Query(..., ge=-90.0, le=90.0, description="Origin citizen latitude"),
    origin_lon: float = Query(..., ge=-180.0, le=180.0, description="Origin citizen longitude"),
    profile: str = Query("walking", description="Transit mode profile (walking/driving)"),
    radius: int = Query(5000, description="Search radius in meters to locate the target place"),
) -> PlaceRouteResponse:
    """Calculate on-demand real-world route from origin GPS to a specific selected place."""
    validate_coordinates(origin_lat, origin_lon)
    db = await get_database()

    # 1. Handle direct Salvus-verified shelter ID lookup
    if place_id.startswith("salvus-shelter-"):
        shelter_raw_id = place_id.replace("salvus-shelter-", "")
        from app.services import shelter_service

        sh = await shelter_service.get_shelter_by_id(db, shelter_raw_id)
        if not sh:
            raise HTTPException(
                status_code=404,
                detail={
                    "success": False,
                    "error": {
                        "code": "SHELTER_NOT_FOUND",
                        "message": f"Verified shelter '{place_id}' not found.",
                    },
                },
            )

        dist_km = places_service.haversine_distance_km(
            origin_lat, origin_lon, sh.latitude, sh.longitude
        )
        dist_m = round(dist_km * 1000.0, 1)
        now_iso = datetime.now(UTC).isoformat()

        target_place = PlaceModel(
            id=place_id,
            source="Salvus Civil Defense",
            source_id=str(sh.id),
            provenance=PlaceProvenance.SALVUS_VERIFIED,
            category=PlaceCategory.SHELTER,
            name=sh.name,
            latitude=sh.latitude,
            longitude=sh.longitude,
            address=sh.address,
            distance_km=dist_km,
            distance_meters=dist_m,
            distance_formatted=places_service.format_distance(dist_m),
            fetched_at=now_iso,
            amenities=sh.amenities or [],
            opening_hours="24/7 Emergency Operation",
        )
        return await places_service.get_place_route(
            origin_lat=origin_lat,
            origin_lon=origin_lon,
            place=target_place,
            profile=profile,
        )

    # 2. Locate place via nearby search
    places, _, _, _ = await places_service.get_nearby_places(
        lat=origin_lat,
        lon=origin_lon,
        radius=radius,
        include_verified=True,
        db=db,
    )
    target_place = next((p for p in places if p.id == place_id), None)
    if not target_place:
        raise HTTPException(
            status_code=404,
            detail={
                "success": False,
                "error": {
                    "code": "PLACE_NOT_FOUND",
                    "message": f"Place '{place_id}' not found within nearby radius.",
                },
            },
        )

    return await places_service.get_place_route(
        origin_lat=origin_lat,
        origin_lon=origin_lon,
        place=target_place,
        profile=profile,
    )


@router.get("/api/places/reverse")
async def reverse_geocode_endpoint(
    lat: float = Query(..., ge=-90.0, le=90.0, description="Latitude to reverse geocode"),
    lon: float | None = Query(
        None, ge=-180.0, le=180.0, description="Longitude to reverse geocode"
    ),
    lng: float | None = Query(None, ge=-180.0, le=180.0, description="Longitude alias"),
) -> dict:
    """Reverse geocode coordinates into a human-readable area / neighborhood / city."""
    target_lon = lon if lon is not None else lng
    if target_lon is None:
        raise HTTPException(
            status_code=422,
            detail={
                "success": False,
                "error": {
                    "code": "MISSING_LONGITUDE",
                    "message": "Longitude query parameter ('lon' or 'lng') is required.",
                },
            },
        )
    return await places_service.reverse_geocode(lat=lat, lon=target_lon)
