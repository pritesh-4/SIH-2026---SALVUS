"""Assignment domain service.

Manages first-class incident-to-responder assignments, controlled lifecycle
transitions, transactional consistency, auditable incident events, and
synchronization across incident and responder states.
"""

from __future__ import annotations

import json
import uuid
from datetime import UTC, datetime

import aiosqlite

from app.models import (
    AssignmentCreate,
    AssignmentResponse,
    AssignmentScoreBreakdown,
    AssignmentStatus,
    IncidentStatus,
    ResponderStatus,
)
from app.services.incident_service import get_incident_by_id
from app.services.responder_service import get_responder_by_id
from app.services.state_machine import (
    ACTIVE_ASSIGNMENT_STATUSES,
    validate_assignment_transition,
)


def _row_to_assignment(row: aiosqlite.Row) -> AssignmentResponse:
    """Convert an aiosqlite Row to AssignmentResponse model."""
    breakdown = None
    if row["score_breakdown"]:
        try:
            breakdown_data = json.loads(row["score_breakdown"])
            breakdown = AssignmentScoreBreakdown(**breakdown_data)
        except Exception:
            breakdown = None

    row_keys = row.keys() if hasattr(row, "keys") else []
    nearby_at = row["nearby_at"] if "nearby_at" in row_keys else None
    accepted_at = row["accepted_at"] if "accepted_at" in row_keys else None

    return AssignmentResponse(
        id=row["id"],
        incident_id=row["incident_id"],
        responder_id=row["responder_id"],
        status=row["status"],
        assigned_by=row["assigned_by"],
        assigned_at=row["assigned_at"],
        accepted_at=accepted_at,
        started_at=row["started_at"],
        nearby_at=nearby_at,
        arrived_at=row["arrived_at"],
        completed_at=row["completed_at"],
        cancelled_at=row["cancelled_at"],
        score=row["score"],
        score_breakdown=breakdown,
        assignment_reason=row["assignment_reason"],
        created_at=row["created_at"],
        updated_at=row["updated_at"],
    )


async def get_assignment_by_id(
    db: aiosqlite.Connection, assignment_id: str
) -> AssignmentResponse | None:
    """Fetch single assignment by ID."""
    cursor = await db.execute("SELECT * FROM assignments WHERE id = ?", (assignment_id,))
    row = await cursor.fetchone()
    if not row:
        return None
    return _row_to_assignment(row)


async def get_assignments_for_incident(
    db: aiosqlite.Connection, incident_id: str
) -> list[AssignmentResponse]:
    """Fetch all assignments associated with an incident, newest first."""
    cursor = await db.execute(
        "SELECT * FROM assignments WHERE incident_id = ? ORDER BY created_at DESC",
        (incident_id,),
    )
    rows = await cursor.fetchall()
    return [_row_to_assignment(r) for r in rows]


async def get_assignments_for_responder(
    db: aiosqlite.Connection, responder_id: str
) -> list[AssignmentResponse]:
    """Fetch all assignments associated with a responder, newest first."""
    cursor = await db.execute(
        "SELECT * FROM assignments WHERE responder_id = ? ORDER BY created_at DESC",
        (responder_id,),
    )
    rows = await cursor.fetchall()
    return [_row_to_assignment(r) for r in rows]


async def get_active_assignment_for_responder(
    db: aiosqlite.Connection, responder_id: str
) -> AssignmentResponse | None:
    """Fetch active assignment for a responder if one exists."""
    active_statuses = tuple(s.value for s in ACTIVE_ASSIGNMENT_STATUSES)
    placeholders = ",".join("?" for _ in active_statuses)
    query = f"""
        SELECT * FROM assignments
        WHERE responder_id = ? AND status IN ({placeholders})
        LIMIT 1
    """
    cursor = await db.execute(query, (responder_id, *active_statuses))
    row = await cursor.fetchone()
    if not row:
        return None
    return _row_to_assignment(row)


async def get_active_assignment_for_incident(
    db: aiosqlite.Connection, incident_id: str
) -> AssignmentResponse | None:
    """Fetch active assignment for an incident if one exists."""
    active_statuses = tuple(s.value for s in ACTIVE_ASSIGNMENT_STATUSES)
    placeholders = ",".join("?" for _ in active_statuses)
    query = f"""
        SELECT * FROM assignments
        WHERE incident_id = ? AND status IN ({placeholders})
        LIMIT 1
    """
    cursor = await db.execute(query, (incident_id, *active_statuses))
    row = await cursor.fetchone()
    if not row:
        return None
    return _row_to_assignment(row)


async def list_assignments(
    db: aiosqlite.Connection,
    incident_id: str | None = None,
    responder_id: str | None = None,
    status: str | None = None,
) -> list[AssignmentResponse]:
    """List assignments with optional filtering by incident, responder, or status."""
    conditions: list[str] = []
    params: list[str] = []

    if incident_id:
        conditions.append("incident_id = ?")
        params.append(incident_id)
    if responder_id:
        conditions.append("responder_id = ?")
        params.append(responder_id)
    if status:
        conditions.append("status = ?")
        params.append(status)

    where_clause = f"WHERE {' AND '.join(conditions)}" if conditions else ""
    query = f"SELECT * FROM assignments {where_clause} ORDER BY created_at DESC"

    cursor = await db.execute(query, tuple(params))
    rows = await cursor.fetchall()
    return [_row_to_assignment(r) for r in rows]


async def create_assignment(
    db: aiosqlite.Connection, payload: AssignmentCreate
) -> AssignmentResponse:
    """Authoritatively and transactionally create a new responder assignment.

    Validates incident existence, responder availability, active assignment constraints,
    synchronizes responder and incident statuses, and creates an audit event.
    """
    # 1. Validate incident existence and non-terminal status
    incident = await get_incident_by_id(db, payload.incident_id)
    if not incident:
        raise ValueError(f"Incident with ID '{payload.incident_id}' does not exist.")

    if incident.status in (IncidentStatus.RESOLVED.value, IncidentStatus.CANCELLED.value):
        raise ValueError(
            f"Cannot assign responder to incident #{incident.ticket_id} "
            f"with terminal status '{incident.status}'."
        )

    # 2. Validate single active assignment constraint per incident (with idempotency support)
    active_inc_assignment = await get_active_assignment_for_incident(db, payload.incident_id)
    if active_inc_assignment:
        if active_inc_assignment.responder_id == payload.responder_id:
            # Idempotent double-assignment by operator
            return active_inc_assignment
        raise ValueError(
            f"Incident #{incident.ticket_id} already has an active assignment "
            f"({active_inc_assignment.id}) with status '{active_inc_assignment.status}'."
        )

    # 3. Validate responder existence and non-offline status
    responder = await get_responder_by_id(db, payload.responder_id)
    if not responder:
        raise ValueError(f"Responder with ID '{payload.responder_id}' does not exist.")

    if responder.status == ResponderStatus.OFFLINE.value:
        raise ValueError(f"Responder '{responder.unit_name}' is OFFLINE and cannot be assigned.")

    # 4. Validate single active assignment constraint per responder
    active_resp_assignment = await get_active_assignment_for_responder(db, payload.responder_id)
    if active_resp_assignment:
        if active_resp_assignment.incident_id == payload.incident_id:
            return active_resp_assignment
        raise ValueError(
            f"Responder '{responder.unit_name}' already has an active assignment "
            f"with status '{active_resp_assignment.status}'."
        )
    if (
        responder.status != ResponderStatus.AVAILABLE.value
        and responder.assigned_incident_id != payload.incident_id
    ):
        raise ValueError(
            f"Responder '{responder.unit_name}' is currently in state "
            f"'{responder.status}' and unavailable."
        )

    now = datetime.now(UTC).isoformat()
    assignment_id = str(uuid.uuid4())
    status_val = payload.status.value
    accepted_at = now if payload.status == AssignmentStatus.ASSIGNED else None
    breakdown_json = payload.score_breakdown.model_dump_json() if payload.score_breakdown else None

    try:
        # 5. Insert assignment record
        await db.execute(
            """
            INSERT INTO assignments (
                id, incident_id, responder_id, status, assigned_by,
                assigned_at, accepted_at, started_at, nearby_at,
                arrived_at, completed_at, cancelled_at,
                score, score_breakdown, assignment_reason, created_at, updated_at
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, NULL, NULL, NULL, NULL, NULL, ?, ?, ?, ?, ?)
            """,
            (
                assignment_id,
                payload.incident_id,
                payload.responder_id,
                status_val,
                payload.assigned_by,
                now,
                accepted_at,
                payload.score,
                breakdown_json,
                payload.assignment_reason,
                now,
                now,
            ),
        )

        # 6. Synchronize responder status if ASSIGNED
        if payload.status == AssignmentStatus.ASSIGNED:
            await db.execute(
                """
                UPDATE responders
                SET status = 'ASSIGNED', assigned_incident_id = ?, updated_at = ?
                WHERE id = ?
                """,
                (payload.incident_id, now, payload.responder_id),
            )

        # 7. Synchronize incident status if ASSIGNED
        new_inc_status = incident.status
        if payload.status == AssignmentStatus.ASSIGNED and incident.status in (
            IncidentStatus.NEW.value,
            IncidentStatus.TRIAGE_PENDING.value,
            IncidentStatus.VERIFIED.value,
        ):
            new_inc_status = IncidentStatus.ASSIGNED.value
            await db.execute(
                """
                UPDATE incidents
                SET status = 'ASSIGNED', updated_at = ?
                WHERE id = ?
                """,
                (now, payload.incident_id),
            )

        # 8. Add audit event to incident timeline
        event_id = str(uuid.uuid4())
        event_metadata = json.dumps(
            {
                "assignment_id": assignment_id,
                "responder_id": responder.id,
                "unit_name": responder.unit_name,
                "assignment_status": status_val,
                "score": payload.score,
                "score_breakdown": (
                    payload.score_breakdown.model_dump() if payload.score_breakdown else None
                ),
                "assignment_reason": payload.assignment_reason,
            }
        )
        await db.execute(
            """
            INSERT INTO incident_events (
                id, incident_id, event_type, previous_status,
                new_status, actor, metadata, created_at
            )
            VALUES (?, ?, 'assignment.created', ?, ?, ?, ?, ?)
            """,
            (
                event_id,
                payload.incident_id,
                incident.status,
                new_inc_status,
                payload.assigned_by,
                event_metadata,
                now,
            ),
        )

        # Commit all changes atomically
        await db.commit()
    except aiosqlite.IntegrityError as err:
        await db.rollback()
        # Handle concurrent dispatch race condition
        existing_inc = await get_active_assignment_for_incident(db, payload.incident_id)
        if existing_inc:
            if existing_inc.responder_id == payload.responder_id:
                return existing_inc
            raise ValueError(
                f"Incident #{incident.ticket_id} already has an active assignment "
                f"({existing_inc.id}) with status '{existing_inc.status}'."
            ) from err
        existing_resp = await get_active_assignment_for_responder(db, payload.responder_id)
        if existing_resp:
            raise ValueError(
                f"Responder '{responder.unit_name}' already has an active assignment "
                f"with status '{existing_resp.status}'."
            ) from err
        raise
    except Exception:
        await db.rollback()
        raise

    created = await get_assignment_by_id(db, assignment_id)
    if not created:
        raise RuntimeError("Failed to retrieve created assignment.")
    return created


async def update_assignment_status(
    db: aiosqlite.Connection,
    assignment_id: str,
    target_status: str,
    actor: str = "authority",
    notes: str | None = None,
) -> AssignmentResponse | None:
    """Transition assignment to target status and synchronously update responder and incident.

    Enforces state machine progression, sets timestamp milestones, and writes incident events.
    """
    assignment = await get_assignment_by_id(db, assignment_id)
    if not assignment:
        return None

    current_status = assignment.status
    if current_status == target_status:
        return assignment

    if not validate_assignment_transition(current_status, target_status):
        raise ValueError(
            f"Invalid assignment transition: '{current_status}' → '{target_status}' is not allowed."
        )

    now = datetime.now(UTC).isoformat()

    # Milestone timestamps
    accepted_at = assignment.accepted_at
    started_at = assignment.started_at
    nearby_at = assignment.nearby_at
    arrived_at = assignment.arrived_at
    completed_at = assignment.completed_at
    cancelled_at = assignment.cancelled_at

    if target_status == AssignmentStatus.ASSIGNED.value and not accepted_at:
        accepted_at = now
    elif target_status == AssignmentStatus.EN_ROUTE.value and not started_at:
        started_at = now
    elif target_status == AssignmentStatus.NEARBY.value and not nearby_at:
        nearby_at = now
    elif target_status == AssignmentStatus.ON_SCENE.value and not arrived_at:
        arrived_at = now
    elif target_status == AssignmentStatus.COMPLETED.value:
        completed_at = now
    elif target_status == AssignmentStatus.CANCELLED.value:
        cancelled_at = now

    try:
        # 1. Update assignment record
        await db.execute(
            """
            UPDATE assignments
            SET status = ?, accepted_at = ?, started_at = ?, nearby_at = ?, arrived_at = ?,
                completed_at = ?, cancelled_at = ?, updated_at = ?
            WHERE id = ?
            """,
            (
                target_status,
                accepted_at,
                started_at,
                nearby_at,
                arrived_at,
                completed_at,
                cancelled_at,
                now,
                assignment_id,
            ),
        )

        # 2. Synchronize responder operational state
        if target_status in (
            AssignmentStatus.ASSIGNED.value,
            AssignmentStatus.EN_ROUTE.value,
            AssignmentStatus.NEARBY.value,
            AssignmentStatus.ON_SCENE.value,
        ):
            await db.execute(
                """
                UPDATE responders
                SET status = ?, assigned_incident_id = ?, updated_at = ?
                WHERE id = ?
                """,
                (target_status, assignment.incident_id, now, assignment.responder_id),
            )
        elif target_status in (AssignmentStatus.COMPLETED.value, AssignmentStatus.CANCELLED.value):
            await db.execute(
                """
                UPDATE responders
                SET status = 'AVAILABLE', assigned_incident_id = NULL, updated_at = ?
                WHERE id = ?
                """,
                (now, assignment.responder_id),
            )

        # 3. Synchronize incident operational state
        incident = await get_incident_by_id(db, assignment.incident_id)
        if incident and incident.status not in (
            IncidentStatus.RESOLVED.value,
            IncidentStatus.CANCELLED.value,
        ):
            previous_inc_status = incident.status
            new_inc_status = previous_inc_status

            if target_status in (
                AssignmentStatus.ASSIGNED.value,
                AssignmentStatus.EN_ROUTE.value,
                AssignmentStatus.NEARBY.value,
                AssignmentStatus.ON_SCENE.value,
            ):
                new_inc_status = target_status
            elif target_status == AssignmentStatus.COMPLETED.value:
                new_inc_status = IncidentStatus.RESOLVED.value
            elif target_status == AssignmentStatus.CANCELLED.value:
                # Check if there are other active assignments for this incident
                other_active = [
                    a
                    for a in await get_assignments_for_incident(db, assignment.incident_id)
                    if a.id != assignment_id
                    and a.status in [s.value for s in ACTIVE_ASSIGNMENT_STATUSES]
                ]
                if not other_active:
                    new_inc_status = IncidentStatus.VERIFIED.value

            if new_inc_status != previous_inc_status:
                await db.execute(
                    """
                    UPDATE incidents
                    SET status = ?, updated_at = ?
                    WHERE id = ?
                    """,
                    (new_inc_status, now, assignment.incident_id),
                )

            # 4. Record auditable incident event
            event_id = str(uuid.uuid4())
            event_metadata = json.dumps(
                {
                    "assignment_id": assignment_id,
                    "responder_id": assignment.responder_id,
                    "previous_assignment_status": current_status,
                    "new_assignment_status": target_status,
                    "notes": notes,
                }
            )
            await db.execute(
                """
                INSERT INTO incident_events (
                    id, incident_id, event_type, previous_status,
                    new_status, actor, metadata, created_at
                )
                VALUES (?, ?, 'assignment.status_changed', ?, ?, ?, ?, ?)
                """,
                (
                    event_id,
                    assignment.incident_id,
                    current_status,
                    target_status,
                    actor,
                    event_metadata,
                    now,
                ),
            )

        # Commit all updates atomically
        await db.commit()
    except Exception:
        await db.rollback()
        raise

    return await get_assignment_by_id(db, assignment_id)
