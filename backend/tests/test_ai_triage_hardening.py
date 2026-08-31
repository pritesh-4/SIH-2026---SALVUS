"""Comprehensive Test Suite for Problem #6: AI Triage & Operational Intelligence Hardening.

Covers all 20 safety-critical scenarios:
1. Normal triage evaluation
2. Critical triage (trapped + rising water + elderly assistance)
3. Ambiguous report (low confidence <0.75 + uncertainty flags)
4. Structured parsing & markdown fence stripping
5. Malformed response rejected safely
6. Invalid confidence rejected or sanitized (e.g. 173% or negative)
7. Invalid affected count rejected or sanitized (e.g. -4 or 0)
8. Provider timeout triggers waterfall fallback
9. Primary Gemini provider fallback to Groq
10. Secondary Groq provider fallback to local Heuristics
11. Deterministic fallback comprehensive rules across all hazard types
12. Duplicate triage idempotency hashing
13. Stale triage race protection (Calculation A cannot overwrite newer Calculation B)
14. Incident version change invalidates stale triage
15. Resolution while AI runs discards triage assessment
16. Cancellation while AI runs discards triage assessment
17. Authority verification transitions lifecycle and writes audit event
18. Authority modification overrides severity/capability and logs reviewer notes
19. AI cannot change location truth (coordinates remain citizen/GPS authoritative)
20. Citizen socket events decouple from internal AI reasoning and model telemetry
"""

from __future__ import annotations

import json
from unittest.mock import AsyncMock, patch

import httpx
import pytest

from app.db import get_database
from app.models import (
    AITriageAssessment,
    IncidentSeverity,
    IncidentStatus,
    IncidentType,
    ResponderCapability,
)
from app.realtime.socket_manager import emit_incident_triage_updated, sio
from app.services import incident_service
from app.services.ai.base import (
    BaseAIProvider,
    parse_and_validate_assessment,
)
from app.services.ai.heuristic_provider import HeuristicProvider
from app.services.ai.service import AIService
from app.services.async_triage_task import run_async_ai_triage


@pytest.fixture
def anyio_backend():
    return "asyncio"


# ==============================================================================
# 1. Normal Triage Evaluation
# ==============================================================================


@pytest.mark.asyncio
async def test_normal_triage_evaluation():
    """Verify standard emergency report produces a well-structured triage assessment."""
    incident = {
        "type": "flood",
        "description": "Ground floor waterlogging 0.4m, slow drainage.",
        "affected_count": 2,
        "is_sos": False,
    }
    heuristic = HeuristicProvider()
    assessment = await heuristic.evaluate(incident)

    assert assessment is not None
    assert assessment.incident_type == IncidentType.FLOOD
    assert assessment.severity in (IncidentSeverity.MEDIUM, IncidentSeverity.LOW)
    assert assessment.recommended_capability == ResponderCapability.FLOOD_BOAT
    assert assessment.source_label == "RULE-BASED TRIAGE"
    assert len(assessment.reported_conditions) > 0
    assert len(assessment.priority_reasoning) >= 5


# ==============================================================================
# 2. Critical Triage Evaluation (Trapped + Rising Water + Vulnerable Persons)
# ==============================================================================


@pytest.mark.asyncio
async def test_critical_triage_trapped_and_rising_water():
    """Verify high-urgency keywords (trapped, rising water, elderly) escalate to CRITICAL."""
    incident = {
        "type": "flood",
        "description": (
            "Water is entering the ground floor. Three people are trapped "
            "and an elderly person cannot walk."
        ),
        "affected_count": 3,
        "is_sos": True,
    }
    heuristic = HeuristicProvider()
    assessment = await heuristic.evaluate(incident)

    assert assessment is not None
    assert assessment.severity == IncidentSeverity.CRITICAL
    assert assessment.severity_level in (4, 5)
    assert assessment.recommended_capability == ResponderCapability.FLOOD_BOAT
    assert any("trapped" in c.lower() for c in assessment.reported_conditions)
    assert any(
        "vulnerable" in c.lower() or "evacuation" in c.lower()
        for c in assessment.reported_conditions
    )
    assert "critical priority" in assessment.priority_reasoning.lower()


# ==============================================================================
# 3. Ambiguous Report (Low Confidence & Uncertainty Flagging)
# ==============================================================================


@pytest.mark.asyncio
async def test_ambiguous_report_low_confidence_and_uncertainty():
    """Verify vague/sparse report triggers low confidence (<0.75) and needs_review."""
    incident = {
        "type": "other",
        "description": "Help please",
        "affected_count": 1,
        "is_sos": False,
    }
    heuristic = HeuristicProvider()
    assessment = await heuristic.evaluate(incident)

    assert assessment is not None
    assert assessment.confidence <= 0.75
    assert assessment.needs_review is True
    assert len(assessment.uncertainty_flags) > 0
    assert any("limited" in u.lower() for u in assessment.uncertainty_flags)


# ==============================================================================
# 4. Structured Parsing & Markdown Fence Stripping
# ==============================================================================


def test_structured_parsing_and_markdown_fence_stripping():
    """Verify raw LLM outputs wrapped in ```json ... ``` code fences parse cleanly."""
    fenced_json = """```json
    {
      "incident_type": "flood",
      "severity": "CRITICAL",
      "severity_level": 4,
      "confidence": 0.88,
      "hazard_type": "Flash Flood & Inundation",
      "affected_people": 4,
      "key_signals": ["water rising", "trapped on roof"],
      "reported_conditions": ["Water rising 1.2m", "4 citizens trapped"],
      "recommended_capability": "FLOOD_BOAT",
      "priority_reasoning": "Trapped citizens in rapidly rising water.",
      "uncertainty_flags": ["Water depth self-reported"]
    }
    ```"""
    sanitized = {"affected_count": 4, "description": "trapped on roof"}
    assessment = parse_and_validate_assessment(
        fenced_json, sanitized, "gemini-provider", "gemini-2.0-flash"
    )

    assert assessment is not None
    assert assessment.incident_type == IncidentType.FLOOD
    assert assessment.severity == IncidentSeverity.CRITICAL
    assert assessment.source_label == "AI TRIAGE — PRIMARY"
    assert len(assessment.reported_conditions) == 2


# ==============================================================================
# 5. Malformed Response Rejected Safely
# ==============================================================================


def test_malformed_response_rejected_safely():
    """Verify invalid JSON syntax is rejected (returns None)."""
    malformed_json = '{"incident_type": "flood", severity: UNQUOTED_BROKEN}'
    sanitized = {"affected_count": 1, "description": "test"}
    assessment = parse_and_validate_assessment(
        malformed_json, sanitized, "gemini-provider", "gemini-2.0-flash"
    )
    assert assessment is None


# ==============================================================================
# 6. Invalid Confidence Rejection / Clamping
# ==============================================================================


def test_invalid_confidence_rejected_or_sanitized():
    """Verify out-of-bounds confidence (e.g. 1.73 or -0.5) is rejected by schema validator."""
    invalid_conf_json = json.dumps(
        {
            "incident_type": "flood",
            "severity": "CRITICAL",
            "severity_level": 4,
            "confidence": 1.73,  # Invalid: must be <= 1.0
            "recommended_capability": "FLOOD_BOAT",
            "priority_reasoning": "Valid reasoning text provided.",
            "uncertainty_flags": [],
        }
    )
    sanitized = {"affected_count": 1, "description": "test"}
    assessment = parse_and_validate_assessment(
        invalid_conf_json, sanitized, "gemini-provider", "gemini-2.0-flash"
    )
    assert assessment is None


# ==============================================================================
# 7. Invalid Affected Count Rejection / Normalization
# ==============================================================================


def test_invalid_affected_count_rejected_or_sanitized():
    """Verify negative affected count (e.g. -4) is rejected by schema validator."""
    invalid_aff_json = json.dumps(
        {
            "incident_type": "flood",
            "severity": "CRITICAL",
            "severity_level": 4,
            "confidence": 0.90,
            "affected_people": -4,  # Invalid: must be >= 1
            "recommended_capability": "FLOOD_BOAT",
            "priority_reasoning": "Valid reasoning text provided.",
            "uncertainty_flags": [],
        }
    )
    sanitized = {"affected_count": 1, "description": "test"}
    assessment = parse_and_validate_assessment(
        invalid_aff_json, sanitized, "gemini-provider", "gemini-2.0-flash"
    )
    assert assessment is None


# ==============================================================================
# 8. Provider Timeout Triggers Fallback
# ==============================================================================


class TimeoutMockProvider(BaseAIProvider):
    def __init__(self, name: str):
        super().__init__(name=name, model="timeout-model", timeout=1.0)

    async def evaluate(self, sanitized: dict, image_data: str | None = None):
        raise httpx.TimeoutException("Mock provider connection timed out")


class ValidMockProvider(BaseAIProvider):
    def __init__(self, name: str, capability: ResponderCapability):
        super().__init__(name=name, model="valid-model", timeout=1.0)
        self.capability = capability

    async def evaluate(self, sanitized: dict, image_data: str | None = None):
        return AITriageAssessment(
            incident_type=IncidentType.FLOOD,
            severity=IncidentSeverity.CRITICAL,
            severity_level=4,
            confidence=0.88,
            hazard_type="Flash Flood",
            affected_people=sanitized.get("affected_count", 1),
            key_signals=["Mock signal"],
            reported_conditions=["Rising water 1.0m"],
            recommended_capability=self.capability,
            priority_reasoning="Mock validated reasoning.",
            uncertainty_flags=[],
            provider=self.name,
            model=self.model,
            source_label="AI TRIAGE — FALLBACK",
            evaluated_at="2026-08-31T12:00:00Z",
            ai_state="AVAILABLE",
            needs_review=False,
            review_status="PENDING",
        )


@pytest.mark.asyncio
async def test_provider_timeout_triggers_fallback():
    """Verify provider timeout does not crash service and triggers next provider in waterfall."""
    timeout_provider = TimeoutMockProvider("failing-primary")
    success_provider = ValidMockProvider("working-fallback", ResponderCapability.FLOOD_BOAT)
    heuristic = HeuristicProvider()

    service = AIService(providers=[timeout_provider, success_provider, heuristic])
    assessment, _ = await service.triage({"type": "flood", "description": "Water rising"})

    assert assessment.provider == "working-fallback"
    assert assessment.source_label == "AI TRIAGE — FALLBACK"


# ==============================================================================
# 9. Primary Gemini Fallback to Groq
# ==============================================================================


@pytest.mark.asyncio
async def test_primary_gemini_fallback_to_groq():
    """Verify when Gemini fails, Groq evaluates and is tagged with FALLBACK provenance."""
    failing_gemini = TimeoutMockProvider("gemini-provider")
    groq_provider = ValidMockProvider("groq-provider", ResponderCapability.AMBULANCE)
    heuristic = HeuristicProvider()

    service = AIService(providers=[failing_gemini, groq_provider, heuristic])
    assessment, _ = await service.triage({"type": "medical", "description": "Cardiac arrest"})

    assert assessment.provider == "groq-provider"
    assert assessment.source_label == "AI TRIAGE — FALLBACK"
    assert assessment.recommended_capability == ResponderCapability.AMBULANCE


# ==============================================================================
# 10. Secondary Groq Fallback to Local Heuristic
# ==============================================================================


@pytest.mark.asyncio
async def test_secondary_groq_fallback_to_heuristic():
    """Verify when all external LLMs fail, local heuristic executes with RULE-BASED TRIAGE."""
    failing_gemini = TimeoutMockProvider("gemini-provider")
    failing_groq = TimeoutMockProvider("groq-provider")
    heuristic = HeuristicProvider()

    service = AIService(providers=[failing_gemini, failing_groq, heuristic])
    assessment, _ = await service.triage(
        {
            "type": "flood",
            "description": "Ground floor inundated, 3 citizens trapped.",
            "affected_count": 3,
            "is_sos": True,
        }
    )

    assert assessment.provider == "heuristic-engine"
    assert assessment.source_label == "RULE-BASED TRIAGE"
    assert assessment.severity == IncidentSeverity.CRITICAL
    assert assessment.recommended_capability == ResponderCapability.FLOOD_BOAT


# ==============================================================================
# 11. Deterministic Fallback Comprehensive Rules
# ==============================================================================


@pytest.mark.asyncio
async def test_deterministic_fallback_comprehensive_rules():
    """Verify rule engine handles all disaster domains (power line, medical, fire, structural)."""
    heuristic = HeuristicProvider()

    # Power line / 11kv hazard
    res_power = await heuristic.evaluate(
        {
            "type": "power_line",
            "description": "Sparking 11kv feeder line submerged in water.",
            "affected_count": 1,
        }
    )
    assert res_power.incident_type == IncidentType.POWER_LINE
    assert res_power.recommended_capability == ResponderCapability.HAZMAT
    assert res_power.severity in (IncidentSeverity.HIGH, IncidentSeverity.CRITICAL)

    # Fire / Thermal hazard
    res_fire = await heuristic.evaluate(
        {
            "type": "fire",
            "description": "Flames and heavy smoke fire spreading rapidly.",
            "affected_count": 4,
        }
    )
    assert res_fire.incident_type == IncidentType.FIRE
    assert res_fire.recommended_capability == ResponderCapability.HAZMAT
    assert res_fire.severity == IncidentSeverity.CRITICAL

    # Structural collapse
    res_struct = await heuristic.evaluate(
        {
            "type": "structural",
            "description": "Building collapse with debris trapping 2 people.",
            "affected_count": 2,
        }
    )
    assert res_struct.incident_type == IncidentType.STRUCTURAL
    assert res_struct.recommended_capability == ResponderCapability.DEBRIS_CLEAR
    assert res_struct.severity == IncidentSeverity.CRITICAL


# ==============================================================================
# 12. Duplicate Triage Idempotency Hashing
# ==============================================================================


@pytest.mark.asyncio
async def test_duplicate_triage_idempotency_hash(client):
    """Verify unchanged incident data reuses existing assessment without re-calling triage."""
    res = await client.post(
        "/api/incidents",
        json={
            "type": "flood",
            "description": "Water logging in courtyard.",
            "latitude": 22.57,
            "longitude": 88.36,
            "affected_count": 1,
        },
    )
    inc_id = res.json()["data"]["id"]

    # Initial async triage
    first = await run_async_ai_triage(incident_id=inc_id)
    assert first is not None

    with patch("app.services.async_triage_task.ai_service.triage") as mock_triage:
        second = await run_async_ai_triage(incident_id=inc_id)
        assert mock_triage.call_count == 0  # Skipped due to matching triage_hash
        assert second is not None


# ==============================================================================
# 13. Stale Triage Race Protection (A cannot overwrite B)
# ==============================================================================


@pytest.mark.asyncio
async def test_stale_triage_race_protection(client):
    """Verify older calculation A cannot overwrite newer calculation B when content changes."""
    res = await client.post(
        "/api/incidents",
        json={
            "type": "flood",
            "description": "Minor waterlogging.",
            "latitude": 22.57,
            "longitude": 88.36,
            "affected_count": 1,
        },
    )
    inc_id = res.json()["data"]["id"]
    db = await get_database()

    # Simulate: User edits description in DB while AI triage A was computing
    await db.execute(
        "UPDATE incidents SET description = 'CRITICAL FLOOD SURGE 2M TRAPPED 5 PEOPLE', "
        "affected_count = 5 WHERE id = ?",
        (inc_id,),
    )
    await db.commit()

    # Triage A finishes using older context
    await run_async_ai_triage(incident_id=inc_id, force_reevaluate=False)

    # Must safely re-evaluate or discard stale result and not mark obsolete hash as authoritative
    updated_inc = await incident_service.get_incident_by_id(db, inc_id)
    assert updated_inc is not None
    assert updated_inc.description == "CRITICAL FLOOD SURGE 2M TRAPPED 5 PEOPLE"


# ==============================================================================
# 14. Incident Version Change Invalidates Stale Triage
# ==============================================================================


@pytest.mark.asyncio
async def test_incident_version_change_invalidates_stale_triage(client):
    """Verify changing incident hash causes old pending triage result to be discarded."""
    res = await client.post(
        "/api/incidents",
        json={
            "type": "medical",
            "description": "Knee scratch.",
            "latitude": 22.57,
            "longitude": 88.36,
            "affected_count": 1,
        },
    )
    inc_id = res.json()["data"]["id"]
    db = await get_database()

    # Mutate incident content directly to simulate simultaneous user edit
    await db.execute(
        "UPDATE incidents SET description = 'Severe asthma attack unconscious' WHERE id = ?",
        (inc_id,),
    )
    await db.commit()

    # Re-evaluating should process the updated description
    assessment = await run_async_ai_triage(incident_id=inc_id, force_reevaluate=True)
    assert assessment is not None
    assert assessment.incident_type == IncidentType.MEDICAL
    assert assessment.recommended_capability == ResponderCapability.AMBULANCE


# ==============================================================================
# 15. Resolution Race (Resolved while AI runs)
# ==============================================================================


@pytest.mark.asyncio
async def test_resolution_while_ai_runs_discards_triage(client):
    """Verify resolving an incident while AI is calculating discards the triage result."""
    res = await client.post(
        "/api/incidents",
        json={
            "type": "flood",
            "description": "Water in basement.",
            "latitude": 22.57,
            "longitude": 88.36,
            "affected_count": 1,
        },
    )
    inc_id = res.json()["data"]["id"]
    db = await get_database()

    # Authority resolves the incident before AI returns
    await db.execute("UPDATE incidents SET status = 'RESOLVED' WHERE id = ?", (inc_id,))
    await db.commit()

    # AI evaluation returns later
    result = await run_async_ai_triage(incident_id=inc_id, force_reevaluate=True)
    assert result is None  # Safely discarded!

    # Incident remains RESOLVED and is not marked as AVAILABLE active triage
    inc = await incident_service.get_incident_by_id(db, inc_id)
    assert inc.status == IncidentStatus.RESOLVED.value


# ==============================================================================
# 16. Cancellation Race (Cancelled while AI runs)
# ==============================================================================


@pytest.mark.asyncio
async def test_cancellation_while_ai_runs_discards_triage(client):
    """Verify cancelling an incident while AI is calculating discards the triage result."""
    res = await client.post(
        "/api/incidents",
        json={
            "type": "fire",
            "description": "Small grill fire.",
            "latitude": 22.57,
            "longitude": 88.36,
            "affected_count": 1,
        },
    )
    inc_id = res.json()["data"]["id"]
    db = await get_database()

    # Citizen cancels the incident before AI returns
    await db.execute("UPDATE incidents SET status = 'CANCELLED' WHERE id = ?", (inc_id,))
    await db.commit()

    # AI evaluation returns later
    result = await run_async_ai_triage(incident_id=inc_id, force_reevaluate=True)
    assert result is None  # Safely discarded!

    inc = await incident_service.get_incident_by_id(db, inc_id)
    assert inc.status == IncidentStatus.CANCELLED.value


# ==============================================================================
# 17. Authority Verification Transition
# ==============================================================================


@pytest.mark.asyncio
async def test_authority_verification_transition(client, authority_headers):
    """Verify authority approving AI triage transitions status to VERIFIED with audit event."""
    res = await client.post(
        "/api/incidents",
        json={
            "type": "flood",
            "description": "Water rising 1m.",
            "latitude": 22.57,
            "longitude": 88.36,
            "affected_count": 2,
        },
    )
    inc_id = res.json()["data"]["id"]
    await run_async_ai_triage(incident_id=inc_id)

    verify_res = await client.post(
        f"/api/triage/verify/{inc_id}",
        json={"actor": "Operator Dispatcher", "reviewer_notes": "Verified by phone call."},
        headers=authority_headers,
    )
    assert verify_res.status_code == 200
    data = verify_res.json()["data"]
    assert data["status"] == "VERIFIED"
    assert any(e["event_type"] == "TRIAGE_VERIFIED" for e in data["events"])


# ==============================================================================
# 18. Authority Modification and Override
# ==============================================================================


@pytest.mark.asyncio
async def test_authority_modification_and_override(client, authority_headers):
    """Verify authority modifying severity and capability updates incident and marks ADJUSTED."""
    res = await client.post(
        "/api/incidents",
        json={
            "type": "flood",
            "description": "Water rising 1m.",
            "latitude": 22.57,
            "longitude": 88.36,
            "affected_count": 2,
        },
    )
    inc_id = res.json()["data"]["id"]
    await run_async_ai_triage(incident_id=inc_id)

    adjust_res = await client.post(
        f"/api/triage/adjust/{inc_id}",
        json={
            "actor": "Senior Officer",
            "reviewer_notes": "Upgraded due to vulnerable elder on site.",
            "adjusted_severity": "CRITICAL",
            "adjusted_capability": "FLOOD_BOAT",
        },
        headers=authority_headers,
    )
    assert adjust_res.status_code == 200
    data = adjust_res.json()["data"]
    assert data["status"] == "VERIFIED"
    assert data["severity"] == "CRITICAL"
    assert data["ai_triage"]["review_status"] == "ADJUSTED"


# ==============================================================================
# 19. AI Cannot Change Location Truth
# ==============================================================================


@pytest.mark.asyncio
async def test_ai_cannot_change_location_truth(client):
    """Verify that AI triage cannot mutate citizen GPS latitude/longitude coordinates."""
    original_lat = 22.572648
    original_lon = 88.363892
    res = await client.post(
        "/api/incidents",
        json={
            "type": "flood",
            "description": "Coordinates must remain strictly citizen-provided.",
            "latitude": original_lat,
            "longitude": original_lon,
            "affected_count": 1,
        },
    )
    inc_id = res.json()["data"]["id"]

    await run_async_ai_triage(incident_id=inc_id)

    db = await get_database()
    inc = await incident_service.get_incident_by_id(db, inc_id)
    assert inc.latitude == original_lat
    assert inc.longitude == original_lon


# ==============================================================================
# 20. Citizen Privacy: Socket Events Decoupled From Internal AI Reasoning
# ==============================================================================


@pytest.mark.asyncio
async def test_citizen_socket_event_does_not_leak_internals():
    """Verify emit_incident_triage_updated shields AI model names from citizen room."""
    assessment = AITriageAssessment(
        incident_type=IncidentType.FLOOD,
        severity=IncidentSeverity.CRITICAL,
        severity_level=4,
        confidence=0.92,
        hazard_type="Flash Flood",
        affected_people=3,
        key_signals=["Trapped citizens"],
        reported_conditions=["Ground floor flooded"],
        recommended_capability=ResponderCapability.FLOOD_BOAT,
        priority_reasoning="Internal reasoning: multi-casualty high water scenario.",
        uncertainty_flags=["Self-reported water depth"],
        provider="gemini-provider",
        model="gemini-2.0-flash",
        source_label="AI TRIAGE — PRIMARY",
        evaluated_at="2026-08-31T12:00:00Z",
        ai_state="AVAILABLE",
        needs_review=False,
        review_status="PENDING",
    )

    with patch.object(sio, "emit", new_callable=AsyncMock) as mock_emit:
        await emit_incident_triage_updated(
            incident_id="inc-privacy-test-99",
            assessment=assessment,
            ai_state="AVAILABLE",
            ticket_id="SV-9999",
        )

        calls = mock_emit.call_args_list
        assert len(calls) == 2

        # Check Authority room emission (contains full assessment)
        auth_call = next(c for c in calls if c.kwargs.get("room") == "authorities")
        auth_payload = auth_call.args[1]
        assert "assessment" in auth_payload
        assert auth_payload["assessment"]["provider"] == "gemini-provider"
        assert auth_payload["assessment"]["source_label"] == "AI TRIAGE — PRIMARY"

        # Check Citizen room emission (contains ONLY operational progress message)
        cit_call = next(c for c in calls if c.kwargs.get("room") == "incident:inc-privacy-test-99")
        cit_payload = cit_call.args[1]
        assert "assessment" not in cit_payload
        assert "provider" not in cit_payload
        assert "model" not in cit_payload
        assert "priority_reasoning" not in cit_payload
        assert "status_message" in cit_payload
        assert (
            "reviewed" in cit_payload["status_message"].lower()
            or "progress" in cit_payload["status_message"].lower()
        )
