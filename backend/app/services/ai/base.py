"""Abstract Base Provider for AI Triage Decision Support."""

from __future__ import annotations

import json
import logging
import re
from abc import ABC, abstractmethod
from datetime import UTC, datetime

from app.models import (
    AITriageAssessment,
    IncidentSeverity,
    IncidentType,
    ResponderCapability,
)

logger = logging.getLogger("salvus.ai.provider")


def sanitize_incident_for_ai(incident_data: dict) -> dict:
    """Strip personal identifiable information (PII) before external model transmission."""
    raw_desc = incident_data.get("description", "")

    # Redact phone numbers and emails
    sanitized_desc = re.sub(
        r"(\+?\d{1,4}[-.\s]?)?\(?\d{2,4}\)?[-.\s]?\d{3,4}[-.\s]?\d{3,4}",
        "[PHONE REDACTED]",
        raw_desc,
    )
    sanitized_desc = re.sub(r"[\w\.-]+@[\w\.-]+\.\w+", "[EMAIL REDACTED]", sanitized_desc)

    return {
        "type": incident_data.get("type", "other"),
        "initial_severity": incident_data.get("severity", "MEDIUM"),
        "description": sanitized_desc.strip(),
        "affected_count": incident_data.get("affected_count", 1),
        "is_sos": bool(incident_data.get("is_sos", False)),
        "latitude": incident_data.get("latitude", 22.5726),
        "longitude": incident_data.get("longitude", 88.3639),
    }


def build_triage_prompt(sanitized: dict, image_data: str | None = None) -> str:
    """Construct structured instruction prompt enforcing controlled schema."""
    desc = sanitized["description"]
    is_sos_txt = "YES" if sanitized["is_sos"] else "NO"
    img_txt = "YES" if image_data else "NO"
    lat = sanitized["latitude"]
    lon = sanitized["longitude"]
    aff = sanitized["affected_count"]
    inc_type = sanitized["type"]

    return f"""You are SALVUS AI Triage, a safety-critical response decision support engine.
Analyze the following emergency incident report and produce a structured assessment.

INCIDENT REPORT DATA:
- Citizen Initial Category: {inc_type}
- Report Description: "{desc}"
- Estimated Affected Persons: {aff}
- Emergency SOS Beacon Active: {is_sos_txt}
- Coordinates: {lat:.4f}° N, {lon:.4f}° E
- Has Attached Imagery: {img_txt}

CONTROLLED VOCABULARY CONSTRAINTS:
1. incident_type: ["flood", "fire", "medical", "hazard", "power_line", "structural", "other"]
2. severity: ["LOW", "MEDIUM", "HIGH", "CRITICAL"]
3. severity_level: Integer 1 to 5 (1=LOW, 2=MODERATE, 3=HIGH, 4=CRITICAL, 5=LIFE_THREATENING)
4. recommended_capability: ["FLOOD_BOAT", "AMBULANCE", "STRETCHER_TEAM", "HAZMAT", "DEBRIS_CLEAR"]
5. confidence: Float 0.00-1.00 (assign < 0.75 if report is vague or lacks details)
6. key_signals: Array of short factual phrases (e.g. ["SOS active", "water rising", "3 trapped"])
7. priority_reasoning: 1-2 concise sentences explaining WHY based only on stated facts.
8. uncertainty_flags: Array of missing info or unverified claims.
9. image_assessment_hint: If image present, prefixed with "AI ESTIMATE — UNVERIFIED: ".

Output ONLY a valid JSON object matching keys:
{{
  "incident_type": "flood",
  "severity": "CRITICAL",
  "severity_level": 4,
  "confidence": 0.88,
  "hazard_type": "Flash Flood & Structural Inundation",
  "affected_people": {aff},
  "key_signals": ["..."],
  "recommended_capability": "FLOOD_BOAT",
  "priority_reasoning": "...",
  "uncertainty_flags": ["..."],
  "image_assessment_hint": null
}}"""


def parse_and_validate_assessment(
    raw_json_str: str,
    sanitized: dict,
    provider_name: str,
    model_name: str,
) -> AITriageAssessment | None:
    """Parse raw JSON response from model and validate strictly against Pydantic schema."""
    try:
        parsed_json = json.loads(raw_json_str)
        now_iso = datetime.now(UTC).isoformat()
        confidence = float(parsed_json.get("confidence", 0.85))
        flags = list(parsed_json.get("uncertainty_flags", []))

        # Enforce controlled severity
        raw_sev = str(parsed_json.get("severity", "MEDIUM")).upper()
        if raw_sev not in ("LOW", "MEDIUM", "HIGH", "CRITICAL"):
            raw_sev = "MEDIUM"

        # Enforce controlled capability
        raw_cap = str(parsed_json.get("recommended_capability", "STRETCHER_TEAM")).upper()
        if raw_cap not in ResponderCapability._member_names_:
            raw_cap = "STRETCHER_TEAM"

        raw_type = str(parsed_json.get("incident_type", "other")).lower()
        if raw_type not in [e.value for e in IncidentType]:
            raw_type = "other"

        return AITriageAssessment(
            incident_type=IncidentType(raw_type),
            severity=IncidentSeverity(raw_sev),
            severity_level=int(parsed_json.get("severity_level", 3)),
            confidence=round(max(0.0, min(1.0, confidence)), 2),
            hazard_type=str(parsed_json.get("hazard_type", "Emergency Hazard")),
            affected_people=int(parsed_json.get("affected_people", sanitized["affected_count"])),
            key_signals=list(parsed_json.get("key_signals", [])),
            recommended_capability=ResponderCapability(raw_cap),
            priority_reasoning=str(
                parsed_json.get("priority_reasoning", "Evaluated via AI decision support pipeline.")
            ),
            uncertainty_flags=flags,
            image_assessment_hint=parsed_json.get("image_assessment_hint"),
            provider=provider_name,
            model=model_name,
            evaluated_at=now_iso,
            ai_state="AVAILABLE",
            needs_review=confidence < 0.75 or len(flags) > 0,
            review_status="PENDING",
        )
    except Exception as exc:
        logger.warning(f"Failed to parse and validate AI response from {provider_name}: {exc}")
        return None


class BaseAIProvider(ABC):
    """Abstract interface for AI triage providers."""

    def __init__(self, name: str, model: str, timeout: float = 3.0):
        self.name = name
        self.model = model
        self.timeout = timeout

    @abstractmethod
    async def evaluate(
        self, sanitized: dict, image_data: str | None = None
    ) -> AITriageAssessment | None:
        """Evaluate incident payload and return a validated AITriageAssessment or None."""
        pass
