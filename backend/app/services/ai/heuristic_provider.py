"""Deterministic Rule-Based Local AI Triage Provider."""

from __future__ import annotations

from datetime import UTC, datetime

from app.models import (
    AITriageAssessment,
    IncidentSeverity,
    IncidentType,
    ResponderCapability,
)
from app.services.ai.base import BaseAIProvider


class HeuristicProvider(BaseAIProvider):
    """Deterministic, zero-downtime, offline rule engine fallback."""

    def __init__(self):
        super().__init__(
            name="heuristic-engine",
            model="salvus-deterministic-rules-v1",
            timeout=0.1,
        )

    async def evaluate(self, sanitized: dict, image_data: str | None = None) -> AITriageAssessment:
        """Run deterministic rule engine on sanitized incident fields."""
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
            k in desc
            for k in ["water", "flood", "submerged", "inundated", "river", "drown", "boat"]
        ):
            resolved_type = IncidentType.FLOOD
            hazard_type = "Flash Flood & Rapid Inundation"
            capability = ResponderCapability.FLOOD_BOAT
            signals.append("Flood water inundation reported")
        elif any(
            k in desc
            for k in ["shock", "electric", "power", "line", "wire", "spark", "feeder", "11kv"]
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
                f"Critical priority: Distress reports {affected} person(s) at immediate risk "
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
            img_hint = (
                "AI ESTIMATE — UNVERIFIED: Imagery indicates environmental hazard in proximity."
            )

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
            provider=self.name,
            model=self.model,
            evaluated_at=now_iso,
            ai_state="AVAILABLE",
            needs_review=confidence < 0.75 or len(uncertainty_flags) > 0,
            review_status="PENDING",
        )
