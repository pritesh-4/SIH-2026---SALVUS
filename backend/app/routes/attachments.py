"""Incident Evidence Photo Attachments REST API routes.

Provides multipart file upload, listing, retrieval, deletion, and local raw file serving.
"""

from __future__ import annotations

import os
from typing import Annotated

import aiosqlite
from fastapi import (
    APIRouter,
    Depends,
    File,
    HTTPException,
    Request,
    UploadFile,
    status,
)
from fastapi.responses import FileResponse

from app.auth.dependencies import (
    get_current_user,
    get_optional_user,
)
from app.auth.jwt_handler import AuthenticatedUser
from app.db import get_database
from app.models import (
    AttachmentListResponse,
    AttachmentSingleResponse,
)
from app.security.rate_limiter import AttachmentRateLimiter, get_client_identifier
from app.services import attachment_service, incident_service
from app.storage import (
    LocalStorageProvider,
    get_storage_provider,
)

router = APIRouter(tags=["attachments"])


async def _verify_attachment_access(
    db: aiosqlite.Connection,
    incident,
    user: AuthenticatedUser | None,
    action: str = "read",  # "read" | "upload" | "delete"
) -> None:
    """Enforce strict RBAC access control for incident evidence."""
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={
                "success": False,
                "error": {
                    "code": "UNAUTHORIZED",
                    "message": "Authentication required to access incident evidence.",
                },
            },
        )

    # Authority and System roles have fleet-wide operational oversight
    if user.is_authority or user.role.value == "system":
        return

    # Citizen ownership check
    if user.is_citizen:
        is_owner = (
            incident.id == user.scoped_incident_id
            or (incident.reporter_id is not None and incident.reporter_id == user.user_id)
            or (user.scoped_incident_id is None and incident.reporter_id is None)
        )
        if not is_owner:
            verb = (
                "view"
                if action == "read"
                else ("upload to" if action == "upload" else "delete from")
            )
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail={
                    "success": False,
                    "error": {
                        "code": "FORBIDDEN",
                        "message": f"Access denied. Citizens can only {verb} their own reports.",
                    },
                },
            )
        return

    # Responder check: Responders may only view operational evidence for assigned incidents
    if user.is_responder:
        if action in ("upload", "delete"):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail={
                    "success": False,
                    "error": {
                        "code": "FORBIDDEN",
                        "message": "Responders cannot modify evidence attachments directly.",
                    },
                },
            )
        cursor = await db.execute(
            """
            SELECT 1 FROM assignments
            WHERE incident_id = ? AND responder_id = ? AND status != 'CANCELLED'
            LIMIT 1
            """,
            (incident.id, user.user_id),
        )
        if await cursor.fetchone():
            return
        cursor2 = await db.execute(
            "SELECT 1 FROM responders WHERE id = ? AND assigned_incident_id = ? LIMIT 1",
            (user.user_id, incident.id),
        )
        if await cursor2.fetchone():
            return

        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={
                "success": False,
                "error": {
                    "code": "FORBIDDEN",
                    "message": "Access denied. Responders can only access assigned incidents.",
                },
            },
        )


@router.post(
    "/api/incidents/{incident_id}/attachments",
    status_code=status.HTTP_201_CREATED,
    response_model=AttachmentSingleResponse,
)
async def upload_incident_attachment(
    incident_id: str,
    file: Annotated[UploadFile, File(description="Incident evidence photo file (JPEG, PNG, WebP)")],
    request: Request,
    user: AuthenticatedUser | None = Depends(get_optional_user),
):
    """Upload a photographic evidence attachment to an active incident (multipart/form-data)."""
    # 1. Rate limiting check
    client_id = get_client_identifier(request, user.user_id if user else None)
    AttachmentRateLimiter.get_instance().check_rate_limit(client_id)

    db = await get_database()

    # 2. Verify authentication
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={
                "success": False,
                "error": {
                    "code": "UNAUTHORIZED",
                    "message": "Authentication required. Provide a valid Bearer token.",
                },
            },
        )

    # 3. Verify incident existence
    incident = await incident_service.get_incident_by_id(db, incident_id)
    if not incident:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={
                "success": False,
                "error": {
                    "code": "INCIDENT_NOT_FOUND",
                    "message": f"No incident found with ID '{incident_id}'.",
                },
            },
        )

    # 4. Verify authorization / ownership
    await _verify_attachment_access(db, incident, user, action="upload")

    # 5. Read uploaded binary payload
    try:
        file_bytes = await file.read()
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={
                "success": False,
                "error": {
                    "code": "FILE_READ_ERROR",
                    "message": f"Failed to read uploaded file payload: {str(e)}",
                },
            },
        ) from e

    # 6. Delegate to attachment service
    uploader_name = user.name if user else "Citizen"
    client_ip = request.client.host if request.client else "127.0.0.1"
    try:
        attachment = await attachment_service.create_attachment(
            db=db,
            incident_id=incident_id,
            file_bytes=file_bytes,
            filename=file.filename or "attachment.jpg",
            content_type=file.content_type,
            uploaded_by=uploader_name,
            client_ip=client_ip,
        )
    except KeyError as e:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={
                "success": False,
                "error": {
                    "code": "INCIDENT_NOT_FOUND",
                    "message": str(e),
                },
            },
        ) from e
    except ValueError as e:
        msg = str(e)
        err_code = "INVALID_ATTACHMENT"
        status_code = status.HTTP_400_BAD_REQUEST

        if "exceeds maximum limit" in msg:
            err_code = "FILE_TOO_LARGE"
            status_code = getattr(status, "HTTP_413_CONTENT_TOO_LARGE", 413)
        elif "Unsupported file format" in msg:
            err_code = "UNSUPPORTED_MEDIA_TYPE"
            status_code = status.HTTP_415_UNSUPPORTED_MEDIA_TYPE
        elif "Maximum limit" in msg:
            err_code = "ATTACHMENT_LIMIT_EXCEEDED"
            status_code = status.HTTP_400_BAD_REQUEST
        elif "terminal state" in msg:
            err_code = "INVALID_INCIDENT_STATE"
            status_code = status.HTTP_400_BAD_REQUEST

        raise HTTPException(
            status_code=status_code,
            detail={
                "success": False,
                "error": {
                    "code": err_code,
                    "message": msg,
                },
            },
        ) from e
    except RuntimeError as e:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail={
                "success": False,
                "error": {
                    "code": "STORAGE_ERROR",
                    "message": str(e),
                },
            },
        ) from e

    return AttachmentSingleResponse(data=attachment)


@router.get(
    "/api/incidents/{incident_id}/attachments",
    response_model=AttachmentListResponse,
)
async def list_incident_attachments(
    incident_id: str,
    user: AuthenticatedUser | None = Depends(get_optional_user),
):
    """Retrieve all evidence photo attachments associated with an incident."""
    db = await get_database()

    # 1. Verify authentication
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={
                "success": False,
                "error": {
                    "code": "UNAUTHORIZED",
                    "message": "Authentication required. Provide a valid Bearer token.",
                },
            },
        )

    # 2. Verify incident existence
    incident = await incident_service.get_incident_by_id(db, incident_id)
    if not incident:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={
                "success": False,
                "error": {
                    "code": "INCIDENT_NOT_FOUND",
                    "message": f"No incident found with ID '{incident_id}'.",
                },
            },
        )

    # 3. Verify authorization
    await _verify_attachment_access(db, incident, user, action="read")

    attachments = await attachment_service.get_attachments_for_incident(db, incident_id)
    return AttachmentListResponse(data=attachments, count=len(attachments))


@router.get(
    "/api/incidents/{incident_id}/attachments/{attachment_id}",
    response_model=AttachmentSingleResponse,
)
async def get_incident_attachment(
    incident_id: str,
    attachment_id: str,
    user: AuthenticatedUser | None = Depends(get_optional_user),
):
    """Retrieve single evidence attachment metadata by ID."""
    db = await get_database()

    # 1. Verify authentication
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={
                "success": False,
                "error": {
                    "code": "UNAUTHORIZED",
                    "message": "Authentication required. Provide a valid Bearer token.",
                },
            },
        )

    # 2. Verify incident existence
    incident = await incident_service.get_incident_by_id(db, incident_id)
    if not incident:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={
                "success": False,
                "error": {
                    "code": "INCIDENT_NOT_FOUND",
                    "message": f"No incident found with ID '{incident_id}'.",
                },
            },
        )

    # 3. Verify authorization
    await _verify_attachment_access(db, incident, user, action="read")

    attachment = await attachment_service.get_attachment_by_id(db, attachment_id)
    if not attachment or attachment.incident_id != incident_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={
                "success": False,
                "error": {
                    "code": "ATTACHMENT_NOT_FOUND",
                    "message": f"Attachment '{attachment_id}' not found on incident.",
                },
            },
        )

    return AttachmentSingleResponse(data=attachment)


@router.delete(
    "/api/incidents/{incident_id}/attachments/{attachment_id}",
    status_code=status.HTTP_200_OK,
)
async def delete_incident_attachment(
    incident_id: str,
    attachment_id: str,
    request: Request,
    user: AuthenticatedUser = Depends(get_current_user),
):
    """Delete an evidence attachment (authorized for incident owner or emergency authority)."""
    db = await get_database()

    # 1. Verify incident exists
    incident = await incident_service.get_incident_by_id(db, incident_id)
    if not incident:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={
                "success": False,
                "error": {
                    "code": "INCIDENT_NOT_FOUND",
                    "message": f"No incident found with ID '{incident_id}'.",
                },
            },
        )

    # 2. Verify ownership / RBAC
    await _verify_attachment_access(db, incident, user, action="delete")

    client_ip = request.client.host if request.client else "127.0.0.1"
    success = await attachment_service.delete_attachment(
        db=db,
        incident_id=incident_id,
        attachment_id=attachment_id,
        actor=user.name,
        client_ip=client_ip,
    )
    if not success:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={
                "success": False,
                "error": {
                    "code": "ATTACHMENT_NOT_FOUND",
                    "message": f"Attachment '{attachment_id}' not found on incident.",
                },
            },
        )

    return {
        "success": True,
        "message": f"Attachment '{attachment_id}' removed from incident '{incident_id}'.",
    }


@router.get("/api/attachments/raw/{storage_key:path}")
async def serve_raw_local_attachment(storage_key: str):
    """Serve local raw image binaries with path traversal security protections."""
    provider = get_storage_provider()
    if not isinstance(provider, LocalStorageProvider):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={
                "success": False,
                "error": {
                    "code": "NOT_LOCAL_STORAGE",
                    "message": "Raw binary endpoint only active with local storage.",
                },
            },
        )

    try:
        file_path = provider._resolve_path(storage_key)
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={
                "success": False,
                "error": {
                    "code": "INVALID_PATH",
                    "message": str(e),
                },
            },
        ) from e

    if not os.path.isfile(file_path):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={
                "success": False,
                "error": {
                    "code": "FILE_NOT_FOUND",
                    "message": "The requested image object was not found on local disk.",
                },
            },
        )

    ext = os.path.splitext(file_path)[1].lower()
    media_type = "image/jpeg"
    if ext == ".png":
        media_type = "image/png"
    elif ext == ".webp":
        media_type = "image/webp"

    return FileResponse(file_path, media_type=media_type)
