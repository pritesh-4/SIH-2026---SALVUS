"""Dedicated AI Incident Triage Service.

Implements safety-critical, human-in-the-loop AI triage decision support:
1. PII sanitization and data minimization before LLM evaluation.
2. Multi-tier provider strategy: Google Gemini -> Groq Fallback -> Deterministic Heuristic Engine.
3. Strict Pydantic schema validation for controlled severity (1-5) and capability matching.
4. Non-blocking latency and graceful degradation when offline or rate-limited.
5. Grounded priority reasoning and explicit uncertainty flagging.
"""

from __future__ import annotations

import logging

from app.models import AITriageAssessment
from app.services.ai.heuristic_provider import HeuristicProvider
from app.services.ai.service import ai_service

logger = logging.getLogger("salvus.ai_triage")


def _local_heuristic_triage(sanitized: dict, image_data: str | None = None) -> AITriageAssessment:
    """Deterministic, rule-based emergency triage fallback."""
    import asyncio

    heuristic = HeuristicProvider()
    try:
        loop = asyncio.get_event_loop()
        if loop.is_running():
            # Run coroutine in current or new task
            import concurrent.futures

            with concurrent.futures.ThreadPoolExecutor() as pool:
                return pool.submit(asyncio.run, heuristic.evaluate(sanitized, image_data)).result()
        return loop.run_until_complete(heuristic.evaluate(sanitized, image_data))
    except Exception:
        import asyncio

        return asyncio.run(heuristic.evaluate(sanitized, image_data))


async def perform_ai_triage(
    incident_dict: dict,
    image_data: str | None = None,
    incident_id: str = "inc-transient",
) -> AITriageAssessment:
    """Public triage boundary: sanitizes input, executes multi-tier provider pipeline,

    and returns validated assessment.
    """
    assessment, _ = await ai_service.triage(
        incident_dict=incident_dict,
        image_data=image_data,
        incident_id=incident_id,
    )
    return assessment
