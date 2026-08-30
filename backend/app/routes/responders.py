"""Responder fleet REST API routes with cryptographic RBAC and telemetry authorization.

Endpoints:
    GET    /api/responders                     — List all active responders
    GET    /api/responders/candidates/{inc_id} — Ranked candidates with routes (Authority)
    GET    /api/responders/{id}                — Get single responder by ID
    PATCH  /api/responders/{id}/status         — Update status or assign incident (RBAC)
    POST   /api/responders/{id}/assign         — Atomically assign responder (Authority)
    POST   /api/responders/{id}/lifecycle      — Advance responder journey (RBAC)
    POST   /api/responders/{id}/location       — Update GPS telemetry (Responder/Authority)
"""

import uuid
from datetime import UTC, datetime

from fastapi import APIRouter, Depends, HTTPException, Query, status

from app.auth.dependencies import (
    get_current_user,
    get_optional_user,
    require_authority,
)
from app.auth.jwt_handler import AuthenticatedUser
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
    ResponderReassignRequest,
    ResponderSingleResponse,
    ResponderStatusUpdate,
)
from app.realtime.socket_manager import (
    emit_assignment_created,
    emit_assignment_reassigned,
    emit_assignment_status_changed,
    emit_incident_status_changed,
    emit_responder_location_updated,
    emit_responder_status_changed,
)
from app.services import (
    assignment_service,
    candidate_generation,
    incident_service,
    responder_service,
)
from app.services.allocation_engine import rank_and_explain_candidates
from app.services.routing_service import haversine_distance_km

router = APIRouter(prefix="/api/responders", tags=["responders"])


@router.get("", response_model=ResponderListResponse)
async def get_responders(
    user: AuthenticatedUser | None = Depends(get_optional_user),
):
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
    user: AuthenticatedUser = Depends(require_authority),
):
    """Retrieve filtered candidate pool for an incident (Authority only)."""
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
async def evaluate_candidate_pool(
    payload: CandidateFilterRequest,
    user: AuthenticatedUser = Depends(require_authority),
):
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
    user: AuthenticatedUser = Depends(require_authority),
):
    """Retrieve ranked candidate responders for an active incident (Authority only)."""
    db = await get_database()
    candidates = await responder_service.get_candidate_responders_for_incident(
        db, incident_id, include_routes=include_routes
    )

    allocation_status = "RECOMMENDED" if candidates else "NO_AVAILABLE_RESPONDER"
    message = "No suitable response unit is currently available." if not candidates else None

    # Dynamic shift detection
    now_iso = datetime.now(UTC).isoformat()
    calc_id = str(uuid.uuid4())

    cursor = await db.execute(
        """
        SELECT id, responder_id, status FROM assignments
        WHERE incident_id = ?
          AND status IN ('PROPOSED', 'ASSIGNED', 'EN_ROUTE', 'NEARBY', 'ON_SCENE')
        LIMIT 1
        """,
        (incident_id,),
    )
    active_assign = await cursor.fetchone()
    assigned_resp_id = active_assign["responder_id"] if active_assign else None

    is_recommendation_changed = False
    change_reason = None
    assigned_eta = None

    if assigned_resp_id:
        assigned_resp = await responder_service.get_responder_by_id(db, assigned_resp_id)
        if assigned_resp and candidates:
            top_cand = candidates[0]
            if top_cand.id != assigned_resp_id:
                inc = await incident_service.get_incident_by_id(db, incident_id)
                if inc:
                    dist_km = haversine_distance_km(
                        assigned_resp.latitude,
                        assigned_resp.longitude,
                        inc.latitude,
                        inc.longitude,
                    )
                    speed_kmh = 30.0 if assigned_resp.capability == "FLOOD_BOAT" else 40.0
                    assigned_eta = round((dist_km / max(1.0, speed_kmh)) * 60.0, 1)

                    if (assigned_eta - top_cand.eta_minutes) >= 2.0:
                        is_recommendation_changed = True
                        diff_min = max(1, round(assigned_eta - top_cand.eta_minutes))
                        change_reason = (
                            f"Recommendation updated: {top_cand.unit_name} is now {diff_min} min "
                            f"faster (~{top_cand.eta_formatted}) and qualified for this incident."
                        )
                    elif assigned_resp.status == "OFFLINE":
                        is_recommendation_changed = True
                        change_reason = (
                            f"Assigned unit {assigned_resp.unit_name} went OFFLINE. "
                            f"{top_cand.unit_name} is now recommended."
                        )

    return ResponderCandidateListResponse(
        incident_id=incident_id,
        allocation_status=allocation_status,
        message=message,
        data=candidates,
        count=len(candidates),
        calculation_id=calc_id,
        calculated_at=now_iso,
        is_recommendation_changed=is_recommendation_changed,
        change_reason=change_reason,
        assigned_responder_id=assigned_resp_id,
        current_assignment_eta_minutes=assigned_eta,
    )


@router.post("/candidates/evaluate", response_model=ResponderCandidateListResponse)
async def evaluate_candidates(
    payload: CandidateEvaluationRequest,
    user: AuthenticatedUser = Depends(require_authority),
):
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
async def get_responder(
    responder_id: str,
    user: AuthenticatedUser | None = Depends(get_optional_user),
):
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
async def update_responder_status(
    responder_id: str,
    payload: ResponderStatusUpdate,
    user: AuthenticatedUser = Depends(get_current_user),
):
    """Update responder operational status or assign to incident with verified RBAC."""
    if user.is_citizen:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={
                "success": False,
                "error": {
                    "code": "FORBIDDEN",
                    "message": "Citizens cannot mutate responder operational status.",
                },
            },
        )

    if user.is_responder and user.scoped_responder_id and user.scoped_responder_id != responder_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={
                "success": False,
                "error": {
                    "code": "FORBIDDEN",
                    "message": "Responders can only mutate their own unit status.",
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
async def assign_responder(
    responder_id: str,
    payload: ResponderAssignmentRequest,
    user: AuthenticatedUser = Depends(require_authority),
):
    """Authoritatively dispatch and link a response unit to an incident (Authority only)."""
    db = await get_database()

    try:
        result = await responder_service.assign_responder_to_incident(
            db,
            responder_id=responder_id,
            incident_id=payload.incident_id,
            status=payload.status.value,
            actor=user.name,
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
        await emit_incident_status_changed(
            updated_incident, updated_incident.status, responder=updated_responder
        )
    except Exception:
        pass

    return ResponderSingleResponse(data=updated_responder)


@router.post("/{responder_id}/reassign", response_model=ResponderSingleResponse)
async def reassign_responder(
    responder_id: str,
    payload: ResponderReassignRequest,
    user: AuthenticatedUser = Depends(require_authority),
):
    """Authoritatively and dynamically reassign an active incident to a new responder unit."""
    db = await get_database()

    try:
        result = await responder_service.reassign_responder_to_incident(
            db,
            new_responder_id=responder_id,
            incident_id=payload.incident_id,
            reason=payload.reason or "Dynamic recommendation reassignment",
            actor=user.name,
        )
    except ValueError as e:
        raise HTTPException(
            status_code=400,
            detail={
                "success": False,
                "error": {
                    "code": "INVALID_REASSIGNMENT",
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
                    "code": "REASSIGNMENT_FAILED",
                    "message": (
                        f"Failed to reassign responder '{responder_id}' to "
                        f"incident '{payload.incident_id}'. Verify IDs exist."
                    ),
                },
            },
        )

    updated_new_responder, updated_incident, previous_responder = result

    # Broadcast real-time reassignment, responder status, and incident status events
    try:
        await emit_assignment_reassigned(
            new_responder=updated_new_responder,
            incident=updated_incident,
            previous_responder=previous_responder,
            reassignment_reason=payload.reason,
        )
        await emit_responder_status_changed(updated_new_responder)
        if previous_responder:
            await emit_responder_status_changed(previous_responder)
        await emit_incident_status_changed(
            updated_incident, updated_incident.status, responder=updated_new_responder
        )
    except Exception:
        pass

    return ResponderSingleResponse(data=updated_new_responder)


@router.post("/{responder_id}/lifecycle", response_model=ResponderSingleResponse)
async def advance_lifecycle(
    responder_id: str,
    payload: ResponderLifecycleAdvanceRequest,
    user: AuthenticatedUser = Depends(get_current_user),
):
    """Advance responder through unified emergency journey (ASSIGNED -> EN_ROUTE -> RESOLVED)."""
    if user.is_citizen:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={
                "success": False,
                "error": {
                    "code": "FORBIDDEN",
                    "message": "Citizens cannot advance responder operational lifecycle.",
                },
            },
        )

    if user.is_responder and user.scoped_responder_id and user.scoped_responder_id != responder_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={
                "success": False,
                "error": {
                    "code": "FORBIDDEN",
                    "message": "Responders can only advance their own mission lifecycle.",
                },
            },
        )

    db = await get_database()
    try:
        result = await responder_service.advance_responder_lifecycle(
            db,
            responder_id=responder_id,
            target_status=payload.target_status.value,
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
        active_assignment = None
        if updated_incident:
            active_assignment = await assignment_service.get_active_assignment_for_incident(
                db, updated_incident.id
            )
            if active_assignment:
                await emit_assignment_status_changed(
                    active_assignment,
                    responder=updated_responder,
                    incident=updated_incident,
                )
            await emit_incident_status_changed(
                updated_incident,
                updated_incident.status,
                assignment=active_assignment,
                responder=updated_responder,
            )
    except Exception:
        pass

    return ResponderSingleResponse(data=updated_responder)


@router.post("/{responder_id}/location", response_model=ResponderSingleResponse)
async def update_responder_location(
    responder_id: str,
    payload: ResponderLocationUpdate,
    user: AuthenticatedUser = Depends(get_current_user),
):
    """Update GPS coordinates for an active responder craft (Responder/Authority/System)."""
    if user.is_citizen:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={
                "success": False,
                "error": {
                    "code": "FORBIDDEN",
                    "message": (
                        "Unauthorized GPS telemetry source. Citizens cannot send fleet telemetry."
                    ),
                },
            },
        )

    if user.is_responder and user.scoped_responder_id and user.scoped_responder_id != responder_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={
                "success": False,
                "error": {
                    "code": "FORBIDDEN",
                    "message": "Responders can only publish telemetry for their own unit.",
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
