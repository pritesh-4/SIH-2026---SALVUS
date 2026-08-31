"""Asynchronous background intelligence task for AI incident triage with failure isolation."""

from __future__ import annotations

import asyncio
import logging
import uuid
from datetime import UTC, datetime

from app.db import get_database
from app.models import AIState, AITriageAssessment
from app.realtime.socket_manager import emit_incident_triage_updated
from app.services.ai.service import ai_service, compute_triage_hash
from app.services.incident_service import get_incident_by_id, save_ai_triage_assessment

logger = logging.getLogger("salvus.async_triage")

# Per-incident concurrency lock to prevent racing background tasks
_incident_locks: dict[str, asyncio.Lock] = {}
_global_lock = asyncio.Lock()


async def _get_incident_lock(incident_id: str) -> asyncio.Lock:
    """Retrieve or create an asyncio lock for a specific incident."""
    async with _global_lock:
        if incident_id not in _incident_locks:
            _incident_locks[incident_id] = asyncio.Lock()
        return _incident_locks[incident_id]


async def run_async_ai_triage(
    incident_id: str,
    request_id: str | None = None,
    task_id: str | None = None,
    force_reevaluate: bool = False,
) -> AITriageAssessment | None:
    """Asynchronous background worker executing multi-tier AI triage and broadcasting results.

    Guarantees:
    - Idempotency: Skips evaluation if incident content is unchanged.
    - Concurrency Control: Prevents race conditions with per-incident async locks.
    - Failure Isolation: Never deletes incidents, blocks dispatch, or alters emergency truth.
    - Realtime Broadcast: Emits incident.triage_updated upon completion.
    """
    active_task_id = task_id or f"task-{uuid.uuid4().hex[:8]}"
    active_request_id = request_id or "req-async"
    lock = await _get_incident_lock(incident_id)

    async with lock:
        db = await get_database()
        incident = await get_incident_by_id(db, incident_id)
        if not incident:
            logger.warning(f"Async triage skipped: Incident '{incident_id}' not found.")
            return None

        incident_dict = {
            "type": incident.type,
            "severity": incident.severity,
            "description": incident.description,
            "affected_count": incident.affected_count,
            "is_sos": incident.is_sos,
            "latitude": incident.latitude,
            "longitude": incident.longitude,
            "image_data": getattr(incident, "image_data", None),
        }

        # Check idempotency hash
        from app.services.ai.base import sanitize_incident_for_ai

        sanitized = sanitize_incident_for_ai(incident_dict)
        current_hash = compute_triage_hash(sanitized)

        if (
            not force_reevaluate
            and incident.triage_hash == current_hash
            and incident.ai_state == AIState.AVAILABLE.value
        ):
            logger.info(
                f"[Async Triage] Skipping redundant triage for #{incident.ticket_id} "
                f"(hash match: {current_hash})"
            )
            return incident.ai_triage

        # Mark incident as PROCESSING
        now = datetime.now(UTC).isoformat()
        await db.execute(
            "UPDATE incidents SET ai_state = ?, updated_at = ? WHERE id = ?",
            (AIState.PROCESSING.value, now, incident_id),
        )
        await db.commit()

        try:
            # Execute intelligence pipeline
            assessment, new_hash = await ai_service.triage(
                incident_dict=incident_dict,
                incident_id=incident_id,
                request_id=active_request_id,
                task_id=active_task_id,
            )

            # Re-check incident state in DB to protect against race conditions:
            # 1. Incident was resolved or cancelled while AI was calculating -> Discard
            # 2. Incident content changed (version change / newer triage began) -> Discard
            fresh_incident = await get_incident_by_id(db, incident_id)
            if not fresh_incident:
                logger.info(
                    f"[Async Triage] Discarding assessment: Incident {incident_id} not found."
                )
                return None

            if fresh_incident.status in ("RESOLVED", "CANCELLED"):
                logger.info(
                    f"[Async Triage] Discarding assessment: Incident #{fresh_incident.ticket_id} "
                    f"is in terminal state '{fresh_incident.status}'. AI result discarded."
                )
                return None

            # Check if incident description / content was updated during AI evaluation
            fresh_sanitized = sanitize_incident_for_ai(
                {
                    "type": fresh_incident.type,
                    "severity": fresh_incident.severity,
                    "description": fresh_incident.description,
                    "affected_count": fresh_incident.affected_count,
                    "is_sos": fresh_incident.is_sos,
                    "latitude": fresh_incident.latitude,
                    "longitude": fresh_incident.longitude,
                }
            )
            fresh_hash = compute_triage_hash(fresh_sanitized)
            if fresh_hash != current_hash and not force_reevaluate:
                logger.info(
                    f"[Async Triage] Discarding stale assessment for #{fresh_incident.ticket_id}: "
                    f"incident content changed during evaluation."
                )
                return None

            # Persist assessment in audit table
            await save_ai_triage_assessment(db, incident_id, assessment)

            # Update incident with AVAILABLE state and content hash
            updated_at = datetime.now(UTC).isoformat()
            await db.execute(
                "UPDATE incidents SET ai_state = ?, triage_hash = ?, updated_at = ? WHERE id = ?",
                (AIState.AVAILABLE.value, new_hash, updated_at, incident_id),
            )
            await db.commit()

            # Broadcast real-time triage update event (authorities: full, citizens: progress)
            await emit_incident_triage_updated(
                incident_id=incident_id,
                assessment=assessment,
                ai_state=AIState.AVAILABLE.value,
                ticket_id=fresh_incident.ticket_id,
            )

            logger.info(
                f"[Async Triage] Triage completed successfully for #{fresh_incident.ticket_id} "
                f"via {assessment.provider} ({assessment.confidence:.2f} conf, "
                f"{assessment.source_label})"
            )
            return assessment

        except Exception as exc:
            logger.error(
                f"[Async Triage Failure] Triage task failed for incident {incident_id}: {exc}",
                exc_info=True,
            )
            # Mark incident as FAILED only if not terminal; NEVER delete the emergency incident
            fail_now = datetime.now(UTC).isoformat()
            try:
                curr = await get_incident_by_id(db, incident_id)
                if curr and curr.status not in ("RESOLVED", "CANCELLED"):
                    await db.execute(
                        "UPDATE incidents SET ai_state = ?, updated_at = ? WHERE id = ?",
                        (AIState.FAILED.value, fail_now, incident_id),
                    )
                    await db.commit()
            except Exception:
                pass
            return None
