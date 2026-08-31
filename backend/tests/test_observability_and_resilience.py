"""Comprehensive test suite for Observability, Request Correlation,
Error Taxonomy, and Resilience Guarantees.
"""

from __future__ import annotations

import pytest
from httpx import ASGITransport, AsyncClient

from app.logging.structured_logger import (
    log_assignment_event,
    log_incident_event,
    log_resilience_event,
    sanitize_telemetry_dict,
)
from app.main import app


@pytest.mark.asyncio
async def test_correlation_id_auto_generated():
    """Verify that requests without X-Request-ID receive a generated correlation ID."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.get("/api/health")
        assert response.status_code == 200
        req_id = response.headers.get("X-Request-ID")
        assert req_id is not None
        assert req_id.startswith("req-")


@pytest.mark.asyncio
async def test_correlation_id_passthrough():
    """Verify that custom client-provided X-Request-ID is preserved and echoed."""
    custom_id = "req-client-trace-999888"
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.get("/api/health", headers={"X-Request-ID": custom_id})
        assert response.status_code == 200
        assert response.headers.get("X-Request-ID") == custom_id


@pytest.mark.asyncio
async def test_health_probe_components_structure():
    """Verify that /api/health returns detailed component health and timestamp."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.get("/api/health")
        assert response.status_code == 200
        data = response.json()
        assert data["status"] in ("healthy", "degraded")
        assert "components" in data
        assert "database" in data["components"]
        assert "ai_waterfall" in data["components"]
        assert "realtime_hub" in data["components"]
        assert "timestamp" in data


@pytest.mark.asyncio
async def test_structured_error_response_on_not_found():
    """Verify that 404 errors adhere to the structured Salvus error taxonomy."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.get("/api/incidents/nonexistent-incident-id-99999")
        assert response.status_code == 404
        data = response.json()
        assert data["success"] is False
        assert "error" in data
        assert data["error"]["code"] in ("NOT_FOUND", "INCIDENT_NOT_FOUND")
        assert "message" in data["error"]
        assert "request_id" in data
        assert data["request_id"].startswith("req-")
        assert data["error"]["retryable"] is False


@pytest.mark.asyncio
async def test_fallback_not_found_on_unknown_route():
    """Verify unhandled route 404 infers default NOT_FOUND code with correlation ID."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.get("/api/completely-undefined-route-xyz")
        assert response.status_code == 404
        data = response.json()
        assert data["success"] is False
        assert data["error"]["code"] == "NOT_FOUND"
        assert "request_id" in data


@pytest.mark.asyncio
async def test_structured_error_response_on_validation_error():
    """Verify that 422 validation errors are normalized with taxonomy code and correlation ID."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # Send empty/invalid payload to create incident
        response = await client.post("/api/incidents", json={})
        assert response.status_code == 422
        data = response.json()
        assert data["success"] is False
        assert data["error"]["code"] == "VALIDATION_ERROR"
        assert "message" in data["error"]
        assert "details" in data["error"]
        assert "request_id" in data
        assert data["request_id"].startswith("req-")


@pytest.mark.asyncio
async def test_structured_error_on_auth_failure():
    """Verify that unauthorized requests return standard AUTH_ERROR or UNAUTHORIZED code."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.get("/api/auth/me")
        assert response.status_code == 401
        data = response.json()
        assert data["success"] is False
        assert data["error"]["code"] in ("AUTH_ERROR", "UNAUTHORIZED")
        assert "request_id" in data


def test_sanitize_telemetry_dict():
    """Verify that sensitive authentication credentials and PII are redacted from log dicts."""
    raw = {
        "api_key": "secret_gemini_key_12345",
        "bearer_token": "jwt.eyJhbGciOi...",
        "user_password": "supersecretpassword",
        "phone_number": "+919876543210",
        "citizen_name": "Pritesh",
        "incident_type": "FLOOD",
        "nested": {
            "auth_secret": "my_db_secret",
            "safe_counter": 42,
        },
    }

    sanitized = sanitize_telemetry_dict(raw)
    assert sanitized["api_key"] == "[REDACTED]"
    assert sanitized["bearer_token"] == "[REDACTED]"
    assert sanitized["user_password"] == "[REDACTED]"
    assert sanitized["phone_number"] == "[REDACTED]"
    assert sanitized["citizen_name"] == "Pritesh"
    assert sanitized["incident_type"] == "FLOOD"
    assert sanitized["nested"]["auth_secret"] == "[REDACTED]"
    assert sanitized["nested"]["safe_counter"] == 42


def test_structured_event_loggers(caplog):
    """Verify structured logging functions format JSON records without exception."""
    with caplog.at_level("INFO"):
        log_incident_event(
            incident_id="inc-100",
            action="STATUS_TRANSITION",
            actor="authority_1",
            status="VERIFIED",
            details={"notes": "Visual verification confirmed"},
            request_id="req-test-123",
        )
        log_assignment_event(
            assignment_id="asg-200",
            incident_id="inc-100",
            responder_id="resp-1",
            action="DISPATCH",
            actor="system_auto",
            success=True,
            request_id="req-test-123",
        )
        log_resilience_event(
            component="realtime_hub",
            event_type="RECONNECT_RECOVERY",
            status="RECOVERED",
            details={"recovered_rooms": 3},
            request_id="req-test-123",
        )

    records = [r.message for r in caplog.records]
    assert any("INCIDENT_LIFECYCLE:" in msg for msg in records)
    assert any("ASSIGNMENT_EVENT:" in msg for msg in records)
    assert any("RESILIENCE_EVENT:" in msg for msg in records)
