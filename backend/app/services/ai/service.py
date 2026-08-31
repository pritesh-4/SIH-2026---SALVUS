"""AI Triage Service Facade orchestrating provider waterfall, fallback, and telemetry."""

from __future__ import annotations

import hashlib
import json
import logging
import time

from app.logging.structured_logger import log_ai_telemetry
from app.models import AITriageAssessment
from app.services.ai.base import BaseAIProvider, sanitize_incident_for_ai
from app.services.ai.gemini_provider import GeminiProvider
from app.services.ai.groq_provider import GroqProvider
from app.services.ai.heuristic_provider import HeuristicProvider

logger = logging.getLogger("salvus.ai.service")


def compute_triage_hash(sanitized: dict) -> str:
    """Compute deterministic SHA-256 hash of the sanitized incident payload."""
    lat_val = sanitized.get("latitude")
    lon_val = sanitized.get("longitude")
    payload_str = json.dumps(
        {
            "type": str(sanitized.get("type", "")).lower(),
            "severity": str(sanitized.get("initial_severity", "")).upper(),
            "description": str(sanitized.get("description", "")).strip().lower(),
            "affected_count": int(sanitized.get("affected_count", 1)),
            "is_sos": bool(sanitized.get("is_sos", False)),
            "latitude": round(float(lat_val), 4) if lat_val is not None else None,
            "longitude": round(float(lon_val), 4) if lon_val is not None else None,
        },
        sort_keys=True,
    )
    return hashlib.sha256(payload_str.encode("utf-8")).hexdigest()[:16]


class AIService:
    """Unified AI Triage Orchestration Engine."""

    def __init__(self, providers: list[BaseAIProvider] | None = None):
        if providers is not None:
            self.providers = providers
        else:
            self.providers = [
                GeminiProvider(timeout=3.0),
                GroqProvider(timeout=3.0),
                HeuristicProvider(),
            ]

    async def triage(
        self,
        incident_dict: dict,
        image_data: str | None = None,
        incident_id: str = "inc-transient",
        request_id: str | None = None,
        task_id: str | None = None,
    ) -> tuple[AITriageAssessment, str]:
        """Execute multi-tier intelligence evaluation with fallback isolation."""
        sanitized = sanitize_incident_for_ai(incident_dict)
        t_hash = compute_triage_hash(sanitized)
        effective_img = image_data or incident_dict.get("image_data")

        for idx, provider in enumerate(self.providers):
            start_time = time.perf_counter()

            is_fallback = idx > 0
            try:
                assessment = await provider.evaluate(sanitized, effective_img)
                latency_ms = (time.perf_counter() - start_time) * 1000.0

                if assessment is not None:
                    # Explicitly stamp accurate provenance
                    if (
                        isinstance(provider, HeuristicProvider)
                        or "heuristic" in provider.name.lower()
                    ):
                        assessment.source_label = "RULE-BASED TRIAGE"
                    elif idx == 0:
                        assessment.source_label = "AI TRIAGE — PRIMARY"
                    else:
                        assessment.source_label = "AI TRIAGE — FALLBACK"

                    log_ai_telemetry(
                        incident_id=incident_id,
                        provider=provider.name,
                        model=provider.model,
                        latency_ms=latency_ms,
                        success=True,
                        fallback=is_fallback,
                        confidence=assessment.confidence,
                        task_id=task_id,
                        request_id=request_id,
                    )
                    return assessment, t_hash
                else:
                    log_ai_telemetry(
                        incident_id=incident_id,
                        provider=provider.name,
                        model=provider.model,
                        latency_ms=latency_ms,
                        success=False,
                        fallback=is_fallback,
                        task_id=task_id,
                        request_id=request_id,
                        error_type="PROVIDER_NULL_RESPONSE",
                    )
            except Exception as exc:
                latency_ms = (time.perf_counter() - start_time) * 1000.0
                log_ai_telemetry(
                    incident_id=incident_id,
                    provider=provider.name,
                    model=provider.model,
                    latency_ms=latency_ms,
                    success=False,
                    fallback=is_fallback,
                    task_id=task_id,
                    request_id=request_id,
                    error_type=type(exc).__name__,
                )
                logger.warning(f"Provider {provider.name} failed during triage evaluation: {exc}")

        # Absolute safety net: if all configured providers failed unexpectedly
        heuristic = HeuristicProvider()
        fallback_assessment = await heuristic.evaluate(sanitized, effective_img)
        fallback_assessment.source_label = "RULE-BASED TRIAGE"
        return fallback_assessment, t_hash


# Global default instance
ai_service = AIService()
