"""GDACS (Global Disaster Alert and Coordination System) Adapter (Phase 2).

Consumes the official GDACS GeoJSON API (UN / European Commission) for multi-hazard global
disaster event awareness, preserving event IDs, alert levels, and verified coordinates.
"""

from __future__ import annotations

import email.utils
import logging
import time
import xml.etree.ElementTree as ET
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

GDACS_RSS_URL = "https://www.gdacs.org/xml/rss.xml"
GDACS_GEOJSON_URL = GDACS_RSS_URL  # Backwards-compatible alias
DEFAULT_TIMEOUT_SECONDS = 8.0


class GDACSAdapter(BaseAlertAdapter):
    """Adapter for official GDACS (UN/EU) multi-hazard disaster event feeds."""

    def __init__(self, feed_url: str = GDACS_RSS_URL, cache_ttl_seconds: int = 600):
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
        super().clear_cache()
        self._cached_alerts = []
        self._last_fetch_time = None

    async def fetch_alerts(
        self,
        lat: float | None = None,
        lon: float | None = None,
        client: httpx.AsyncClient | None = None,
        **kwargs: Any,
    ) -> tuple[list[NormalizedAlert], AlertProvenance]:
        """Fetch and normalize active global disaster events from GDACS GeoRSS feed."""
        now = datetime.now(UTC)
        start_time = time.perf_counter()
        timeout_sec = float(kwargs.get("timeout") or DEFAULT_TIMEOUT_SECONDS)

        # In-memory freshness check
        if (
            self._cached_alerts
            and self._last_fetch_time
            and (now - self._last_fetch_time).total_seconds() < self.cache_ttl_seconds
        ):
            return self._cached_alerts, AlertProvenance.CACHED

        headers = {
            "User-Agent": "Salvus-Disaster-Coordination/2.0",
            "Accept": "application/rss+xml, application/xml, text/xml, application/json, */*",
        }

        try:
            if client is not None:
                response = await client.get(self.feed_url, headers=headers, timeout=timeout_sec)
            else:
                async with httpx.AsyncClient(timeout=timeout_sec) as http:
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

            # Support both RSS XML payload and GeoJSON fallback (for mock unit tests)
            text_resp = response.text.strip()
            if text_resp.startswith("<") or "<rss" in text_resp or "<feed" in text_resp:
                alerts = self._parse_gdacs_rss(text_resp, now)
            else:
                data = response.json()
                features = data.get("features", []) if isinstance(data, dict) else []
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

    def _parse_gdacs_rss(self, xml_content: str, now: datetime) -> list[NormalizedAlert]:
        """Parse GeoRSS XML feed from GDACS into normalized alerts."""
        alerts: list[NormalizedAlert] = []
        now_iso = now.isoformat()
        try:
            root = ET.fromstring(xml_content)
        except Exception as e:
            logger.warning(f"Failed to parse GDACS RSS XML: {e}")
            return alerts

        channel = root.find("channel")
        items = channel.findall("item") if channel is not None else root.findall(".//item")

        for item in items:
            alert = self._normalize_single_rss_item(item, now, now_iso)
            if alert is not None:
                alerts.append(alert)
        return alerts

    def _normalize_single_rss_item(
        self, item: ET.Element, now: datetime, now_iso: str
    ) -> NormalizedAlert | None:
        """Extract and normalize a single GDACS GeoRSS <item> element."""
        title = (item.findtext("title") or "Global Disaster Event").strip()
        description = (item.findtext("description") or title).strip()
        link = (item.findtext("link") or "").strip()
        guid = (item.findtext("guid") or "").strip()
        pub_date_str = item.findtext("pubDate")

        # GDACS specific tags
        event_id = (
            item.findtext("{http://www.gdacs.org}eventid")
            or guid
            or f"gdacs-{abs(hash(title)) % 10000000}"
        )
        event_type_raw = (item.findtext("{http://www.gdacs.org}eventtype") or "OT").strip()
        alert_level = (item.findtext("{http://www.gdacs.org}alertlevel") or "Green").strip()
        event_name = (item.findtext("{http://www.gdacs.org}eventname") or "").strip()
        severity_raw = (item.findtext("{http://www.gdacs.org}severity") or "").strip()
        country = (item.findtext("{http://www.gdacs.org}country") or "International Zone").strip()
        iso3 = (item.findtext("{http://www.gdacs.org}iso3") or "").strip()
        from_date_str = item.findtext("{http://www.gdacs.org}fromdate") or pub_date_str
        to_date_str = item.findtext("{http://www.gdacs.org}todate")

        # Extract coordinates from georss:point ("lat lon")
        lat: float | None = None
        lon: float | None = None
        pt = item.findtext("{http://www.georss.org/georss}point")
        if pt and pt.strip():
            parts = pt.strip().split()
            if len(parts) >= 2:
                try:
                    lat_val = float(parts[0])
                    lon_val = float(parts[1])
                    if -90.0 <= lat_val <= 90.0 and -180.0 <= lon_val <= 180.0:
                        lat = lat_val
                        lon = lon_val
                except (ValueError, TypeError):
                    lat = None
                    lon = None

        # Fallback to W3C geo:Point if georss:point is not present
        if lat is None or lon is None:
            wgs_lat = item.findtext("{http://www.w3.org/2003/01/geo/wgs84_pos#}lat")
            wgs_lon = item.findtext("{http://www.w3.org/2003/01/geo/wgs84_pos#}long")
            if wgs_lat and wgs_lon:
                try:
                    lat_val = float(wgs_lat)
                    lon_val = float(wgs_lon)
                    if -90.0 <= lat_val <= 90.0 and -180.0 <= lon_val <= 180.0:
                        lat = lat_val
                        lon = lon_val
                except (ValueError, TypeError):
                    pass

        hazard_type = self._map_event_type(event_type_raw)
        severity = self._map_alert_level(alert_level)
        radius_km = self._calculate_event_radius(hazard_type, alert_level)

        observed_at = self._parse_rss_date(from_date_str, now_iso)
        expires_at = (
            self._parse_rss_date(to_date_str, (now + timedelta(hours=24)).isoformat())
            if to_date_str
            else (now + timedelta(hours=24)).isoformat()
        )

        if severity == HazardSeverity.CRITICAL:
            action = (
                "Coordinate with civil protection and emergency response units; "
                "verify local safe zones."
            )
        elif severity == HazardSeverity.WARNING:
            action = (
                "Monitor official regional disaster coordination reports and prepare contingencies."
            )
        else:
            action = "Review regional situation reports and maintain routine situational awareness."

        area_label = f"{event_name}, {country}" if event_name else country
        url = (
            link
            or f"https://www.gdacs.org/report.aspx?eventtype={event_type_raw}&eventid={event_id}"
        )

        evidence = [
            {
                "provider": "GDACS",
                "event_id": str(event_id),
                "event_type": event_type_raw,
                "alert_level": alert_level,
                "severity": severity_raw,
                "country": country,
                "iso3": iso3,
            }
        ]

        return NormalizedAlert(
            id=f"alt-gdacs-{event_id}",
            source="GDACS (UN / EU)",
            source_event_id=str(event_id),
            source_type=SourceType.CIVIL_DEFENSE,
            hazard_type=hazard_type,
            raw_type=event_type_raw,
            severity=severity,
            title=title,
            description=description,
            why_it_matters=f"Global disaster alert issued by GDACS for {country}.",
            recommended_action=action,
            recommended_actions=[action],
            latitude=lat,
            longitude=lon,
            affected_area=area_label,
            radius_km=radius_km,
            observed_at=observed_at,
            issued_at=observed_at,
            expires_at=expires_at,
            fetched_at=now_iso,
            source_url=url,
            provenance=AlertProvenance.LIVE,
            confidence=0.96,
            is_active=True,
            sources_matched=["GDACS (UN / EU)"],
            evidence_sources=evidence,
        )

    def _parse_gdacs_features(
        self, features: list[dict[str, Any]], now: datetime
    ) -> list[NormalizedAlert]:
        """Parse GeoJSON features from GDACS into normalized alerts (legacy / mock support)."""
        alerts: list[NormalizedAlert] = []
        now_iso = now.isoformat()

        for feat in features:
            if not isinstance(feat, dict):
                continue
            props = feat.get("properties") or {}
            geom = feat.get("geometry") or {}
            coords = geom.get("coordinates")
            geom_type = geom.get("type", "Point")

            if not coords:
                continue

            lat: float | None = None
            lon: float | None = None
            geom_poly: list[list[float]] | None = None

            if geom_type == "Point" and len(coords) >= 2 and isinstance(coords[0], (int, float)):
                lon, lat = float(coords[0]), float(coords[1])
            elif geom_type == "Polygon" and isinstance(coords, list) and len(coords) > 0:
                ring = coords[0]
                if isinstance(ring, list) and len(ring) >= 3:
                    geom_poly = [
                        [float(pt[1]), float(pt[0])]
                        for pt in ring
                        if isinstance(pt, (list, tuple)) and len(pt) >= 2
                    ]
                    if len(geom_poly) >= 3:
                        lat = sum(p[0] for p in geom_poly) / len(geom_poly)
                        lon = sum(p[1] for p in geom_poly) / len(geom_poly)
            elif geom_type == "MultiPolygon" and isinstance(coords, list) and len(coords) > 0:
                poly = coords[0]
                if isinstance(poly, list) and len(poly) > 0:
                    ring = poly[0]
                    if isinstance(ring, list) and len(ring) >= 3:
                        geom_poly = [
                            [float(pt[1]), float(pt[0])]
                            for pt in ring
                            if isinstance(pt, (list, tuple)) and len(pt) >= 2
                        ]
                        if len(geom_poly) >= 3:
                            lat = sum(p[0] for p in geom_poly) / len(geom_poly)
                            lon = sum(p[1] for p in geom_poly) / len(geom_poly)
            elif len(coords) >= 2 and isinstance(coords[0], (int, float)):
                lon, lat = float(coords[0]), float(coords[1])

            if (
                lat is None
                or lon is None
                or not (-90.0 <= lat <= 90.0)
                or not (-180.0 <= lon <= 180.0)
            ):
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
                geometry=geom_poly,
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

    def _parse_rss_date(self, date_str: str | None, default_iso: str) -> str:
        """Safely parse RSS RFC 822 / 2822 or ISO date string to ISO 8601 format."""
        if not date_str or not isinstance(date_str, str):
            return default_iso
        s = date_str.strip()
        if not s:
            return default_iso
        try:
            dt = email.utils.parsedate_to_datetime(s)
            return dt.isoformat()
        except Exception:
            pass
        try:
            clean = s.replace("Z", "+00:00")
            dt = datetime.fromisoformat(clean)
            return dt.isoformat()
        except Exception:
            pass
        return default_iso
