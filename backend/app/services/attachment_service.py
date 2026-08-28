"""Incident photo evidence attachment domain service.

Manages attachment lifecycle, database persistence, storage cleanup, and orphan prevention.
"""

from __future__ import annotations

import json
import time
import uuid
from datetime import UTC, datetime

import aiosqlite

from app.logging import log_attachment_telemetry
from app.models import AttachmentStatus, IncidentAttachmentResponse
from app.services.state_machine import is_terminal
from app.storage import (
    ObjectStorageProvider,
    get_max_attachments_per_incident,
    get_storage_provider,
    validate_image_file,
)


def _row_to_attachment(row: aiosqlite.Row) -> IncidentAttachmentResponse:
    """Convert an SQLite row into an IncidentAttachmentResponse model."""
    keys = row.keys()
    thumbnail = row["thumbnail_url"] if "thumbnail_url" in keys else None
    return IncidentAttachmentResponse(
        id=row["id"],
        incident_id=row["incident_id"],
        url=row["secure_url"],
        thumbnail_url=thumbnail,
        original_filename=row["original_filename"],
        mime_type=row["mime_type"],
        size_bytes=row["size_bytes"],
        width=row["width"],
        height=row["height"],
        checksum=row["checksum"],
        uploaded_at=row["uploaded_at"],
        uploaded_by=row["uploaded_by"],
        status=row["status"],
    )


async def get_attachments_for_incident(
    db: aiosqlite.Connection, incident_id: str
) -> list[IncidentAttachmentResponse]:
    """Retrieve all evidence photo attachments associated with an incident."""
    cursor = await db.execute(
        """
        SELECT id, incident_id, storage_key, secure_url, thumbnail_url, original_filename,
               mime_type, size_bytes, width, height, checksum,
               uploaded_at, uploaded_by, status
        FROM incident_attachments
        WHERE incident_id = ? AND status = ?
        ORDER BY uploaded_at ASC
        """,
        (incident_id, AttachmentStatus.AVAILABLE.value),
    )
    rows = await cursor.fetchall()
    return [_row_to_attachment(r) for r in rows]


async def get_attachment_by_id(
    db: aiosqlite.Connection, attachment_id: str
) -> IncidentAttachmentResponse | None:
    """Retrieve a single attachment by its primary ID."""
    cursor = await db.execute(
        """
        SELECT id, incident_id, storage_key, secure_url, thumbnail_url, original_filename,
               mime_type, size_bytes, width, height, checksum,
               uploaded_at, uploaded_by, status
        FROM incident_attachments
        WHERE id = ?
        """,
        (attachment_id,),
    )
    row = await cursor.fetchone()
    if not row:
        return None
    return _row_to_attachment(row)


async def create_attachment(
    db: aiosqlite.Connection,
    incident_id: str,
    file_bytes: bytes,
    filename: str,
    content_type: str | None = None,
    uploaded_by: str = "citizen",
    storage_provider: ObjectStorageProvider | None = None,
    client_ip: str | None = None,
) -> IncidentAttachmentResponse:
    """Validate, store, and persist an evidence photo attachment for an incident.

    Guarantees orphan prevention: rolls back external storage object if database persistence fails.
    """
    start_time = time.perf_counter()
    provider = storage_provider or get_storage_provider()
    provider_name = provider.__class__.__name__

    # 1. Verify incident existence and lifecycle state
    cursor = await db.execute("SELECT id, status FROM incidents WHERE id = ?", (incident_id,))
    incident_row = await cursor.fetchone()
    if not incident_row:
        raise KeyError(f"No incident found with ID '{incident_id}'.")

    current_status = incident_row["status"]
    if is_terminal(current_status):
        raise ValueError(
            f"Cannot attach photos to an incident in terminal state '{current_status}'."
        )

    # 2. Check maximum attachments per incident limit
    count_cursor = await db.execute(
        "SELECT COUNT(*) FROM incident_attachments WHERE incident_id = ? AND status = ?",
        (incident_id, AttachmentStatus.AVAILABLE.value),
    )
    count_row = await count_cursor.fetchone()
    current_count = count_row[0] if count_row else 0
    max_limit = get_max_attachments_per_incident()

    if current_count >= max_limit:
        raise ValueError(
            f"Maximum limit of {max_limit} photo attachment(s) reached for incident #{incident_id}."
        )

    # 3. Validate image binary integrity, magic bytes, size limits, and checksum
    sanitized_name, verified_mime, size_bytes, width, height, checksum = validate_image_file(
        file_bytes, filename, declared_content_type=content_type
    )

    # 4. Check for duplicate upload (same checksum on this incident)
    dup_cursor = await db.execute(
        """
        SELECT id, incident_id, storage_key, secure_url, thumbnail_url, original_filename,
               mime_type, size_bytes, width, height, checksum,
               uploaded_at, uploaded_by, status
        FROM incident_attachments
        WHERE incident_id = ? AND checksum = ? AND status = ?
        LIMIT 1
        """,
        (incident_id, checksum, AttachmentStatus.AVAILABLE.value),
    )
    dup_row = await dup_cursor.fetchone()
    if dup_row:
        return _row_to_attachment(dup_row)

    # 5. Upload to durable object storage provider
    try:
        upload_result = await provider.upload(
            file_bytes=file_bytes,
            filename=sanitized_name,
            mime_type=verified_mime,
            folder=f"salvus_incidents/{incident_id}",
        )
    except Exception as e:
        duration_ms = (time.perf_counter() - start_time) * 1000.0
        log_attachment_telemetry(
            incident_id=incident_id,
            action="upload",
            provider=provider_name,
            duration_ms=duration_ms,
            success=False,
            size_bytes=size_bytes,
            mime_type=verified_mime,
            client_ip=client_ip,
            actor=uploaded_by,
            error_type="STORAGE_UPLOAD_ERROR",
        )
        raise RuntimeError(f"Storage upload failed: {str(e)}") from e

    # 6. Persist metadata to SQLite database with orphan prevention rollback
    attachment_id = str(uuid.uuid4())
    now = datetime.now(UTC).isoformat()
    thumbnail_url = upload_result.thumbnail_url or provider.get_transformed_url(
        upload_result.storage_key, width=400, height=300, crop="fill"
    )

    try:
        await db.execute(
            """
            INSERT INTO incident_attachments (
                id, incident_id, storage_key, secure_url, thumbnail_url, original_filename,
                mime_type, size_bytes, width, height, checksum,
                uploaded_at, uploaded_by, status
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                attachment_id,
                incident_id,
                upload_result.storage_key,
                upload_result.secure_url,
                thumbnail_url,
                sanitized_name,
                upload_result.mime_type,
                upload_result.size_bytes,
                upload_result.width,
                upload_result.height,
                upload_result.checksum,
                now,
                uploaded_by,
                AttachmentStatus.AVAILABLE.value,
            ),
        )

        # Log an auditable ATTACHMENT_ADDED event on the incident
        event_id = str(uuid.uuid4())
        await db.execute(
            """
            INSERT INTO incident_events (
                id, incident_id, event_type, previous_status, new_status,
                actor, metadata, created_at
            )
            VALUES (?, ?, 'ATTACHMENT_ADDED', ?, ?, ?, ?, ?)
            """,
            (
                event_id,
                incident_id,
                current_status,
                current_status,
                uploaded_by,
                json.dumps(
                    {
                        "attachment_id": attachment_id,
                        "filename": sanitized_name,
                        "size_bytes": size_bytes,
                        "mime_type": verified_mime,
                        "checksum": checksum,
                        "thumbnail_url": thumbnail_url,
                    }
                ),
                now,
            ),
        )

        await db.commit()

        duration_ms = (time.perf_counter() - start_time) * 1000.0
        log_attachment_telemetry(
            incident_id=incident_id,
            action="upload",
            provider=provider_name,
            duration_ms=duration_ms,
            success=True,
            attachment_id=attachment_id,
            size_bytes=size_bytes,
            mime_type=verified_mime,
            client_ip=client_ip,
            actor=uploaded_by,
        )

    except Exception as db_err:
        # Compensating cleanup: Delete uploaded object from storage to prevent orphaned cloud file
        try:
            await provider.delete(upload_result.storage_key)
        except Exception:
            pass  # Best-effort cleanup

        duration_ms = (time.perf_counter() - start_time) * 1000.0
        log_attachment_telemetry(
            incident_id=incident_id,
            action="upload",
            provider=provider_name,
            duration_ms=duration_ms,
            success=False,
            attachment_id=attachment_id,
            size_bytes=size_bytes,
            mime_type=verified_mime,
            client_ip=client_ip,
            actor=uploaded_by,
            error_type="DATABASE_INSERT_ROLLBACK",
        )
        raise RuntimeError(
            f"Database error while saving attachment metadata: {str(db_err)}"
        ) from db_err

    # 7. Return created attachment model
    created = await get_attachment_by_id(db, attachment_id)
    if not created:
        raise RuntimeError("Failed to retrieve created attachment record.")
    return created


async def delete_attachment(
    db: aiosqlite.Connection,
    incident_id: str,
    attachment_id: str,
    actor: str = "authority",
    storage_provider: ObjectStorageProvider | None = None,
    client_ip: str | None = None,
) -> bool:
    """Delete an evidence attachment from database and external object storage."""
    start_time = time.perf_counter()
    provider = storage_provider or get_storage_provider()
    provider_name = provider.__class__.__name__

    cursor = await db.execute(
        """
        SELECT id, storage_key, original_filename, size_bytes, mime_type FROM incident_attachments
        WHERE id = ? AND incident_id = ?
        """,
        (attachment_id, incident_id),
    )
    row = await cursor.fetchone()
    if not row:
        return False

    storage_key = row["storage_key"]
    filename = row["original_filename"]
    size_bytes = row["size_bytes"]
    mime_type = row["mime_type"]
    now = datetime.now(UTC).isoformat()

    # 1. Delete from database
    await db.execute("DELETE FROM incident_attachments WHERE id = ?", (attachment_id,))

    # 2. Log ATTACHMENT_DELETED event
    event_id = str(uuid.uuid4())
    await db.execute(
        """
        INSERT INTO incident_events (
            id, incident_id, event_type, previous_status, new_status,
            actor, metadata, created_at
        )
        VALUES (?, ?, 'ATTACHMENT_DELETED', NULL, NULL, ?, ?, ?)
        """,
        (
            event_id,
            incident_id,
            actor,
            json.dumps({"attachment_id": attachment_id, "filename": filename}),
            now,
        ),
    )

    await db.commit()

    # 3. Best-effort deletion from external storage provider
    try:
        await provider.delete(storage_key)
    except Exception:
        pass

    duration_ms = (time.perf_counter() - start_time) * 1000.0
    log_attachment_telemetry(
        incident_id=incident_id,
        action="delete",
        provider=provider_name,
        duration_ms=duration_ms,
        success=True,
        attachment_id=attachment_id,
        size_bytes=size_bytes,
        mime_type=mime_type,
        client_ip=client_ip,
        actor=actor,
    )

    return True
