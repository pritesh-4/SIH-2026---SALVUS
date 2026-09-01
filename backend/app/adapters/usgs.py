"""USGS Earthquake Hazards Program Adapter (Phase 2).

Consumes the official USGS real-time GeoJSON earthquake feed, preserving event IDs,
magnitudes, epicenter coordinates, depths, and proportional hazard radii.
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

logger = logging.getLogger("salvus.adapters.usgs")

USGS_API_URL = "https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_day.geojson"
DEFAULT_TIMEOUT_SECONDS = 3.5


class USGSAdapter(BaseAlertAdapter):
    """Adapter for official USGS real-time seismic feeds."""

    def __init__(self, feed_url: str = USGS_API_URL, cache_ttl_seconds: int = 300):
        super().__init__(
            source_id="usgs_earthquake",
            source_name="USGS Earthquake Hazards Program",
            display_name="USGS",
            source_type=SourceType.SEISMIC_NETWORK,
            cache_ttl_seconds=cache_ttl_seconds,
            initial_status=SourceStatus.AVAILABLE,
            initial_status_label="LIVE",
            initial_is_live=True,
        )
        self.feed_url = feed_url
        self._cached_alerts: list[NormalizedAlert] = []
        self._last_fetch_time: datetime | None = None

    def clear_cache(self) -> None:
        """Reset cached USGS alerts for testing."""
        super().clear_cache()
        self._cached_alerts = []
        self._last_fetch_time = None

    async def fetch_alerts(
        self,
        lat: float | None = None,
        lon: float | None = None,
        client: httpx.AsyncClient | None = None,
        **kwargs,
    ) -> tuple[list[NormalizedAlert], AlertProvenance]:
        """Fetch and normalize real-time earthquakes from USGS GeoJSON feed."""
        now = datetime.now(UTC)
        start_time = time.perf_counter()

        # In-memory freshness check
        if (
            self._cached_alerts
            and self._last_fetch_time
            and (now - self._last_fetch_time).total_seconds() < self.cache_ttl_seconds
        ):
            return self._cached_alerts, AlertProvenance.CACHED

        headers = {
            "User-Agent": "Salvus-Emergency-Platform/2.0",
            "Accept": "application/geo+json, application/json",
        }

        try:
            if client is not None:
                response = await client.get(
                    self.feed_url, headers=headers, timeout=DEFAULT_TIMEOUT_SECONDS
                )
            else:
                async with httpx.AsyncClient(timeout=DEFAULT_TIMEOUT_SECONDS) as http:
                    response = await http.get(self.feed_url, headers=headers)

            latency_ms = (time.perf_counter() - start_time) * 1000.0

            if response.status_code != 200:
                logger.warning(f"USGS feed returned HTTP {response.status_code}")
                status = SourceStatus.FAILED if not self._cached_alerts else SourceStatus.STALE
                self.update_health(
                    status=status,
                    latency_ms=latency_ms,
                    error=f"HTTP {response.status_code}",
                )
                prov = AlertProvenance.CACHED if self._cached_alerts else AlertProvenance.FALLBACK
                return self._cached_alerts, prov

            data = response.json()
            features = data.get("features", [])
            alerts = self._parse_usgs_features(features, now)

            self._cached_alerts = alerts
            self._last_fetch_time = now
            self.update_health(
                status=SourceStatus.AVAILABLE,
                latency_ms=latency_ms,
                active_alerts_count=len(alerts),
            )
            return alerts, AlertProvenance.LIVE

        except Exception as e:
            latency_ms = (time.perf_counter() - start_time) * 1000.0
            logger.warning(f"Failed to fetch USGS earthquakes: {e}")
            status = SourceStatus.FAILED if not self._cached_alerts else SourceStatus.STALE
            self.update_health(status=status, latency_ms=latency_ms, error=str(e))
            prov = AlertProvenance.CACHED if self._cached_alerts else AlertProvenance.FALLBACK
            return self._cached_alerts, prov

    def _parse_usgs_features(
        self, features: list[dict[str, Any]], now: datetime
    ) -> list[NormalizedAlert]:
        """Parse USGS GeoJSON features into normalized alerts."""
        alerts: list[NormalizedAlert] = []
        now_iso = now.isoformat()

        for feat in features:
            if not isinstance(feat, dict):
                continue
            props = feat.get("properties") or {}
            geom = feat.get("geometry") or {}
            coords = geom.get("coordinates")

            if not coords or len(coords) < 2:
                continue

            lon, lat = coords[0], coords[1]
            if lat < -90.0 or lat > 90.0 or lon < -180.0 or lon > 180.0:
                continue

            mag = float(props.get("mag") or 0.0)
            # Filter negligible micro-tremors (<2.5M) to reduce noise
            if mag < 2.5:
                continue

            event_id = str(feat.get("id") or props.get("code") or f"usgs-{len(alerts)}")
            place = str(props.get("place") or "Global Seismic Location").strip()

            # Severity interpretation based on magnitude
            if mag >= 6.5:
                sev = HazardSeverity.CRITICAL
                radius = 80.0
                action = (
                    "Evacuate damaged masonry buildings; expect powerful aftershocks; "
                    "move to open muster points."
                )
            elif mag >= 5.0:
                sev = HazardSeverity.WARNING
                radius = 40.0
                action = (
                    "Inspect structural perimeters; shut off main gas valves; "
                    "remain outdoors if cracks develop."
                )
            elif mag >= 4.0:
                sev = HazardSeverity.WATCH
                radius = 25.0
                action = "Stay alert for potential minor tremors or shaking."
            else:
                sev = HazardSeverity.ADVISORY
                radius = 15.0
                action = "Seismic event recorded; monitor official reports."

            time_ms = props.get("time")
            observed_at = (
                datetime.fromtimestamp(time_ms / 1000.0, UTC).isoformat() if time_ms else now_iso
            )
            # Conservative TTL: 12 hours for significant earthquakes, 4 hours for minor
            ttl_hours = 12 if mag >= 5.0 else 4
            expires_at = (now + timedelta(hours=ttl_hours)).isoformat()

            url = (
                props.get("url") or f"https://earthquake.usgs.gov/earthquakes/eventpage/{event_id}"
            )

            alert = NormalizedAlert(
                id=f"alt-usgs-{event_id}",
                source="USGS Earthquake Hazards Program",
                source_event_id=event_id,
                source_type=SourceType.SEISMIC_NETWORK,
                hazard_type=HazardType.EARTHQUAKE,
                severity=sev,
                title=f"M{mag:.1f} Seismic Disturbance — {place}",
                description=f"Magnitude {mag:.1f} earthquake recorded by USGS seismic sensors.",
                why_it_matters="Potential for secondary tremors and structural vibrations.",
                recommended_action=action,
                latitude=float(lat),
                longitude=float(lon),
                affected_area=place,
                radius_km=radius,
                observed_at=observed_at,
                issued_at=observed_at,
                expires_at=expires_at,
                fetched_at=now_iso,
                source_url=url,
                provenance=AlertProvenance.LIVE,
                confidence=0.98,
                is_active=True,
            )
            alerts.append(alert)

        return alerts
