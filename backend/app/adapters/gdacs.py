"""GDACS (Global Disaster Alert and Coordination System) Adapter (Phase 2).

Consumes the official GDACS GeoJSON API (UN / European Commission) for multi-hazard global
disaster event awareness, preserving event IDs, alert levels, and verified coordinates.
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

logger = logging.getLogger("salvus.adapters.gdacs")

GDACS_GEOJSON_URL = "https://www.gdacs.org/datareport/resources/GDACS/events.geojson"
DEFAULT_TIMEOUT_SECONDS = 4.0


class GDACSAdapter(BaseAlertAdapter):
    """Adapter for official GDACS (UN/EU) multi-hazard disaster event feeds."""

    def __init__(self, feed_url: str = GDACS_GEOJSON_URL, cache_ttl_seconds: int = 600):
        super().__init__(
            source_id="gdacs",
            source_name="GDACS (UN / EU)",
            source_type=SourceType.CIVIL_DEFENSE,
            cache_ttl_seconds=cache_ttl_seconds,
        )
        self.feed_url = feed_url
        self._cached_alerts: list[NormalizedAlert] = []
        self._last_fetch_time: datetime | None = None

    def clear_cache(self) -> None:
        """Reset cached GDACS alerts for testing."""
        self._cached_alerts = []
        self._last_fetch_time = None

    async def fetch_alerts(
        self,
        lat: float | None = None,
        lon: float | None = None,
        client: httpx.AsyncClient | None = None,
        **kwargs,
    ) -> tuple[list[NormalizedAlert], AlertProvenance]:
        """Fetch and normalize active global disaster events from GDACS."""
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
            "User-Agent": "Salvus-Disaster-Coordination/2.0",
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
                logger.warning(f"GDACS feed returned HTTP {response.status_code}")
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
            alerts = self._parse_gdacs_features(features, now)

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
            logger.warning(f"Failed to fetch GDACS disaster feed: {e}")
            status = SourceStatus.FAILED if not self._cached_alerts else SourceStatus.STALE
            self.update_health(status=status, latency_ms=latency_ms, error=str(e))
            prov = AlertProvenance.CACHED if self._cached_alerts else AlertProvenance.FALLBACK
            return self._cached_alerts, prov

    def _parse_gdacs_features(
        self, features: list[dict[str, Any]], now: datetime
    ) -> list[NormalizedAlert]:
        """Parse GeoJSON features from GDACS into normalized alerts."""
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

            event_id = str(props.get("eventid") or props.get("id") or f"gdacs-{len(alerts)}")
            event_type_raw = str(props.get("eventtype") or props.get("hazard_type") or "OT")
            alert_level = str(props.get("alertlevel") or props.get("alert_level") or "Green")
            name = str(props.get("name") or props.get("eventname") or "Global Disaster Event")
            desc = str(
                props.get("description")
                or f"GDACS {alert_level} Alert for {name} ({event_type_raw})"
            )
            country = props.get("country") or "International Zone"

            hazard_type = self._map_event_type(event_type_raw)
            severity = self._map_alert_level(alert_level)
            radius_km = self._calculate_event_radius(hazard_type, alert_level)

            # Timestamps
            from_date = props.get("fromdate") or props.get("onset")
            to_date = props.get("todate") or props.get("expires")
            observed_at = self._parse_iso_time(from_date, now_iso)
            expires_at = (
                self._parse_iso_time(to_date, (now + timedelta(hours=12)).isoformat())
                if to_date
                else (now + timedelta(hours=12)).isoformat()
            )

            # Recommended action based on alert level
            if severity == HazardSeverity.CRITICAL:
                action = "Coordinate with emergency response units; review evacuation corridors."
            elif severity == HazardSeverity.WARNING:
                action = "Monitor international civil protection updates and prepare contingencies."
            else:
                action = "Review regional situation reports."

            url = (
                props.get("url")
                or f"https://www.gdacs.org/report.aspx?eventtype={event_type_raw}&eventid={event_id}"
            )

            alert = NormalizedAlert(
                id=f"alt-gdacs-{event_id}",
                source="GDACS (UN / EU)",
                source_event_id=event_id,
                source_type=SourceType.CIVIL_DEFENSE,
                hazard_type=hazard_type,
                severity=severity,
                title=f"GDACS {alert_level} Alert: {name}",
                description=desc,
                why_it_matters=f"Global disaster alert issued for {country}.",
                recommended_action=action,
                latitude=float(lat),
                longitude=float(lon),
                affected_area=f"{name}, {country}",
                radius_km=radius_km,
                observed_at=observed_at,
                issued_at=observed_at,
                expires_at=expires_at,
                fetched_at=now_iso,
                source_url=url,
                provenance=AlertProvenance.LIVE,
                confidence=0.96,
                is_active=True,
            )
            alerts.append(alert)

        return alerts

    def _map_event_type(self, code: str) -> HazardType:
        """Map GDACS 2-letter event code to HazardType."""
        c = code.upper().strip()
        if c in ("TC", "TS", "CYCLONE", "HURRICANE", "TYPHOON"):
            return HazardType.CYCLONE
        if c in ("EQ", "EARTHQUAKE"):
            return HazardType.EARTHQUAKE
        if c in ("FL", "FLOOD"):
            return HazardType.FLOOD
        if c in ("WF", "FIRE", "WILDFIRE"):
            return HazardType.FIRE
        if c in ("SW", "WEATHER", "EXTREME_WEATHER"):
            return HazardType.WEATHER
        return HazardType.OTHER

    def _map_alert_level(self, level: str) -> HazardSeverity:
        """Map GDACS color alert level to HazardSeverity."""
        lvl = level.lower().strip()
        if "red" in lvl:
            return HazardSeverity.CRITICAL
        if "orange" in lvl:
            return HazardSeverity.WARNING
        if "yellow" in lvl:
            return HazardSeverity.WATCH
        if "green" in lvl:
            return HazardSeverity.ADVISORY
        return HazardSeverity.INFO

    def _calculate_event_radius(self, hazard_type: HazardType, alert_level: str) -> float:
        """Calculate realistic event impact radius in km."""
        lvl = alert_level.lower()
        if hazard_type == HazardType.CYCLONE:
            return 100.0 if "red" in lvl else 50.0
        if hazard_type == HazardType.EARTHQUAKE:
            return 50.0 if "red" in lvl else 25.0
        if hazard_type == HazardType.FLOOD:
            return 30.0 if "red" in lvl else 15.0
        return 25.0

    def _parse_iso_time(self, raw_time: str | None, default_iso: str) -> str:
        """Safely parse GDACS date string to ISO format."""
        if not raw_time:
            return default_iso
        try:
            clean = raw_time.replace("Z", "+00:00")
            dt = datetime.fromisoformat(clean)
            return dt.isoformat()
        except Exception:
            return default_iso
