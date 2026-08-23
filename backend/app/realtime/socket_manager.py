"""Socket.IO realtime manager for Salvus.

Provides the async Socket.IO server instance, room management,
and typed event emission helpers.

Rooms:
    - "authorities" : All active dispatchers/dashboard clients
    - "incident:{id}" : Per-incident room for citizen + assigned responders
"""

from __future__ import annotations

import socketio

from app.models import IncidentResponse

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
        sio.enter_room(sid, room)
        print(f"[Socket.IO] {sid} joined room: {room}")
        await sio.emit("room_joined", {"room": room}, to=sid)


@sio.event
async def leave_room(sid: str, data: dict):
    """Let a client leave a named room."""
    room = data.get("room")
    if room:
        sio.leave_room(sid, room)
        print(f"[Socket.IO] {sid} left room: {room}")


# ---------------------------------------------------------------------------
# Typed event emitters — called by the incident service / routes
# ---------------------------------------------------------------------------


async def emit_incident_created(incident: IncidentResponse) -> None:
    """Broadcast a new incident to the authorities room."""
    await sio.emit(
        "incident:new",
        {
            "incident_id": incident.id,
            "ticket_id": incident.ticket_id,
            "type": incident.type,
            "severity": incident.severity,
            "latitude": incident.latitude,
            "longitude": incident.longitude,
            "is_sos": incident.is_sos,
            "status": incident.status,
            "created_at": incident.created_at,
        },
        room="authorities",
    )
    print(f"[Socket.IO] Emitted incident:new → authorities ({incident.ticket_id})")


async def emit_incident_status_changed(incident: IncidentResponse, new_status: str) -> None:
    """Broadcast a status change to both the authorities room and the
    incident-specific room."""
    payload = {
        "incident_id": incident.id,
        "ticket_id": incident.ticket_id,
        "status": new_status,
        "updated_at": incident.updated_at,
    }

    # Notify the authority dashboard
    await sio.emit("incident:status_changed", payload, room="authorities")

    # Notify subscribers of this specific incident (citizen app, responders)
    incident_room = f"incident:{incident.id}"
    await sio.emit("incident:status_changed", payload, room=incident_room)

    print(
        f"[Socket.IO] Emitted incident:status_changed → authorities + {incident_room} "
        f"({incident.ticket_id} → {new_status})"
    )
