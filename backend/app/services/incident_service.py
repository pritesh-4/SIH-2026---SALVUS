"""Incident business-logic service.

All database operations and domain rules for incidents live here.
Controllers/routes call these functions — they never talk to the DB directly.
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime, timedelta

import aiosqlite

from app.models import (
    IncidentCreate,
    IncidentEventResponse,
    IncidentResponse,
    IncidentStatus,
)
from app.services.state_machine import is_terminal, validate_transition

# ---------------------------------------------------------------------------
# Ticket ID generation
# ---------------------------------------------------------------------------


async def _next_ticket_id(db: aiosqlite.Connection) -> str:
    """Generate the next SV-XXXX ticket ID."""
    cursor = await db.execute("SELECT ticket_id FROM incidents ORDER BY created_at DESC LIMIT 1")
    row = await cursor.fetchone()
    if row:
        try:
            last_num = int(row["ticket_id"].split("-")[1])
            return f"SV-{last_num + 1}"
        except (IndexError, ValueError):
            pass
    return "SV-1001"


# ---------------------------------------------------------------------------
# Row → Pydantic converters
# ---------------------------------------------------------------------------


def _row_to_incident(row: aiosqlite.Row, events: list[dict] | None = None) -> IncidentResponse:
    """Convert a database row to an IncidentResponse."""
    return IncidentResponse(
        id=row["id"],
        ticket_id=row["ticket_id"],
        type=row["type"],
        severity=row["severity"],
        description=row["description"],
        reporter_name=row["reporter_name"],
        reporter_phone=row["reporter_phone"],
        latitude=row["latitude"],
        longitude=row["longitude"],
        affected_count=row["affected_count"],
        is_sos=bool(row["is_sos"]),
        status=row["status"],
        created_at=row["created_at"],
        updated_at=row["updated_at"],
        events=[IncidentEventResponse(**e) for e in (events or [])],
    )


async def _get_events_for_incident(db: aiosqlite.Connection, incident_id: str) -> list[dict]:
    """Fetch all events for an incident, ordered by creation time."""
    cursor = await db.execute(
        """
        SELECT id, incident_id, event_type, previous_status, new_status,
               actor, metadata, created_at
        FROM incident_events
        WHERE incident_id = ?
        ORDER BY created_at ASC
        """,
        (incident_id,),
    )
    rows = await cursor.fetchall()
    return [dict(r) for r in rows]


# ---------------------------------------------------------------------------
# Public service functions
# ---------------------------------------------------------------------------


async def create_incident(db: aiosqlite.Connection, payload: IncidentCreate) -> IncidentResponse:
    """Create a new incident and its initial CREATED event.

    Includes rapid duplicate submission deduplication (4s window).
    """
    now_dt = datetime.now(UTC)
    now = now_dt.isoformat()
    recent_threshold = (now_dt - timedelta(seconds=4)).isoformat()

    # Deduplication check
    cursor = await db.execute(
        """
        SELECT id FROM incidents
        WHERE type = ? AND description = ? AND latitude = ? AND longitude = ? AND created_at >= ?
        LIMIT 1
        """,
        (
            payload.type.value,
            payload.description,
            payload.latitude,
            payload.longitude,
            recent_threshold,
        ),
    )
    duplicate_row = await cursor.fetchone()
    if duplicate_row:
        # Return existing incident instead of creating accidental duplicate
        existing = await get_incident_by_id(db, duplicate_row["id"])
        if existing:
            return existing

    incident_id = str(uuid.uuid4())
    ticket_id = await _next_ticket_id(db)

    await db.execute(
        """
        INSERT INTO incidents (id, ticket_id, type, severity, description,
            reporter_name, reporter_phone, latitude, longitude,
            affected_count, is_sos, status, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            incident_id,
            ticket_id,
            payload.type.value,
            payload.severity.value,
            payload.description,
            payload.reporter_name,
            payload.reporter_phone,
            payload.latitude,
            payload.longitude,
            payload.affected_count,
            int(payload.is_sos),
            IncidentStatus.NEW.value,
            now,
            now,
        ),
    )

    # Create the initial event
    event_id = str(uuid.uuid4())
    await db.execute(
        """
        INSERT INTO incident_events (id, incident_id, event_type,
            previous_status, new_status, actor, created_at)
        VALUES (?, ?, 'CREATED', NULL, ?, 'citizen', ?)
        """,
        (event_id, incident_id, IncidentStatus.NEW.value, now),
    )

    await db.commit()

    # Fetch and return the created incident
    return await get_incident_by_id(db, incident_id)


async def get_all_incidents(db: aiosqlite.Connection) -> list[IncidentResponse]:
    """Return all incidents ordered by creation time (newest first), with events."""
    cursor = await db.execute("SELECT * FROM incidents ORDER BY created_at DESC")
    rows = await cursor.fetchall()

    results = []
    for row in rows:
        events = await _get_events_for_incident(db, row["id"])
        results.append(_row_to_incident(row, events))
    return results


async def get_incident_by_id(db: aiosqlite.Connection, incident_id: str) -> IncidentResponse | None:
    """Return a single incident with its event timeline, or None."""
    cursor = await db.execute("SELECT * FROM incidents WHERE id = ?", (incident_id,))
    row = await cursor.fetchone()
    if not row:
        return None

    events = await _get_events_for_incident(db, incident_id)
    return _row_to_incident(row, events)


async def update_incident_status(
    db: aiosqlite.Connection,
    incident_id: str,
    new_status: str,
    actor: str = "authority",
) -> IncidentResponse | None:
    """Transition an incident to a new status. Returns None if incident not found.

    Raises ValueError if the transition is invalid.
    """
    cursor = await db.execute("SELECT * FROM incidents WHERE id = ?", (incident_id,))
    row = await cursor.fetchone()
    if not row:
        return None

    current_status = row["status"]

    # Validate the transition
    if not validate_transition(current_status, new_status):
        if is_terminal(current_status):
            raise ValueError(
                f"Incident is in terminal state '{current_status}' and cannot be transitioned."
            )
        raise ValueError(f"Invalid transition: '{current_status}' → '{new_status}' is not allowed.")

    now = datetime.now(UTC).isoformat()

    # Update the incident
    await db.execute(
        "UPDATE incidents SET status = ?, updated_at = ? WHERE id = ?",
        (new_status, now, incident_id),
    )

    # Create the status change event
    event_id = str(uuid.uuid4())
    await db.execute(
        """
        INSERT INTO incident_events (id, incident_id, event_type,
            previous_status, new_status, actor, created_at)
        VALUES (?, ?, 'STATUS_CHANGE', ?, ?, ?, ?)
        """,
        (event_id, incident_id, current_status, new_status, actor, now),
    )

    await db.commit()
    return await get_incident_by_id(db, incident_id)


async def reset_demo_database(db: aiosqlite.Connection) -> None:
    """Clear all incidents and re-seed default demo scenarios."""
    await db.execute("DELETE FROM incident_events")
    await db.execute("DELETE FROM incidents")
    await db.commit()

    from app.db.seed import seed_database

    await seed_database(db)
