"""Responder fleet REST API routes.

Endpoints:
    GET    /api/responders              — List all active responders
    GET    /api/responders/{id}         — Get single responder by ID
    PATCH  /api/responders/{id}/status  — Update responder status or assign incident
    POST   /api/responders/{id}/location— Update real-time GPS telemetry
"""

from __future__ import annotations

from fastapi import APIRouter, HTTPException

from app.db import get_database
from app.models import (
    ResponderListResponse,
    ResponderLocationUpdate,
    ResponderSingleResponse,
    ResponderStatusUpdate,
)
from app.services import responder_service

router = APIRouter(prefix="/api/responders", tags=["responders"])


@router.get("", response_model=ResponderListResponse)
async def list_responders():
    """List all disaster response units."""
    db = await get_database()
    responders = await responder_service.get_all_responders(db)
    return ResponderListResponse(data=responders, count=len(responders))


@router.get("/{responder_id}", response_model=ResponderSingleResponse)
async def get_responder(responder_id: str):
    """Get single responder details."""
    db = await get_database()
    resp = await responder_service.get_responder_by_id(db, responder_id)
    if not resp:
        raise HTTPException(
            status_code=404,
            detail={
                "success": False,
                "error": {
                    "code": "RESPONDER_NOT_FOUND",
                    "message": f"No responder found with ID '{responder_id}'.",
                },
            },
        )
    return ResponderSingleResponse(data=resp)


@router.patch("/{responder_id}/status", response_model=ResponderSingleResponse)
async def update_responder_status(responder_id: str, payload: ResponderStatusUpdate):
    """Update responder operational status or assign to incident."""
    db = await get_database()
    resp = await responder_service.update_responder_status(
        db,
        responder_id,
        status=payload.status.value if payload.status else None,
        assigned_incident_id=payload.assigned_incident_id,
    )
    if not resp:
        raise HTTPException(
            status_code=404,
            detail={
                "success": False,
                "error": {
                    "code": "RESPONDER_NOT_FOUND",
                    "message": f"No responder found with ID '{responder_id}'.",
                },
            },
        )

    # Broadcast real-time responder update
    try:
        from app.realtime.socket_manager import sio

        await sio.emit("responder:status_changed", resp.model_dump(), room="authorities")
        if resp.assigned_incident_id:
            await sio.emit(
                "responder:status_changed",
                resp.model_dump(),
                room=f"incident:{resp.assigned_incident_id}",
            )
    except Exception:
        pass

    return ResponderSingleResponse(data=resp)


@router.post("/{responder_id}/location", response_model=ResponderSingleResponse)
async def update_responder_location(responder_id: str, payload: ResponderLocationUpdate):
    """Update GPS coordinates for an active responder craft."""
    db = await get_database()
    resp = await responder_service.update_responder_location(
        db, responder_id, payload.latitude, payload.longitude
    )
    if not resp:
        raise HTTPException(
            status_code=404,
            detail={
                "success": False,
                "error": {
                    "code": "RESPONDER_NOT_FOUND",
                    "message": f"No responder found with ID '{responder_id}'.",
                },
            },
        )

    # Broadcast position update to map listeners
    try:
        from app.realtime.socket_manager import sio

        await sio.emit("responder:location_updated", resp.model_dump(), room="authorities")
        if resp.assigned_incident_id:
            await sio.emit(
                "responder:location_updated",
                resp.model_dump(),
                room=f"incident:{resp.assigned_incident_id}",
            )
    except Exception:
        pass

    return ResponderSingleResponse(data=resp)
