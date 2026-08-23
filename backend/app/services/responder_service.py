"""Responder fleet domain service.

Manages active rescue units, availability states, real-time GPS coordinates,
and incident assignments.
"""

from __future__ import annotations

from datetime import UTC, datetime

import aiosqlite

from app.models import ResponderResponse


def _row_to_responder(row: aiosqlite.Row) -> ResponderResponse:
    """Convert an aiosqlite Row to ResponderResponse model."""
    return ResponderResponse(
        id=row["id"],
        unit_name=row["unit_name"],
        team_lead=row["team_lead"],
        vehicle_type=row["vehicle_type"],
        capability=row["capability"],
        status=row["status"],
        latitude=row["latitude"],
        longitude=row["longitude"],
        radio_channel=row["radio_channel"],
        max_capacity=row["max_capacity"],
        current_load=row["current_load"],
        assigned_incident_id=row["assigned_incident_id"],
        last_seen=row["last_seen"],
        created_at=row["created_at"],
        updated_at=row["updated_at"],
    )


async def get_all_responders(db: aiosqlite.Connection) -> list[ResponderResponse]:
    """Fetch all active responders from database."""
    cursor = await db.execute("SELECT * FROM responders ORDER BY unit_name ASC")
    rows = await cursor.fetchall()
    return [_row_to_responder(r) for r in rows]


async def get_responder_by_id(
    db: aiosqlite.Connection, responder_id: str
) -> ResponderResponse | None:
    """Fetch single responder unit by ID."""
    cursor = await db.execute("SELECT * FROM responders WHERE id = ?", (responder_id,))
    row = await cursor.fetchone()
    if not row:
        return None
    return _row_to_responder(row)


async def update_responder_status(
    db: aiosqlite.Connection,
    responder_id: str,
    status: str | None = None,
    assigned_incident_id: str | None = None,
) -> ResponderResponse | None:
    """Update responder operational status or incident assignment."""
    cursor = await db.execute("SELECT * FROM responders WHERE id = ?", (responder_id,))
    row = await cursor.fetchone()
    if not row:
        return None

    now = datetime.now(UTC).isoformat()
    new_status = status or row["status"]
    new_incident_id = (
        assigned_incident_id if assigned_incident_id is not None else row["assigned_incident_id"]
    )

    await db.execute(
        """
        UPDATE responders
        SET status = ?, assigned_incident_id = ?, updated_at = ?
        WHERE id = ?
        """,
        (new_status, new_incident_id, now, responder_id),
    )
    await db.commit()
    return await get_responder_by_id(db, responder_id)


async def update_responder_location(
    db: aiosqlite.Connection,
    responder_id: str,
    latitude: float,
    longitude: float,
) -> ResponderResponse | None:
    """Update real-time GPS telemetry of a response unit."""
    cursor = await db.execute("SELECT * FROM responders WHERE id = ?", (responder_id,))
    row = await cursor.fetchone()
    if not row:
        return None

    now = datetime.now(UTC).isoformat()
    await db.execute(
        """
        UPDATE responders
        SET latitude = ?, longitude = ?, last_seen = ?, updated_at = ?
        WHERE id = ?
        """,
        (latitude, longitude, now, now, responder_id),
    )
    await db.commit()
    return await get_responder_by_id(db, responder_id)
