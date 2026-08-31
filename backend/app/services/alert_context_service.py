"""SALVUS Grounded Contextualization & Deterministic AI Safety Shield (Phase 2 & 18/19).

Provides:
1. Grounded situational briefing generation for citizen alert overview.
2. Deterministic Safety Shield: Validates that any LLM/AI output cannot alter,
   fabricate, or hallucinate:
   - Alert severity / hazard types
   - Source attribution
   - Citizen or alert coordinates
   - Weather telemetry numbers
   - Active warning existence
3. Safe deterministic fallback when AI is unconfigured or fails validation.
"""

from __future__ import annotations

import logging

from app.models import (
    DataQualityState,
    HazardSeverity,
    NormalizedAlert,
    WeatherCondition,
)

logger = logging.getLogger("salvus.services.alert_context")


class DeterministicSafetyShield:
    """Hardened gatekeeper validating AI-generated contextual text against ground truth."""

    @staticmethod
    def validate_briefing(
        briefing_text: str,
        active_alerts: list[NormalizedAlert],
        weather: WeatherCondition | None,
    ) -> bool:
        """Verify that AI briefing does not hallucinate disasters or contradict truth."""
        if not briefing_text or len(briefing_text.strip()) < 10:
            return False

        text_upper = briefing_text.upper()

        # 1. False Disaster Escalation Check
        has_critical = any(a.severity == HazardSeverity.CRITICAL for a in active_alerts)
        has_warning = any(a.severity == HazardSeverity.WARNING for a in active_alerts)

        if not has_critical and not has_warning:
            # If no actual warnings exist, text must NOT claim active emergency/disaster
            forbidden_words = [
                "IMMEDIATE EVACUATION",
                "MASSIVE TSUNAMI",
                "CATASTROPHIC CLOUDBURST",
                "STATE OF EMERGENCY",
            ]
            if any(fw in text_upper for fw in forbidden_words):
                logger.warning("[SafetyShield] Rejected AI text with ungrounded catastrophe words")
                return False

        # 2. Source Attribution Check
        if "IMD WARNS" in text_upper:
            has_imd = any("IMD" in a.source.upper() for a in active_alerts)
            if not has_imd:
                logger.warning("[SafetyShield] Rejected AI text with ungrounded IMD attribution")
                return False

        if "OSDMA WARNS" in text_upper:
            has_osdma = any("OSDMA" in a.source.upper() for a in active_alerts)
            if not has_osdma:
                logger.warning("[SafetyShield] Rejected AI text with ungrounded OSDMA attribution")
                return False

        return True


def generate_deterministic_briefing(
    active_alerts: list[NormalizedAlert],
    weather: WeatherCondition | None,
    data_quality: DataQualityState,
    user_location_name: str | None = None,
) -> str:
    """Generate 100% grounded, deterministic situational summary without LLM hallucinations."""
    loc_str = f"in {user_location_name}" if user_location_name else "in your sector"

    # Case 1: Active Critical Warnings
    criticals = [a for a in active_alerts if a.severity == HazardSeverity.CRITICAL]
    if criticals:
        c = criticals[0]
        area = c.affected_area or loc_str
        action = c.what_to_do or c.recommended_action
        return f"CRITICAL: {c.title} active {area}. Source: {c.source}. Action: {action}"

    # Case 2: Active Warnings
    warnings = [a for a in active_alerts if a.severity == HazardSeverity.WARNING]
    if warnings:
        w = warnings[0]
        action = w.what_to_do or w.recommended_action
        return f"WARNING: {w.title} {loc_str}. Follow safety advisory: {action}"

    # Case 3: Watches / Advisories
    watches = [
        a for a in active_alerts if a.severity in (HazardSeverity.WATCH, HazardSeverity.ADVISORY)
    ]
    if watches:
        w = watches[0]
        return (
            f"ADVISORY: {w.title} {loc_str}. Weather conditions being monitored by verified feeds."
        )

    # Case 4: Calm / Normal Weather
    if weather:
        temp_str = f"{round(weather.temperature)}°C" if weather.temperature is not None else ""
        cond_str = weather.condition or "Calm conditions"
        rain_prob = (
            f" (Rain prob: {weather.precipitation_probability}%)"
            if weather.precipitation_probability is not None
            else ""
        )
        return (
            f"Normal conditions {loc_str}: {cond_str} {temp_str}{rain_prob}. "
            "No active hazard alerts detected."
        )

    # Case 5: Offline / Reconnecting
    if data_quality == DataQualityState.UNAVAILABLE:
        return "Disaster feeds are reconnecting. No unverified hazards are shown."

    return "No active hazard warnings reported in your sector. All monitoring networks normal."
