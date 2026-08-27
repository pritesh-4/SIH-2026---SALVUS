"""Places REST API routes.

Provides endpoints for querying real-world geographic context (hospitals,
pharmacies, clinics, police, fire stations) around citizen device coordinates.

Endpoints:
    GET  /api/places/nearby — Query real-world geographic places with strict provenance separation
    GET  /api/places        — Architecture-consistent query alias
"""

from __future__ import annotations

import math

from fastapi import APIRouter, HTTPException, Query

from app.models import (
    PlaceCategory,
    PlaceModel,
    PlaceProvenance,
    PlacesResponse,
)
from app.services import places_service, shelter_service

router = APIRouter(tags=["places"])


def validate_single_coordinate(lat: float, lon: float) -> None:
    """Validate latitude and longitude ranges."""
    if math.isnan(lat) or lat < -90.0 or lat > 90.0:
        raise ValueError(f"Invalid latitude={lat}; must be within [-90, 90]")
    if math.isnan(lon) or lon < -180.0 or lon > 180.0:
        raise ValueError(f"Invalid longitude={lon}; must be within [-180, 180]")


@router.get("/api/places/nearby", response_model=PlacesResponse)
@router.get("/api/places", response_model=PlacesResponse)
async def get_nearby_places_endpoint(
    lat: float = Query(..., description="Citizen latitude (-90 to 90)"),
    lng: float | None = Query(None, description="Citizen longitude (-180 to 180)"),
    lon: float | None = Query(None, description="Citizen longitude alias (-180 to 180)"),
    radius: int = Query(2000, description="Query radius in meters (300 to 5000)"),
    categories: str | None = Query(None, description="Comma-separated category filters"),
    include_verified: bool = Query(True, description="Include official Salvus-verified shelters"),
) -> PlacesResponse:
    """Retrieve nearby geographic places with strict provenance distinction.

    - OpenStreetMap places are classified as OSM_MAPPED.
    - Official Salvus civil defense shelters are classified as SALVUS_VERIFIED.
    """
    target_lon = lng if lng is not None else lon
    if target_lon is None:
        raise HTTPException(
            status_code=422,
            detail={
                "success": False,
                "error": {
                    "code": "MISSING_COORDINATES",
                    "message": "Missing required longitude (provide 'lng' or 'lon' parameter)",
                },
            },
        )

    try:
        validate_single_coordinate(lat, target_lon)
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

    cat_list = (
        [c.strip().lower() for c in categories.split(",") if c.strip()] if categories else None
    )

    try:
        osm_places, is_cached = await places_service.get_nearby_places(
            lat=lat,
            lon=target_lon,
            radius=radius,
            categories=cat_list,
        )

        all_places: list[PlaceModel] = list(osm_places)

        # Merge official Salvus-verified shelters if requested and not filtered out
        if include_verified and (
            not cat_list or any(c in ("shelter", "shelters", "all") for c in cat_list)
        ):
            try:
                verified_shelters = await shelter_service.get_all_shelters()
                now_iso = osm_places[0].fetched_at if osm_places else "2026-08-27T18:00:00Z"
                for sh in verified_shelters:
                    if sh.latitude is not None and sh.longitude is not None:
                        dist_km = places_service.haversine_distance_km(
                            lat, target_lon, sh.latitude, sh.longitude
                        )
                        dist_m = round(dist_km * 1000, 1)
                        if dist_m <= radius:
                            all_places.append(
                                PlaceModel(
                                    id=f"salvus-shelter-{sh.id}",
                                    name=sh.name,
                                    category=PlaceCategory.SHELTER,
                                    latitude=sh.latitude,
                                    longitude=sh.longitude,
                                    address=sh.address,
                                    distance_meters=dist_m,
                                    distance_formatted=places_service.format_distance(dist_m),
                                    source="SALVUS_CIVIL_DEFENSE",
                                    provenance=PlaceProvenance.SALVUS_VERIFIED,
                                    amenities=sh.amenities
                                    or ["Designated Refuge", "Emergency Supplies"],
                                    phone=sh.contact_phone,
                                    opening_hours="24/7 Emergency Operation",
                                    fetched_at=now_iso,
                                )
                            )
            except Exception:
                # If database fetch fails, keep OSM places without disruption
                pass

        # Sort combined places by proximity
        all_places.sort(key=lambda p: p.distance_meters)

        return PlacesResponse(
            success=True,
            data=all_places,
            count=len(all_places),
            query_center={"latitude": lat, "longitude": target_lon},
            radius_meters=radius,
            cached=is_cached,
        )
    except Exception:
        # Graceful degradation if external provider fails
        return PlacesResponse(
            success=True,
            data=[],
            count=0,
            query_center={"latitude": lat, "longitude": target_lon},
            radius_meters=radius,
            cached=False,
        )
