"""AI services and provider abstraction package for Salvus."""

from app.services.ai.base import (
    BaseAIProvider,
    build_triage_prompt,
    parse_and_validate_assessment,
    sanitize_incident_for_ai,
)
from app.services.ai.gemini_provider import GeminiProvider
from app.services.ai.groq_provider import GroqProvider
from app.services.ai.heuristic_provider import HeuristicProvider
from app.services.ai.service import AIService, ai_service, compute_triage_hash

__all__ = [
    "AIService",
    "BaseAIProvider",
    "GeminiProvider",
    "GroqProvider",
    "HeuristicProvider",
    "ai_service",
    "build_triage_prompt",
    "compute_triage_hash",
    "parse_and_validate_assessment",
    "sanitize_incident_for_ai",
]
