"""Socket.IO realtime manager for Salvus.

Provides the async Socket.IO server instance, room management,
and typed event emission helpers.

Rooms:
    - "authorities" : All active dispatchers/dashboard clients
    - "incident:{id}" : Per-incident room for citizen + assigned responders
"""

from __future__ import annotations

import socketio

from app.models import AssignmentResponse, IncidentResponse, ResponderResponse, ShelterResponse

# ---------------------------------------------------------------------------
# Socket.IO server instance (async mode for FastAPI)
# ---------------------------------------------------------------------------

sio = socketio.AsyncServer(
    async_mode="asgi",
    cors_allowed_origins="*",
    logger=False,
    engineio_logger=False,
)


# ---------------------------------------------------------------------------
# Connection lifecycle handlers
# ---------------------------------------------------------------------------


@sio.event
async def connect(sid: str, environ: dict, auth: dict | None = None):
    """Handle new client connection."""
    print(f"[Socket.IO] Client connected: {sid}")


@sio.event
async def disconnect(sid: str):
    """Handle client disconnection."""
    print(f"[Socket.IO] Client disconnected: {sid}")


@sio.event
async def join_room(sid: str, data: dict):
    """Let a client join a named room.

    Expected payload: {"room": "authorities"} or {"room": "incident:<id>"}
    """
    room = data.get("room")
    if room:
        await sio.enter_room(sid, room)
        print(f"[Socket.IO] {sid} joined room: {room}")
        await sio.emit("room_joined", {"room": room}, to=sid)


@sio.event
async def leave_room(sid: str, data: dict):
    """Let a client leave a named room."""
    room = data.get("room")
    if room:
        await sio.leave_room(sid, room)
        print(f"[Socket.IO] {sid} left room: {room}")


# ---------------------------------------------------------------------------
# Typed event emitters — called by services and routes
# ---------------------------------------------------------------------------


async def emit_incident_created(incident: IncidentResponse) -> None:
    """Broadcast a new incident to the authorities room."""
    payload = incident.model_dump()
    # Support both dot and colon format event listeners
    await sio.emit("incident.created", payload, room="authorities")
    await sio.emit("incident:new", payload, room="authorities")
    print(f"[Socket.IO] Emitted incident.created → authorities ({incident.ticket_id})")


async def emit_incident_status_changed(incident: IncidentResponse, new_status: str) -> None:
    """Broadcast a status change to both the authorities room and the
    incident-specific room."""
    payload = {
        "id": incident.id,
        "incident_id": incident.id,
        "ticket_id": incident.ticket_id,
        "status": new_status,
        "updated_at": incident.updated_at,
        "incident": incident.model_dump(),
        "events": [e.model_dump() for e in incident.events],
    }

    # Notify the authority dashboard
    await sio.emit("incident.status_changed", payload, room="authorities")
    await sio.emit("incident:status_changed", payload, room="authorities")
    await sio.emit("incident.response_state_changed", payload, room="authorities")
    await sio.emit("incident:response_state_changed", payload, room="authorities")

    # Notify subscribers of this specific incident (citizen app, responders)
    incident_room = f"incident:{incident.id}"
    await sio.emit("incident.status_changed", payload, room=incident_room)
    await sio.emit("incident:status_changed", payload, room=incident_room)
    await sio.emit("incident.response_state_changed", payload, room=incident_room)
    await sio.emit("incident:response_state_changed", payload, room=incident_room)

    print(
        f"[Socket.IO] Emitted incident.status_changed → authorities + {incident_room} "
        f"({incident.ticket_id} → {new_status})"
    )


async def emit_responder_status_changed(responder: ResponderResponse) -> None:
    """Broadcast responder status changes."""
    payload = responder.model_dump()
    await sio.emit("responder.status_changed", payload, room="authorities")
    await sio.emit("responder:status_changed", payload, room="authorities")

    if responder.assigned_incident_id:
        room = f"incident:{responder.assigned_incident_id}"
        await sio.emit("responder.status_changed", payload, room=room)
        await sio.emit("responder:status_changed", payload, room=room)

    print(
        f"[Socket.IO] Emitted responder.status_changed → {responder.unit_name} ({responder.status})"
    )


async def emit_responder_location_updated(responder: ResponderResponse) -> None:
    """Broadcast responder GPS telemetry updates."""
    payload = responder.model_dump()
    await sio.emit("responder.location_updated", payload, room="authorities")
    await sio.emit("responder:location_updated", payload, room="authorities")

    if responder.assigned_incident_id:
        room = f"incident:{responder.assigned_incident_id}"
        await sio.emit("responder.location_updated", payload, room=room)
        await sio.emit("responder:location_updated", payload, room=room)


async def emit_assignment_created(
    assignment_or_responder: AssignmentResponse | ResponderResponse,
    incident_or_none: IncidentResponse | None = None,
    responder: ResponderResponse | None = None,
    incident: IncidentResponse | None = None,
) -> None:
    """Broadcast newly created incident assignment."""
    if isinstance(assignment_or_responder, AssignmentResponse):
        assignment = assignment_or_responder
        incident_id = assignment.incident_id
        payload = {
            "id": assignment.id,
            "assignment_id": assignment.id,
            "incident_id": assignment.incident_id,
            "responder_id": assignment.responder_id,
            "status": assignment.status,
            "assignment": assignment.model_dump(),
        }
        if responder:
            payload["responder"] = responder.model_dump()
        if incident:
            payload["incident"] = incident.model_dump()
            payload["ticket_id"] = incident.ticket_id
    else:
        resp = assignment_or_responder
        inc = incident_or_none
        incident_id = inc.id if inc else resp.assigned_incident_id
        payload = {
            "responder_id": resp.id,
            "incident_id": incident_id,
            "ticket_id": inc.ticket_id if inc else None,
            "responder": resp.model_dump(),
            "incident": inc.model_dump() if inc else None,
        }

    await sio.emit("assignment.created", payload, room="authorities")
    await sio.emit("assignment:created", payload, room="authorities")

    if incident_id:
        incident_room = f"incident:{incident_id}"
        await sio.emit("assignment.created", payload, room=incident_room)
        await sio.emit("assignment:created", payload, room=incident_room)

    print(
        f"[Socket.IO] Emitted assignment.created → "
        f"{payload.get('responder_id')} for incident {incident_id}"
    )


async def emit_assignment_status_changed(
    assignment: AssignmentResponse,
    previous_status: str | None = None,
    responder: ResponderResponse | None = None,
    incident: IncidentResponse | None = None,
) -> None:
    """Broadcast assignment lifecycle transition."""
    payload = {
        "id": assignment.id,
        "assignment_id": assignment.id,
        "incident_id": assignment.incident_id,
        "responder_id": assignment.responder_id,
        "previous_status": previous_status,
        "status": assignment.status,
        "assignment": assignment.model_dump(),
    }
    if responder:
        payload["responder"] = responder.model_dump()
    if incident:
        payload["incident"] = incident.model_dump()
        payload["ticket_id"] = incident.ticket_id

    await sio.emit("assignment.status_changed", payload, room="authorities")
    await sio.emit("assignment:status_changed", payload, room="authorities")

    if assignment.incident_id:
        incident_room = f"incident:{assignment.incident_id}"
        await sio.emit("assignment.status_changed", payload, room=incident_room)
        await sio.emit("assignment:status_changed", payload, room=incident_room)

    print(
        f"[Socket.IO] Emitted assignment.status_changed → {assignment.id} "
        f"({previous_status} → {assignment.status})"
    )


async def emit_assignment_updated(assignment: AssignmentResponse) -> None:
    """Broadcast assignment general updates."""
    payload = {
        "id": assignment.id,
        "assignment_id": assignment.id,
        "incident_id": assignment.incident_id,
        "responder_id": assignment.responder_id,
        "status": assignment.status,
        "assignment": assignment.model_dump(),
    }
    await sio.emit("assignment.updated", payload, room="authorities")
    await sio.emit("assignment:updated", payload, room="authorities")

    if assignment.incident_id:
        incident_room = f"incident:{assignment.incident_id}"
        await sio.emit("assignment.updated", payload, room=incident_room)
        await sio.emit("assignment:updated", payload, room=incident_room)


async def emit_shelter_updated(shelter: ShelterResponse) -> None:
    """Broadcast shelter capacity or status updates."""
    payload = shelter.model_dump()
    await sio.emit("shelter.updated", payload, room="authorities")
    await sio.emit("shelter:updated", payload, room="authorities")
    print(
        f"[Socket.IO] Emitted shelter.updated → {shelter.name} ({shelter.available_beds} beds free)"
    )
