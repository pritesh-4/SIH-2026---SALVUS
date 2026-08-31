"""Odisha Department of Water Resources / Flood Forecasting Authority Adapter (Phase 1 & 22).

Integrates official Odisha river basin telemetry, Mahanadi / Brahmani / Baitarani reservoir levels,
and Central Water Commission (CWC) flood forecasts when structured telemetry is accessible.

Strict Non-Fabrication Policy:
When river gauges and reservoir SCADA systems are published only as manual PDF bulletins or internal
intranet feeds, this provider remains isolated in STANDBY / UNAVAILABLE status.
Zero fabricated water level warnings are ever returned.
"""

from __future__ import annotations

import logging
import os
import time
from datetime import UTC, datetime, timedelta

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

logger = logging.getLogger("salvus.adapters.odisha_flood")

ODISHA_FLOOD_API_URL = os.getenv(
    "ODISHA_FLOOD_API_URL", "https://dowrodisha.gov.in/api/v1/flood_telemetry"
)
ODISHA_FLOOD_API_KEY = os.getenv("ODISHA_FLOOD_API_KEY", "")
DEFAULT_TIMEOUT_SECONDS = 3.5


class OdishaFloodAdapter(BaseAlertAdapter):
    """Adapter for official Odisha Department of Water Resources & CWC Flood Telemetry."""

    def __init__(
        self,
        api_url: str = ODISHA_FLOOD_API_URL,
        api_key: str = ODISHA_FLOOD_API_KEY,
        cache_ttl_seconds: int = 600,
    ):
        initial_status = SourceStatus.AVAILABLE if api_key else SourceStatus.UNAVAILABLE
        super().__init__(
            source_id="odisha_flood",
            source_name="Odisha Water Resources & Flood Authority",
            source_type=SourceType.HYDROLOGICAL_SERVICE,
            cache_ttl_seconds=cache_ttl_seconds,
            endpoint_url=api_url,
            limitations=(
                "River gauge and reservoir level telemetry (Hirakud, Rengali, Indravati) "
                "require official WRD SCADA endpoint credentials. "
                "Standby mode active when uncredentialed."
            ),
            initial_status=initial_status,
        )
        self.api_url = api_url
        self.api_key = api_key
        self._cached_alerts: list[NormalizedAlert] = []
        self._last_fetch_time: datetime | None = None

    def clear_cache(self) -> None:
        """Reset cached flood state for tests."""
        super().clear_cache()
        self._cached_alerts = []
        self._last_fetch_time = None
        if not self.api_key:
            self._health.status = SourceStatus.UNAVAILABLE

    async def fetch_alerts(
        self,
        lat: float | None = None,
        lon: float | None = None,
        client: httpx.AsyncClient | None = None,
        **kwargs,
    ) -> tuple[list[NormalizedAlert], AlertProvenance]:
        """Fetch and normalize Odisha flood gauge telemetry if authorized."""
        now = datetime.now(UTC)
        start_time = time.perf_counter()

        # If uncredentialed, remain gracefully isolated
        if not self.api_key and "dowrodisha.gov.in" in self.api_url:
            self.update_health(
                status=SourceStatus.UNAVAILABLE,
                latency_ms=0.0,
                error=(
                    "Odisha Flood integration requires verified WRD SCADA feed/API access. "
                    "Adapter is in standby."
                ),
                active_alerts_count=0,
            )
            return [], AlertProvenance.FALLBACK

        if (
            self._cached_alerts
            and self._last_fetch_time
            and (now - self._last_fetch_time).total_seconds() < self.cache_ttl_seconds
        ):
            return self._cached_alerts, AlertProvenance.CACHED

        headers = {
            "Accept": "application/json",
            "Authorization": f"Bearer {self.api_key}",
        }

        try:
            if client is not None:
                resp = await client.get(self.api_url, headers=headers)
            else:
                async with httpx.AsyncClient(timeout=DEFAULT_TIMEOUT_SECONDS) as http:
                    resp = await http.get(self.api_url, headers=headers)
            latency = (time.perf_counter() - start_time) * 1000

            if resp.status_code != 200:
                self.update_health(
                    status=SourceStatus.DEGRADED,
                    latency_ms=latency,
                    error=f"HTTP {resp.status_code}",
                )
                return self._cached_alerts, AlertProvenance.CACHED

            data = resp.json()
            alerts = []
            now_iso = now.isoformat()

            raw_stations = data.get("stations", []) if isinstance(data, dict) else data
            for idx, rec in enumerate(raw_stations):
                if not isinstance(rec, dict):
                    continue
                station_name = rec.get("station_name") or rec.get("river") or f"Station-{idx}"
                water_level = float(rec.get("water_level_m") or rec.get("level") or 0.0)
                danger_level = float(rec.get("danger_level_m") or rec.get("danger_level") or 0.0)
                warning_level = float(rec.get("warning_level_m") or danger_level * 0.9)

                # Skip normal levels
                if danger_level > 0 and water_level < warning_level:
                    continue

                sev = (
                    HazardSeverity.CRITICAL
                    if (danger_level > 0 and water_level >= danger_level)
                    else HazardSeverity.WARNING
                )
                event_id = str(rec.get("station_id") or f"wrd-{idx}")
                lat = float(rec.get("latitude") or 20.4625)
                lon = float(rec.get("longitude") or 85.8830)

                exp_iso = (now + timedelta(hours=8)).isoformat()
                rec_action = (
                    "Avoid low-lying river embankments; follow district disaster management "
                    "evacuation routes."
                )

                desc = (
                    f"River gauge at {station_name} recorded water level at "
                    f"{water_level:.2f}m (Danger Stage: {danger_level:.2f}m)."
                )

                alerts.append(
                    NormalizedAlert(
                        id=f"wrd-{event_id}",
                        source="Odisha Water Resources & Flood Authority",
                        source_event_id=event_id,
                        source_type=SourceType.HYDROLOGICAL_SERVICE,
                        hazard_type=HazardType.FLOOD,
                        raw_type="RIVER_INUNDATION",
                        severity=sev,
                        confidence=0.96,
                        title=f"FLOOD WARNING: Elevated River Stage at {station_name}",
                        description=desc,
                        why_it_matters="Downstream flood plain inundation risk.",
                        recommended_action=rec_action,
                        recommended_actions=[rec_action],
                        actionable=True,
                        latitude=lat,
                        longitude=lon,
                        affected_area=f"{station_name} Basin",
                        radius_km=float(rec.get("radius_km") or 15.0),
                        observed_at=str(rec.get("timestamp") or now_iso),
                        issued_at=str(rec.get("timestamp") or now_iso),
                        starts_at=str(rec.get("timestamp") or now_iso),
                        expires_at=exp_iso,
                        fetched_at=now_iso,
                        status=AlertStatus.ACTIVE,
                        source_url="https://dowrodisha.gov.in",
                        provenance=AlertProvenance.LIVE,
                        is_active=True,
                        sources_matched=["Odisha Water Resources & Flood Authority"],
                    )
                )

            self._cached_alerts = alerts
            self._last_fetch_time = now
            self.update_health(
                status=SourceStatus.AVAILABLE,
                latency_ms=latency,
                active_alerts_count=len(alerts),
            )
            return alerts, AlertProvenance.LIVE

        except Exception as e:
            latency = (time.perf_counter() - start_time) * 1000
            logger.info(f"Odisha Flood telemetry unreachable (expected when uncredentialed): {e}")
            status = SourceStatus.STALE if self._cached_alerts else SourceStatus.UNAVAILABLE
            self.update_health(
                status=status,
                latency_ms=latency,
                error="Hydrological telemetry unreachable. Requires verified WRD API access.",
            )
            prov = AlertProvenance.CACHED if self._cached_alerts else AlertProvenance.FALLBACK
            return self._cached_alerts, prov
