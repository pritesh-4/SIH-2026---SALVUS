"""Tests for Salvus Photo Attachment Evidence domain (Phase 1 & Phase 2)."""

import uuid
from unittest.mock import MagicMock, patch

import httpx
import pytest

from app.auth.jwt_handler import UserRole, create_access_token
from app.db import get_database
from app.models import AIVisionAssessment, AIVisionObservation
from app.security.rate_limiter import AttachmentRateLimiter
from app.services import attachment_service
from app.services.vision_service import VisionService
from app.storage.cloudinary import CloudinaryStorageProvider

# Minimal 1x1 pixel test binary image fixtures
MINIMAL_PNG = (
    b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01\x08\x06\x00\x00\x00"
    b"\x1f\x15c4\x00\x00\x00\rIDATx\x9cc`\x00\x00\x00\x02\x00\x01H\xaf\xa4q\x00\x00\x00\x00IEND\xaeB`\x82"
)

MINIMAL_JPEG = (
    b"\xff\xd8\xff\xe0\x00\x10JFIF\x00\x01\x01\x01\x00H\x00H\x00\x00\xff\xdb\x00C\x00\x08\x06\x06"
    b"\x07\x06\x05\x08\x07\x07\x07\t\t\x08\n\x0c\x14\r\x0c\x0b\x0b\x0c\x19\x12\x13\x0f\x14\x1d\x1a"
    b"\x1f\x1e\x1d\x1a\x1c\x1c $.' \",#\x1c\x1c(7),01444\x1f'9=82<.342\xff\xc0\x00\x11\x08\x00"
    b'\x01\x00\x01\x03\x01"\x00\x02\x11\x01\x03\x11\x01\xff\xc4\x00\x1f\x00\x00\x01\x05\x01\x01'
    b"\x01\x01\x01\x01\x00\x00\x00\x00\x00\x00\x00\x00\x01\x02\x03\x04\x05\x06\x07\x08\t\n\x0b"
    b"\xff\xda\x00\x0c\x03\x01\x00\x02\x11\x03\x11\x00?\x00\xbf\x00\xff\xd9"
)

MINIMAL_WEBP = (
    b"RIFF\x1a\x00\x00\x00WEBPVP8 \x0e\x00\x00\x00"
    b"0\x01\x00\x9d\x01*\x01\x00\x01\x00\x00\x00\x00\x00"
)

SAMPLE_INCIDENT = {
    "type": "flood",
    "severity": "HIGH",
    "description": "Rising floodwaters on Southern Avenue near Lake Road.",
    "reporter_name": "Priya Sen",
    "reporter_phone": "+91 98301 99999",
    "latitude": 22.5120,
    "longitude": 88.3630,
    "affected_count": 4,
    "is_sos": False,
}


async def _create_test_incident(client, custom_payload=None, reporter_user_id=None):
    """Helper to create an incident and return (incident_id, citizen_token)."""
    user_id = reporter_user_id or f"cit-{uuid.uuid4().hex[:8]}"
    payload = custom_payload or SAMPLE_INCIDENT

    citizen_token_creator = create_access_token(
        user_id=user_id,
        role=UserRole.CITIZEN,
        name=payload.get("reporter_name", "Test Citizen"),
    )
    headers = {"Authorization": f"Bearer {citizen_token_creator}"}

    resp = await client.post("/api/incidents", json=payload, headers=headers)
    assert resp.status_code == 201
    data = resp.json()["data"]
    incident_id = data["id"]

    token = create_access_token(
        user_id=user_id,
        role=UserRole.CITIZEN,
        name=payload.get("reporter_name", "Test Citizen"),
        scoped_incident_id=incident_id,
    )
    return incident_id, token


# ---------------------------------------------------------------------------
# 1. Valid Image Uploads (JPEG, PNG, WebP)
# ---------------------------------------------------------------------------


class TestValidAttachmentUploads:
    """Test valid image uploads across supported MIME types."""

    @pytest.mark.asyncio
    async def test_upload_jpeg_success(self, client):
        incident_id, token = await _create_test_incident(client)
        headers = {"Authorization": f"Bearer {token}"}

        files = {"file": ("scene_photo.jpg", MINIMAL_JPEG, "image/jpeg")}
        resp = await client.post(
            f"/api/incidents/{incident_id}/attachments",
            files=files,
            headers=headers,
        )
        assert resp.status_code == 201

        body = resp.json()
        assert body["success"] is True
        att = body["data"]
        assert att["incident_id"] == incident_id
        assert att["mime_type"] == "image/jpeg"
        assert att["size_bytes"] == len(MINIMAL_JPEG)
        assert att["original_filename"] == "scene_photo.jpg"
        assert att["status"] == "AVAILABLE"
        assert att["checksum"] is not None
        assert att["url"].startswith("/api/attachments/raw/")
        assert att.get("thumbnail_url") is not None

    @pytest.mark.asyncio
    async def test_upload_png_success(self, client):
        incident_id, token = await _create_test_incident(client)
        headers = {"Authorization": f"Bearer {token}"}

        files = {"file": ("structural_damage.png", MINIMAL_PNG, "image/png")}
        resp = await client.post(
            f"/api/incidents/{incident_id}/attachments",
            files=files,
            headers=headers,
        )
        assert resp.status_code == 201
        att = resp.json()["data"]
        assert att["mime_type"] == "image/png"
        assert att["width"] == 1
        assert att["height"] == 1

    @pytest.mark.asyncio
    async def test_upload_webp_success(self, client):
        incident_id, token = await _create_test_incident(client)
        headers = {"Authorization": f"Bearer {token}"}

        files = {"file": ("flood_level.webp", MINIMAL_WEBP, "image/webp")}
        resp = await client.post(
            f"/api/incidents/{incident_id}/attachments",
            files=files,
            headers=headers,
        )
        assert resp.status_code == 201
        att = resp.json()["data"]
        assert att["mime_type"] == "image/webp"


# ---------------------------------------------------------------------------
# 2. Magic-Byte Validation & Spoofing Defense
# ---------------------------------------------------------------------------


class TestMagicByteValidation:
    """Test binary magic-byte detection and extension spoofing rejection."""

    @pytest.mark.asyncio
    async def test_reject_spoofed_text_file(self, client):
        incident_id, token = await _create_test_incident(client)
        headers = {"Authorization": f"Bearer {token}"}

        # Text file pretending to be JPEG
        spoofed_payload = b"Hello, this is just a plain text script pretending to be an image!"
        files = {"file": ("malicious.jpg", spoofed_payload, "image/jpeg")}
        resp = await client.post(
            f"/api/incidents/{incident_id}/attachments",
            files=files,
            headers=headers,
        )
        assert resp.status_code == 415
        body = resp.json()
        assert body["detail"]["error"]["code"] == "UNSUPPORTED_MEDIA_TYPE"

    @pytest.mark.asyncio
    async def test_reject_pdf_file(self, client):
        incident_id, token = await _create_test_incident(client)
        headers = {"Authorization": f"Bearer {token}"}

        pdf_bytes = b"%PDF-1.4\n%\xe2\xe3\xcf\xd3\n1 0 obj\n<<>>\nendobj"
        files = {"file": ("document.pdf", pdf_bytes, "application/pdf")}
        resp = await client.post(
            f"/api/incidents/{incident_id}/attachments",
            files=files,
            headers=headers,
        )
        assert resp.status_code == 415
        assert resp.json()["detail"]["error"]["code"] == "UNSUPPORTED_MEDIA_TYPE"

    @pytest.mark.asyncio
    async def test_reject_empty_file(self, client):
        incident_id, token = await _create_test_incident(client)
        headers = {"Authorization": f"Bearer {token}"}

        files = {"file": ("empty.jpg", b"", "image/jpeg")}
        resp = await client.post(
            f"/api/incidents/{incident_id}/attachments",
            files=files,
            headers=headers,
        )
        assert resp.status_code == 400
        assert resp.json()["detail"]["error"]["code"] == "INVALID_ATTACHMENT"


# ---------------------------------------------------------------------------
# 3. File Limits Enforcement
# ---------------------------------------------------------------------------


class TestLimitsEnforcement:
    """Test size limits and count limits per incident."""

    @pytest.mark.asyncio
    async def test_reject_oversized_file(self, client, monkeypatch):
        # Temporarily set max size to 500 bytes for testing
        monkeypatch.setenv("MAX_ATTACHMENT_SIZE_BYTES", "500")

        incident_id, token = await _create_test_incident(client)
        headers = {"Authorization": f"Bearer {token}"}

        large_payload = MINIMAL_JPEG + (b"\x00" * 1000)
        files = {"file": ("big_photo.jpg", large_payload, "image/jpeg")}
        resp = await client.post(
            f"/api/incidents/{incident_id}/attachments",
            files=files,
            headers=headers,
        )
        assert resp.status_code == 413
        assert resp.json()["detail"]["error"]["code"] == "FILE_TOO_LARGE"

    @pytest.mark.asyncio
    async def test_max_attachments_per_incident_limit(self, client, monkeypatch):
        monkeypatch.setenv("MAX_ATTACHMENTS_PER_INCIDENT", "3")

        incident_id, token = await _create_test_incident(client)
        headers = {"Authorization": f"Bearer {token}"}

        # Upload 3 files successfully
        for i in range(3):
            # Slightly vary bytes to avoid deduplication
            file_data = MINIMAL_PNG + bytes([i])
            files = {"file": (f"photo_{i}.png", file_data, "image/png")}
            resp = await client.post(
                f"/api/incidents/{incident_id}/attachments",
                files=files,
                headers=headers,
            )
            assert resp.status_code == 201

        # Attempt 4th upload -> Should be rejected
        files = {"file": ("photo_4.png", MINIMAL_PNG + b"\x99", "image/png")}
        resp = await client.post(
            f"/api/incidents/{incident_id}/attachments",
            files=files,
            headers=headers,
        )
        assert resp.status_code == 400
        assert resp.json()["detail"]["error"]["code"] == "ATTACHMENT_LIMIT_EXCEEDED"


# ---------------------------------------------------------------------------
# 4. Authorization, RBAC & Isolation
# ---------------------------------------------------------------------------


class TestAttachmentAuthorization:
    """Test RBAC access rules and citizen data isolation across upload, list, and get."""

    @pytest.mark.asyncio
    async def test_unauthenticated_upload_rejected(self, anon_client):
        resp = await anon_client.post(
            "/api/incidents/some-incident-id/attachments",
            files={"file": ("scene.jpg", MINIMAL_JPEG, "image/jpeg")},
        )
        assert resp.status_code == 401

    @pytest.mark.asyncio
    async def test_citizen_cannot_upload_to_other_incident(self, client):
        # Create incident A and incident B with distinct payloads and citizen owners
        payload_b = {
            **SAMPLE_INCIDENT,
            "description": "Distinct Incident B on Rashbehari Avenue",
            "latitude": 22.5180,
        }
        inc_a, token_a = await _create_test_incident(client, reporter_user_id="cit-alice-1")
        inc_b, token_b = await _create_test_incident(
            client, custom_payload=payload_b, reporter_user_id="cit-bob-2"
        )

        # Citizen A attempts to upload to Incident B
        headers_a = {"Authorization": f"Bearer {token_a}"}
        resp = await client.post(
            f"/api/incidents/{inc_b}/attachments",
            files={"file": ("cross_citizen.jpg", MINIMAL_JPEG, "image/jpeg")},
            headers=headers_a,
        )
        assert resp.status_code == 403
        assert resp.json()["detail"]["error"]["code"] == "FORBIDDEN"

    @pytest.mark.asyncio
    async def test_authority_can_upload_to_any_incident(self, client, authority_headers):
        incident_id, _ = await _create_test_incident(client)

        resp = await client.post(
            f"/api/incidents/{incident_id}/attachments",
            files={"file": ("recon_drone.jpg", MINIMAL_JPEG, "image/jpeg")},
            headers=authority_headers,
        )
        assert resp.status_code == 201

    @pytest.mark.asyncio
    async def test_unauthenticated_get_list_rejected(self, anon_client):
        resp = await anon_client.get("/api/incidents/any-incident/attachments")
        assert resp.status_code == 401

    @pytest.mark.asyncio
    async def test_unauthenticated_get_single_rejected(self, anon_client):
        resp = await anon_client.get("/api/incidents/any-incident/attachments/any-att")
        assert resp.status_code == 401

    @pytest.mark.asyncio
    async def test_citizen_cannot_get_other_incident_attachments(self, client):
        payload_b = {
            **SAMPLE_INCIDENT,
            "description": "Distinct Incident B on Rashbehari Avenue",
            "latitude": 22.5180,
        }
        inc_a, token_a = await _create_test_incident(client, reporter_user_id="cit-alice-1")
        inc_b, token_b = await _create_test_incident(
            client, custom_payload=payload_b, reporter_user_id="cit-bob-2"
        )

        # Citizen A attempts to list attachments of Incident B
        resp = await client.get(
            f"/api/incidents/{inc_b}/attachments",
            headers={"Authorization": f"Bearer {token_a}"},
        )
        assert resp.status_code == 403
        assert resp.json()["detail"]["error"]["code"] == "FORBIDDEN"

    @pytest.mark.asyncio
    async def test_assigned_responder_can_view_attachments(self, client):
        incident_id, token = await _create_test_incident(client)
        headers = {"Authorization": f"Bearer {token}"}

        # Upload attachment
        up_resp = await client.post(
            f"/api/incidents/{incident_id}/attachments",
            files={"file": ("hazard.jpg", MINIMAL_JPEG, "image/jpeg")},
            headers=headers,
        )
        att_id = up_resp.json()["data"]["id"]

        # Assign responder to incident in database
        db = await get_database()
        responder_id = "resp-unit-42"
        await db.execute(
            """
            INSERT INTO responders (
                id, unit_name, team_lead, vehicle_type, capability, status,
                latitude, longitude, radio_channel, max_capacity, current_load,
                assigned_incident_id, last_seen, created_at, updated_at
            )
            VALUES (?, 'NDRF-42', 'Capt. Roy', 'BOAT', 'WATER_RESCUE', 'ASSIGNED',
                    22.5120, 88.3630, 'CH-9', 6, 0, ?, '2026-08-28T00:00:00Z',
                    '2026-08-28T00:00:00Z', '2026-08-28T00:00:00Z')
            """,
            (responder_id, incident_id),
        )
        await db.commit()

        responder_jwt = create_access_token(
            user_id=responder_id,
            role=UserRole.RESPONDER,
            name="NDRF Unit 42",
        )
        resp_headers = {"Authorization": f"Bearer {responder_jwt}"}

        # Responder reads attachments
        list_resp = await client.get(
            f"/api/incidents/{incident_id}/attachments",
            headers=resp_headers,
        )
        assert list_resp.status_code == 200
        assert list_resp.json()["count"] == 1

        single_resp = await client.get(
            f"/api/incidents/{incident_id}/attachments/{att_id}",
            headers=resp_headers,
        )
        assert single_resp.status_code == 200

    @pytest.mark.asyncio
    async def test_unassigned_responder_cannot_view_attachments(self, client):
        incident_id, _ = await _create_test_incident(client)

        unassigned_responder_jwt = create_access_token(
            user_id="resp-unassigned-99",
            role=UserRole.RESPONDER,
            name="NDRF Unit 99",
        )
        resp_headers = {"Authorization": f"Bearer {unassigned_responder_jwt}"}

        resp = await client.get(
            f"/api/incidents/{incident_id}/attachments",
            headers=resp_headers,
        )
        assert resp.status_code == 403
        assert resp.json()["detail"]["error"]["code"] == "FORBIDDEN"


# ---------------------------------------------------------------------------
# 5. Incident State & Lifecycle Constraints
# ---------------------------------------------------------------------------


class TestIncidentStateConstraints:
    """Test uploads against missing or terminal incidents."""

    @pytest.mark.asyncio
    async def test_upload_to_nonexistent_incident(self, client, authority_headers):
        resp = await client.post(
            "/api/incidents/00000000-0000-0000-0000-000000000000/attachments",
            files={"file": ("photo.jpg", MINIMAL_JPEG, "image/jpeg")},
            headers=authority_headers,
        )
        assert resp.status_code == 404

    @pytest.mark.asyncio
    async def test_upload_to_cancelled_incident_rejected(self, client):
        incident_id, token = await _create_test_incident(client)
        headers = {"Authorization": f"Bearer {token}"}

        # Cancel the incident
        await client.patch(
            f"/api/incidents/{incident_id}/status",
            json={"status": "CANCELLED"},
            headers=headers,
        )

        # Try to upload photo to cancelled incident
        resp = await client.post(
            f"/api/incidents/{incident_id}/attachments",
            files={"file": ("late_photo.jpg", MINIMAL_JPEG, "image/jpeg")},
            headers=headers,
        )
        assert resp.status_code == 400
        assert resp.json()["detail"]["error"]["code"] == "INVALID_INCIDENT_STATE"


# ---------------------------------------------------------------------------
# 6. Attachment Retrieval & Incident Inclusion
# ---------------------------------------------------------------------------


class TestAttachmentRetrieval:
    """Test fetching attachments and verified embedding in incident details."""

    @pytest.mark.asyncio
    async def test_list_and_get_attachments(self, client):
        incident_id, token = await _create_test_incident(client)
        headers = {"Authorization": f"Bearer {token}"}

        # Upload two photos
        resp1 = await client.post(
            f"/api/incidents/{incident_id}/attachments",
            files={"file": ("photo1.jpg", MINIMAL_JPEG, "image/jpeg")},
            headers=headers,
        )
        att1_id = resp1.json()["data"]["id"]

        resp2 = await client.post(
            f"/api/incidents/{incident_id}/attachments",
            files={"file": ("photo2.png", MINIMAL_PNG, "image/png")},
            headers=headers,
        )
        att2_id = resp2.json()["data"]["id"]

        # 1. List attachments for incident
        list_resp = await client.get(
            f"/api/incidents/{incident_id}/attachments",
            headers=headers,
        )
        assert list_resp.status_code == 200
        list_data = list_resp.json()
        assert list_data["count"] == 2
        assert {a["id"] for a in list_data["data"]} == {att1_id, att2_id}

        # 2. Get single attachment
        single_resp = await client.get(
            f"/api/incidents/{incident_id}/attachments/{att1_id}",
            headers=headers,
        )
        assert single_resp.status_code == 200
        assert single_resp.json()["data"]["id"] == att1_id

        # 3. Verify embedded attachments in GET /api/incidents/{id}
        inc_resp = await client.get(f"/api/incidents/{incident_id}", headers=headers)
        assert inc_resp.status_code == 200
        inc_data = inc_resp.json()["data"]
        assert "attachments" in inc_data
        assert len(inc_data["attachments"]) == 2
        assert inc_data["attachments"][0]["id"] == att1_id


# ---------------------------------------------------------------------------
# 7. Attachment Deletion & Audit Trail
# ---------------------------------------------------------------------------


class TestAttachmentDeletion:
    """Test attachment deletion, RBAC checks, and audit logging."""

    @pytest.mark.asyncio
    async def test_delete_attachment_by_owner(self, client):
        incident_id, token = await _create_test_incident(client)
        headers = {"Authorization": f"Bearer {token}"}

        # Upload
        up_resp = await client.post(
            f"/api/incidents/{incident_id}/attachments",
            files={"file": ("remove_me.jpg", MINIMAL_JPEG, "image/jpeg")},
            headers=headers,
        )
        att_id = up_resp.json()["data"]["id"]

        # Delete
        del_resp = await client.delete(
            f"/api/incidents/{incident_id}/attachments/{att_id}",
            headers=headers,
        )
        assert del_resp.status_code == 200
        assert del_resp.json()["success"] is True

        # Verify not in list
        list_resp = await client.get(
            f"/api/incidents/{incident_id}/attachments",
            headers=headers,
        )
        assert list_resp.json()["count"] == 0

        # Verify ATTACHMENT_DELETED event logged in incident
        inc_resp = await client.get(f"/api/incidents/{incident_id}", headers=headers)
        events = inc_resp.json()["data"]["events"]
        event_types = [e["event_type"] for e in events]
        assert "ATTACHMENT_ADDED" in event_types
        assert "ATTACHMENT_DELETED" in event_types

    @pytest.mark.asyncio
    async def test_non_owner_cannot_delete_attachment(self, client):
        payload_b = {
            **SAMPLE_INCIDENT,
            "description": "Distinct Incident B on Rashbehari Avenue",
            "latitude": 22.5180,
        }
        inc_a, token_a = await _create_test_incident(client, reporter_user_id="cit-alice-1")
        inc_b, token_b = await _create_test_incident(
            client, custom_payload=payload_b, reporter_user_id="cit-bob-2"
        )

        # Citizen A uploads
        up_resp = await client.post(
            f"/api/incidents/{inc_a}/attachments",
            files={"file": ("photo.jpg", MINIMAL_JPEG, "image/jpeg")},
            headers={"Authorization": f"Bearer {token_a}"},
        )
        att_id = up_resp.json()["data"]["id"]

        # Citizen B attempts to delete Citizen A's attachment
        del_resp = await client.delete(
            f"/api/incidents/{inc_a}/attachments/{att_id}",
            headers={"Authorization": f"Bearer {token_b}"},
        )
        assert del_resp.status_code == 403


# ---------------------------------------------------------------------------
# 8. Local File Serving & Traversal Security
# ---------------------------------------------------------------------------


class TestLocalFileServing:
    """Test raw local file delivery endpoint and path traversal prevention."""

    @pytest.mark.asyncio
    async def test_serve_raw_file(self, client):
        incident_id, token = await _create_test_incident(client)
        headers = {"Authorization": f"Bearer {token}"}

        up_resp = await client.post(
            f"/api/incidents/{incident_id}/attachments",
            files={"file": ("test_render.png", MINIMAL_PNG, "image/png")},
            headers=headers,
        )
        url = up_resp.json()["data"]["url"]

        # Fetch image bytes from raw serving route
        raw_resp = await client.get(url)
        assert raw_resp.status_code == 200
        assert raw_resp.headers["content-type"] == "image/png"
        assert raw_resp.content == MINIMAL_PNG

    @pytest.mark.asyncio
    async def test_path_traversal_blocked(self, client):
        resp = await client.get("/api/attachments/raw/../../etc/passwd")
        assert resp.status_code in (400, 404)


# ---------------------------------------------------------------------------
# 9. Deduplication Check
# ---------------------------------------------------------------------------


class TestAttachmentDeduplication:
    """Test that identical file uploads on the same incident return existing record."""

    @pytest.mark.asyncio
    async def test_duplicate_upload_deduplicated(self, client):
        incident_id, token = await _create_test_incident(client)
        headers = {"Authorization": f"Bearer {token}"}

        # Upload once
        resp1 = await client.post(
            f"/api/incidents/{incident_id}/attachments",
            files={"file": ("duplicate.jpg", MINIMAL_JPEG, "image/jpeg")},
            headers=headers,
        )
        att1 = resp1.json()["data"]

        # Upload second time with same binary
        resp2 = await client.post(
            f"/api/incidents/{incident_id}/attachments",
            files={"file": ("duplicate.jpg", MINIMAL_JPEG, "image/jpeg")},
            headers=headers,
        )
        att2 = resp2.json()["data"]

        assert att1["id"] == att2["id"]
        assert att1["checksum"] == att2["checksum"]

        # Total count remains 1
        list_resp = await client.get(
            f"/api/incidents/{incident_id}/attachments",
            headers=headers,
        )
        assert list_resp.json()["count"] == 1


# ---------------------------------------------------------------------------
# 10. Rate Limiting & Burst Protection
# ---------------------------------------------------------------------------


class TestRateLimiting:
    """Test rate limiting against rapid burst uploads."""

    @pytest.mark.asyncio
    async def test_rate_limit_burst_rejected(self, client):
        incident_id, token = await _create_test_incident(client)
        headers = {"Authorization": f"Bearer {token}"}

        # Configure small limit for this test
        limiter = AttachmentRateLimiter.get_instance()
        limiter.max_requests = 2
        limiter.window_seconds = 30
        limiter._history.clear()

        # Upload 1 -> 201
        r1 = await client.post(
            f"/api/incidents/{incident_id}/attachments",
            files={"file": ("b1.png", MINIMAL_PNG + b"\x01", "image/png")},
            headers=headers,
        )
        assert r1.status_code == 201

        # Upload 2 -> 201
        r2 = await client.post(
            f"/api/incidents/{incident_id}/attachments",
            files={"file": ("b2.png", MINIMAL_PNG + b"\x02", "image/png")},
            headers=headers,
        )
        assert r2.status_code == 201

        # Upload 3 -> Rate limit exceeded 429
        r3 = await client.post(
            f"/api/incidents/{incident_id}/attachments",
            files={"file": ("b3.png", MINIMAL_PNG + b"\x03", "image/png")},
            headers=headers,
        )
        assert r3.status_code == 429
        assert r3.json()["detail"]["error"]["code"] == "RATE_LIMIT_EXCEEDED"
        assert "Retry-After" in r3.headers

        # Reset limiter to default
        limiter.max_requests = 10
        limiter.window_seconds = 60
        limiter._history.clear()


# ---------------------------------------------------------------------------
# 11. Compensating Cleanup & Storage Rollback
# ---------------------------------------------------------------------------


class TestCompensatingCleanup:
    """Test that storage upload is compensated and deleted if DB persistence fails."""

    @pytest.mark.asyncio
    async def test_compensating_delete_on_db_insert_failure(self):
        db = await get_database()
        incident_id = str(uuid.uuid4())

        # Seed incident
        await db.execute(
            """
            INSERT INTO incidents (
                id, ticket_id, type, severity, description,
                latitude, longitude, created_at, updated_at
            )
            VALUES (?, 'SV-ROLLBACK-1', 'flood', 'HIGH', 'Test Rollback',
                    22.5, 88.3, '2026-08-28T00:00:00Z', '2026-08-28T00:00:00Z')
            """,
            (incident_id,),
        )
        await db.commit()

        # Mock storage provider with proper sync/async separation
        from app.storage.base import StorageUploadResult

        class MockStorageProvider:
            def __init__(self):
                self.deleted_keys = []

            async def upload(self, *args, **kwargs):
                return StorageUploadResult(
                    storage_key="test_folder/orphan_key.jpg",
                    secure_url="https://cdn.example.com/orphan_key.jpg",
                    size_bytes=len(MINIMAL_JPEG),
                    mime_type="image/jpeg",
                    checksum="fakechecksum123",
                    width=1,
                    height=1,
                )

            def get_transformed_url(self, *args, **kwargs):
                return "https://cdn.example.com/thumb.jpg"

            async def delete(self, storage_key: str):
                self.deleted_keys.append(storage_key)
                return True

        mock_provider = MockStorageProvider()

        # Patch db.execute to fail during INSERT INTO incident_attachments
        original_execute = db.execute

        async def failing_execute(query, *args, **kwargs):
            if "INSERT INTO incident_attachments" in query:
                raise RuntimeError("Simulated SQLite Disk Failure")
            return await original_execute(query, *args, **kwargs)

        with patch.object(db, "execute", side_effect=failing_execute):
            with pytest.raises(RuntimeError) as exc_info:
                await attachment_service.create_attachment(
                    db=db,
                    incident_id=incident_id,
                    file_bytes=MINIMAL_JPEG,
                    filename="photo.jpg",
                    storage_provider=mock_provider,
                )
            assert "Simulated SQLite Disk Failure" in str(exc_info.value)

        # Verify compensating delete was called
        assert mock_provider.deleted_keys == ["test_folder/orphan_key.jpg"]


# ---------------------------------------------------------------------------
# 12. Cloudinary Provider Unit & Mock Tests
# ---------------------------------------------------------------------------


class TestCloudinaryProvider:
    """Test CloudinaryStorageProvider upload, timeout, error handling, and transformations."""

    @pytest.mark.asyncio
    async def test_cloudinary_upload_success(self):
        provider = CloudinaryStorageProvider(
            cloud_name="demo-cloud",
            api_key="123456",
            api_secret="secret789",
        )

        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = {
            "public_id": "salvus_incidents/inc-1/evidence_photo",
            "secure_url": (
                "https://res.cloudinary.com/demo-cloud/image/upload/v1/"
                "salvus_incidents/inc-1/evidence_photo.jpg"
            ),
            "width": 800,
            "height": 600,
        }

        async def mock_post_ok(*args, **kwargs):
            return mock_response

        with patch("httpx.AsyncClient.post", new=mock_post_ok):
            result = await provider.upload(
                file_bytes=MINIMAL_JPEG,
                filename="photo.jpg",
                mime_type="image/jpeg",
                folder="salvus_incidents/inc-1",
            )

        assert result.storage_key == "salvus_incidents/inc-1/evidence_photo"
        assert "demo-cloud" in result.secure_url
        assert result.thumbnail_url is not None
        assert "c_fill,g_auto,w_400,h_300" in result.thumbnail_url

    @pytest.mark.asyncio
    async def test_cloudinary_upload_timeout(self):
        provider = CloudinaryStorageProvider(
            cloud_name="demo-cloud",
            api_key="123456",
            api_secret="secret789",
        )

        async def mock_post_timeout(*args, **kwargs):
            raise httpx.TimeoutException("Timed out")

        with patch("httpx.AsyncClient.post", new=mock_post_timeout):
            with pytest.raises(RuntimeError) as exc:
                await provider.upload(
                    file_bytes=MINIMAL_JPEG,
                    filename="photo.jpg",
                    mime_type="image/jpeg",
                )
            assert "timed out" in str(exc.value).lower()

    @pytest.mark.asyncio
    async def test_cloudinary_upload_http_error(self):
        provider = CloudinaryStorageProvider(
            cloud_name="demo-cloud",
            api_key="123456",
            api_secret="secret789",
        )

        mock_response = MagicMock()
        mock_response.status_code = 401
        mock_response.text = "Invalid Signature"

        async def mock_post_error(*args, **kwargs):
            return mock_response

        with patch("httpx.AsyncClient.post", new=mock_post_error):
            with pytest.raises(RuntimeError) as exc:
                await provider.upload(
                    file_bytes=MINIMAL_JPEG,
                    filename="photo.jpg",
                    mime_type="image/jpeg",
                )
            assert "Cloudinary upload failed (HTTP 401)" in str(exc.value)

    def test_cloudinary_transformed_urls(self):
        provider = CloudinaryStorageProvider(cloud_name="salvus-cloud")
        thumb = provider.get_transformed_url("evidence_key", width=400, height=300, crop="fill")
        assert thumb == (
            "https://res.cloudinary.com/salvus-cloud/image/upload/"
            "c_fill,g_auto,w_400,h_300,q_auto,f_auto/evidence_key"
        )


# ---------------------------------------------------------------------------
# 13. AI-Vision Readiness Contract & Invariants
# ---------------------------------------------------------------------------


class TestAIVisionReadiness:
    """Test normalized AI-Vision schema, disclaimer assertions, and decision support guarantees."""

    def test_ai_vision_assessment_model_defaults(self):
        assessment = AIVisionAssessment(
            hazard_type="flood",
            observations=[
                AIVisionObservation(
                    category="water_depth",
                    description="Water submerged road up to vehicle tire line",
                    confidence=0.85,
                )
            ],
            water_depth_estimate="0.4m - 0.7m",
            damage_severity_hint="HIGH",
            confidence=0.88,
        )

        assert assessment.hazard_detected is True
        assert assessment.hazard_type == "flood"
        assert len(assessment.observations) == 1
        assert assessment.disclaimer == "AI ESTIMATE — UNVERIFIED DECISION SUPPORT ONLY"
        assert assessment.confidence == 0.88

    def test_vision_service_unverified_assessment_factory(self):
        assessment = VisionService.create_unverified_assessment(
            hazard_type="fire",
            observations=[
                {"category": "smoke", "description": "Dark plumes visible", "confidence": 0.9}
            ],
            confidence=0.92,
            uncertainty_flags=["HIGH_SMOKE_OCCLUSION"],
        )

        assert assessment.hazard_type == "fire"
        assert assessment.confidence == 0.92
        assert "HIGH_SMOKE_OCCLUSION" in assessment.uncertainty_flags
        assert "UNVERIFIED" in assessment.disclaimer
        assert assessment.analyzed_at is not None

    @pytest.mark.asyncio
    async def test_vision_service_contract_consumption(self):
        assessment = await VisionService.analyze_incident_attachment_contract(
            attachment_id="att-test-123",
            storage_key="salvus_incidents/test_key.jpg",
            incident_type="structural",
        )

        assert assessment.hazard_type == "structural"
        assert "AWAITING_HUMAN_TRIAGE" in assessment.uncertainty_flags
        assert assessment.disclaimer == "AI ESTIMATE — UNVERIFIED DECISION SUPPORT ONLY"
