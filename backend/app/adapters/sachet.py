"""SACHET / NDMA India Alert Feed Adapter (Phase 2).

Consumes the official SACHET CAP/JSON feed with ETag conditional requests (If-None-Match)
and Last-Modified support. Normalizes official civil defense advisories into Salvus alert models.
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

logger = logging.getLogger("salvus.adapters.sachet")

SACHET_FEED_URL = "https://sachet.ndma.gov.in/cap_public_website/FetchAllAlertDetails"
DEFAULT_TIMEOUT_SECONDS = 4.0


class SachetAdapter(BaseAlertAdapter):
    """Adapter for official SACHET (NDMA India) Common Alerting Protocol feeds."""

    def __init__(self, feed_url: str = SACHET_FEED_URL, cache_ttl_seconds: int = 300):
        super().__init__(
            source_id="sachet_ndma",
            source_name="SACHET / NDMA India",
            source_type=SourceType.CIVIL_DEFENSE,
            cache_ttl_seconds=cache_ttl_seconds,
        )
        self.feed_url = feed_url
        self._etag: str | None = None
        self._last_modified: str | None = None
        self._cached_alerts: list[NormalizedAlert] = []
        self._last_fetch_time: datetime | None = None

    def clear_cache(self) -> None:
        """Reset cached feed and ETag state for testing."""
        self._etag = None
        self._last_modified = None
        self._cached_alerts = []
        self._last_fetch_time = None

    async def fetch_alerts(
        self,
        lat: float | None = None,
        lon: float | None = None,
        client: httpx.AsyncClient | None = None,
        **kwargs,
    ) -> tuple[list[NormalizedAlert], AlertProvenance]:
        """Fetch and normalize alerts from SACHET NDMA with ETag/304 conditional query."""
        now = datetime.now(UTC)
        start_time = time.perf_counter()

        # Check in-memory freshness before issuing an HTTP request
        if (
            self._cached_alerts
            and self._last_fetch_time
            and (now - self._last_fetch_time).total_seconds() < self.cache_ttl_seconds
        ):
            return self._cached_alerts, AlertProvenance.CACHED

        headers = {
            "User-Agent": "Salvus-Emergency-Platform/2.0",
            "Accept": "application/json, application/xml, text/xml, */*",
        }
        if self._etag:
            headers["If-None-Match"] = self._etag
        if self._last_modified:
            headers["If-Modified-Since"] = self._last_modified

        try:
            if client is not None:
                response = await client.get(
                    self.feed_url, headers=headers, timeout=DEFAULT_TIMEOUT_SECONDS
                )
            else:
                async with httpx.AsyncClient(timeout=DEFAULT_TIMEOUT_SECONDS) as http:
                    response = await http.get(self.feed_url, headers=headers)

            latency_ms = (time.perf_counter() - start_time) * 1000.0

            # 1. Handle HTTP 304 Not Modified: Reuse cached alerts
            if response.status_code == 304:
                self._last_fetch_time = now
                self.update_health(
                    status=SourceStatus.AVAILABLE,
                    latency_ms=latency_ms,
                    active_alerts_count=len(self._cached_alerts),
                )
                return self._cached_alerts, AlertProvenance.CACHED

            # 2. Handle HTTP Errors
            if response.status_code != 200:
                logger.warning(
                    f"SACHET feed returned HTTP {response.status_code}: {response.text[:200]}"
                )
                status = SourceStatus.FAILED if not self._cached_alerts else SourceStatus.STALE
                self.update_health(
                    status=status,
                    latency_ms=latency_ms,
                    error=f"HTTP {response.status_code}",
                )
                prov = AlertProvenance.CACHED if self._cached_alerts else AlertProvenance.FALLBACK
                return self._cached_alerts, prov

            # 3. Store ETag and Last-Modified headers
            if "ETag" in response.headers:
                self._etag = response.headers["ETag"]
            if "Last-Modified" in response.headers:
                self._last_modified = response.headers["Last-Modified"]

            # 4. Parse payload (JSON or CAP dictionary)
            data = response.json()
            alerts = self._parse_sachet_payload(data, now)

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
            logger.warning(f"Failed to fetch SACHET NDMA alerts: {e}")
            status = SourceStatus.FAILED if not self._cached_alerts else SourceStatus.STALE
            self.update_health(status=status, latency_ms=latency_ms, error=str(e))
            prov = AlertProvenance.CACHED if self._cached_alerts else AlertProvenance.FALLBACK
            return self._cached_alerts, prov

    def _parse_sachet_payload(self, data: Any, now: datetime) -> list[NormalizedAlert]:
        """Parse raw SACHET CAP/JSON feed records into normalized alerts."""
        alerts: list[NormalizedAlert] = []
        now_iso = now.isoformat()

        # Accommodate various JSON structures (list of alerts or wrapper object)
        records = []
        if isinstance(data, list):
            records = data
        elif isinstance(data, dict):
            records = (
                data.get("alerts")
                or data.get("data")
                or data.get("results")
                or data.get("features")
                or [data]
            )

        for rec in records:
            if not isinstance(rec, dict):
                continue
            alert = self._normalize_single_record(rec, now, now_iso)
            if alert is not None:
                alerts.append(alert)

        return alerts

    def _normalize_single_record(
        self, rec: dict[str, Any], now: datetime, now_iso: str
    ) -> NormalizedAlert | None:
        """Extract and normalize a single SACHET CAP record."""
        try:
            # Identifier
            raw_id = str(
                rec.get("identifier")
                or rec.get("alert_id")
                or rec.get("id")
                or rec.get("event_id")
                or f"sachet-{int(now.timestamp())}"
            )
            event_id = f"alt-sachet-{raw_id}"

            # Info block (CAP info or flat record)
            info = rec.get("info")
            if isinstance(info, list) and info:
                info = info[0]
            elif not isinstance(info, dict):
                info = rec

            # Title & Headline
            title = (
                info.get("headline")
                or info.get("event")
                or info.get("title")
                or rec.get("title")
                or "Official SACHET Disaster Advisory"
            ).strip()

            # Description
            description = (
                info.get("description") or info.get("summary") or rec.get("description") or title
            ).strip()

            # Instruction / Recommended Action
            recommended_action = (
                info.get("instruction")
                or rec.get("instruction")
                or info.get("recommended_action")
                or "Follow official civil defense broadcasts and stay alert."
            ).strip()

            # Event / Hazard Type mapping
            hazard_type = self._map_hazard_type(
                info.get("event") or info.get("category") or title or description
            )

            # Severity mapping
            severity = self._map_severity(
                info.get("severity") or rec.get("severity") or info.get("urgency")
            )

            # Coordinates & Area
            area_info = info.get("area")
            if isinstance(area_info, list) and area_info:
                area_info = area_info[0]
            elif not isinstance(area_info, dict):
                area_info = info

            area_desc = (
                area_info.get("areaDesc")
                or rec.get("area_name")
                or rec.get("location")
                or "Designated Regional Sector"
            ).strip()

            lat, lon, radius_km = self._extract_coordinates(area_info, rec)
            if lat is None or lon is None:
                # Do not inject arbitrary location if coordinates are missing
                return None

            # Timestamps
            sent_str = rec.get("sent") or info.get("effective") or info.get("onset")
            observed_at = self._parse_iso_time(sent_str, now_iso)
            issued_at = observed_at

            exp_str = info.get("expires") or rec.get("expires")
            if exp_str:
                expires_at = self._parse_iso_time(exp_str, now_iso)
            else:
                # Conservative default TTL of 6 hours for civil defense advisories
                expires_at = (now + timedelta(hours=6)).isoformat()

            source_url = (
                info.get("web")
                or rec.get("source_url")
                or rec.get("url")
                or "https://sachet.ndma.gov.in"
            )

            return NormalizedAlert(
                id=event_id,
                source="SACHET / NDMA India",
                source_event_id=raw_id,
                source_type=SourceType.CIVIL_DEFENSE,
                hazard_type=hazard_type,
                severity=severity,
                title=title,
                description=description,
                why_it_matters=f"Official emergency advisory issued by NDMA for {area_desc}.",
                recommended_action=recommended_action,
                latitude=float(lat),
                longitude=float(lon),
                affected_area=area_desc,
                radius_km=float(radius_km),
                observed_at=observed_at,
                issued_at=issued_at,
                expires_at=expires_at,
                fetched_at=now_iso,
                source_url=source_url,
                provenance=AlertProvenance.LIVE,
                confidence=0.98,
                is_active=True,
            )

        except Exception as e:
            logger.debug(f"Skipping malformed SACHET record: {e}")
            return None

    def _map_hazard_type(self, text: str | None) -> HazardType:
        """Map CAP event descriptors to Salvus HazardType."""
        if not text:
            return HazardType.OTHER
        t = text.lower()
        if "flood" in t or "inundation" in t or "waterlog" in t:
            return HazardType.FLOOD
        if "cyclone" in t or "storm" in t or "gale" in t or "squall" in t:
            return HazardType.CYCLONE
        if "quake" in t or "seismic" in t or "tremor" in t:
            return HazardType.EARTHQUAKE
        if "fire" in t or "wildfire" in t:
            return HazardType.FIRE
        if "weather" in t or "rain" in t or "heat" in t or "cold" in t or "fog" in t:
            return HazardType.WEATHER
        if "power" in t or "grid" in t or "infrastructure" in t or "bridge" in t:
            return HazardType.INFRASTRUCTURE
        return HazardType.OTHER

    def _map_severity(self, raw_sev: str | None) -> HazardSeverity:
        """Map CAP severity/urgency to Salvus HazardSeverity."""
        if not raw_sev:
            return HazardSeverity.WATCH
        s = raw_sev.lower()
        if "extreme" in s or "critical" in s or "red" in s:
            return HazardSeverity.CRITICAL
        if "severe" in s or "high" in s or "orange" in s or "warning" in s:
            return HazardSeverity.WARNING
        if "moderate" in s or "medium" in s or "yellow" in s or "watch" in s:
            return HazardSeverity.WATCH
        if "minor" in s or "advisory" in s or "info" in s or "green" in s:
            return HazardSeverity.ADVISORY
        return HazardSeverity.WATCH

    def _extract_coordinates(
        self, area_info: dict[str, Any], rec: dict[str, Any]
    ) -> tuple[float | None, float | None, float]:
        """Extract centroid latitude, longitude, and radius from CAP area fields."""
        lat = area_info.get("latitude") or rec.get("latitude") or rec.get("lat")
        lon = area_info.get("longitude") or rec.get("longitude") or rec.get("lon")
        radius = float(area_info.get("radius_km") or rec.get("radius_km") or 10.0)

        # Handle circle format: "lat,lon radius"
        circle = area_info.get("circle") or rec.get("circle")
        if circle and isinstance(circle, str):
            parts = circle.strip().split()
            if len(parts) >= 1 and "," in parts[0]:
                c_lat, c_lon = parts[0].split(",")
                lat, lon = float(c_lat), float(c_lon)
            if len(parts) >= 2:
                try:
                    radius = float(parts[1])
                except ValueError:
                    pass

        # Handle polygon format: "lat1,lon1 lat2,lon2 ..."
        polygon = area_info.get("polygon") or rec.get("polygon")
        if polygon and isinstance(polygon, str) and (lat is None or lon is None):
            pairs = polygon.strip().split()
            lats, lons = [], []
            for p in pairs:
                if "," in p:
                    p_lat, p_lon = p.split(",")
                    lats.append(float(p_lat))
                    lons.append(float(p_lon))
            if lats and lons:
                lat = sum(lats) / len(lats)
                lon = sum(lons) / len(lons)

        if lat is not None and lon is not None:
            return float(lat), float(lon), radius
        return None, None, radius

    def _parse_iso_time(self, raw_time: str | None, default_iso: str) -> str:
        """Parse raw timestamp strings safely to ISO format."""
        if not raw_time:
            return default_iso
        try:
            # Handle ISO string with or without Z
            clean = raw_time.replace("Z", "+00:00")
            dt = datetime.fromisoformat(clean)
            return dt.isoformat()
        except Exception:
            return default_iso
