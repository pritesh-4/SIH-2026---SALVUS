"""Incident REST API routes.

Endpoints:
    POST   /api/incidents              — Create a new incident
    GET    /api/incidents              — List all incidents
    GET    /api/incidents/{id}         — Get a single incident with events
    PATCH  /api/incidents/{id}/status  — Transition incident status
    POST   /api/incidents/dev/seed     — Seed demo incidents (Dev tool)
    POST   /api/incidents/dev/reset    — Reset demo database (Dev tool)
"""

from __future__ import annotations

from fastapi import APIRouter, HTTPException

from app.db import get_database
from app.models import (
    IncidentCreate,
    IncidentListResponse,
    IncidentSingleResponse,
    IncidentStatusUpdate,
)
from app.services import incident_service

router = APIRouter(prefix="/api/incidents", tags=["incidents"])


@router.post("", status_code=201, response_model=IncidentSingleResponse)
async def create_incident(payload: IncidentCreate):
    """Create a new incident report or SOS beacon."""
    db = await get_database()
    incident = await incident_service.create_incident(db, payload)

    # Emit realtime event (best-effort, non-blocking)
    try:
        from app.realtime.socket_manager import emit_incident_created

        await emit_incident_created(incident)
    except Exception:
        pass  # Socket emission is best-effort

    return IncidentSingleResponse(data=incident)


@router.get("", response_model=IncidentListResponse)
async def list_incidents():
    """List all incidents, newest first."""
    db = await get_database()
    incidents = await incident_service.get_all_incidents(db)
    return IncidentListResponse(data=incidents, count=len(incidents))


@router.get("/{incident_id}", response_model=IncidentSingleResponse)
async def get_incident(incident_id: str):
    """Get a single incident with its full event timeline."""
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
    return IncidentSingleResponse(data=incident)


@router.patch("/{incident_id}/status", response_model=IncidentSingleResponse)
async def update_incident_status(incident_id: str, payload: IncidentStatusUpdate):
    """Transition an incident to a new lifecycle status."""
    db = await get_database()

    try:
        incident = await incident_service.update_incident_status(
            db, incident_id, payload.status.value, payload.actor
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

        await emit_incident_status_changed(incident, payload.status.value)
    except Exception:
        pass

    return IncidentSingleResponse(data=incident)


@router.post("/dev/seed", response_model=IncidentListResponse)
async def seed_dev_incidents():
    """Developer helper: Seed standard demo incidents and broadcast."""
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
async def reset_dev_database():
    """Developer helper: Reset database incidents to initial demo state."""
    db = await get_database()
    await incident_service.reset_demo_database(db)
    incidents = await incident_service.get_all_incidents(db)
    return IncidentListResponse(data=incidents, count=len(incidents))
