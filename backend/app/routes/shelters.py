"""Shelter logistics REST API routes.

Endpoints:
    GET    /api/shelters          — List all shelters
    GET    /api/shelters/{id}     — Get single shelter by ID
    PATCH  /api/shelters/{id}     — Update shelter occupancy or status
"""

from __future__ import annotations

from fastapi import APIRouter, HTTPException

from app.db import get_database
from app.models import (
    ShelterListResponse,
    ShelterSingleResponse,
    ShelterUpdate,
)
from app.services import shelter_service

router = APIRouter(prefix="/api/shelters", tags=["shelters"])


@router.get("", response_model=ShelterListResponse)
async def list_shelters():
    """List all registered evacuation shelters and available capacities."""
    db = await get_database()
    shelters = await shelter_service.get_all_shelters(db)
    return ShelterListResponse(data=shelters, count=len(shelters))


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
async def update_shelter(shelter_id: str, payload: ShelterUpdate):
    """Update shelter bed availability or supplies status."""
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
    return ShelterSingleResponse(data=shelter)
