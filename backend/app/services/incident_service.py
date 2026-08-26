"""Incident business-logic service.

All database operations and domain rules for incidents live here.
Controllers/routes call these functions — they never talk to the DB directly.
"""

from __future__ import annotations

import json
import uuid
from datetime import UTC, datetime, timedelta

import aiosqlite

from app.models import (
    AITriageAssessment,
    IncidentCreate,
    IncidentEventResponse,
    IncidentResponse,
    IncidentSeverity,
    IncidentStatus,
    IncidentType,
    ResponderCapability,
    TriageVerificationRequest,
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
# Row → Pydantic converters & Triage Helpers
# ---------------------------------------------------------------------------


async def _get_latest_triage(
    db: aiosqlite.Connection, incident_id: str
) -> AITriageAssessment | None:
    """Fetch the latest AI triage assessment for an incident."""
    cursor = await db.execute(
        """
        SELECT assessment FROM ai_triage_assessments
        WHERE incident_id = ?
        ORDER BY created_at DESC
        LIMIT 1
        """,
        (incident_id,),
    )
    row = await cursor.fetchone()
    if not row:
        return None

    try:
        data = json.loads(row["assessment"])
        return AITriageAssessment(**data)
    except Exception:
        return None


# In-memory store for attached scene imagery
_incident_images: dict[str, str] = {}


def _row_to_incident(
    row: aiosqlite.Row,
    events: list[dict] | None = None,
    ai_triage: AITriageAssessment | None = None,
) -> IncidentResponse:
    """Convert a database row to an IncidentResponse."""
    row_keys = row.keys() if hasattr(row, "keys") else []
    reporter_id = row["reporter_id"] if "reporter_id" in row_keys else None
    ai_state = row["ai_state"] if "ai_state" in row_keys else "NOT_STARTED"
    triage_hash = row["triage_hash"] if "triage_hash" in row_keys else None
    inc_id = row["id"]
    image_data = _incident_images.get(inc_id)

    return IncidentResponse(
        id=inc_id,
        ticket_id=row["ticket_id"],
        type=row["type"],
        severity=row["severity"],
        description=row["description"],
        reporter_name=row["reporter_name"],
        reporter_phone=row["reporter_phone"],
        reporter_id=reporter_id,
        latitude=row["latitude"],
        longitude=row["longitude"],
        affected_count=row["affected_count"],
        is_sos=bool(row["is_sos"]),
        status=row["status"],
        ai_state=ai_state,
        triage_hash=triage_hash,
        created_at=row["created_at"],
        updated_at=row["updated_at"],
        events=[IncidentEventResponse(**e) for e in (events or [])],
        ai_triage=ai_triage,
        image_data=image_data,
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


async def save_ai_triage_assessment(
    db: aiosqlite.Connection, incident_id: str, assessment: AITriageAssessment
) -> None:
    """Persist an AI triage assessment in the audit table."""
    now = datetime.now(UTC).isoformat()
    triage_id = str(uuid.uuid4())

    await db.execute(
        """
        INSERT INTO ai_triage_assessments (
            id, incident_id, provider, model, assessment,
            confidence, review_status, created_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            triage_id,
            incident_id,
            assessment.provider,
            assessment.model,
            assessment.model_dump_json(),
            assessment.confidence,
            assessment.review_status,
            now,
        ),
    )
    await db.commit()


async def create_incident(
    db: aiosqlite.Connection,
    payload: IncidentCreate,
    reporter_id: str | None = None,
) -> IncidentResponse:
    """Create a new incident, initial CREATED event, and automatically run AI triage."""
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
        existing = await get_incident_by_id(db, duplicate_row["id"])
        if existing:
            return existing

    incident_id = str(uuid.uuid4())
    ticket_id = await _next_ticket_id(db)

    if payload.image_data:
        _incident_images[incident_id] = payload.image_data

    await db.execute(
        """
        INSERT INTO incidents (id, ticket_id, type, severity, description,
            reporter_name, reporter_phone, reporter_id, latitude, longitude,
            affected_count, is_sos, status, ai_state, triage_hash, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            incident_id,
            ticket_id,
            payload.type.value,
            payload.severity.value,
            payload.description,
            payload.reporter_name,
            payload.reporter_phone,
            reporter_id,
            payload.latitude,
            payload.longitude,
            payload.affected_count,
            int(payload.is_sos),
            IncidentStatus.NEW.value,
            "PROCESSING",
            None,
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

    # Fetch and return the created incident immediately (critical-path completed)
    return await get_incident_by_id(db, incident_id)


async def get_all_incidents(db: aiosqlite.Connection) -> list[IncidentResponse]:
    """Return all incidents ordered by creation time (newest first), with events & triage."""
    cursor = await db.execute("SELECT * FROM incidents ORDER BY created_at DESC")
    rows = await cursor.fetchall()

    results = []
    for row in rows:
        events = await _get_events_for_incident(db, row["id"])
        triage = await _get_latest_triage(db, row["id"])
        results.append(_row_to_incident(row, events, triage))
    return results


async def get_incident_by_id(db: aiosqlite.Connection, incident_id: str) -> IncidentResponse | None:
    """Return a single incident with its event timeline and latest AI triage, or None."""
    cursor = await db.execute("SELECT * FROM incidents WHERE id = ?", (incident_id,))
    row = await cursor.fetchone()
    if not row:
        return None

    events = await _get_events_for_incident(db, incident_id)
    triage = await _get_latest_triage(db, incident_id)
    return _row_to_incident(row, events, triage)


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


async def verify_incident_triage(
    db: aiosqlite.Connection,
    incident_id: str,
    payload: TriageVerificationRequest,
) -> IncidentResponse | None:
    """Human-in-the-loop verification of AI Triage assessment.

    Atomically updates review status, applies operator overrides, updates incident severity/type,
    transitions status to VERIFIED, and logs an auditable TRIAGE_VERIFIED event.
    """
    incident = await get_incident_by_id(db, incident_id)
    if not incident:
        return None

    if incident.status in ("RESOLVED", "CANCELLED"):
        raise ValueError(
            f"Cannot verify triage for terminal incident #{incident.ticket_id} ({incident.status})"
        )

    now = datetime.now(UTC).isoformat()
    is_adjusted = bool(
        payload.adjusted_severity or payload.adjusted_type or payload.adjusted_capability
    )
    review_status = "ADJUSTED" if is_adjusted else "VERIFIED"

    # 1. Update incident severity/type if adjusted by operator
    new_severity = (
        payload.adjusted_severity.value if payload.adjusted_severity else incident.severity
    )
    new_type = payload.adjusted_type.value if payload.adjusted_type else incident.type

    # Transition state to VERIFIED (if not already verified or beyond)
    target_status = incident.status
    if incident.status in (IncidentStatus.NEW.value, IncidentStatus.TRIAGE_PENDING.value):
        target_status = IncidentStatus.VERIFIED.value

    await db.execute(
        """
        UPDATE incidents
        SET severity = ?, type = ?, status = ?, updated_at = ?
        WHERE id = ?
        """,
        (new_severity, new_type, target_status, now, incident_id),
    )

    # 2. Update existing AI assessment review status or insert verified assessment
    adjustments_dict = {
        "adjusted_severity": payload.adjusted_severity.value if payload.adjusted_severity else None,
        "adjusted_type": payload.adjusted_type.value if payload.adjusted_type else None,
        "adjusted_capability": (
            payload.adjusted_capability.value if payload.adjusted_capability else None
        ),
        "notes": payload.reviewer_notes,
    }

    # Update latest triage assessment
    cursor = await db.execute(
        """
        SELECT id, assessment FROM ai_triage_assessments
        WHERE incident_id = ?
        ORDER BY created_at DESC
        LIMIT 1
        """,
        (incident_id,),
    )
    existing_triage = await cursor.fetchone()

    if existing_triage:
        triage_id = existing_triage["id"]
        try:
            triage_data = json.loads(existing_triage["assessment"])
            triage_data["review_status"] = review_status
            if payload.adjusted_severity:
                triage_data["severity"] = payload.adjusted_severity.value
            if payload.adjusted_type:
                triage_data["incident_type"] = payload.adjusted_type.value
            if payload.adjusted_capability:
                triage_data["recommended_capability"] = payload.adjusted_capability.value

            updated_assessment_json = json.dumps(triage_data)
        except Exception:
            updated_assessment_json = existing_triage["assessment"]

        await db.execute(
            """
            UPDATE ai_triage_assessments
            SET review_status = ?, operator_adjustments = ?, operator_id = ?,
                reviewed_at = ?, assessment = ?
            WHERE id = ?
            """,
            (
                review_status,
                json.dumps(adjustments_dict),
                payload.actor,
                now,
                updated_assessment_json,
                triage_id,
            ),
        )
    else:
        # If no prior triage assessment existed, create one
        triage_id = str(uuid.uuid4())
        notes_txt = payload.reviewer_notes or "Standard operational verification"
        sev_lvl = 4 if new_severity == "CRITICAL" else 3 if new_severity == "HIGH" else 2
        default_assessment = AITriageAssessment(
            incident_type=IncidentType(new_type),
            severity=IncidentSeverity(new_severity),
            severity_level=sev_lvl,
            confidence=1.0,
            hazard_type=f"Verified {new_type.title()} Incident",
            affected_people=incident.affected_count,
            key_signals=["Verified by human operator"],
            recommended_capability=(
                payload.adjusted_capability or ResponderCapability.FLOOD_BOAT
                if new_type == "flood"
                else ResponderCapability.AMBULANCE
            ),
            priority_reasoning=f"Operator verified emergency status: {notes_txt}",
            uncertainty_flags=[],
            provider="human-operator",
            model="human-in-the-loop",
            evaluated_at=now,
            needs_review=False,
            review_status=review_status,
        )
        await db.execute(
            """
            INSERT INTO ai_triage_assessments (
                id, incident_id, provider, model, assessment,
                confidence, review_status, operator_adjustments, operator_id,
                created_at, reviewed_at
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                triage_id,
                incident_id,
                "human-operator",
                "human-in-the-loop",
                default_assessment.model_dump_json(),
                1.0,
                review_status,
                json.dumps(adjustments_dict),
                payload.actor,
                now,
                now,
            ),
        )

    # 3. Log an auditable TRIAGE_VERIFIED event
    event_id = str(uuid.uuid4())
    await db.execute(
        """
        INSERT INTO incident_events (id, incident_id, event_type,
            previous_status, new_status, actor, metadata, created_at)
        VALUES (?, ?, 'TRIAGE_VERIFIED', ?, ?, ?, ?, ?)
        """,
        (
            event_id,
            incident_id,
            incident.status,
            target_status,
            payload.actor,
            json.dumps(
                {
                    "review_status": review_status,
                    "notes": payload.reviewer_notes,
                    "adjustments": adjustments_dict,
                }
            ),
            now,
        ),
    )

    await db.commit()
    return await get_incident_by_id(db, incident_id)


async def reset_demo_database(db: aiosqlite.Connection) -> None:
    """Clear all incidents, events, triage assessments and re-seed default demo scenarios."""
    await db.execute("DELETE FROM incident_events")
    await db.execute("DELETE FROM ai_triage_assessments")
    await db.execute("DELETE FROM incidents")
    await db.commit()

    from app.db.seed import seed_database

    await seed_database(db)
