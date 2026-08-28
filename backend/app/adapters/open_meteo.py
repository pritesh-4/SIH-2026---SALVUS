"""Open-Meteo Environmental & Meteorological Context Adapter (Phase 2).

Provides contextual weather telemetry without turning normal precipitation into false disaster
emergencies. Enforces strict, non-alarmist thresholds and labels alerts as WEATHER CONDITION.
"""

from __future__ import annotations

import logging
import time
from datetime import UTC, datetime, timedelta
from typing import Any

import httpx

from app.adapters.base import BaseAlertAdapter
from app.models import (
    AlertProvenance,
    HazardSeverity,
    HazardType,
    NormalizedAlert,
    SourceStatus,
    SourceType,
)

logger = logging.getLogger("salvus.adapters.open_meteo")

OPEN_METEO_API_URL = "https://api.open-meteo.com/v1/forecast"
DEFAULT_TIMEOUT_SECONDS = 3.5


class OpenMeteoAdapter(BaseAlertAdapter):
    """Adapter for Open-Meteo weather and environmental context telemetry."""

    def __init__(self, api_url: str = OPEN_METEO_API_URL, cache_ttl_seconds: int = 300):
        super().__init__(
            source_id="open_meteo",
            source_name="Open-Meteo Weather Service",
            source_type=SourceType.WEATHER_SERVICE,
            cache_ttl_seconds=cache_ttl_seconds,
        )
        self.api_url = api_url
        # Grid cache: {(round(lat, 2), round(lon, 2)): (alerts, expire_datetime)}
        self._grid_cache: dict[tuple[float, float], tuple[list[NormalizedAlert], datetime]] = {}

    def clear_cache(self) -> None:
        """Reset cached weather telemetry for testing."""
        self._grid_cache.clear()

    async def fetch_alerts(
        self,
        lat: float | None = None,
        lon: float | None = None,
        client: httpx.AsyncClient | None = None,
        **kwargs,
    ) -> tuple[list[NormalizedAlert], AlertProvenance]:
        """Fetch real-time environmental context for coordinates with non-alarmist thresholds."""
        now = datetime.now(UTC)
        start_time = time.perf_counter()

        target_lat = round(lat if lat is not None else 22.5726, 2)
        target_lon = round(lon if lon is not None else 88.3639, 2)
        grid_key = (target_lat, target_lon)

        # Check grid cache
        cached_entry = self._grid_cache.get(grid_key)
        if cached_entry and now < cached_entry[1]:
            return cached_entry[0], AlertProvenance.CACHED

        params = {
            "latitude": target_lat,
            "longitude": target_lon,
            "current": (
                "precipitation,rain,showers,snowfall,wind_speed_10m,wind_gusts_10m,weather_code"
            ),
            "hourly": "precipitation",
            "forecast_days": 1,
            "timezone": "auto",
        }

        try:
            if client is not None:
                response = await client.get(
                    self.api_url, params=params, timeout=DEFAULT_TIMEOUT_SECONDS
                )
            else:
                async with httpx.AsyncClient(timeout=DEFAULT_TIMEOUT_SECONDS) as http:
                    response = await http.get(self.api_url, params=params)

            latency_ms = (time.perf_counter() - start_time) * 1000.0

            if response.status_code != 200:
                logger.warning(f"Open-Meteo API returned HTTP {response.status_code}")
                cached_alerts = cached_entry[0] if cached_entry else []
                status = SourceStatus.FAILED if not cached_alerts else SourceStatus.STALE
                self.update_health(
                    status=status,
                    latency_ms=latency_ms,
                    error=f"HTTP {response.status_code}",
                )
                prov = AlertProvenance.CACHED if cached_alerts else AlertProvenance.FALLBACK
                return cached_alerts, prov

            data = response.json()
            alerts = self._evaluate_environmental_context(data, target_lat, target_lon, now)

            # Store in grid cache
            expires_at_dt = now + timedelta(seconds=self.cache_ttl_seconds)
            self._grid_cache[grid_key] = (alerts, expires_at_dt)

            self.update_health(
                status=SourceStatus.AVAILABLE,
                latency_ms=latency_ms,
                active_alerts_count=len(alerts),
            )
            return alerts, AlertProvenance.LIVE

        except Exception as e:
            latency_ms = (time.perf_counter() - start_time) * 1000.0
            logger.warning(f"Failed to fetch Open-Meteo telemetry: {e}")
            cached_alerts = cached_entry[0] if cached_entry else []
            status = SourceStatus.FAILED if not cached_alerts else SourceStatus.STALE
            self.update_health(status=status, latency_ms=latency_ms, error=str(e))
            prov = AlertProvenance.CACHED if cached_alerts else AlertProvenance.FALLBACK
            return cached_alerts, prov

    def _evaluate_environmental_context(
        self, data: dict[str, Any], lat: float, lon: float, now: datetime
    ) -> list[NormalizedAlert]:
        """Apply strict non-alarmist thresholds to environmental measurements.

        Rule: Rain is NOT a disaster. Normal precipitation (<15mm/h) produces NO alert.
        """
        current = data.get("current", {})
        hourly = data.get("hourly", {})

        precip = float(current.get("precipitation") or current.get("rain") or 0.0)
        wind_speed = float(current.get("wind_speed_10m") or 0.0)
        wind_gusts = float(current.get("wind_gusts_10m") or wind_speed)

        # 3-hour precipitation accumulation
        hourly_precip = hourly.get("precipitation", [])
        accum_3h = sum(float(p) for p in hourly_precip[:3] if p is not None)

        now_iso = now.isoformat()
        alerts: list[NormalizedAlert] = []

        # 1. EXTREME SQUALL / CLOUDBURST (Warning Level)
        # Threshold: Extreme rainfall > 50mm/h or wind gusts > 90 km/h
        if precip >= 50.0 or accum_3h >= 100.0 or wind_gusts >= 90.0:
            exp_iso = (now + timedelta(hours=3)).isoformat()
            alerts.append(
                NormalizedAlert(
                    id=f"alt-meteo-severe-{lat:.2f}-{lon:.2f}",
                    source="Open-Meteo Weather Service",
                    source_event_id=f"meteo-severe-{int(now.timestamp())}",
                    source_type=SourceType.WEATHER_SERVICE,
                    hazard_type=HazardType.WEATHER,
                    severity=HazardSeverity.WARNING,
                    title="WEATHER CONDITION: Severe Rain Squall / High Wind Advisory",
                    description=(
                        f"Extreme weather metrics recorded: {precip:.1f} mm/h precipitation, "
                        f"{wind_gusts:.1f} km/h wind gusts."
                    ),
                    why_it_matters=(
                        "Potential for localized water accumulation and flying "
                        "debris in exposed areas."
                    ),
                    recommended_action=(
                        "Seek solid shelter indoors; avoid traveling during peak storm activity."
                    ),
                    latitude=lat,
                    longitude=lon,
                    affected_area="Regional Weather Grid Sector",
                    radius_km=15.0,
                    observed_at=now_iso,
                    issued_at=now_iso,
                    expires_at=exp_iso,
                    fetched_at=now_iso,
                    source_url="https://open-meteo.com",
                    provenance=AlertProvenance.LIVE,
                    confidence=0.92,
                    is_active=True,
                )
            )

        # 2. MODERATE SQUALL / HEAVY RAIN (Watch Level)
        # Threshold: Moderate rain 15-50mm/h or wind gusts 60-90 km/h
        elif precip >= 15.0 or accum_3h >= 40.0 or wind_gusts >= 60.0:
            exp_iso = (now + timedelta(hours=3)).isoformat()
            alerts.append(
                NormalizedAlert(
                    id=f"alt-meteo-watch-{lat:.2f}-{lon:.2f}",
                    source="Open-Meteo Weather Service",
                    source_event_id=f"meteo-watch-{int(now.timestamp())}",
                    source_type=SourceType.WEATHER_SERVICE,
                    hazard_type=HazardType.WEATHER,
                    severity=HazardSeverity.WATCH,
                    title="WEATHER CONDITION: Active Heavy Rain / Gusty Winds",
                    description=(
                        f"Active rainfall recorded at {precip:.1f} mm/h with "
                        f"gusts of {wind_gusts:.1f} km/h."
                    ),
                    why_it_matters=(
                        "Surface water runoff and localized traffic slowdowns possible."
                    ),
                    recommended_action=(
                        "Exercise caution on roadways and monitor official municipal channels."
                    ),
                    latitude=lat,
                    longitude=lon,
                    affected_area="Regional Weather Grid Sector",
                    radius_km=10.0,
                    observed_at=now_iso,
                    issued_at=now_iso,
                    expires_at=exp_iso,
                    fetched_at=now_iso,
                    source_url="https://open-meteo.com",
                    provenance=AlertProvenance.LIVE,
                    confidence=0.88,
                    is_active=True,
                )
            )

        # 3. ROUTINE WEATHER (<15 mm/h rain, normal wind)
        # Emits NO disaster alert to prevent false alarms

        return alerts
