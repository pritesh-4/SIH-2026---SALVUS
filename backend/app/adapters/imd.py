"""India Meteorological Department (IMD) Official Warnings Adapter (Phase 1).

Ingests official IMD meteorological alerts and district-level weather warnings
(cyclone, heavy rainfall, thunderstorm/squall, heatwave, coldwave).
"""

from __future__ import annotations

import asyncio
import logging
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

logger = logging.getLogger("salvus.adapters.imd")

IMD_MAUSAM_API_URL = "https://mausam.imd.gov.in/api/warnings_district.json"
DEFAULT_TIMEOUT_SECONDS = 4.0


class IMDAdapter(BaseAlertAdapter):
    """Adapter for official India Meteorological Department (IMD) warnings & advisories."""

    def __init__(self, api_url: str = IMD_MAUSAM_API_URL, cache_ttl_seconds: int = 600):
        super().__init__(
            source_id="imd_india",
            source_name="India Meteorological Department (IMD)",
            display_name="IMD Direct",
            source_type=SourceType.WEATHER_SERVICE,
            cache_ttl_seconds=cache_ttl_seconds,
            endpoint_url=api_url,
            limitations=(
                "Official IMD district bulletins and CAP advisories. "
                "Direct API is secondary; national warnings are actively ingested via SACHET."
            ),
            initial_status=SourceStatus.UNAVAILABLE,
            initial_status_label="UNAVAILABLE / VIA SACHET",
            initial_is_live=False,
        )
        self.api_url = api_url
        self._etag: str | None = None
        self._cached_alerts: list[NormalizedAlert] = []
        self._last_fetch_time: datetime | None = None

    def clear_cache(self) -> None:
        """Reset cached IMD state for tests."""
        super().clear_cache()
        self._etag = None
        self._cached_alerts = []
        self._last_fetch_time = None

    async def fetch_alerts(
        self,
        lat: float | None = None,
        lon: float | None = None,
        client: httpx.AsyncClient | None = None,
        **kwargs,
    ) -> tuple[list[NormalizedAlert], AlertProvenance]:
        """Fetch and normalize official IMD district alerts."""
        now = datetime.now(UTC)
        start_time = time.perf_counter()

        # Check in-memory freshness
        if (
            self._cached_alerts
            and self._last_fetch_time
            and (now - self._last_fetch_time).total_seconds() < self.cache_ttl_seconds
        ):
            return self._cached_alerts, AlertProvenance.CACHED

        headers = {
            "User-Agent": "Salvus-Disaster-Intelligence/2.0 (Civil-Protection)",
            "Accept": "application/json, text/plain, */*",
        }
        if self._etag:
            headers["If-None-Match"] = self._etag

        # Bounded retry with backoff (up to 2 attempts)
        max_attempts = 2
        last_error = None

        for attempt in range(max_attempts):
            try:
                if client is not None:
                    response = await client.get(
                        self.api_url, headers=headers, timeout=DEFAULT_TIMEOUT_SECONDS
                    )
                else:
                    async with httpx.AsyncClient(timeout=DEFAULT_TIMEOUT_SECONDS) as http:
                        response = await http.get(self.api_url, headers=headers)

                latency_ms = (time.perf_counter() - start_time) * 1000.0

                # 1. HTTP 304 Not Modified
                if response.status_code == 304:
                    self._last_fetch_time = now
                    self.update_health(
                        status=SourceStatus.AVAILABLE,
                        latency_ms=latency_ms,
                        active_alerts_count=len(self._cached_alerts),
                    )
                    return self._cached_alerts, AlertProvenance.CACHED

                # 2. HTTP 200 OK
                if response.status_code == 200:
                    if "ETag" in response.headers:
                        self._etag = response.headers["ETag"]

                    data = response.json()
                    alerts = self._parse_imd_payload(data, now)
                    self._cached_alerts = alerts
                    self._last_fetch_time = now
                    self.update_health(
                        status=SourceStatus.AVAILABLE,
                        latency_ms=latency_ms,
                        active_alerts_count=len(alerts),
                    )
                    return alerts, AlertProvenance.LIVE

                logger.warning(
                    f"IMD API attempt {attempt + 1} returned HTTP {response.status_code}"
                )
                last_error = f"HTTP {response.status_code}"

            except Exception as e:
                last_error = str(e)
                logger.warning(f"IMD attempt {attempt + 1} failed: {e}")

            if attempt < max_attempts - 1:
                await asyncio.sleep(0.2 * (attempt + 1))

        latency_ms = (time.perf_counter() - start_time) * 1000.0
        status = SourceStatus.STALE if self._cached_alerts else SourceStatus.UNAVAILABLE
        self.update_health(
            status=status,
            latency_ms=latency_ms,
            error=last_error,
            status_label="UNAVAILABLE / VIA SACHET",
            is_live=False,
        )
        prov = AlertProvenance.CACHED if self._cached_alerts else AlertProvenance.FALLBACK
        return self._cached_alerts, prov

    def _parse_imd_payload(self, data: Any, now: datetime) -> list[NormalizedAlert]:
        """Parse raw IMD warnings list/dict into normalized alerts."""
        alerts: list[NormalizedAlert] = []
        now_iso = now.isoformat()

        records: list[dict[str, Any]] = []
        if isinstance(data, list):
            records = [r for r in data if isinstance(r, dict)]
        elif isinstance(data, dict):
            records = data.get("warnings") or data.get("data") or data.get("features") or []
            if not isinstance(records, list):
                records = [data]

        for idx, rec in enumerate(records):
            if not isinstance(rec, dict):
                continue

            district = str(
                rec.get("district_name") or rec.get("district") or rec.get("area") or ""
            ).strip()
            state = str(rec.get("state_name") or rec.get("state") or "").strip()
            color = str(
                rec.get("warning_color") or rec.get("color") or rec.get("severity") or "GREEN"
            ).upper()

            # Filter GREEN (No warning) to avoid alarm fatigue
            if color in ("GREEN", "NO_WARNING", "NIL", "WHITE"):
                continue

            sev = self._map_color_to_severity(color)
            hazard_type = self._map_hazard_type(
                rec.get("warning_type") or rec.get("hazard") or rec.get("description")
            )

            title = str(
                rec.get("title")
                or rec.get("warning_text")
                or f"IMD {color} Warning — {district or state or 'Regional'}"
            )
            desc = str(
                rec.get("description")
                or rec.get("action_text")
                or f"Official IMD advisory for {district}, {state}. {color} alert level in effect."
            )
            rec_action = str(
                rec.get("action_suggested")
                or rec.get("recommendation")
                or "Follow state disaster management guidelines and maintain situational vigilance."
            )

            lat = float(rec.get("latitude") or rec.get("lat") or 0.0)
            lon = float(rec.get("longitude") or rec.get("lon") or 0.0)

            # Default coordinates to 0.0 only if not supplied;
            # if zero and no geometry, skip or locate
            if lat == 0.0 and lon == 0.0:
                # If no point coordinates, check if district centroid is provided
                continue

            event_id = str(
                rec.get("warning_id") or rec.get("id") or f"imd-{state}-{district}-{idx}"
            )
            exp_iso = (now + timedelta(hours=24)).isoformat()
            if rec.get("valid_to") or rec.get("expires_at"):
                exp_iso = str(rec.get("valid_to") or rec.get("expires_at"))

            alerts.append(
                NormalizedAlert(
                    id=f"imd-{event_id}",
                    source="India Meteorological Department (IMD)",
                    source_event_id=event_id,
                    source_type=SourceType.WEATHER_SERVICE,
                    hazard_type=hazard_type,
                    raw_type=color,
                    severity=sev,
                    confidence=0.95,
                    title=title,
                    description=desc,
                    why_it_matters=f"Official IMD meteorological warning level {color}.",
                    recommended_action=rec_action,
                    recommended_actions=[rec_action],
                    actionable=sev in (HazardSeverity.CRITICAL, HazardSeverity.WARNING),
                    latitude=lat,
                    longitude=lon,
                    affected_area=f"{district}, {state}"
                    if district and state
                    else district or state or "Regional Zone",
                    radius_km=float(rec.get("radius_km") or 25.0),
                    observed_at=str(rec.get("issued_time") or now_iso),
                    issued_at=str(rec.get("issued_time") or now_iso),
                    starts_at=str(rec.get("valid_from") or now_iso),
                    expires_at=exp_iso,
                    fetched_at=now_iso,
                    status=AlertStatus.ACTIVE,
                    source_url=str(rec.get("source_url") or "https://mausam.imd.gov.in"),
                    provenance=AlertProvenance.LIVE,
                    is_active=True,
                    sources_matched=["India Meteorological Department (IMD)"],
                )
            )

        return alerts

    def _map_color_to_severity(self, color: str) -> HazardSeverity:
        """Map IMD warning colors to Salvus HazardSeverity."""
        if "RED" in color:
            return HazardSeverity.CRITICAL
        if "ORANGE" in color or "AMBER" in color:
            return HazardSeverity.WARNING
        if "YELLOW" in color:
            return HazardSeverity.WATCH
        return HazardSeverity.ADVISORY

    def _map_hazard_type(self, text: str | None) -> HazardType:
        """Map IMD warning description to HazardType."""
        if not text:
            return HazardType.WEATHER
        t = text.lower()
        if "cyclone" in t or "depression" in t or "storm" in t:
            return HazardType.CYCLONE
        if "flood" in t or "inundation" in t:
            return HazardType.FLOOD
        if "fire" in t:
            return HazardType.FIRE
        return HazardType.WEATHER
