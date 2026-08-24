"""Responder fleet REST API routes.

Endpoints:
    GET    /api/responders                     — List all active responders
    GET    /api/responders/candidates/{inc_id} — Get ranked candidates for incident
    GET    /api/responders/{id}                — Get single responder by ID
    PATCH  /api/responders/{id}/status         — Update responder status or assign incident
    POST   /api/responders/{id}/assign         — Assign responder to incident
    POST   /api/responders/{id}/location       — Update real-time GPS telemetry
"""

from __future__ import annotations

from fastapi import APIRouter, HTTPException

from app.db import get_database
from app.models import (
    ResponderAssignmentRequest,
    ResponderCandidateListResponse,
    ResponderListResponse,
    ResponderLocationUpdate,
    ResponderSingleResponse,
    ResponderStatusUpdate,
)
from app.realtime.socket_manager import (
    emit_assignment_created,
    emit_responder_location_updated,
    emit_responder_status_changed,
)
from app.services import responder_service

router = APIRouter(prefix="/api/responders", tags=["responders"])


@router.get("", response_model=ResponderListResponse)
async def list_responders():
    """List all disaster response units."""
    db = await get_database()
    responders = await responder_service.get_all_responders(db)
    return ResponderListResponse(data=responders, count=len(responders))


@router.get("/candidates/{incident_id}", response_model=ResponderCandidateListResponse)
async def get_candidate_responders(incident_id: str):
    """Retrieve ranked candidate responders for an active emergency incident."""
    db = await get_database()
    candidates = await responder_service.get_candidate_responders_for_incident(db, incident_id)
    return ResponderCandidateListResponse(
        incident_id=incident_id, data=candidates, count=len(candidates)
    )


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
    if payload.actor == "citizen":
        raise HTTPException(
            status_code=403,
            detail={
                "success": False,
                "error": {
                    "code": "FORBIDDEN",
                    "message": "Citizens cannot mutate responder operational status.",
                },
            },
        )

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
        await emit_responder_status_changed(resp)
    except Exception:
        pass

    return ResponderSingleResponse(data=resp)


@router.post("/{responder_id}/assign", response_model=ResponderSingleResponse)
async def assign_responder(responder_id: str, payload: ResponderAssignmentRequest):
    """Authoritatively dispatch and link a response unit to an active incident."""
    if payload.actor == "citizen":
        raise HTTPException(
            status_code=403,
            detail={
                "success": False,
                "error": {
                    "code": "FORBIDDEN",
                    "message": "Only authorized dispatchers can assign emergency response units.",
                },
            },
        )

    db = await get_database()
    result = await responder_service.assign_responder_to_incident(
        db,
        responder_id=responder_id,
        incident_id=payload.incident_id,
        status=payload.status.value,
        actor=payload.actor,
    )

    if not result:
        raise HTTPException(
            status_code=404,
            detail={
                "success": False,
                "error": {
                    "code": "ASSIGNMENT_FAILED",
                    "message": (
                        f"Failed to assign responder '{responder_id}' to "
                        f"incident '{payload.incident_id}'. Verify IDs exist."
                    ),
                },
            },
        )

    updated_responder, updated_incident = result

    # Broadcast real-time assignment and status events
    try:
        await emit_assignment_created(updated_responder, updated_incident)
        await emit_responder_status_changed(updated_responder)
    except Exception:
        pass

    return ResponderSingleResponse(data=updated_responder)


@router.post("/{responder_id}/location", response_model=ResponderSingleResponse)
async def update_responder_location(responder_id: str, payload: ResponderLocationUpdate):
    """Update GPS coordinates for an active responder craft."""
    if payload.actor == "citizen":
        raise HTTPException(
            status_code=403,
            detail={
                "success": False,
                "error": {
                    "code": "FORBIDDEN",
                    "message": "Unauthorized GPS telemetry source.",
                },
            },
        )

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
        await emit_responder_location_updated(resp)
    except Exception:
        pass

    return ResponderSingleResponse(data=resp)

