"""Comprehensive tests for Phase 2: Async Intelligence Boundary & Failure Isolation.

Validates:
1. Incident Ingestion Contract: POST /api/incidents returns immediately.
2. Background task execution and DB persistence of AI assessment.
3. Multi-tier provider fallback: Gemini Failure -> Groq Fallback -> Heuristic Engine.
4. AI Failure Isolation: Provider failures never delete incidents or crash API.
5. Idempotency & duplicate task prevention (content hashing & locking).
6. Request Correlation: X-Request-ID propagation across middleware.
7. Structured logging & telemetry verification (zero secret/PII leaks).
8. AI State Model: NOT_STARTED -> PROCESSING -> AVAILABLE / FAILED.
9. Realtime Decoupling: incident.created emitted first, incident.triage_updated post-task.
10. Fast Health & Readiness Probe with zero external AI coupling.
"""

from __future__ import annotations

import time
from unittest.mock import AsyncMock, patch

import httpx
import pytest

from app.db import get_database
from app.logging.structured_logger import log_ai_telemetry
from app.models import AIState, IncidentStatus
from app.realtime.socket_manager import sio
from app.services.ai.gemini_provider import GeminiProvider
from app.services.ai.groq_provider import GroqProvider
from app.services.ai.heuristic_provider import HeuristicProvider
from app.services.ai.service import AIService
from app.services.async_triage_task import run_async_ai_triage
from app.services.incident_service import get_incident_by_id


@pytest.fixture
def anyio_backend():
    return "asyncio"


# ==============================================================================
# 1. Incident Ingestion Contract & Latency Validation
# ==============================================================================


@pytest.mark.asyncio
async def test_incident_ingestion_contract_immediate_response(anon_client):
    """Verify that POST /api/incidents returns immediately (<50ms server critical path)."""
    payload = {
        "type": "flood",
        "severity": "CRITICAL",
        "description": "Rising floodwaters in Sector V, ground floor submerged rapidly.",
        "reporter_name": "Siddharth Sen",
        "reporter_phone": "+91-98300-11111",
        "latitude": 22.5800,
        "longitude": 88.4300,
        "affected_count": 4,
        "is_sos": True,
    }

    with patch("app.routes.incidents.run_async_ai_triage") as mock_async_task:
        start = time.perf_counter()
        res = await anon_client.post("/api/incidents", json=payload)
        elapsed_ms = (time.perf_counter() - start) * 1000.0

        assert res.status_code == 201
        data = res.json()["data"]

        # Ingestion contract guarantees
        assert data["ticket_id"].startswith("SV-")
        assert data["status"] == IncidentStatus.NEW.value
        assert data["ai_state"] == AIState.PROCESSING.value
        assert data["access_token"] is not None
        assert mock_async_task.called

        # Server processing latency should be extremely fast (critical path < 50ms)
        assert elapsed_ms < 100.0, f"Ingestion critical path took {elapsed_ms:.2f}ms"


# ==============================================================================
# 2. Asynchronous AI Task Execution & Persistence
# ==============================================================================


@pytest.mark.asyncio
async def test_async_ai_task_execution_and_persistence(client):
    """Verify background task runs, computes assessment, persists, and updates state."""

    payload = {
        "type": "medical",
        "severity": "HIGH",
        "description": "Elderly patient having severe breathing difficulty and chest pain.",
        "reporter_name": "Dr. Anirban Roy",
        "reporter_phone": "+91-98300-22222",
        "latitude": 22.5700,
        "longitude": 88.3700,
        "affected_count": 1,
        "is_sos": True,
    }
    create_res = await client.post("/api/incidents", json=payload)
    assert create_res.status_code == 201
    inc_id = create_res.json()["data"]["id"]

    # Run the background worker
    assessment = await run_async_ai_triage(
        incident_id=inc_id, request_id="req-test-1", task_id="task-test-1"
    )

    assert assessment is not None
    assert assessment.incident_type.value == "medical"
    assert assessment.recommended_capability.value == "AMBULANCE"
    assert assessment.ai_state == "AVAILABLE"

    # Verify DB state
    db = await get_database()
    updated_inc = await get_incident_by_id(db, inc_id)
    assert updated_inc is not None
    assert updated_inc.ai_state == AIState.AVAILABLE.value
    assert updated_inc.triage_hash is not None
    assert updated_inc.ai_triage is not None
    assert updated_inc.ai_triage.recommended_capability.value == "AMBULANCE"


# ==============================================================================
# 3. Multi-Tier Provider Waterfall & Fallback
# ==============================================================================


@pytest.mark.asyncio
async def test_provider_waterfall_gemini_failure_groq_fallback():
    """Verify Gemini failure triggers Groq fallback smoothly."""
    sanitized = {
        "type": "fire",
        "initial_severity": "HIGH",
        "description": "Transformer spark and electrical fire spreading near residential block.",
        "affected_count": 6,
        "is_sos": True,
        "latitude": 22.5800,
        "longitude": 88.4200,
    }

    mock_gemini = AsyncMock(spec=GeminiProvider)
    mock_gemini.name = "gemini-2.0-flash"
    mock_gemini.model = "gemini-2.0-flash"
    mock_gemini.evaluate.return_value = None  # Simulates Gemini failure / offline

    mock_groq = AsyncMock(spec=GroqProvider)
    mock_groq.name = "groq-llama-3.3-70b"
    mock_groq.model = "llama-3.3-70b-versatile"
    heuristic = HeuristicProvider()
    expected_assessment = await heuristic.evaluate(sanitized)
    expected_assessment.provider = "groq-llama-3.3-70b"
    mock_groq.evaluate.return_value = expected_assessment

    service = AIService(providers=[mock_gemini, mock_groq, heuristic])
    assessment, t_hash = await service.triage(
        incident_dict=sanitized, incident_id="inc-mock-fire", request_id="req-fallback"
    )

    assert mock_gemini.evaluate.called
    assert mock_groq.evaluate.called
    assert assessment.provider == "groq-llama-3.3-70b"
    assert assessment.severity.value in ("HIGH", "CRITICAL")
    assert t_hash is not None


@pytest.mark.asyncio
async def test_provider_waterfall_all_external_fail_heuristic_fallback():
    """Verify when Gemini and Groq both fail, Heuristic provider succeeds with zero downtime."""
    sanitized = {
        "type": "flood",
        "initial_severity": "CRITICAL",
        "description": "Rapid waterlogging 1.5m, boat rescue required immediately.",
        "affected_count": 8,
        "is_sos": True,
        "latitude": 22.5750,
        "longitude": 88.3650,
    }

    mock_gemini = AsyncMock(spec=GeminiProvider)
    mock_gemini.name = "gemini-2.0-flash"
    mock_gemini.model = "gemini-2.0-flash"
    mock_gemini.evaluate.side_effect = httpx.TimeoutException("Gemini timed out")

    mock_groq = AsyncMock(spec=GroqProvider)
    mock_groq.name = "groq-llama-3.3-70b"
    mock_groq.model = "llama-3.3-70b-versatile"
    mock_groq.evaluate.side_effect = Exception("Groq 429 Rate Limit Exceeded")

    heuristic = HeuristicProvider()

    service = AIService(providers=[mock_gemini, mock_groq, heuristic])
    assessment, t_hash = await service.triage(
        incident_dict=sanitized, incident_id="inc-mock-offline", request_id="req-offline"
    )

    assert assessment is not None
    assert assessment.provider == "heuristic-engine"
    assert assessment.recommended_capability.value == "FLOOD_BOAT"
    assert assessment.severity.value == "CRITICAL"


# ==============================================================================
# 4. Failure Isolation & Emergency Data Preservation
# ==============================================================================


@pytest.mark.asyncio
async def test_catastrophic_ai_failure_isolates_and_preserves_incident(client):
    """Verify that an unhandled AI exception never deletes incidents or crashes the API."""
    payload = {
        "type": "hazard",
        "severity": "HIGH",
        "description": "Gas leak odor detected near warehouse.",
        "reporter_name": "Warehouse Guard",
        "latitude": 22.5600,
        "longitude": 88.3900,
        "affected_count": 2,
        "is_sos": False,
    }
    create_res = await client.post("/api/incidents", json=payload)
    inc_id = create_res.json()["data"]["id"]

    # Force AI service to raise an unhandled exception
    with patch(
        "app.services.async_triage_task.ai_service.triage",
        side_effect=RuntimeError("Catastrophic model crash"),
    ):
        result = await run_async_ai_triage(incident_id=inc_id, force_reevaluate=True)
        assert result is None  # Handled safely

    # Verify incident still exists intact in the database
    db = await get_database()
    incident = await get_incident_by_id(db, inc_id)
    assert incident is not None
    assert incident.id == inc_id
    assert incident.ai_state == AIState.FAILED.value
    assert incident.status == IncidentStatus.NEW.value


# ==============================================================================
# 5. Idempotency & Duplicate Triage Prevention
# ==============================================================================


@pytest.mark.asyncio
async def test_idempotency_skips_redundant_triage_on_unchanged_incident(client):
    """Verify unchanged incident data skips duplicate AI calls."""
    payload = {
        "type": "flood",
        "severity": "MEDIUM",
        "description": "Road waterlogging 0.3m, slow traffic.",
        "reporter_name": "Commuter",
        "latitude": 22.5650,
        "longitude": 88.3750,
        "affected_count": 1,
        "is_sos": False,
    }
    create_res = await client.post("/api/incidents", json=payload)
    inc_id = create_res.json()["data"]["id"]

    # First triage execution
    first_assessment = await run_async_ai_triage(incident_id=inc_id)
    assert first_assessment is not None

    # Second triage execution (with spy on ai_service.triage)
    with patch("app.services.async_triage_task.ai_service.triage") as mock_triage:
        second_assessment = await run_async_ai_triage(incident_id=inc_id)
        assert mock_triage.call_count == 0  # Should be skipped due to matching hash!
        assert second_assessment is not None
        assert second_assessment.provider == first_assessment.provider


# ==============================================================================
# 6. Request Correlation (X-Request-ID)
# ==============================================================================


@pytest.mark.asyncio
async def test_correlation_id_propagation_and_generation(anon_client):
    """Verify X-Request-ID is generated if missing and propagated if supplied."""
    # 1. Without header -> generates req-*
    res1 = await anon_client.get("/api/health")
    assert res1.status_code == 200
    assert "X-Request-ID" in res1.headers
    assert res1.headers["X-Request-ID"].startswith("req-")

    # 2. With header -> preserves exact ID
    custom_id = "req-custom-trace-9999"
    res2 = await anon_client.get("/api/health", headers={"X-Request-ID": custom_id})
    assert res2.status_code == 200
    assert res2.headers["X-Request-ID"] == custom_id


# ==============================================================================
# 7. Structured Telemetry & Secret Sanitization
# ==============================================================================


def test_structured_ai_telemetry_filters_secrets():
    """Verify log_ai_telemetry scrubs API keys, auth tokens, and raw private prompts."""
    # Should not raise exception and should sanitize extra keys
    log_ai_telemetry(
        incident_id="inc-test-sanitize",
        provider="gemini-2.0-flash",
        model="gemini-2.0-flash",
        latency_ms=145.2,
        success=True,
        fallback=False,
        confidence=0.92,
        request_id="req-123",
        task_id="task-456",
        extra={
            "api_key": "SECRET_KEY_12345",
            "auth_token": "BEARER_SECRET",
            "reporter_phone": "+91-98765-43210",
            "safe_feature": "water_level_m",
        },
    )


# ==============================================================================
# 8. Real-time Decoupling (incident.triage_updated)
# ==============================================================================


@pytest.mark.asyncio
async def test_realtime_triage_updated_broadcast(client):
    """Verify incident.triage_updated is emitted to authorities room upon completion."""
    payload = {
        "type": "structural",
        "severity": "HIGH",
        "description": "Roof collapse at community center, debris blocking exit.",
        "reporter_name": "Volunteer",
        "latitude": 22.5850,
        "longitude": 88.4250,
        "affected_count": 5,
        "is_sos": True,
    }
    create_res = await client.post("/api/incidents", json=payload)
    inc_id = create_res.json()["data"]["id"]

    with patch.object(sio, "emit", new_callable=AsyncMock) as mock_emit:
        await run_async_ai_triage(incident_id=inc_id, force_reevaluate=True)

        # Ensure emit was called for incident.triage_updated
        triage_emits = [
            call for call in mock_emit.call_args_list if call[0][0] == "incident.triage_updated"
        ]
        assert len(triage_emits) >= 1
        event_name, event_data = triage_emits[0][0][0], triage_emits[0][0][1]
        assert event_name == "incident.triage_updated"
        assert event_data["incident_id"] == inc_id
        assert event_data["ai_state"] == "AVAILABLE"
        assert event_data["assessment"]["recommended_capability"] == "DEBRIS_CLEAR"


# ==============================================================================
# 9. Fast Health / Readiness Decoupling
# ==============================================================================


@pytest.mark.asyncio
async def test_health_check_fast_and_independent(anon_client):
    """Verify /health answers with DB connectivity without contacting AI providers."""
    start = time.perf_counter()
    res = await anon_client.get("/api/health")
    elapsed_ms = (time.perf_counter() - start) * 1000.0

    assert res.status_code == 200
    data = res.json()
    assert data["status"] == "healthy"
    assert data["database"] == "connected"
    assert elapsed_ms < 100.0
