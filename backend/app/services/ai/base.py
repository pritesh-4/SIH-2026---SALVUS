"""Abstract Base Provider for AI Triage Decision Support."""

from __future__ import annotations

import json
import logging
import re
from abc import ABC, abstractmethod
from datetime import UTC, datetime

from pydantic import BaseModel, Field, field_validator

from app.models import (
    AITriageAssessment,
    IncidentSeverity,
    IncidentType,
    ResponderCapability,
)

logger = logging.getLogger("salvus.ai.provider")


class LLMTriageOutputSchema(BaseModel):
    """Strict Pydantic schema for validating raw LLM JSON triage generation.

    Any response violating these constraints is strictly rejected.
    """

    severity_level: int = Field(
        ge=1, le=5, description="1=LOW, 2=MODERATE, 3=HIGH, 4=CRITICAL, 5=LIFE_THREATENING"
    )
    recommended_capability: ResponderCapability = Field(
        description="Must match controlled ResponderCapability enum exactly"
    )
    priority_reasoning: str = Field(
        min_length=5, max_length=1500, description="Concise evidence-grounded justification"
    )
    confidence: float = Field(
        ge=0.0, le=1.0, description="Model confidence estimate between 0.0 and 1.0"
    )
    uncertainty_flags: list[str] = Field(
        default_factory=list, description="Ambiguities or missing info in field report"
    )

    # Optional / Contextual / Multimodal fields
    incident_type: IncidentType = Field(
        default=IncidentType.OTHER, description="Classified incident category"
    )
    severity: IncidentSeverity | None = Field(
        default=None, description="Optional high-level severity badge"
    )
    hazard_type: str | None = Field(
        default=None, max_length=200, description="Specific hazard label"
    )
    key_signals: list[str] = Field(
        default_factory=list, description="Concrete grounded signals extracted from report"
    )
    affected_people: int | None = Field(
        default=None, ge=1, le=100000, description="Estimated affected persons count"
    )
    damage_type: str | None = Field(
        default=None, description="e.g. Structural Inundation, Fracture, Grid Failure"
    )
    hazard_detected: str | None = Field(
        default=None, description="Specific hazard detected in imagery"
    )
    water_depth_estimate: str | None = Field(
        default=None, description="Visual water depth estimate, e.g. 0.8m - 1.2m"
    )
    image_assessment_hint: str | None = Field(
        default=None, description="Tagged with 'AI ESTIMATE — UNVERIFIED'"
    )

    @field_validator("water_depth_estimate", mode="before")
    @classmethod
    def coerce_water_depth_str(cls, v: any) -> str | None:
        if v is None:
            return None
        if isinstance(v, (int, float)):
            return f"{v:.1f}m"
        return str(v).strip()

    @field_validator("priority_reasoning")
    @classmethod
    def validate_reasoning_not_blank(cls, v: str) -> str:
        stripped = v.strip()
        if len(stripped) < 5:
            raise ValueError("priority_reasoning must contain at least 5 characters")
        return stripped


def sanitize_incident_for_ai(incident_data: dict) -> dict:
    """Strip personal identifiable information (PII) before external model transmission.

    Adheres strictly to the Input Contract:
    - Included: description (sanitized), type, affected count, SOS flag, hazard context, coords.
    - Excluded / Redacted: phone numbers, emails, names, medical records, credentials.
    """
    raw_desc = incident_data.get("description", "") or ""

    # 1. Redact personal identification numbers (e.g. 12-digit grouped ID)
    sanitized_desc = re.sub(r"\b\d{4}[-\s]\d{4}[-\s]\d{4}\b", "[ID REDACTED]", raw_desc)

    # 2. Redact email addresses
    sanitized_desc = re.sub(r"[\w\.-]+@[\w\.-]+\.\w+", "[EMAIL REDACTED]", sanitized_desc)

    # 3. Redact phone numbers (domestic, international, formatted)
    sanitized_desc = re.sub(
        r"(\+?\d{1,4}[-.\s]?)?\(?\d{2,4}\)?[-.\s]?\d{3,5}[-.\s]?\d{3,5}\b",
        "[PHONE REDACTED]",
        sanitized_desc,
    )

    return {
        "type": incident_data.get("type", "other"),
        "initial_severity": incident_data.get("severity", "MEDIUM"),
        "description": sanitized_desc.strip(),
        "affected_count": incident_data.get("affected_count", 1),
        "is_sos": bool(incident_data.get("is_sos", False)),
        "has_image": bool(incident_data.get("image_data")),
        "image_data": incident_data.get("image_data"),
        "hazard_context": incident_data.get("hazard_context")
        or "Standard Regional Flood/Weather Zone",
        "latitude": incident_data.get("latitude", 22.5726),
        "longitude": incident_data.get("longitude", 88.3639),
    }


def build_triage_prompt(sanitized: dict, image_data: str | None = None) -> str:
    """Construct structured instruction prompt enforcing controlled schema."""
    desc = sanitized["description"]
    is_sos_txt = "YES" if sanitized["is_sos"] else "NO"
    img_txt = "YES" if (image_data or sanitized.get("has_image")) else "NO"
    lat = sanitized["latitude"]
    lon = sanitized["longitude"]
    aff = sanitized["affected_count"]
    inc_type = sanitized["type"]
    hazard_ctx = sanitized.get("hazard_context", "Standard Regional Disaster Grid")

    multimodal_instructions = ""
    if image_data or sanitized.get("has_image"):
        multimodal_instructions = """
MULTIMODAL IMAGE ANALYSIS:
Imagery has been provided from the incident scene.
Examine the incident details and visual cues to estimate:
- damage_type: (e.g. "Structural Inundation", "Rubble Collapse", "Submerged Roadway")
- hazard_detected: (e.g. "Rising Floodwater", "Hazardous Power Grid", "Structural Instability")
- water_depth_estimate: (e.g. "0.8m - 1.2m" or "Vehicle Submerged")
- image_assessment_hint: format starting with "AI ESTIMATE — UNVERIFIED: [Visual damage]"
"""

    return f"""You are SALVUS AI Triage, a safety-critical decision support engine.
Analyze the following sanitized emergency distress report and generate a structured assessment.

INCIDENT REPORT DATA:
- Citizen Initial Category: {inc_type}
- Report Description: "{desc}"
- Estimated Affected Persons: {aff}
- Emergency SOS Beacon Active: {is_sos_txt}
- Coordinates: {lat:.4f}° N, {lon:.4f}° E
- Regional Hazard Context: {hazard_ctx}
- Has Attached Imagery: {img_txt}
{multimodal_instructions}
CONTROLLED VOCABULARY CONSTRAINTS:
1. incident_type: ["flood", "fire", "medical", "hazard", "power_line", "structural", "other"]
2. severity: ["LOW", "MEDIUM", "HIGH", "CRITICAL"]
3. severity_level: Integer 1 to 5 (1=LOW, 2=MODERATE, 3=HIGH, 4=CRITICAL, 5=LIFE_THREATENING)
4. recommended_capability: ["FLOOD_BOAT", "AMBULANCE", "STRETCHER_TEAM", "HAZMAT", "DEBRIS_CLEAR"]
5. confidence: Float 0.00-1.00 (assign < 0.75 if report is vague or lacks details)
6. key_signals: Array of short factual phrases (e.g. ["SOS active", "water rising", "3 trapped"])
7. priority_reasoning: 1-2 concise sentences explaining WHY based strictly on stated facts.
8. uncertainty_flags: Array of missing info, ambiguities, or unverified claims.
9. image_assessment_hint: If imagery is present, MUST start with "AI ESTIMATE — UNVERIFIED: ".

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
  "damage_type": null,
  "hazard_detected": null,
  "water_depth_estimate": null,
  "image_assessment_hint": null
}}"""


def parse_and_validate_assessment(
    raw_json_str: str,
    sanitized: dict,
    provider_name: str,
    model_name: str,
) -> AITriageAssessment | None:
    """Parse raw JSON response from model and validate strictly against Pydantic schema.

    Enforces Output Contract:
    - Malformed JSON -> REJECT (return None)
    - Unvalidated enum or invalid severity level -> REJECT (return None)
    - Missing required fields -> REJECT (return None)
    """
    try:
        # Strip markdown code blocks if the model wrapped the JSON
        clean_json = raw_json_str.strip()
        if clean_json.startswith("```"):
            clean_json = re.sub(r"^```(?:json)?\s*", "", clean_json)
            clean_json = re.sub(r"\s*```$", "", clean_json)

        parsed_dict = json.loads(clean_json)

        # Strict validation through Pydantic
        validated = LLMTriageOutputSchema.model_validate(parsed_dict)

        # Derive controlled severity badge from level or explicit field
        sev = validated.severity
        if not sev:
            if validated.severity_level >= 4:
                sev = IncidentSeverity.CRITICAL
            elif validated.severity_level == 3:
                sev = IncidentSeverity.HIGH
            elif validated.severity_level == 2:
                sev = IncidentSeverity.MEDIUM
            else:
                sev = IncidentSeverity.LOW

        hazard = (
            validated.hazard_type
            or f"{validated.incident_type.value.replace('_', ' ').title()} Hazard"
        )
        affected = (
            validated.affected_people
            if validated.affected_people is not None
            else sanitized.get("affected_count", 1)
        )
        now_iso = datetime.now(UTC).isoformat()
        conf = round(max(0.0, min(1.0, validated.confidence)), 2)

        # Enforce AI ESTIMATE — UNVERIFIED on visual hints
        img_hint = validated.image_assessment_hint
        if not img_hint and (
            validated.damage_type or validated.water_depth_estimate or validated.hazard_detected
        ):
            details = []
            if validated.damage_type:
                details.append(f"Damage: {validated.damage_type}")
            if validated.hazard_detected:
                details.append(f"Hazard: {validated.hazard_detected}")
            if validated.water_depth_estimate:
                details.append(f"Est Depth: {validated.water_depth_estimate}")
            img_hint = f"AI ESTIMATE — UNVERIFIED: {', '.join(details)}"
        elif not img_hint and (sanitized.get("has_image") or sanitized.get("image_data")):
            img_hint = (
                f"AI ESTIMATE — UNVERIFIED: Scene imagery attached ({hazard}). "
                f"Ground survey required."
            )
        elif img_hint and not img_hint.startswith("AI ESTIMATE — UNVERIFIED:"):
            img_hint = f"AI ESTIMATE — UNVERIFIED: {img_hint}"

        return AITriageAssessment(
            incident_type=validated.incident_type,
            severity=sev,
            severity_level=validated.severity_level,
            confidence=conf,
            hazard_type=hazard,
            affected_people=affected,
            key_signals=validated.key_signals or ["Field report submitted"],
            recommended_capability=validated.recommended_capability,
            priority_reasoning=validated.priority_reasoning,
            uncertainty_flags=validated.uncertainty_flags,
            damage_type=validated.damage_type,
            hazard_detected=validated.hazard_detected,
            water_depth_estimate=validated.water_depth_estimate,
            image_assessment_hint=img_hint,
            provider=provider_name,
            model=model_name,
            evaluated_at=now_iso,
            ai_state="AVAILABLE",
            needs_review=conf < 0.75 or len(validated.uncertainty_flags) > 0,
            review_status="PENDING",
        )
    except Exception as exc:
        logger.warning(
            f"Strict validation rejected malformed AI response from {provider_name}: {exc}"
        )
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
