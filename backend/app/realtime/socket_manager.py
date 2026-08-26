"""Socket.IO realtime manager for Salvus.

Provides the async Socket.IO server instance, room management,
and typed event emission helpers.

Rooms:
    - "authorities" : All active dispatchers/dashboard clients
    - "incident:{id}" : Per-incident room for citizen + assigned responders
"""

from __future__ import annotations

import urllib.parse

import socketio

from app.auth.jwt_handler import AuthenticatedUser, verify_access_token
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
# Connection lifecycle handlers with cryptographic authentication
# ---------------------------------------------------------------------------


def _extract_token_from_environ(environ: dict, auth: dict | None) -> str | None:
    """Extract auth token from auth payload or query string."""
    if auth and isinstance(auth, dict) and auth.get("token"):
        return str(auth["token"]).strip()

    # Fallback to query string
    qs = environ.get("QUERY_STRING", "")
    if qs:
        params = urllib.parse.parse_qs(qs)
        if "token" in params and params["token"]:
            return params["token"][0].strip()

    return None


@sio.event
async def connect(sid: str, environ: dict, auth: dict | None = None):
    """Handle and cryptographically authenticate new client connection."""
    token = _extract_token_from_environ(environ, auth)
    if token:
        try:
            user = verify_access_token(token)
            await sio.save_session(sid, {"user": user.model_dump(), "authenticated": True})
            print(
                f"[Socket.IO] Authenticated client connected: {sid} "
                f"as {user.name} ({user.role.value})"
            )
            return
        except Exception as err:
            print(f"[Socket.IO] Token verification failed for {sid}: {err}")
            await sio.save_session(sid, {"user": None, "authenticated": False, "error": str(err)})
            return

    # Anonymous connection (limited permissions)
    await sio.save_session(sid, {"user": None, "authenticated": False, "role": "ANONYMOUS"})
    print(f"[Socket.IO] Anonymous client connected: {sid}")


@sio.event
async def disconnect(sid: str):
    """Handle client disconnection."""
    print(f"[Socket.IO] Client disconnected: {sid}")


@sio.event
async def join_room(sid: str, data: dict):
    """Join a named room with strict RBAC room authorization.

    Protected rooms:
        - "authorities"   : Requires AUTHORITY or SYSTEM role
        - "incident:<id>" : Requires AUTHORITY/SYSTEM, or CITIZEN scoped to this incident,
                            or RESPONDER assigned to this incident.
    """
    if not isinstance(data, dict):
        return

    room = data.get("room")
    if not room or not isinstance(room, str):
        return

    session = await sio.get_session(sid) or {}
    user_data = session.get("user")
    user = AuthenticatedUser(**user_data) if user_data else None

    # 1. Protect 'authorities' room
    if room == "authorities":
        if not user or not user.is_authority:
            print(
                f"[Socket.IO Security Alert] Blocked unauthorized join to 'authorities' "
                f"from sid={sid}"
            )
            await sio.emit(
                "error",
                {
                    "code": "FORBIDDEN",
                    "message": (
                        "Access denied. Only verified emergency authority operators "
                        "may subscribe to the authorities room."
                    ),
                    "room": room,
                },
                to=sid,
            )
            return

    # 2. Protect 'incident:{id}' rooms (Citizen data isolation)
    elif room.startswith("incident:"):
        incident_id = room.split(":", 1)[1].strip()
        if not user:
            print(
                f"[Socket.IO Security Alert] Blocked unauthenticated join to '{room}' "
                f"from sid={sid}"
            )
            await sio.emit(
                "error",
                {
                    "code": "UNAUTHORIZED",
                    "message": (
                        "Authentication required to subscribe to incident distress channels."
                    ),
                    "room": room,
                },
                to=sid,
            )

            return

        if user.is_citizen:
            # Verify citizen ownership of this specific incident
            if user.scoped_incident_id and user.scoped_incident_id != incident_id:
                print(
                    f"[Socket.IO Security Alert] Citizen '{user.user_id}' "
                    f"attempted cross-incident subscription to '{room}'"
                )
                await sio.emit(
                    "error",
                    {
                        "code": "FORBIDDEN",
                        "message": "Citizens may only subscribe to their own active incident room.",
                        "room": room,
                    },
                    to=sid,
                )
                return

    # Authorized: Enter room and confirm
    await sio.enter_room(sid, room)
    print(f"[Socket.IO] {sid} authorized and joined room: {room}")
    await sio.emit("room_joined", {"room": room}, to=sid)


@sio.event
async def leave_room(sid: str, data: dict):
    """Let a client leave a named room."""
    if isinstance(data, dict):
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
    await sio.emit("incident.created", payload, room="authorities")
    print(f"[Socket.IO] Emitted incident.created → authorities ({incident.ticket_id})")


async def emit_incident_response_state_changed(
    incident: IncidentResponse,
    new_status: str,
    assignment: AssignmentResponse | None = None,
    responder: ResponderResponse | None = None,
) -> None:
    """Broadcast incident response state transition to authorities and incident room."""
    payload = {
        "id": incident.id,
        "incident_id": incident.id,
        "ticket_id": incident.ticket_id,
        "status": new_status,
        "updated_at": incident.updated_at,
        "incident": incident.model_dump(),
        "events": [e.model_dump() for e in incident.events],
    }
    if assignment:
        payload["assignment"] = assignment.model_dump()
    if responder:
        payload["responder"] = responder.model_dump()

    # Notify the authority dashboard
    await sio.emit("incident.response_state_changed", payload, room="authorities")

    # Notify subscribers of this specific incident (citizen app, responders)
    incident_room = f"incident:{incident.id}"
    await sio.emit("incident.response_state_changed", payload, room=incident_room)

    print(
        f"[Socket.IO] Emitted incident.response_state_changed → authorities + {incident_room} "
        f"({incident.ticket_id} → {new_status})"
    )


async def emit_incident_status_changed(
    incident: IncidentResponse,
    new_status: str,
    assignment: AssignmentResponse | None = None,
    responder: ResponderResponse | None = None,
) -> None:
    """Convenience alias for emit_incident_response_state_changed."""
    await emit_incident_response_state_changed(
        incident=incident,
        new_status=new_status,
        assignment=assignment,
        responder=responder,
    )


async def emit_responder_status_changed(responder: ResponderResponse) -> None:
    """Broadcast responder status changes."""
    payload = responder.model_dump()
    await sio.emit("responder.status_changed", payload, room="authorities")

    if responder.assigned_incident_id:
        room = f"incident:{responder.assigned_incident_id}"
        await sio.emit("responder.status_changed", payload, room=room)

    print(
        f"[Socket.IO] Emitted responder.status_changed → {responder.unit_name} ({responder.status})"
    )


async def emit_responder_location_updated(responder: ResponderResponse) -> None:
    """Broadcast responder GPS telemetry updates."""
    payload = responder.model_dump()
    await sio.emit("responder.location_updated", payload, room="authorities")

    if responder.assigned_incident_id:
        room = f"incident:{responder.assigned_incident_id}"
        await sio.emit("responder.location_updated", payload, room=room)

    print(
        f"[Socket.IO] Emitted responder.location_updated → {responder.unit_name} "
        f"({responder.latitude:.4f}, {responder.longitude:.4f})"
    )


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
            "status": "ASSIGNED",
            "responder": resp.model_dump(),
            "incident": inc.model_dump() if inc else None,
        }

    await sio.emit("assignment.created", payload, room="authorities")

    if incident_id:
        incident_room = f"incident:{incident_id}"
        await sio.emit("assignment.created", payload, room=incident_room)

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

    if assignment.incident_id:
        incident_room = f"incident:{assignment.incident_id}"
        await sio.emit("assignment.status_changed", payload, room=incident_room)

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

    if assignment.incident_id:
        incident_room = f"incident:{assignment.incident_id}"
        await sio.emit("assignment.updated", payload, room=incident_room)


async def emit_shelter_updated(shelter: ShelterResponse) -> None:
    """Broadcast shelter capacity or status updates."""
    payload = shelter.model_dump()
    await sio.emit("shelter.updated", payload, room="authorities")
    print(
        f"[Socket.IO] Emitted shelter.updated → {shelter.name} ({shelter.available_beds} beds free)"
    )
