"""Incident REST API routes with cryptographic authentication, RBAC, and data isolation.

Endpoints:
    POST   /api/incidents              — Create a new incident (Citizen / Public)
    GET    /api/incidents              — List incidents (Scoped by role)
    GET    /api/incidents/{id}         — Get single incident (Citizen isolation enforced)
    PATCH  /api/incidents/{id}/status  — Transition incident status (RBAC protected)
    POST   /api/incidents/dev/seed     — Seed demo incidents (Authority / Dev tool)
    POST   /api/incidents/dev/reset    — Reset demo database (Authority / Dev tool)
    GET    /api/incidents/{id}/candidate-pool — Get filtered candidate pool (Authority)
"""

from __future__ import annotations

import uuid

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query, Request, status

from app.auth.dependencies import (
    get_current_user,
    get_optional_user,
    require_authority,
)
from app.auth.jwt_handler import (
    AuthenticatedUser,
    UserRole,
    create_access_token,
)
from app.db import get_database
from app.models import (
    CandidateGenerationResponse,
    IncidentActiveLookupResponse,
    IncidentCreate,
    IncidentListResponse,
    IncidentResponse,
    IncidentSingleResponse,
    IncidentStatus,
    IncidentStatusUpdate,
)
from app.services import candidate_generation, incident_service
from app.services.async_triage_task import run_async_ai_triage

router = APIRouter(prefix="/api/incidents", tags=["incidents"])


def _sanitize_incident_pii(incident: IncidentResponse) -> IncidentResponse:
    """Sanitize private citizen medical/contact details for public/cross-citizen views."""
    sanitized = incident.model_copy(deep=True)
    sanitized.reporter_phone = None
    if sanitized.reporter_name and sanitized.reporter_name != "Anonymous":
        # Redact last names for privacy: e.g. "Rahul S."
        parts = sanitized.reporter_name.split()
        if len(parts) > 1:
            sanitized.reporter_name = f"{parts[0]} {parts[1][0]}."
    return sanitized


@router.post("", status_code=201, response_model=IncidentSingleResponse)
async def create_incident(
    payload: IncidentCreate,
    request: Request,
    background_tasks: BackgroundTasks,
    user: AuthenticatedUser | None = Depends(get_optional_user),
):
    """Create a new incident report or SOS beacon and issue scoped citizen access token."""
    db = await get_database()
    request_id = getattr(request.state, "request_id", "req-transient")
    idempotency_key = (
        request.headers.get("Idempotency-Key")
        or request.headers.get("X-Idempotency-Key")
        or payload.idempotency_key
    )

    # Derive authenticated citizen identity or mint new citizen ID
    reporter_id = user.user_id if user else f"cit-{uuid.uuid4().hex[:8]}"
    reporter_name = (
        payload.reporter_name
        if payload.reporter_name != "Anonymous"
        else (user.name if user else "Citizen User")
    )

    incident = await incident_service.create_incident(
        db, payload, reporter_id=reporter_id, idempotency_key=idempotency_key
    )

    # Issue scoped citizen token for this incident if caller is not already authority/system
    if not user or user.role == UserRole.CITIZEN:
        token = create_access_token(
            user_id=reporter_id,
            role=UserRole.CITIZEN,
            name=reporter_name,
            scoped_incident_id=incident.id,
        )
        incident.access_token = token

    # Emit immediate realtime incident.created event (critical-path non-blocking)
    try:
        from app.realtime.socket_manager import emit_incident_created

        await emit_incident_created(incident)
    except Exception:
        pass  # Socket emission is best-effort

    # Dispatch asynchronous background AI decision-support triage
    background_tasks.add_task(
        run_async_ai_triage,
        incident_id=incident.id,
        request_id=request_id,
    )

    return IncidentSingleResponse(data=incident)


@router.get("", response_model=IncidentListResponse)
async def list_incidents(
    user: AuthenticatedUser | None = Depends(get_optional_user),
):
    """List all incidents, enforcing citizen data isolation & PII protection."""
    db = await get_database()
    incidents = await incident_service.get_all_incidents(db)

    # If caller is AUTHORITY or SYSTEM: return full unredacted operational fleet view
    if user and user.is_authority:
        return IncidentListResponse(data=incidents, count=len(incidents))

    # If caller is CITIZEN:
    if user and user.is_citizen:
        # If citizen has a scoped incident, prioritize returning their own unredacted incident
        # and sanitize any other public incidents
        results: list[IncidentResponse] = []
        for inc in incidents:
            is_own = inc.id == user.scoped_incident_id or (
                inc.reporter_id and inc.reporter_id == user.user_id
            )
            if is_own:
                results.append(inc)
            else:
                results.append(_sanitize_incident_pii(inc))
        return IncidentListResponse(data=results, count=len(results))

    # Unauthenticated / public overview: sanitize PII across all incidents
    sanitized_incidents = [_sanitize_incident_pii(inc) for inc in incidents]
    return IncidentListResponse(data=sanitized_incidents, count=len(sanitized_incidents))


@router.get("/active", response_model=IncidentActiveLookupResponse)
async def get_active_incident(
    incident_id: str | None = Query(
        None, description="Optional specific incident ID hint to check"
    ),
    user: AuthenticatedUser | None = Depends(get_optional_user),
):
    """Retrieve the authoritative current active emergency incident for an authenticated citizen.

    If an active incident is found, returns the incident and assigned responder (if any).
    If the incident is terminal (RESOLVED/CANCELLED), returns is_terminal=True.
    If no active emergency exists, returns data=None.
    """
    db = await get_database()
    incident, responder, is_terminal = await incident_service.get_active_incident_for_user(
        db, user=user, incident_id=incident_id
    )
    return IncidentActiveLookupResponse(
        success=True,
        data=incident,
        responder=responder,
        is_terminal=is_terminal,
    )


@router.get("/{incident_id}/candidate-pool", response_model=CandidateGenerationResponse)
async def get_incident_candidate_pool(
    incident_id: str,
    required_capability: str | None = Query(
        None, description="Optional required capability override"
    ),
    user: AuthenticatedUser = Depends(require_authority),
):
    """Retrieve filtered candidate pool (eligible vs excluded) for an incident (Authority only)."""
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


@router.get("/{incident_id}", response_model=IncidentSingleResponse)
async def get_incident(
    incident_id: str,
    user: AuthenticatedUser | None = Depends(get_optional_user),
):
    """Get a single incident with full audit events, verifying ownership and access bounds."""
    db = await get_database()
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

    # Authority / System has full unredacted access
    if user and user.is_authority:
        return IncidentSingleResponse(data=incident)

    # Check citizen ownership
    is_owner = False
    if user and user.is_citizen:
        is_owner = incident.id == user.scoped_incident_id or (
            incident.reporter_id is not None and incident.reporter_id == user.user_id
        )
        if not is_owner:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail={
                    "success": False,
                    "error": {
                        "code": "FORBIDDEN",
                        "message": (
                            "Access denied. Citizens cannot access other citizens' "
                            "private incident records."
                        ),
                    },
                },
            )

        return IncidentSingleResponse(data=incident)

    # If unauthenticated, sanitize PII
    return IncidentSingleResponse(data=_sanitize_incident_pii(incident))


@router.patch("/{incident_id}/status", response_model=IncidentSingleResponse)
async def update_incident_status(
    incident_id: str,
    payload: IncidentStatusUpdate,
    user: AuthenticatedUser = Depends(get_current_user),
):
    """Transition an incident to a new lifecycle status with verified cryptographic RBAC."""
    target_status = payload.status.value

    # Determine actor from verified token — NEVER trust client-provided actor string!
    verified_actor = user.name

    # 1. Citizen RBAC rules: Citizens can ONLY cancel their own active incident
    if user.is_citizen:
        if payload.status != IncidentStatus.CANCELLED:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail={
                    "success": False,
                    "error": {
                        "code": "FORBIDDEN",
                        "message": (
                            "Only authorized emergency authorities may perform "
                            "triage, verification, dispatch, or resolution."
                        ),
                    },
                },
            )

        # Verify incident ownership
        db = await get_database()
        existing = await incident_service.get_incident_by_id(db, incident_id)
        if not existing:
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

        is_owner = (
            existing.id == user.scoped_incident_id
            or (existing.reporter_id is not None and existing.reporter_id == user.user_id)
            or (user.scoped_incident_id is None and existing.reporter_id is None)
        )
        if not is_owner:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail={
                    "success": False,
                    "error": {
                        "code": "FORBIDDEN",
                        "message": "Citizens can only cancel their own emergency reports.",
                    },
                },
            )

    # 2. Responder RBAC rules: Responders cannot verify triage or resolve whole incidents directly
    elif user.is_responder:
        if payload.status in (IncidentStatus.TRIAGE_PENDING, IncidentStatus.VERIFIED):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail={
                    "success": False,
                    "error": {
                        "code": "FORBIDDEN",
                        "message": "Responders cannot verify or modify incident triage.",
                    },
                },
            )

    db = await get_database()

    try:
        incident = await incident_service.update_incident_status(
            db, incident_id, target_status, actor=verified_actor
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

    # Emit realtime event (best-effort)
    try:
        from app.realtime.socket_manager import emit_incident_status_changed

        await emit_incident_status_changed(incident, target_status)
    except Exception:
        pass

    return IncidentSingleResponse(data=incident)


@router.post("/dev/seed", response_model=IncidentListResponse)
async def seed_dev_incidents(
    user: AuthenticatedUser = Depends(require_authority),
):
    """Developer helper: Seed standard demo incidents and broadcast (Authority only)."""
    db = await get_database()
    from app.db.seed import seed_database

    await seed_database(db)
    incidents = await incident_service.get_all_incidents(db)

    # Broadcast to authority clients
    try:
        from app.realtime.socket_manager import emit_incident_created

        for inc in incidents[:2]:
            await emit_incident_created(inc)
    except Exception:
        pass

    return IncidentListResponse(data=incidents, count=len(incidents))


@router.post("/dev/reset", response_model=IncidentListResponse)
async def reset_dev_database(
    user: AuthenticatedUser = Depends(require_authority),
):
    """Developer helper: Reset database incidents to initial demo state (Authority only)."""
    db = await get_database()
    await incident_service.reset_demo_database(db)
    incidents = await incident_service.get_all_incidents(db)
    return IncidentListResponse(data=incidents, count=len(incidents))
