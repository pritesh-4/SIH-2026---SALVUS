"""Groq Llama 3.3 70B AI Triage Provider."""

from __future__ import annotations

import logging
import os

import httpx

from app.models import AITriageAssessment
from app.services.ai.base import (
    BaseAIProvider,
    build_triage_prompt,
    parse_and_validate_assessment,
)

logger = logging.getLogger("salvus.ai.groq")

GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions"


class GroqProvider(BaseAIProvider):
    """Secondary fallback intelligence provider using Groq LLMs."""

    def __init__(
        self,
        api_key: str | None = None,
        model: str | None = None,
        timeout: float = 4.0,
    ):
        active_model = model or os.getenv("GROQ_MODEL", "openai/gpt-oss-120b")
        super().__init__(name="groq-provider", model=active_model, timeout=timeout)
        self.api_key = api_key or os.getenv("GROQ_API_KEY")

    async def evaluate(
        self, sanitized: dict, image_data: str | None = None
    ) -> AITriageAssessment | None:
        key = self.api_key or os.getenv("GROQ_API_KEY")
        if not key or not key.strip():
            logger.debug("Groq API key not configured, skipping provider.")
            return None

        prompt_text = build_triage_prompt(sanitized, image_data)

        payload = {
            "model": self.model,
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

        headers = {"Authorization": f"Bearer {key.strip()}", "Content-Type": "application/json"}

        try:
            async with httpx.AsyncClient(timeout=self.timeout) as client:
                response = await client.post(GROQ_API_URL, json=payload, headers=headers)
                if response.status_code != 200:
                    logger.warning(f"Groq API returned status {response.status_code}")
                    return None

                data = response.json()
                raw_text = data["choices"][0]["message"]["content"]
                return parse_and_validate_assessment(
                    raw_json_str=raw_text,
                    sanitized=sanitized,
                    provider_name=self.name,
                    model_name=self.model,
                )
        except httpx.TimeoutException:
            logger.warning(f"Groq API request timed out after {self.timeout}s.")
            return None
        except Exception as exc:
            logger.warning(f"Groq API evaluation failed: {exc}")
            return None
