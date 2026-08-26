"""Unit and integration tests for AI Incident Triage & Human Verification."""

from __future__ import annotations

import pytest

from app.models import IncidentSeverity, IncidentType, ResponderCapability
from app.services.ai_triage_service import _local_heuristic_triage, sanitize_incident_for_ai


@pytest.fixture
def anyio_backend():
    return "asyncio"


def test_prompt_pii_sanitization():
    """Verify personal phone numbers and emails are redacted before model transmission."""
    raw_incident = {
        "type": "flood",
        "description": "Call me at +91 98301 24890 or email aditi.roy@gmail.com immediately!",
        "affected_count": 4,
        "is_sos": True,
    }
    sanitized = sanitize_incident_for_ai(raw_incident)

    assert "+91 98301 24890" not in sanitized["description"]
    assert "aditi.roy@gmail.com" not in sanitized["description"]
    assert "[PHONE REDACTED]" in sanitized["description"]
    assert "[EMAIL REDACTED]" in sanitized["description"]
    assert sanitized["affected_count"] == 4
    assert sanitized["is_sos"] is True


def test_heuristic_fallback_triage_flood():
    """Verify deterministic rule-based triage correctly classifies flood scenarios."""
    incident = {
        "type": "flood",
        "description": "Ground floor submerged in 1.4m rising water. 3 people trapped on roof.",
        "affected_count": 3,
        "is_sos": True,
    }
    assessment = _local_heuristic_triage(incident)

    assert assessment.incident_type == IncidentType.FLOOD
    assert assessment.severity == IncidentSeverity.CRITICAL
    assert assessment.severity_level in (4, 5)
    assert assessment.recommended_capability == ResponderCapability.FLOOD_BOAT
    assert assessment.confidence >= 0.75
    assert len(assessment.key_signals) > 0
    assert (
        "trapped" in assessment.priority_reasoning.lower()
        or "distress" in assessment.priority_reasoning.lower()
    )


def test_heuristic_fallback_triage_medical():
    """Verify deterministic rule-based triage correctly classifies medical trauma."""
    incident = {
        "type": "medical",
        "description": "Elderly patient suffering acute chest pain and bleeding.",
        "affected_count": 1,
        "is_sos": False,
    }
    assessment = _local_heuristic_triage(incident)

    assert assessment.incident_type == IncidentType.MEDICAL
    assert assessment.recommended_capability == ResponderCapability.AMBULANCE
    assert assessment.severity in (IncidentSeverity.HIGH, IncidentSeverity.CRITICAL)


@pytest.mark.asyncio
async def test_ai_triage_api_flow(client, citizen_headers):
    """Verify end-to-end AI triage analysis, verification, adjustment, and candidate alignment."""
    # 1. Create a new emergency incident
    create_res = await client.post(
        "/api/incidents",
        json={
            "type": "flood",
            "severity": "MEDIUM",
            "description": "Rising flood water trapping 5 citizens in ground floor apartment.",
            "reporter_name": "Demo Citizen",
            "latitude": 22.5726,
            "longitude": 88.3639,
            "affected_count": 5,
            "is_sos": True,
        },
    )
    assert create_res.status_code == 201
    incident = create_res.json()["data"]
    inc_id = incident["id"]
    assert incident["status"] == "NEW"
    assert incident["ai_triage"] is not None
    assert incident["ai_triage"]["recommended_capability"] == "FLOOD_BOAT"

    # 2. Trigger on-demand analyze endpoint
    analyze_res = await client.post(f"/api/triage/analyze/{inc_id}")
    assert analyze_res.status_code == 200
    triage_data = analyze_res.json()["data"]
    assert triage_data["incident_type"] == "flood"
    assert triage_data["severity"] in ("HIGH", "CRITICAL")
    assert triage_data["confidence"] > 0.5

    # 3. Test citizen unauthorized to verify triage
    unauth_res = await client.post(
        f"/api/triage/verify/{inc_id}",
        json={"actor": "citizen", "reviewer_notes": "Attempting verification"},
        headers=citizen_headers,
    )
    assert unauth_res.status_code == 403

    # 4. Operator overrides & verifies triage assessment
    verify_res = await client.post(
        f"/api/triage/verify/{inc_id}",
        json={
            "actor": "Authority Dispatcher 12",
            "reviewer_notes": "Confirmed high flood level. Verified for watercraft dispatch.",
            "adjusted_severity": "CRITICAL",
            "adjusted_type": "flood",
            "adjusted_capability": "FLOOD_BOAT",
        },
    )
    assert verify_res.status_code == 200
    verified_incident = verify_res.json()["data"]
    assert verified_incident["status"] == "VERIFIED"
    assert verified_incident["severity"] == "CRITICAL"
    assert verified_incident["ai_triage"]["review_status"] == "ADJUSTED"

    # 5. Check candidates alignment with verified capability
    cand_res = await client.get(f"/api/responders/candidates/{inc_id}")
    assert cand_res.status_code == 200
    candidates = cand_res.json()["data"]
    assert len(candidates) > 0
    # Top candidate should be a flood boat
    top_cand = candidates[0]
    assert top_cand["capability"] == "FLOOD_BOAT"
    assert top_cand["is_recommended"] is True
