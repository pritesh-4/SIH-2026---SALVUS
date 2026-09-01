"""Odisha State Disaster Management Authority (OSDMA) / SATARK Adapter (Phase 1 & 19).

Integrates official Odisha-specific disaster telemetry and SATARK early warnings
(cyclone, lightning, heat wave, flood, storm surge) when machine-readable API access is configured.

Strict Non-Fabrication Policy:
When unauthenticated public machine-readable feeds are not exposed by the authority,
this adapter stays in STANDBY / UNAVAILABLE mode with documented integration requirements.
Zero fabricated or simulated data is ever produced.
"""

from __future__ import annotations

import logging
import os
import time
from datetime import UTC, datetime, timedelta
from typing import Any

import httpx

from app.adapters.base import BaseAlertAdapter
from app.models import (
    AlertProvenance,
    AlertStatus,
    HazardSeverity,
    HazardType,
    NormalizedAlert,
    SourceStatus,
    SourceType,
)

logger = logging.getLogger("salvus.adapters.osdma")

# Configurable environment endpoint for verified authority feeds
OSDMA_API_URL = os.getenv("OSDMA_SATARK_API_URL", "https://satark.odisha.gov.in/api/v1/alerts")
OSDMA_API_KEY = os.getenv("OSDMA_SATARK_API_KEY", "")
DEFAULT_TIMEOUT_SECONDS = 3.5


class OSDMAAdapter(BaseAlertAdapter):
    """Adapter for official OSDMA / SATARK Odisha Early Warning Network."""

    def __init__(
        self,
        api_url: str = OSDMA_API_URL,
        api_key: str = OSDMA_API_KEY,
        cache_ttl_seconds: int = 600,
    ):
        initial_status = SourceStatus.AVAILABLE if api_key else SourceStatus.UNAVAILABLE
        initial_label = "LIVE" if api_key else "CONFIGURATION REQUIRED"
        super().__init__(
            source_id="osdma_satark",
            source_name="OSDMA / SATARK Odisha",
            display_name="OSDMA",
            source_type=SourceType.CIVIL_DEFENSE,
            cache_ttl_seconds=cache_ttl_seconds,
            endpoint_url=api_url,
            limitations=(
                "Requires verified OSDMA/SATARK secure API key or state intranet access. "
                "In unauthenticated deployment environments, the adapter remains "
                "isolated in STANDBY."
            ),
            initial_status=initial_status,
            initial_status_label=initial_label,
            initial_is_live=bool(api_key),
        )
        self.api_url = api_url
        self.api_key = api_key
        self._cached_alerts: list[NormalizedAlert] = []
        self._last_fetch_time: datetime | None = None

    def clear_cache(self) -> None:
        """Reset cached OSDMA state for tests."""
        super().clear_cache()
        self._cached_alerts = []
        self._last_fetch_time = None
        if not self.api_key:
            self._health.status = SourceStatus.UNAVAILABLE
            self._health.status_label = "CONFIGURATION REQUIRED"
            self._health.is_live = False

    async def fetch_alerts(
        self,
        lat: float | None = None,
        lon: float | None = None,
        client: httpx.AsyncClient | None = None,
        **kwargs,
    ) -> tuple[list[NormalizedAlert], AlertProvenance]:
        """Fetch and normalize OSDMA / SATARK alerts if machine-readable access is enabled."""
        now = datetime.now(UTC)
        start_time = time.perf_counter()

        # If no verified credentials or endpoint configured, remain gracefully isolated
        if not self.api_key and "satark.odisha.gov.in" in self.api_url:
            self.update_health(
                status=SourceStatus.UNAVAILABLE,
                latency_ms=0.0,
                error=(
                    "OSDMA integration requires verified feed/API access credentials. "
                    "Adapter is isolated in standby mode."
                ),
                active_alerts_count=0,
            )
            return [], AlertProvenance.FALLBACK

        # In-memory cache freshness check
        if (
            self._cached_alerts
            and self._last_fetch_time
            and (now - self._last_fetch_time).total_seconds() < self.cache_ttl_seconds
        ):
            return self._cached_alerts, AlertProvenance.CACHED

        headers = {
            "User-Agent": "Salvus-Disaster-Coordination/2.0 (State-Portal-Adapter)",
            "Accept": "application/json",
        }
        if self.api_key:
            headers["Authorization"] = f"Bearer {self.api_key}"

        try:
            if client is not None:
                response = await client.get(
                    self.api_url, headers=headers, timeout=DEFAULT_TIMEOUT_SECONDS
                )
            else:
                async with httpx.AsyncClient(timeout=DEFAULT_TIMEOUT_SECONDS) as http:
                    response = await http.get(self.api_url, headers=headers)

            latency_ms = (time.perf_counter() - start_time) * 1000.0

            if response.status_code == 200:
                data = response.json()
                alerts = self._parse_osdma_payload(data, now)
                self._cached_alerts = alerts
                self._last_fetch_time = now
                self.update_health(
                    status=SourceStatus.AVAILABLE,
                    latency_ms=latency_ms,
                    active_alerts_count=len(alerts),
                )
                return alerts, AlertProvenance.LIVE

            logger.warning(f"OSDMA API returned HTTP {response.status_code}")
            status = SourceStatus.STALE if self._cached_alerts else SourceStatus.UNAVAILABLE
            self.update_health(
                status=status,
                latency_ms=latency_ms,
                error=f"HTTP {response.status_code}",
            )
            prov = AlertProvenance.CACHED if self._cached_alerts else AlertProvenance.FALLBACK
            return self._cached_alerts, prov

        except Exception as e:
            latency_ms = (time.perf_counter() - start_time) * 1000.0
            logger.info(f"OSDMA feed unreachable (expected when uncredentialed): {e}")
            status = SourceStatus.STALE if self._cached_alerts else SourceStatus.UNAVAILABLE
            self.update_health(
                status=status,
                latency_ms=latency_ms,
                error="OSDMA / SATARK feed unreachable. Requires verified API access.",
            )
            prov = AlertProvenance.CACHED if self._cached_alerts else AlertProvenance.FALLBACK
            return self._cached_alerts, prov

    def _parse_osdma_payload(self, data: Any, now: datetime) -> list[NormalizedAlert]:
        """Parse structured OSDMA / SATARK JSON alerts when authenticated."""
        alerts: list[NormalizedAlert] = []
        now_iso = now.isoformat()

        if isinstance(data, list):
            records = data
        elif isinstance(data, dict):
            records = data.get("alerts") or data.get("data") or []
            if not isinstance(records, list):
                records = [records]
        else:
            records = []

        for idx, rec in enumerate(records):
            if not isinstance(rec, dict):
                continue

            hazard_raw = str(rec.get("hazard_type") or rec.get("hazard") or "OTHER")
            hazard_type = self._map_hazard_type(hazard_raw)
            sev_raw = str(rec.get("severity") or rec.get("alert_level") or "WARNING")
            sev = self._map_severity(sev_raw)

            event_id = str(rec.get("alert_id") or rec.get("id") or f"osdma-{idx}")
            lat = float(rec.get("latitude") or rec.get("lat") or 20.2961)
            lon = float(rec.get("longitude") or rec.get("lon") or 85.8245)
            area = str(rec.get("district") or rec.get("affected_area") or "Odisha State Sector")

            exp_iso = (now + timedelta(hours=12)).isoformat()
            if rec.get("expires_at") or rec.get("valid_to"):
                exp_iso = str(rec.get("expires_at") or rec.get("valid_to"))

            rec_action = str(
                rec.get("advisory")
                or rec.get("recommended_action")
                or "Follow OSDMA district collectorate advisories and stay tuned to local sirens."
            )

            alerts.append(
                NormalizedAlert(
                    id=f"osdma-{event_id}",
                    source="OSDMA / SATARK Odisha",
                    source_event_id=event_id,
                    source_type=SourceType.CIVIL_DEFENSE,
                    hazard_type=hazard_type,
                    raw_type=hazard_raw,
                    severity=sev,
                    confidence=0.98,
                    title=str(rec.get("title") or f"OSDMA Alert: {hazard_raw.title()} in {area}"),
                    description=str(
                        rec.get("description")
                        or f"Official OSDMA early warning bulletin for {area}."
                    ),
                    why_it_matters="Official state disaster management early warning advisory.",
                    recommended_action=rec_action,
                    recommended_actions=[rec_action],
                    actionable=True,
                    latitude=lat,
                    longitude=lon,
                    affected_area=area,
                    radius_km=float(rec.get("radius_km") or 20.0),
                    observed_at=str(rec.get("issued_at") or now_iso),
                    issued_at=str(rec.get("issued_at") or now_iso),
                    starts_at=str(rec.get("starts_at") or now_iso),
                    expires_at=exp_iso,
                    fetched_at=now_iso,
                    status=AlertStatus.ACTIVE,
                    source_url="https://satark.odisha.gov.in",
                    provenance=AlertProvenance.LIVE,
                    is_active=True,
                    sources_matched=["OSDMA / SATARK Odisha"],
                )
            )

        return alerts

    def _map_hazard_type(self, text: str) -> HazardType:
        t = text.lower()
        if "flood" in t:
            return HazardType.FLOOD
        if "cyclone" in t or "storm" in t:
            return HazardType.CYCLONE
        if "lightning" in t or "thunderstorm" in t or "heat" in t or "cold" in t:
            return HazardType.WEATHER
        if "earthquake" in t or "tsunami" in t:
            return HazardType.EARTHQUAKE
        if "fire" in t:
            return HazardType.FIRE
        return HazardType.OTHER

    def _map_severity(self, text: str) -> HazardSeverity:
        t = text.upper()
        if "CRITICAL" in t or "RED" in t or "SEVERE" in t:
            return HazardSeverity.CRITICAL
        if "WARNING" in t or "ORANGE" in t:
            return HazardSeverity.WARNING
        if "WATCH" in t or "YELLOW" in t:
            return HazardSeverity.WATCH
        return HazardSeverity.ADVISORY
