"""Simulation REST API routes for Hackathon demo & real-time telemetry testing.

Provides deterministic responder movement simulation that operates strictly through
the identical domain model, database mutations, and Socket.IO events as production GPS trackers.
"""

from __future__ import annotations

from fastapi import APIRouter, HTTPException

from app.db import get_database
from app.models import (
    ResponderSingleResponse,
    SimulationStepRequest,
)
from app.realtime.socket_manager import (
    emit_assignment_status_changed,
    emit_incident_status_changed,
    emit_responder_location_updated,
    emit_responder_status_changed,
)
from app.services import assignment_service, responder_service

router = APIRouter(prefix="/api/simulation", tags=["simulation"])


@router.post("/step", response_model=ResponderSingleResponse)
async def process_simulation_step(payload: SimulationStepRequest):
    """Process a single real-time simulated telemetry step along an active route vector."""
    db = await get_database()

    responder = await responder_service.get_responder_by_id(db, payload.responder_id)
    if not responder:
        raise HTTPException(
            status_code=404,
            detail={
                "success": False,
                "error": {
                    "code": "RESPONDER_NOT_FOUND",
                    "message": f"No responder found with ID '{payload.responder_id}'.",
                },
            },
        )

    # 1. Update location coordinates in DB
    updated_resp = await responder_service.update_responder_location(
        db, payload.responder_id, payload.latitude, payload.longitude
    )
    if not updated_resp:
        raise HTTPException(
            status_code=500,
            detail={"success": False, "error": {"message": "Location update failed"}},
        )

    # 2. Broadcast position update
    try:
        await emit_responder_location_updated(updated_resp)
    except Exception:
        pass

    # 3. If a status progression is requested or inferred, advance lifecycle
    if payload.target_status and payload.target_status.value != updated_resp.status:
        try:
            result = await responder_service.advance_responder_lifecycle(
                db,
                responder_id=payload.responder_id,
                target_status=payload.target_status.value,
                actor="simulation_engine",
                notes=f"Simulated telemetry checkpoint {payload.step_index}/{payload.total_steps}",
            )
            if result:
                updated_resp, updated_inc = result
                try:
                    await emit_responder_status_changed(updated_resp)
                    if updated_inc:
                        active_assignment = (
                            await assignment_service.get_active_assignment_for_incident(
                                db, updated_inc.id
                            )
                        )
                        if active_assignment:
                            await emit_assignment_status_changed(
                                active_assignment,
                                responder=updated_resp,
                                incident=updated_inc,
                            )
                        await emit_incident_status_changed(
                            updated_inc,
                            updated_inc.status,
                            assignment=active_assignment,
                            responder=updated_resp,
                        )
                except Exception:
                    pass
        except ValueError as e:
            # If transition is invalid (e.g. already reached later state), ignore gracefully
            print(f"[Simulation] Lifecycle transition skipped: {e}")

    return ResponderSingleResponse(data=updated_resp)


@router.post("/reset-fleet")
async def reset_simulation_fleet():
    """Reset all responder positions and availability states to seed defaults."""
    db = await get_database()
    await db.execute("DELETE FROM responders")
    await db.commit()

    from app.db.seed import seed_database

    await seed_database(db)
    responders = await responder_service.get_all_responders(db)

    # Broadcast updated responder list
    for resp in responders:
        try:
            await emit_responder_status_changed(resp)
            await emit_responder_location_updated(resp)
        except Exception:
            pass

    return {"success": True, "message": "Fleet simulation reset complete", "count": len(responders)}
