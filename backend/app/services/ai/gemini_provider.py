"""Google Gemini AI Triage Provider."""

from __future__ import annotations

import logging
import os
import re

import httpx

from app.models import AITriageAssessment
from app.services.ai.base import (
    BaseAIProvider,
    build_triage_prompt,
    parse_and_validate_assessment,
)

logger = logging.getLogger("salvus.ai.gemini")

GEMINI_API_URL = (
    "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent"
)


class GeminiProvider(BaseAIProvider):
    """Primary intelligence provider using Google Gemini."""

    def __init__(
        self,
        api_key: str | None = None,
        model: str | None = None,
        timeout: float = 4.0,
    ):
        active_model = model or os.getenv("GEMINI_MODEL", "gemini-flash-latest")
        super().__init__(name="gemini-provider", model=active_model, timeout=timeout)

        self.api_key = api_key or os.getenv("GEMINI_API_KEY")

    async def evaluate(
        self, sanitized: dict, image_data: str | None = None
    ) -> AITriageAssessment | None:
        key = self.api_key or os.getenv("GEMINI_API_KEY")
        if not key or not key.strip():
            logger.debug("Gemini API key not configured, skipping provider.")
            return None

        url = (
            f"https://generativelanguage.googleapis.com/v1beta/models/"
            f"{self.model}:generateContent?key={key.strip()}"
        )
        prompt_text = build_triage_prompt(sanitized, image_data)
        parts = [{"text": prompt_text}]

        if image_data and image_data.strip():
            raw_b64 = image_data.strip()
            mime_type = "image/jpeg"
            if raw_b64.startswith("data:"):
                match = re.match(r"data:([^;]+);base64,(.+)", raw_b64)
                if match:
                    mime_type = match.group(1)
                    raw_b64 = match.group(2)
            parts.append(
                {
                    "inlineData": {
                        "mimeType": mime_type,
                        "data": raw_b64,
                    }
                }
            )

        payload = {
            "contents": [{"parts": parts}],
            "generationConfig": {
                "temperature": 0.1,
                "responseMimeType": "application/json",
            },
        }

        try:
            async with httpx.AsyncClient(timeout=self.timeout) as client:
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
                return parse_and_validate_assessment(
                    raw_json_str=text_content,
                    sanitized=sanitized,
                    provider_name=self.name,
                    model_name=self.model,
                )
        except httpx.TimeoutException:
            logger.warning(f"Gemini API request timed out after {self.timeout}s.")
            return None
        except Exception as exc:
            logger.warning(f"Gemini API evaluation failed: {exc}")
            return None
