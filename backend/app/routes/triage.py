"""AI Incident Triage & Human Verification REST API routes with cryptographic RBAC.

Endpoints:
    POST  /api/triage/analyze/{id} — Trigger AI triage assessment (Authority/System)
    POST  /api/triage/verify/{id}  — Verify and accept triage assessment (Authority)
    POST  /api/triage/adjust/{id}  — Override triage attributes & verify (Authority)
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException

from app.auth.dependencies import require_authority
from app.auth.jwt_handler import AuthenticatedUser
from app.db import get_database
from app.models import (
    AITriageSingleResponse,
    IncidentSingleResponse,
    TriageVerificationRequest,
)
from app.services import incident_service

router = APIRouter(prefix="/api/triage", tags=["ai_triage"])


@router.post("/analyze/{incident_id}", response_model=AITriageSingleResponse)
async def analyze_incident_triage(
    incident_id: str,
    user: AuthenticatedUser = Depends(require_authority),
):
    """Trigger AI triage assessment and calculate priority/signals (Authority/System only)."""
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

    from app.realtime.socket_manager import emit_incident_triage_updated
    from app.services.ai.service import ai_service

    # Perform AI Triage
    assessment, new_hash = await ai_service.triage(
        incident_dict={
            "type": incident.type,
            "severity": incident.severity,
            "description": incident.description,
            "affected_count": incident.affected_count,
            "is_sos": incident.is_sos,
            "latitude": incident.latitude,
            "longitude": incident.longitude,
            "image_data": getattr(incident, "image_data", None),
        },
        incident_id=incident_id,
    )

    # Persist in DB audit trail and update ai_state
    await incident_service.save_ai_triage_assessment(db, incident_id, assessment)
    await db.execute(
        "UPDATE incidents SET ai_state = 'AVAILABLE', triage_hash = ? WHERE id = ?",
        (new_hash, incident_id),
    )
    await db.commit()

    # Broadcast realtime event
    try:
        await emit_incident_triage_updated(
            incident_id=incident_id,
            assessment=assessment,
            ai_state="AVAILABLE",
            ticket_id=incident.ticket_id,
        )
    except Exception:
        pass

    return AITriageSingleResponse(data=assessment)


@router.post("/verify/{incident_id}", response_model=IncidentSingleResponse)
async def verify_incident_triage(
    incident_id: str,
    payload: TriageVerificationRequest,
    user: AuthenticatedUser = Depends(require_authority),
):
    """Operator approves AI triage assessment and transitions to VERIFIED (Authority only)."""
    # Derive verified actor from authenticated token
    verified_payload = payload.model_copy()
    verified_payload.actor = user.name

    db = await get_database()
    try:
        updated_incident = await incident_service.verify_incident_triage(
            db, incident_id, verified_payload
        )
    except ValueError as e:
        raise HTTPException(
            status_code=400,
            detail={
                "success": False,
                "error": {
                    "code": "INVALID_VERIFICATION",
                    "message": str(e),
                },
            },
        ) from e

    if not updated_incident:
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

    # Broadcast verification and status change
    try:
        from app.realtime.socket_manager import (
            emit_incident_status_changed,
            sio,
        )

        await emit_incident_status_changed(updated_incident, updated_incident.status)
        await sio.emit(
            "incident:triage_verified",
            {
                "incident_id": incident_id,
                "incident": updated_incident.model_dump(),
                "actor": user.name,
            },
            room="authorities",
        )
    except Exception:
        pass

    return IncidentSingleResponse(data=updated_incident)


@router.post("/adjust/{incident_id}", response_model=IncidentSingleResponse)
async def adjust_incident_triage(
    incident_id: str,
    payload: TriageVerificationRequest,
    user: AuthenticatedUser = Depends(require_authority),
):
    """Operator overrides triage attributes and confirms verification (Authority only)."""
    return await verify_incident_triage(incident_id, payload, user=user)
