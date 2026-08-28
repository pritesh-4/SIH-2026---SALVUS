"""Places REST API routes (Phase 1: Real-World Places Intelligence).

Provides endpoints for querying real-world geographic context (hospitals,
clinics, pharmacies, police stations, fire stations, emergency facilities,
and emergency shelters) around citizen GPS coordinates with strict provenance separation.

Endpoints:
    GET  /api/places/nearby — Query real-world geographic places
    GET  /api/places        — Architectural alias endpoint
"""

from __future__ import annotations

import math
from datetime import UTC, datetime

from fastapi import APIRouter, HTTPException, Query

from app.db import get_database
from app.models import (
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
) -> PlacesResponse:
    """Retrieve nearby geographic places with strict provenance distinction.

    - Real-world external OpenStreetMap facilities are tagged OSM_MAPPED.
    - Official Salvus civil defense shelters are tagged SALVUS_VERIFIED.
    - If the provider does not provide contact details, fields return null (no fabrication).
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

    # Resolve radius
    if radius_km is not None:
        effective_radius_m = int(round(radius_km * 1000.0))
        effective_radius_km = round(radius_km, 2)
    elif radius is not None:
        effective_radius_m = max(100, min(10000, radius))
        effective_radius_km = round(effective_radius_m / 1000.0, 2)
    else:
        effective_radius_m = 2000
        effective_radius_km = 2.0

    cat_list = [c.strip() for c in categories.split(",") if c.strip()] if categories else None

    now_iso = datetime.now(UTC).isoformat()

    try:
        db = await get_database()
        places, is_cached = await places_service.get_nearby_places(
            lat=lat,
            lon=target_lon,
            radius=effective_radius_m,
            categories=cat_list,
            include_verified=include_verified,
            db=db,
        )

        return PlacesResponse(
            success=True,
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
            data=[],
            count=0,
            searched_radius_km=effective_radius_km,
            radius_meters=effective_radius_m,
            query_center={"latitude": lat, "longitude": target_lon},
            cached=False,
            fetched_at=now_iso,
        )
