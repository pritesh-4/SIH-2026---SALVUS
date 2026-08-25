"""Dedicated AI Incident Triage Service.

Implements safety-critical, human-in-the-loop AI triage decision support:
1. PII sanitization and data minimization before LLM evaluation.
2. Multi-tier provider strategy: Google Gemini -> Groq Fallback -> Deterministic Heuristic Engine.
3. Strict Pydantic schema validation for controlled severity (1-5) and capability matching.
4. Non-blocking latency and graceful degradation when offline or rate-limited.
5. Grounded priority reasoning and explicit uncertainty flagging.
"""

from __future__ import annotations

import json
import logging
import os
import re
from datetime import UTC, datetime

import httpx

from app.models import (
    AITriageAssessment,
    IncidentSeverity,
    IncidentType,
    ResponderCapability,
)

logger = logging.getLogger("salvus.ai_triage")

# Provider configurations
GEMINI_API_URL = (
    "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent"
)
GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions"
REQUEST_TIMEOUT_SECONDS = 4.0


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


def _build_triage_prompt(sanitized: dict, image_data: str | None = None) -> str:
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


def _local_heuristic_triage(sanitized: dict, image_data: str | None = None) -> AITriageAssessment:
    """Deterministic, rule-based emergency triage fallback.

    Guarantees fast, robust, zero-downtime assessment even when offline or during API rate-limits.
    """
    desc = (sanitized.get("description") or "").lower()
    initial_type = (sanitized.get("type") or "other").lower()
    affected = sanitized.get("affected_count", 1)
    is_sos = sanitized.get("is_sos", False)

    # 1. Classification & Capability Mapping
    resolved_type = IncidentType.OTHER
    hazard_type = "General Emergency Distress"
    capability = ResponderCapability.STRETCHER_TEAM
    signals: list[str] = []

    if any(
        k in desc for k in ["water", "flood", "submerged", "inundated", "river", "drown", "boat"]
    ):
        resolved_type = IncidentType.FLOOD
        hazard_type = "Flash Flood & Rapid Inundation"
        capability = ResponderCapability.FLOOD_BOAT
        signals.append("Flood water inundation reported")
    elif any(
        k in desc for k in ["shock", "electric", "power", "line", "wire", "spark", "feeder", "11kv"]
    ):
        resolved_type = IncidentType.POWER_LINE
        hazard_type = "Live Electrical / Submerged Grid Threat"
        capability = ResponderCapability.HAZMAT
        signals.append("High-voltage electrical hazard")
    elif any(
        k in desc
        for k in [
            "heart",
            "stroke",
            "bleed",
            "unconscious",
            "medical",
            "injury",
            "trauma",
            "patient",
            "pregnant",
        ]
    ):
        resolved_type = IncidentType.MEDICAL
        hazard_type = "Acute Medical Distress & Trauma"
        capability = ResponderCapability.AMBULANCE
        signals.append("Acute patient medical requirement")
    elif any(k in desc for k in ["fire", "smoke", "burn", "explosion", "flame", "gas leak"]):
        resolved_type = IncidentType.FIRE
        hazard_type = "Active Fire / Thermal Threat"
        capability = ResponderCapability.HAZMAT
        signals.append("Thermal or smoke hazard detected")
    elif any(k in desc for k in ["collapse", "crack", "debris", "roof", "rubble", "crushed"]):
        resolved_type = IncidentType.STRUCTURAL
        hazard_type = "Structural Collapse / Debris Trap"
        capability = ResponderCapability.DEBRIS_CLEAR
        signals.append("Structural integrity failure")
    else:
        # Fallback to initial reported type
        if initial_type in ("flood", "fire", "medical", "hazard", "power_line", "structural"):
            resolved_type = IncidentType(initial_type)
            hazard_type = f"{initial_type.replace('_', ' ').title()} Incident"
            if initial_type == "flood":
                capability = ResponderCapability.FLOOD_BOAT
            elif initial_type == "medical":
                capability = ResponderCapability.AMBULANCE

    if is_sos:
        signals.append("High-priority SOS beacon triggered")
    if affected > 1:
        signals.append(f"{affected} individuals reported at risk")

    # 2. Severity and Priority Reasoning
    uncertainty_flags: list[str] = []
    if len(desc) < 20:
        uncertainty_flags.append("Limited reporter text detail provided")

    is_critical_keyword = any(
        k in desc
        for k in [
            "trapped",
            "dying",
            "urgent",
            "critical",
            "severe",
            "drowning",
            "unconscious",
            "11kv",
            "chest pain",
            "cardiac",
            "heart attack",
            "stroke",
        ]
    )

    is_high_keyword = any(
        k in desc
        for k in [
            "rising",
            "injured",
            "blocked",
            "high",
            "bleed",
            "bleeding",
            "patient",
            "fracture",
            "broken",
            "flame",
            "smoke",
            "burn",
        ]
    )

    if is_sos or (is_critical_keyword and affected >= 3):
        severity = IncidentSeverity.CRITICAL
        severity_level = 5 if is_sos and is_critical_keyword else 4
        reasoning = (
            f"Critical priority: Active distress reports {affected} person(s) at immediate risk "
            f"in an escalating {hazard_type.lower()} scenario."
        )
        confidence = 0.89 if len(desc) > 30 else 0.78
    elif is_critical_keyword or is_high_keyword or affected >= 5:
        severity = IncidentSeverity.HIGH
        severity_level = 3
        reasoning = (
            f"High priority: Significant {hazard_type.lower()} impacting {affected} person(s) "
            f"requiring prompt intervention."
        )
        confidence = 0.85
    elif any(k in desc for k in ["moderate", "waterlogged", "slow", "assist"]):
        severity = IncidentSeverity.MEDIUM
        severity_level = 2
        reasoning = (
            f"Moderate priority: {hazard_type} with contained hazard perimeter affecting "
            f"{affected} person(s)."
        )
        confidence = 0.82
    else:
        severity = IncidentSeverity.LOW
        severity_level = 1
        reasoning = f"Low priority: Standard monitoring advised for {hazard_type.lower()}."
        confidence = 0.70
        uncertainty_flags.append("Awaiting operator verification of on-site urgency")

    img_hint = None
    if image_data:
        img_hint = "AI ESTIMATE — UNVERIFIED: Imagery indicates environmental hazard in proximity."

    now_iso = datetime.now(UTC).isoformat()

    return AITriageAssessment(
        incident_type=resolved_type,
        severity=severity,
        severity_level=severity_level,
        confidence=round(confidence, 2),
        hazard_type=hazard_type,
        affected_people=affected,
        key_signals=signals or ["Standard field distress report"],
        recommended_capability=capability,
        priority_reasoning=reasoning,
        uncertainty_flags=uncertainty_flags,
        image_assessment_hint=img_hint,
        provider="heuristic-engine",
        model="salvus-deterministic-rules-v1",
        evaluated_at=now_iso,
        needs_review=confidence < 0.75 or len(uncertainty_flags) > 0,
        review_status="PENDING",
    )


async def _call_gemini_api(
    sanitized: dict, api_key: str, image_data: str | None = None
) -> AITriageAssessment | None:
    """Call Google Gemini API with structured JSON output schema."""
    url = f"{GEMINI_API_URL}?key={api_key}"
    prompt_text = _build_triage_prompt(sanitized, image_data)

    payload = {
        "contents": [{"parts": [{"text": prompt_text}]}],
        "generationConfig": {
            "temperature": 0.1,
            "responseMimeType": "application/json",
        },
    }

    async with httpx.AsyncClient(timeout=REQUEST_TIMEOUT_SECONDS) as client:
        response = await client.post(url, json=payload)
        if response.status_code != 200:
            logger.warning(
                f"Gemini API returned status {response.status_code}: {response.text[:200]}"
            )
            return None

        data = response.json()
        candidates = data.get("candidates", [])
        if not candidates:
            return None

        text_content = candidates[0]["content"]["parts"][0]["text"]
        parsed_json = json.loads(text_content)

        # Validate against schema
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
        if raw_type not in IncidentType._member_names_ and raw_type not in [
            e.value for e in IncidentType
        ]:
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
                parsed_json.get("priority_reasoning", "Urgent response evaluation requested.")
            ),
            uncertainty_flags=flags,
            image_assessment_hint=parsed_json.get("image_assessment_hint"),
            provider="gemini-2.0-flash",
            model="gemini-2.0-flash",
            evaluated_at=now_iso,
            needs_review=confidence < 0.75 or len(flags) > 0,
            review_status="PENDING",
        )


async def _call_groq_api(
    sanitized: dict, api_key: str, image_data: str | None = None
) -> AITriageAssessment | None:
    """Call Groq API (Llama 3.3 70B) as secondary LLM fallback."""
    prompt_text = _build_triage_prompt(sanitized, image_data)

    payload = {
        "model": "llama-3.3-70b-versatile",
        "messages": [
            {
                "role": "system",
                "content": (
                    "You are a safety-critical emergency AI triage service. "
                    "Output only valid JSON conforming strictly to the requested schema."
                ),
            },
            {"role": "user", "content": prompt_text},
        ],
        "response_format": {"type": "json_object"},
        "temperature": 0.1,
    }

    headers = {"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"}

    async with httpx.AsyncClient(timeout=REQUEST_TIMEOUT_SECONDS) as client:
        response = await client.post(GROQ_API_URL, json=payload, headers=headers)
        if response.status_code != 200:
            logger.warning(f"Groq API returned status {response.status_code}")
            return None

        data = response.json()
        raw_text = data["choices"][0]["message"]["content"]
        parsed_json = json.loads(raw_text)

        now_iso = datetime.now(UTC).isoformat()
        confidence = float(parsed_json.get("confidence", 0.85))
        flags = list(parsed_json.get("uncertainty_flags", []))

        raw_sev = str(parsed_json.get("severity", "MEDIUM")).upper()
        if raw_sev not in ("LOW", "MEDIUM", "HIGH", "CRITICAL"):
            raw_sev = "MEDIUM"

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
                parsed_json.get("priority_reasoning", "Evaluated via fallback inference pipeline.")
            ),
            uncertainty_flags=flags,
            image_assessment_hint=parsed_json.get("image_assessment_hint"),
            provider="groq-llama-3.3-70b",
            model="llama-3.3-70b-versatile",
            evaluated_at=now_iso,
            needs_review=confidence < 0.75 or len(flags) > 0,
            review_status="PENDING",
        )


async def perform_ai_triage(
    incident_dict: dict, image_data: str | None = None
) -> AITriageAssessment:
    """Public triage boundary: sanitizes input, executes multi-tier provider pipeline,

    and returns validated assessment.
    """
    sanitized = sanitize_incident_for_ai(incident_dict)

    # 1. Try Gemini
    gemini_key = os.getenv("GEMINI_API_KEY")
    if gemini_key and gemini_key.strip():
        try:
            assessment = await _call_gemini_api(sanitized, gemini_key.strip(), image_data)
            if assessment:
                return assessment
        except Exception as e:
            logger.warning(f"Gemini triage evaluation failed: {e}")

    # 2. Try Groq Fallback
    groq_key = os.getenv("GROQ_API_KEY")
    if groq_key and groq_key.strip():
        try:
            assessment = await _call_groq_api(sanitized, groq_key.strip(), image_data)
            if assessment:
                return assessment
        except Exception as e:
            logger.warning(f"Groq triage fallback failed: {e}")

    # 3. Deterministic Local Heuristic Fallback
    return _local_heuristic_triage(sanitized, image_data)
