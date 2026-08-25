"""Responder fleet domain service.

Manages active rescue units, availability states, real-time GPS coordinates,
explainable candidate allocation, and synchronized lifecycle assignments.
"""

from __future__ import annotations

import json
import uuid
from datetime import UTC, datetime

import aiosqlite

from app.models import (
    CandidateResponderResponse,
    IncidentResponse,
    ResponderResponse,
)
from app.services.allocation_engine import rank_and_explain_candidates
from app.services.incident_service import get_incident_by_id
from app.services.routing_service import get_route, haversine_distance_km
from app.services.state_machine import validate_responder_transition


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


async def assign_responder_to_incident(
    db: aiosqlite.Connection,
    responder_id: str,
    incident_id: str,
    status: str = "ASSIGNED",
    actor: str = "authority",
) -> tuple[ResponderResponse, IncidentResponse] | None:
    """Authoritatively and atomically assign a responder unit to an active incident."""
    responder = await get_responder_by_id(db, responder_id)
    if not responder:
        return None

    incident = await get_incident_by_id(db, incident_id)
    if not incident:
        return None

    # Check terminal incident state guard
    if incident.status in ("RESOLVED", "CANCELLED"):
        raise ValueError(
            f"Cannot assign responder to incident #{incident.ticket_id} "
            f"with terminal status '{incident.status}'."
        )

    now = datetime.now(UTC).isoformat()

    # 1. Update responder record
    await db.execute(
        """
        UPDATE responders
        SET status = ?, assigned_incident_id = ?, updated_at = ?
        WHERE id = ?
        """,
        (status, incident_id, now, responder_id),
    )

    # 2. Update incident record lifecycle
    previous_inc_status = incident.status
    new_inc_status = "ASSIGNED"
    await db.execute(
        """
        UPDATE incidents
        SET status = 'ASSIGNED', updated_at = ?
        WHERE id = ?
        """,
        (now, incident_id),
    )

    # 3. Add audit event to incident timeline
    event_id = str(uuid.uuid4())
    event_metadata = json.dumps(
        {
            "responder_id": responder.id,
            "unit_name": responder.unit_name,
            "team_lead": responder.team_lead,
            "capability": responder.capability,
            "vehicle_type": responder.vehicle_type,
            "radio_channel": responder.radio_channel,
            "distance_km": haversine_distance_km(
                incident.latitude, incident.longitude, responder.latitude, responder.longitude
            ),
        }
    )
    await db.execute(
        """
        INSERT INTO incident_events (id, incident_id, event_type, previous_status,
            new_status, actor, metadata, created_at)
        VALUES (?, ?, 'RESPONDER_ASSIGNED', ?, ?, ?, ?, ?)
        """,
        (
            event_id,
            incident_id,
            previous_inc_status,
            new_inc_status,
            actor,
            event_metadata,
            now,
        ),
    )

    await db.commit()

    updated_responder = await get_responder_by_id(db, responder_id)
    updated_incident = await get_incident_by_id(db, incident_id)
    if not updated_responder or not updated_incident:
        return None

    return updated_responder, updated_incident


async def advance_responder_lifecycle(
    db: aiosqlite.Connection,
    responder_id: str,
    target_status: str,
    actor: str = "authority",
    notes: str | None = None,
) -> tuple[ResponderResponse, IncidentResponse | None] | None:
    """Advance responder through unified operational journey and synchronize incident lifecycle."""
    responder = await get_responder_by_id(db, responder_id)
    if not responder:
        return None

    if not validate_responder_transition(responder.status, target_status):
        raise ValueError(
            f"Invalid responder transition from '{responder.status}' to '{target_status}'."
        )

    now = datetime.now(UTC).isoformat()
    incident_id = responder.assigned_incident_id
    updated_incident = None

    # Handle resolution or status change
    new_assigned_id = incident_id
    if target_status == "AVAILABLE":
        new_assigned_id = None

    await db.execute(
        """
        UPDATE responders
        SET status = ?, assigned_incident_id = ?, updated_at = ?
        WHERE id = ?
        """,
        (target_status, new_assigned_id, now, responder_id),
    )

    if incident_id:
        incident = await get_incident_by_id(db, incident_id)
        if incident and incident.status not in ("RESOLVED", "CANCELLED"):
            previous_inc_status = incident.status
            new_inc_status = previous_inc_status

            if target_status in ("ASSIGNED", "EN_ROUTE", "NEARBY", "ON_SCENE"):
                new_inc_status = target_status
            elif target_status == "AVAILABLE":
                new_inc_status = "RESOLVED"

            await db.execute(
                """
                UPDATE incidents
                SET status = ?, updated_at = ?
                WHERE id = ?
                """,
                (new_inc_status, now, incident_id),
            )

            # Record lifecycle audit event
            event_id = str(uuid.uuid4())
            event_metadata = json.dumps(
                {
                    "responder_id": responder.id,
                    "unit_name": responder.unit_name,
                    "responder_status": target_status,
                    "notes": notes,
                }
            )
            await db.execute(
                """
                INSERT INTO incident_events (id, incident_id, event_type, previous_status,
                    new_status, actor, metadata, created_at)
                VALUES (?, ?, 'LIFECYCLE_TRANSITION', ?, ?, ?, ?, ?)
                """,
                (
                    event_id,
                    incident_id,
                    previous_inc_status,
                    new_inc_status,
                    actor,
                    event_metadata,
                    now,
                ),
            )

            await db.commit()
            updated_incident = await get_incident_by_id(db, incident_id)

    await db.commit()
    updated_responder = await get_responder_by_id(db, responder_id)
    if not updated_responder:
        return None

    return updated_responder, updated_incident


async def get_candidate_responders_for_incident(
    db: aiosqlite.Connection,
    incident_id: str,
    include_routes: bool = True,
) -> list[CandidateResponderResponse]:
    """Retrieve ranked candidate responders for an active emergency incident with

    deterministic scoring, explanations, and OSRM/fallback routing vectors.
    """
    incident = await get_incident_by_id(db, incident_id)
    if not incident:
        return []

    responders = await get_all_responders(db)
    if not responders:
        return []

    candidates = rank_and_explain_candidates(incident, responders)

    # If requested, enrich top candidates (up to top 4) with real OSRM route geometry
    if include_routes and candidates:
        for cand in candidates[:4]:
            try:
                profile = "boat" if cand.capability == "FLOOD_BOAT" else "driving"
                route_res = await get_route(
                    origin_lat=cand.latitude,
                    origin_lon=cand.longitude,
                    dest_lat=incident.latitude,
                    dest_lon=incident.longitude,
                    profile=profile,
                )
                cand.distance_km = route_res.distance_km
                cand.eta_minutes = route_res.duration_minutes
                cand.eta_formatted = route_res.eta_formatted
                cand.route_geometry = route_res.coordinates
                cand.route_status = route_res.status.value
            except Exception as e:
                print(f"[ResponderService] Route enrichment skipped for {cand.unit_name}: {e}")

    return candidates
