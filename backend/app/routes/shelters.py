"""Shelter logistics REST API routes with cryptographic RBAC.

Endpoints:
    GET    /api/shelters                 — List all shelters (Public/Citizen)
    GET    /api/shelters/recommendations — Recommended shelters for a location (Public)
    GET    /api/shelters/{id}            — Get single shelter by ID
    PATCH  /api/shelters/{id}            — Update occupancy or status (Authority only)
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query

from app.auth.dependencies import require_authority
from app.auth.jwt_handler import AuthenticatedUser
from app.db import get_database
from app.models import (
    ShelterListResponse,
    ShelterRecommendationListResponse,
    ShelterSingleResponse,
    ShelterUpdate,
)
from app.realtime.socket_manager import emit_shelter_updated
from app.services import shelter_service

router = APIRouter(prefix="/api/shelters", tags=["shelters"])


@router.get("", response_model=ShelterListResponse)
async def list_shelters():
    """List all registered evacuation shelters and available capacities."""
    db = await get_database()
    shelters = await shelter_service.get_all_shelters(db)
    return ShelterListResponse(data=shelters, count=len(shelters))


@router.get("/recommendations", response_model=ShelterRecommendationListResponse)
async def get_recommended_shelters(
    lat: float = Query(..., ge=-90, le=90, description="Latitude of user/incident"),
    lon: float = Query(..., ge=-180, le=180, description="Longitude of user/incident"),
    amenity: list[str] | None = Query(default=None, description="Optional required amenities"),
    max_radius_km: float = Query(default=25.0, ge=0.1, le=200.0, description="Search radius in km"),
    demo: bool = Query(
        default=False, description="Enable demo mode to include global demo shelters"
    ),
    include_mapped: bool = Query(
        default=True, description="Include OSM mapped community facilities"
    ),
):
    """Retrieve ranked candidate safe evacuation shelters for an incident or citizen."""
    db = await get_database()
    recommendations = await shelter_service.get_recommended_shelters(
        db,
        latitude=lat,
        longitude=lon,
        required_amenities=amenity,
        max_radius_km=max_radius_km,
        demo_mode=demo,
        include_mapped=include_mapped,
    )
    return ShelterRecommendationListResponse(data=recommendations, count=len(recommendations))


@router.get("/{shelter_id}", response_model=ShelterSingleResponse)
async def get_shelter(shelter_id: str):
    """Get single shelter details."""
    db = await get_database()
    shelter = await shelter_service.get_shelter_by_id(db, shelter_id)
    if not shelter:
        raise HTTPException(
            status_code=404,
            detail={
                "success": False,
                "error": {
                    "code": "SHELTER_NOT_FOUND",
                    "message": f"No shelter found with ID '{shelter_id}'.",
                },
            },
        )
    return ShelterSingleResponse(data=shelter)


@router.patch("/{shelter_id}", response_model=ShelterSingleResponse)
async def update_shelter(
    shelter_id: str,
    payload: ShelterUpdate,
    user: AuthenticatedUser = Depends(require_authority),
):
    """Update shelter bed availability or supplies status (Authority only)."""
    db = await get_database()
    shelter = await shelter_service.update_shelter_occupancy(
        db,
        shelter_id,
        available_beds=payload.available_beds,
        status=payload.status.value if payload.status else None,
        supplies_status=payload.supplies_status,
    )
    if not shelter:
        raise HTTPException(
            status_code=404,
            detail={
                "success": False,
                "error": {
                    "code": "SHELTER_NOT_FOUND",
                    "message": f"No shelter found with ID '{shelter_id}'.",
                },
            },
        )

    # Broadcast real-time shelter update
    try:
        await emit_shelter_updated(shelter)
    except Exception:
        pass

    return ShelterSingleResponse(data=shelter)
