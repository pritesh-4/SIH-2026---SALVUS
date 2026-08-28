"""AI Vision Decision Support Service Interface (Phase 4 - AI Readiness).

Establishes the future multimodal image analysis domain contract for Salvus incident evidence
(e.g., Gemini 1.5 Pro / Flash or other cloud vision backends).

CORE PRINCIPLES & INVARIANTS:
1. Decision Support Only:
   AI visual assessments are UNVERIFIED observations. They must NEVER autonomously
   dispatch emergency units, alter incident status, or resolve incidents without human review.
2. Secure Backend Reference:
   The vision model consumes secure backend-accessible storage keys or byte streams,
   never relying on frontend public keys or raw URLs.
3. No Premature AI Execution:
   This service provides the contract and architecture ready for background multimodal workers
   without prematurely executing live AI API calls.
"""

from __future__ import annotations

import logging
from datetime import UTC, datetime
from typing import Any

from app.models import AIVisionAssessment, AIVisionObservation

logger = logging.getLogger("salvus.vision_service")

MANDATORY_VISION_DISCLAIMER = "AI ESTIMATE — UNVERIFIED DECISION SUPPORT ONLY"


class VisionService:
    """Service interface for multimodal AI vision analysis on incident evidence."""

    @staticmethod
    def create_unverified_assessment(
        hazard_type: str,
        observations: list[dict[str, Any]] | None = None,
        water_depth_estimate: str | None = None,
        damage_severity_hint: str | None = None,
        confidence: float = 0.0,
        uncertainty_flags: list[str] | None = None,
        model_version: str = "salvus-vision-stub-v1",
    ) -> AIVisionAssessment:
        """Create a normalized, unverified AI vision assessment adhering to all invariants."""
        obs_models = [
            AIVisionObservation(
                category=obs.get("category", "general"),
                description=obs.get("description", ""),
                confidence=float(obs.get("confidence", 0.0)),
            )
            for obs in (observations or [])
        ]

        return AIVisionAssessment(
            hazard_detected=True,
            hazard_type=hazard_type,
            observations=obs_models,
            water_depth_estimate=water_depth_estimate,
            damage_severity_hint=damage_severity_hint,
            confidence=max(0.0, min(1.0, float(confidence))),
            uncertainty_flags=uncertainty_flags or [],
            analyzed_at=datetime.now(UTC).isoformat(),
            model_version=model_version,
            disclaimer=MANDATORY_VISION_DISCLAIMER,
        )

    @classmethod
    async def analyze_incident_attachment_contract(
        cls,
        attachment_id: str,
        storage_key: str,
        incident_type: str = "flood",
    ) -> AIVisionAssessment:
        """Normalized contract interface ready for future multimodal AI worker integration.

        Consumes the secure backend `storage_key` rather than public client-side URLs.
        Returns normalized AIVisionAssessment with mandatory disclaimer.
        """
        logger.info(
            "Vision analysis contract ready for attachment %s (key=%s)",
            attachment_id,
            storage_key,
        )

        return cls.create_unverified_assessment(
            hazard_type=incident_type,
            observations=[
                {
                    "category": "situational_context",
                    "description": f"Field observation for {incident_type} evidence",
                    "confidence": 0.5,
                }
            ],
            water_depth_estimate=None,
            damage_severity_hint=None,
            confidence=0.5,
            uncertainty_flags=["AWAITING_HUMAN_TRIAGE", "UNVERIFIED_FIELD_OBSERVATION"],
            model_version="gemini-multimodal-contract-v1",
        )
