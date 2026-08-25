"""AI Incident Triage & Human Verification REST API routes.

Endpoints:
    POST  /api/triage/analyze/{incident_id}  — Trigger on-demand AI triage assessment
    POST  /api/triage/verify/{incident_id}   — Operator verifies and accepts triage assessment
    POST  /api/triage/adjust/{incident_id}   — Operator overrides triage attributes and verifies
"""

from __future__ import annotations

from fastapi import APIRouter, HTTPException

from app.db import get_database
from app.models import (
    AITriageSingleResponse,
    IncidentSingleResponse,
    TriageVerificationRequest,
)
from app.services import incident_service
from app.services.ai_triage_service import perform_ai_triage

router = APIRouter(prefix="/api/triage", tags=["ai_triage"])


@router.post("/analyze/{incident_id}", response_model=AITriageSingleResponse)
async def analyze_incident_triage(incident_id: str):
    """Run safety-critical AI decision support triage on an incident."""
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

    # Perform AI Triage
    assessment = await perform_ai_triage(
        {
            "type": incident.type,
            "severity": incident.severity,
            "description": incident.description,
            "affected_count": incident.affected_count,
            "is_sos": incident.is_sos,
            "latitude": incident.latitude,
            "longitude": incident.longitude,
        }
    )

    # Persist in DB audit trail
    await incident_service.save_ai_triage_assessment(db, incident_id, assessment)

    # Broadcast realtime event
    try:
        from app.realtime.socket_manager import sio

        await sio.emit(
            "incident:triage_updated",
            {"incident_id": incident_id, "assessment": assessment.model_dump()},
            room="authorities",
        )
    except Exception:
        pass

    return AITriageSingleResponse(data=assessment)


@router.post("/verify/{incident_id}", response_model=IncidentSingleResponse)
async def verify_incident_triage(incident_id: str, payload: TriageVerificationRequest):
    """Operator approves AI triage assessment and transitions incident to VERIFIED."""
    if payload.actor == "citizen":
        raise HTTPException(
            status_code=403,
            detail={
                "success": False,
                "error": {
                    "code": "FORBIDDEN",
                    "message": "Only emergency authorities can verify or adjust triage.",
                },
            },
        )

    db = await get_database()
    try:
        updated_incident = await incident_service.verify_incident_triage(db, incident_id, payload)
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
                "actor": payload.actor,
            },
            room="authorities",
        )
    except Exception:
        pass

    return IncidentSingleResponse(data=updated_incident)


@router.post("/adjust/{incident_id}", response_model=IncidentSingleResponse)
async def adjust_incident_triage(incident_id: str, payload: TriageVerificationRequest):
    """Operator overrides severity, type, or capability and confirms verification."""
    return await verify_incident_triage(incident_id, payload)
