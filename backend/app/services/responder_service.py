"""Responder fleet domain service.

Manages active rescue units, availability states, real-time GPS coordinates,
operational candidate matching, and incident assignments.
"""

from __future__ import annotations

import json
import math
import uuid
from datetime import UTC, datetime

import aiosqlite

from app.models import (
    CandidateResponderResponse,
    IncidentResponse,
    ResponderResponse,
)
from app.services.incident_service import get_incident_by_id


def haversine_distance_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Calculate the great-circle distance between two GPS coordinates in kilometers."""
    radius_km = 6371.0
    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)
    a = (
        math.sin(dlat / 2) ** 2
        + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(dlon / 2) ** 2
    )
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
    return round(radius_km * c, 2)


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
    """Authoritatively assign a responder unit to an active emergency incident."""
    responder = await get_responder_by_id(db, responder_id)
    if not responder:
        return None

    incident = await get_incident_by_id(db, incident_id)
    if not incident:
        return None

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

    # 2. Update incident record lifecycle if pending triage
    previous_inc_status = incident.status
    new_inc_status = incident.status
    if incident.status in ("NEW", "TRIAGE_PENDING", "VERIFIED"):
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
            "capability": responder.capability,
            "vehicle_type": responder.vehicle_type,
            "radio_channel": responder.radio_channel,
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


async def get_candidate_responders_for_incident(
    db: aiosqlite.Connection, incident_id: str
) -> list[CandidateResponderResponse]:
    """Rank all active response units for a specific incident based on:

    1. Capability match
    2. Operational availability
    3. Spatial proximity (Haversine distance)
    4. Current unit workload
    """
    incident = await get_incident_by_id(db, incident_id)
    if not incident:
        return []

    responders = await get_all_responders(db)
    if not responders:
        return []

    candidates: list[CandidateResponderResponse] = []

    for resp in responders:
        dist_km = haversine_distance_km(
            incident.latitude, incident.longitude, resp.latitude, resp.longitude
        )

        # Baseline capability matching score
        cap_score = 50
        cap_reason = "General Auxiliary Support"

        inc_type = incident.type.lower()
        if inc_type == "flood":
            if resp.capability == "FLOOD_BOAT":
                cap_score = 95
                cap_reason = "Specialized Flood Watercraft"
            elif resp.capability == "AMBULANCE":
                cap_score = 70
                cap_reason = "Medical Evacuation Support"
            elif resp.capability == "STRETCHER_TEAM":
                cap_score = 65
                cap_reason = "Shallow Water Extraction"
        elif inc_type == "medical":
            if resp.capability == "AMBULANCE":
                cap_score = 95
                cap_reason = "Primary Advanced Life Support"
            elif resp.capability == "STRETCHER_TEAM":
                cap_score = 85
                cap_reason = "Stretcher Patient Transfer"
            elif resp.capability == "FLOOD_BOAT":
                cap_score = 60
                cap_reason = "Amphibious Medical Transit"
        elif inc_type in ("power_line", "hazard", "fire"):
            if resp.capability in ("HAZMAT", "DEBRIS_CLEAR"):
                cap_score = 95
                cap_reason = "Hazard Mitigation & Isolation"
            elif resp.capability == "STRETCHER_TEAM":
                cap_score = 75
                cap_reason = "Perimeter Safety & Evacuation"

        # Availability score adjustment
        status_bonus = 0
        if resp.status == "AVAILABLE":
            status_bonus = 30
        elif resp.status == "NEARBY":
            status_bonus = 20
        elif resp.status == "EN_ROUTE":
            status_bonus = 10
        elif resp.status in ("ASSIGNED", "ON_SCENE"):
            status_bonus = -20
        elif resp.status == "OFFLINE":
            status_bonus = -100

        # Distance penalty (5 points per km)
        dist_penalty = min(40, int(dist_km * 5))

        # Workload penalty (ratio of current load to max capacity)
        load_ratio = resp.current_load / max(1, resp.max_capacity)
        load_penalty = int(load_ratio * 20)

        total_score = max(0, cap_score + status_bonus - dist_penalty - load_penalty)

        candidates.append(
            CandidateResponderResponse(
                id=resp.id,
                unit_name=resp.unit_name,
                team_lead=resp.team_lead,
                vehicle_type=resp.vehicle_type,
                capability=resp.capability,
                status=resp.status,
                latitude=resp.latitude,
                longitude=resp.longitude,
                radio_channel=resp.radio_channel,
                max_capacity=resp.max_capacity,
                current_load=resp.current_load,
                assigned_incident_id=resp.assigned_incident_id,
                distance_km=dist_km,
                match_score=total_score,
                match_reason=cap_reason,
                is_recommended=False,
            )
        )

    # Sort candidates by total match score descending, then by distance ascending
    candidates.sort(key=lambda c: (-c.match_score, c.distance_km))

    # Mark the single highest-scoring available candidate as recommended
    for cand in candidates:
        if cand.status in ("AVAILABLE", "NEARBY", "EN_ROUTE"):
            cand.is_recommended = True
            break

    return candidates
