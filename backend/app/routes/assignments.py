"""Assignment REST API routes with cryptographic authentication, RBAC, and ownership validation.

Endpoints:
    POST   /api/assignments                         — Create responder assignment (Authority)
    GET    /api/assignments                         — List all assignments with optional filters
    GET    /api/assignments/{id}                    — Get single assignment details
    PATCH  /api/assignments/{id}/status             — Transition status along lifecycle (RBAC)
    GET    /api/incidents/{incident_id}/assignments — Get all assignments for an incident
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query, status

from app.auth.dependencies import (
    get_current_user,
    get_optional_user,
    require_authority,
)
from app.auth.jwt_handler import AuthenticatedUser
from app.db import get_database
from app.models import (
    AssignmentCreate,
    AssignmentListResponse,
    AssignmentSingleResponse,
    AssignmentStatusUpdate,
)
from app.realtime.socket_manager import (
    emit_assignment_created,
    emit_assignment_status_changed,
    emit_incident_status_changed,
    emit_responder_status_changed,
)
from app.services import assignment_service, incident_service, responder_service

router = APIRouter(tags=["assignments"])


@router.post("/api/assignments", status_code=201, response_model=AssignmentSingleResponse)
async def create_assignment(
    payload: AssignmentCreate,
    user: AuthenticatedUser = Depends(require_authority),
):
    """Authoritatively dispatch and link a responder to an active incident (Authority only)."""
    # Derive verified assigner from authenticated token
    verified_payload = payload.model_copy()
    verified_payload.assigned_by = user.name

    db = await get_database()

    try:
        assignment = await assignment_service.create_assignment(db, verified_payload)
    except ValueError as e:
        err_msg = str(e)
        code = "INVALID_ASSIGNMENT"
        if "does not exist" in err_msg:
            code = "NOT_FOUND"
        elif "OFFLINE" in err_msg:
            code = "RESPONDER_OFFLINE"
        elif "Responder" in err_msg and "already has an active assignment" in err_msg:
            code = "RESPONDER_ALREADY_ASSIGNED"
        elif "Incident" in err_msg and "already has an active assignment" in err_msg:
            code = "INCIDENT_ALREADY_ASSIGNED"
        elif "terminal status" in err_msg:
            code = "TERMINAL_INCIDENT"

        raise HTTPException(
            status_code=400 if code != "NOT_FOUND" else 404,
            detail={
                "success": False,
                "error": {
                    "code": code,
                    "message": err_msg,
                },
            },
        ) from e

    # Broadcast real-time events
    try:
        responder = await responder_service.get_responder_by_id(db, assignment.responder_id)
        incident = await incident_service.get_incident_by_id(db, assignment.incident_id)

        await emit_assignment_created(assignment, responder=responder, incident=incident)
        if responder:
            await emit_responder_status_changed(responder)
        if incident:
            await emit_incident_status_changed(
                incident, incident.status, assignment=assignment, responder=responder
            )
    except Exception:
        pass

    return AssignmentSingleResponse(data=assignment)


@router.get("/api/assignments", response_model=AssignmentListResponse)
async def list_assignments(
    incident_id: str | None = Query(None, description="Filter by incident ID"),
    responder_id: str | None = Query(None, description="Filter by responder ID"),
    status_filter: str | None = Query(
        None, alias="status", description="Filter by assignment status"
    ),
    user: AuthenticatedUser | None = Depends(get_optional_user),
):
    """List responder assignments with optional filtering."""
    db = await get_database()
    assignments = await assignment_service.list_assignments(
        db, incident_id=incident_id, responder_id=responder_id, status=status_filter
    )
    return AssignmentListResponse(data=assignments, count=len(assignments))


@router.get("/api/assignments/{assignment_id}", response_model=AssignmentSingleResponse)
async def get_assignment(
    assignment_id: str,
    user: AuthenticatedUser | None = Depends(get_optional_user),
):
    """Get single assignment by its ID."""
    db = await get_database()
    assignment = await assignment_service.get_assignment_by_id(db, assignment_id)
    if not assignment:
        raise HTTPException(
            status_code=404,
            detail={
                "success": False,
                "error": {
                    "code": "ASSIGNMENT_NOT_FOUND",
                    "message": f"No assignment found with ID '{assignment_id}'.",
                },
            },
        )
    return AssignmentSingleResponse(data=assignment)


@router.get(
    "/api/incidents/{incident_id}/assignments",
    response_model=AssignmentListResponse,
)
async def get_incident_assignments(
    incident_id: str,
    user: AuthenticatedUser | None = Depends(get_optional_user),
):
    """Get all assignments associated with an incident."""
    db = await get_database()
    # Verify incident exists
    incident = await incident_service.get_incident_by_id(db, incident_id)
    if not incident:
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

    assignments = await assignment_service.get_assignments_for_incident(db, incident_id)
    return AssignmentListResponse(data=assignments, count=len(assignments))


@router.patch("/api/assignments/{assignment_id}/status", response_model=AssignmentSingleResponse)
async def update_assignment_status(
    assignment_id: str,
    payload: AssignmentStatusUpdate,
    user: AuthenticatedUser = Depends(get_current_user),
):
    """Advance an assignment through its controlled lifecycle with verified RBAC."""
    if user.is_citizen:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={
                "success": False,
                "error": {
                    "code": "FORBIDDEN",
                    "message": "Citizens cannot mutate responder assignment status.",
                },
            },
        )

    # If user is RESPONDER, verify they are assigned to this responder unit
    if user.is_responder and user.scoped_responder_id:
        db = await get_database()
        current = await assignment_service.get_assignment_by_id(db, assignment_id)
        if current and current.responder_id != user.scoped_responder_id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail={
                    "success": False,
                    "error": {
                        "code": "FORBIDDEN",
                        "message": (
                            "Responders can only update assignments assigned to their own unit."
                        ),
                    },
                },
            )

    db = await get_database()

    # Get current assignment state before transition for event metadata
    current = await assignment_service.get_assignment_by_id(db, assignment_id)
    if not current:
        raise HTTPException(
            status_code=404,
            detail={
                "success": False,
                "error": {
                    "code": "ASSIGNMENT_NOT_FOUND",
                    "message": f"No assignment found with ID '{assignment_id}'.",
                },
            },
        )

    try:
        updated = await assignment_service.update_assignment_status(
            db,
            assignment_id=assignment_id,
            target_status=payload.status.value,
            actor=user.name,
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

    if not updated:
        raise HTTPException(
            status_code=404,
            detail={
                "success": False,
                "error": {
                    "code": "ASSIGNMENT_NOT_FOUND",
                    "message": f"No assignment found with ID '{assignment_id}'.",
                },
            },
        )

    # Broadcast real-time events
    try:
        responder = await responder_service.get_responder_by_id(db, updated.responder_id)
        incident = await incident_service.get_incident_by_id(db, updated.incident_id)

        await emit_assignment_status_changed(
            updated,
            previous_status=current.status,
            responder=responder,
            incident=incident,
        )
        if responder:
            await emit_responder_status_changed(responder)
        if incident:
            await emit_incident_status_changed(
                incident, incident.status, assignment=updated, responder=responder
            )
    except Exception:
        pass

    return AssignmentSingleResponse(data=updated)
