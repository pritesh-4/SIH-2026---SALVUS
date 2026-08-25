"""Responder fleet REST API routes.

Endpoints:
    GET    /api/responders                     — List all active responders
    GET    /api/responders/candidates/{inc_id} — Get ranked candidates with explanations & routes
    GET    /api/responders/{id}                — Get single responder by ID
    PATCH  /api/responders/{id}/status         — Update responder status or assign incident
    POST   /api/responders/{id}/assign         — Atomically assign responder to incident
    POST   /api/responders/{id}/lifecycle      — Advance responder lifecycle journey
    POST   /api/responders/{id}/location       — Update real-time GPS telemetry
"""

from __future__ import annotations

from fastapi import APIRouter, HTTPException, Query

from app.db import get_database
from app.models import (
    CandidateEvaluationRequest,
    CandidateFilterRequest,
    CandidateGenerationResponse,
    ResponderAssignmentRequest,
    ResponderCandidateListResponse,
    ResponderLifecycleAdvanceRequest,
    ResponderListResponse,
    ResponderLocationUpdate,
    ResponderSingleResponse,
    ResponderStatusUpdate,
)
from app.realtime.socket_manager import (
    emit_assignment_created,
    emit_incident_status_changed,
    emit_responder_location_updated,
    emit_responder_status_changed,
)
from app.services import candidate_generation, responder_service
from app.services.allocation_engine import rank_and_explain_candidates

router = APIRouter(prefix="/api/responders", tags=["responders"])


@router.get("", response_model=ResponderListResponse)
async def get_responders():
    """List all disaster response units."""
    db = await get_database()
    responders = await responder_service.get_all_responders(db)
    return ResponderListResponse(data=responders, count=len(responders))


@router.get("/candidate-pool/{incident_id}", response_model=CandidateGenerationResponse)
async def get_candidate_pool(
    incident_id: str,
    required_capability: str | None = Query(
        None, description="Optional required capability override"
    ),
):
    """Retrieve filtered candidate pool separating eligible from excluded responders."""
    db = await get_database()
    result = await candidate_generation.get_candidate_pool_for_incident(
        db, incident_id, required_capability=required_capability
    )
    if not result:
        raise HTTPException(
            status_code=404,
            detail={
                "success": False,
                "error": {
                    "code": "INCIDENT_NOT_FOUND",
                    "message": f"No incident found with ID '{incident_id}'.",
                },
            },
        )
    return CandidateGenerationResponse(data=result)


@router.post("/candidate-pool/evaluate", response_model=CandidateGenerationResponse)
async def evaluate_candidate_pool(payload: CandidateFilterRequest):
    """Evaluate candidate eligibility for an incident payload without database coupling."""
    result = candidate_generation.generate_candidate_pool(
        incident=payload.incident,
        responders=payload.responders,
        required_capability=payload.required_capability,
    )
    return CandidateGenerationResponse(data=result)


@router.get("/candidates/{incident_id}", response_model=ResponderCandidateListResponse)
async def get_candidate_responders(
    incident_id: str,
    include_routes: bool = Query(
        True, description="Enrich top candidate units with live OSRM / corridor route geometry"
    ),
):
    """Retrieve ranked candidate responders for an active incident with deterministic scoring,

    mathematical factor breakdown, transparent justifications, and route vectors.
    """
    db = await get_database()
    candidates = await responder_service.get_candidate_responders_for_incident(
        db, incident_id, include_routes=include_routes
    )
    allocation_status = "RECOMMENDED" if candidates else "NO_AVAILABLE_RESPONDER"
    message = "No suitable response unit is currently available." if not candidates else None
    return ResponderCandidateListResponse(
        incident_id=incident_id,
        allocation_status=allocation_status,
        message=message,
        data=candidates,
        count=len(candidates),
    )


@router.post("/candidates/evaluate", response_model=ResponderCandidateListResponse)
async def evaluate_candidates(payload: CandidateEvaluationRequest):
    """Evaluate candidate responders from payload against an incident without database coupling."""
    candidates = rank_and_explain_candidates(payload.incident, payload.responders)
    allocation_status = "RECOMMENDED" if candidates else "NO_AVAILABLE_RESPONDER"
    message = "No suitable response unit is currently available." if not candidates else None
    return ResponderCandidateListResponse(
        incident_id=payload.incident.id,
        allocation_status=allocation_status,
        message=message,
        data=candidates,
        count=len(candidates),
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
    """Authoritatively and atomically dispatch and link a response unit to an active incident."""
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
    try:
        result = await responder_service.assign_responder_to_incident(
            db,
            responder_id=responder_id,
            incident_id=payload.incident_id,
            status=payload.status.value,
            actor=payload.actor,
        )
    except ValueError as e:
        raise HTTPException(
            status_code=400,
            detail={
                "success": False,
                "error": {
                    "code": "INVALID_ASSIGNMENT",
                    "message": str(e),
                },
            },
        ) from e

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

    # Broadcast real-time assignment, responder status, and incident status events
    try:
        await emit_assignment_created(updated_responder, updated_incident)
        await emit_responder_status_changed(updated_responder)
        await emit_incident_status_changed(updated_incident, updated_incident.status)
    except Exception:
        pass

    return ResponderSingleResponse(data=updated_responder)


@router.post("/{responder_id}/lifecycle", response_model=ResponderSingleResponse)
async def advance_lifecycle(responder_id: str, payload: ResponderLifecycleAdvanceRequest):
    """Advance responder through unified emergency journey (ASSIGNED -> EN_ROUTE -> RESOLVED)."""
    if payload.actor == "citizen":
        raise HTTPException(
            status_code=403,
            detail={
                "success": False,
                "error": {
                    "code": "FORBIDDEN",
                    "message": "Citizens cannot advance responder operational lifecycle.",
                },
            },
        )

    db = await get_database()
    try:
        result = await responder_service.advance_responder_lifecycle(
            db,
            responder_id=responder_id,
            target_status=payload.target_status.value,
            actor=payload.actor,
            notes=payload.notes,
        )
    except ValueError as e:
        raise HTTPException(
            status_code=400,
            detail={
                "success": False,
                "error": {
                    "code": "INVALID_TRANSITION",
                    "message": str(e),
                },
            },
        ) from e

    if not result:
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

    updated_responder, updated_incident = result

    # Broadcast real-time updates
    try:
        await emit_responder_status_changed(updated_responder)
        if updated_incident:
            await emit_incident_status_changed(updated_incident, updated_incident.status)
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
