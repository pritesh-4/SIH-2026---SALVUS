"""SACHET / NDMA India Alert Feed Adapter (Phase 2A).

Consumes the official SACHET CAP/JSON feed with ETag conditional requests (If-None-Match)
and Last-Modified support. Normalizes official civil defense advisories into Salvus alert models.
"""

from __future__ import annotations

import logging
import re
import time
from datetime import UTC, datetime, timedelta, timezone
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
DEFAULT_TIMEOUT_SECONDS = 8.0
IST = timezone(timedelta(hours=5, minutes=30))


class SachetAdapter(BaseAlertAdapter):
    """Adapter for official SACHET (NDMA India) disaster alert feeds."""

    def __init__(self, feed_url: str = SACHET_FEED_URL, cache_ttl_seconds: int = 300):
        super().__init__(
            source_id="sachet_ndma",
            source_name="SACHET / NDMA India",
            display_name="SACHET",
            source_type=SourceType.CIVIL_DEFENSE,
            cache_ttl_seconds=cache_ttl_seconds,
            initial_status=SourceStatus.AVAILABLE,
            initial_status_label="LIVE",
            initial_is_live=True,
        )
        self.feed_url = feed_url
        self._etag: str | None = None
        self._last_modified: str | None = None
        self._cached_alerts: list[NormalizedAlert] = []
        self._last_fetch_time: datetime | None = None

    def clear_cache(self) -> None:
        """Reset cached feed and ETag state for testing."""
        super().clear_cache()
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
        timeout_sec = float(kwargs.get("timeout") or DEFAULT_TIMEOUT_SECONDS)

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
                response = await client.get(self.feed_url, headers=headers, timeout=timeout_sec)
            else:
                async with httpx.AsyncClient(timeout=timeout_sec) as http:
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
            if "alerts" in data and isinstance(data["alerts"], list):
                records = data["alerts"]
            elif "data" in data and isinstance(data["data"], list):
                records = data["data"]
            elif "results" in data and isinstance(data["results"], list):
                records = data["results"]
            elif "features" in data and isinstance(data["features"], list):
                records = data["features"]
            elif (
                "identifier" in data
                or "disaster_type" in data
                or "warning_message" in data
                or "info" in data
                or "centroid" in data
            ):
                records = [data]
            else:
                records = []

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
        """Extract and normalize a single SACHET record.

        Supports both real flat SACHET payload and legacy nested CAP records.
        """
        try:
            if not isinstance(rec, dict):
                return None
            if (
                not rec.get("identifier")
                and not rec.get("disaster_type")
                and not rec.get("info")
                and not rec.get("warning_message")
                and not rec.get("area_description")
                and not rec.get("centroid")
            ):
                return None

            # 1. Identifier
            raw_id = (
                rec.get("identifier") or rec.get("alert_id") or rec.get("id") or rec.get("event_id")
            )
            source_event_id = (
                str(raw_id) if raw_id is not None else f"sachet-{int(now.timestamp())}"
            )
            event_id = f"alt-sachet-{source_event_id}"

            # 2. Check for legacy nested CAP "info" block
            info = rec.get("info")
            if isinstance(info, list) and info:
                info = info[0]
            elif not isinstance(info, dict):
                info = None

            # 3. Disaster / Hazard Type
            disaster_type = (
                rec.get("disaster_type")
                or (info.get("event") if info else None)
                or rec.get("event")
                or (info.get("category") if info else None)
            )
            raw_type = str(disaster_type).strip() if disaster_type else None
            hazard_type = self._map_hazard_type(
                raw_type or (info.get("headline") if info else None)
            )

            # 4. Title / Headline (No invented titles)
            title = None
            if disaster_type:
                title = str(disaster_type).strip()
            elif info and info.get("headline"):
                title = str(info["headline"]).strip()
            elif rec.get("title"):
                title = str(rec["title"]).strip()
            elif info and info.get("event"):
                title = str(info["event"]).strip()

            # 5. Warning Message / Description
            raw_desc = (
                rec.get("warning_message")
                or (info.get("description") if info else None)
                or rec.get("description")
                or (info.get("summary") if info else None)
            )
            description = str(raw_desc).strip() if raw_desc else None

            # 6. Area Description
            area_info = info.get("area") if info else None
            if isinstance(area_info, list) and area_info:
                area_info = area_info[0]
            elif not isinstance(area_info, dict):
                area_info = None

            raw_area = (
                rec.get("area_description")
                or (area_info.get("areaDesc") if area_info else None)
                or rec.get("area_name")
                or rec.get("location")
            )
            affected_area = str(raw_area).strip() if raw_area else None

            # Extract administrative districts and state (Phase 2C)
            from app.services.geo_service import parse_administrative_area

            affected_districts, state = parse_administrative_area(affected_area)
            if rec.get("state"):
                state = str(rec["state"]).strip()
            if isinstance(rec.get("affected_districts"), list):
                affected_districts = [str(d).strip() for d in rec["affected_districts"]]

            # 7. Coordinates & Centroid Parsing
            # CRITICAL: SACHET centroid is "longitude,latitude" (LON,LAT)
            # Must convert correctly to: latitude=LAT, longitude=LON
            # Do NOT fabricate coordinates if missing!
            lat: float | None = None
            lon: float | None = None
            radius_km: float = 20.0
            geom_poly: list[list[float]] | None = None

            centroid = rec.get("centroid")
            if centroid and isinstance(centroid, str) and "," in centroid:
                parts = centroid.strip().split(",")
                if len(parts) == 2:
                    try:
                        lon_val = float(parts[0].strip())
                        lat_val = float(parts[1].strip())
                        if -90.0 <= lat_val <= 90.0 and -180.0 <= lon_val <= 180.0:
                            lat = lat_val
                            lon = lon_val
                    except (ValueError, TypeError):
                        lat = None
                        lon = None

            # Legacy CAP area extraction fallback if centroid was not present
            if (lat is None or lon is None) and (
                area_info or "latitude" in rec or "circle" in rec or "polygon" in rec
            ):
                c_lat, c_lon, c_radius, c_poly = self._extract_legacy_coordinates(
                    area_info or {}, rec
                )
                if c_lat is not None and c_lon is not None:
                    lat, lon = c_lat, c_lon
                    radius_km = c_radius
                    geom_poly = c_poly

            # If area_covered provided, derive approximate radius
            if rec.get("area_covered"):
                try:
                    area_sq_km = float(rec["area_covered"])
                    if area_sq_km > 0:
                        import math

                        radius_km = round(math.sqrt(area_sq_km / math.pi), 1)
                except Exception:
                    pass

            # 8. Source Attribution
            alert_source = rec.get("alert_source")
            if alert_source:
                source = str(alert_source).strip()
            elif info and info.get("senderName"):
                source = str(info["senderName"]).strip()
            else:
                source = "SACHET / NDMA India"

            sources_matched = [source]
            if "SACHET / NDMA India" not in sources_matched:
                sources_matched.append("SACHET / NDMA India")

            # 9. Severity Mapping
            # Use: severity_color + severity + severity_level through canonical severity mapping
            severity = self._map_sachet_severity(
                color=rec.get("severity_color"),
                severity=rec.get("severity") or (info.get("severity") if info else None),
                severity_level=rec.get("severity_level") or (info.get("urgency") if info else None),
            )

            # 10. Timestamps (starts_at / issued_at / expires_at)
            start_raw = (
                rec.get("effective_start_time")
                or rec.get("sent")
                or (info.get("effective") if info else None)
                or (info.get("onset") if info else None)
            )
            issued_at = self._parse_sachet_timestamp(start_raw)
            starts_at = issued_at
            observed_at = issued_at or now_iso

            end_raw = (
                rec.get("effective_end_time")
                or rec.get("expires")
                or (info.get("expires") if info else None)
            )
            expires_at = self._parse_sachet_timestamp(end_raw)

            # 11. Instruction / Recommended Action
            raw_action = (
                rec.get("instruction")
                or (info.get("instruction") if info else None)
                or rec.get("recommended_action")
            )
            recommended_action = str(raw_action).strip() if raw_action else None
            rec_actions = [recommended_action] if recommended_action else []

            # 12. Provider Metadata Preservation
            evidence: list[dict[str, Any]] = [
                {
                    "provider": "SACHET",
                    "source_event_id": source_event_id,
                    "alert_id_sdma_autoinc": rec.get("alert_id_sdma_autoinc"),
                    "actual_lang": rec.get("actual_lang"),
                    "area_covered": rec.get("area_covered"),
                    "sender_org_id": rec.get("sender_org_id"),
                    "disseminated": rec.get("disseminated"),
                    "raw_severity": rec.get("severity"),
                    "severity_color": rec.get("severity_color"),
                    "severity_level": rec.get("severity_level"),
                }
            ]

            why_it_matters = (
                f"Official emergency advisory issued by {source} for {affected_area}."
                if affected_area
                else f"Official emergency advisory issued by {source}."
            )

            source_url = (
                (info.get("web") if info else None)
                or rec.get("source_url")
                or rec.get("url")
                or "https://sachet.ndma.gov.in"
            )

            return NormalizedAlert(
                id=event_id,
                source=source,
                source_event_id=source_event_id,
                source_type=SourceType.CIVIL_DEFENSE,
                hazard_type=hazard_type,
                raw_type=raw_type,
                severity=severity,
                title=title or "Official Disaster Advisory",
                description=description or title or "Official emergency advisory issued.",
                why_it_matters=why_it_matters,
                recommended_action=recommended_action
                or "Follow official civil defense broadcasts and maintain situational vigilance.",
                recommended_actions=rec_actions,
                latitude=lat,
                longitude=lon,
                affected_area=affected_area,
                affected_districts=affected_districts,
                state=state,
                radius_km=radius_km,
                observed_at=observed_at,
                issued_at=issued_at or observed_at,
                starts_at=starts_at,
                expires_at=expires_at,
                fetched_at=now_iso,
                source_url=source_url,
                provenance=AlertProvenance.LIVE,
                confidence=0.98,
                is_active=True,
                geometry=geom_poly,
                sources_matched=sources_matched,
                evidence_sources=evidence,
            )

        except Exception as e:
            logger.debug(f"Skipping malformed SACHET record: {e}")
            return None

    def _map_hazard_type(self, text: str | None) -> HazardType:
        """Map SACHET disaster_type and event descriptors to Salvus HazardType."""
        if not text:
            return HazardType.OTHER
        t = text.lower()
        if "flood" in t or "inundation" in t or "waterlog" in t or "river" in t:
            return HazardType.FLOOD
        if "thunderstorm" in t or "lightning" in t or "thunder" in t:
            return HazardType.WEATHER
        if "cyclon" in t or "storm" in t or "gale" in t or "squall" in t:
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

    def _map_sachet_severity(
        self,
        color: str | None = None,
        severity: str | None = None,
        severity_level: str | None = None,
    ) -> HazardSeverity | None:
        """Map severity_color, severity, and severity_level using Salvus canonical rules.

        Avoids automatically converting every 'ALERT' into CRITICAL.
        """
        # 1. Primary: Official color code
        if color:
            c = str(color).strip().lower()
            if c in ("red", "extreme", "critical", "emergency"):
                return HazardSeverity.CRITICAL
            if c in ("orange", "amber", "severe", "warning"):
                return HazardSeverity.WARNING
            if c in ("yellow", "watch", "moderate"):
                return HazardSeverity.WATCH
            if c in ("green", "advisory", "info", "minor"):
                return HazardSeverity.ADVISORY

        # 2. Secondary: Official severity designation
        if severity:
            s = str(severity).strip().lower()
            if s in ("red", "extreme", "critical", "emergency"):
                return HazardSeverity.CRITICAL
            if s in ("orange", "amber", "severe", "warning"):
                return HazardSeverity.WARNING
            # In Indian disaster protocol (IMD/SACHET), ALERT corresponds to Orange Warning Stage
            if s == "alert":
                return HazardSeverity.WARNING
            if s in ("yellow", "watch", "moderate"):
                return HazardSeverity.WATCH
            if s in ("green", "advisory", "info", "minor", "low"):
                return HazardSeverity.ADVISORY

        # 3. Tertiary: Severity level / urgency
        if severity_level:
            lv = str(severity_level).strip().lower()
            if "extreme" in lv or "critical" in lv:
                return HazardSeverity.CRITICAL
            if "severe" in lv or "very likely" in lv:
                return HazardSeverity.WARNING
            if "likely" in lv or "rising" in lv:
                return HazardSeverity.WATCH

        # Do not fabricate severity if all raw indicators are missing
        return None

    def _parse_sachet_timestamp(self, raw: str | None) -> str | None:
        """Parse SACHET timestamps safely without fabricating dates.

        Handles:
        - '%a %b %d %H:%M:%S IST %Y' (e.g. 'Tue Sep 01 16:05:00 IST 2026')
        - ISO 8601 strings (e.g. '2026-08-28T08:00:00Z')
        - '%Y-%m-%d %H:%M:%S'
        """
        if not raw or not isinstance(raw, str):
            return None
        t = raw.strip()
        if not t:
            return None

        # 1. Try ISO 8601
        try:
            return datetime.fromisoformat(t.replace("Z", "+00:00")).isoformat()
        except Exception:
            pass

        # 2. Pattern: Tue Sep 01 16:05:00 IST 2026
        m = re.match(
            r"^[A-Za-z]{3}\s+([A-Za-z]{3})\s+(\d{1,2})\s+(\d{2}:\d{2}:\d{2})\s+([A-Za-z]{2,5})\s+(\d{4})$",
            t,
        )
        if m:
            month_name, day, time_str, tz_abbr, year = m.groups()
            tz_offset = timedelta(hours=5, minutes=30) if tz_abbr.upper() == "IST" else timedelta(0)
            try:
                dt = datetime.strptime(f"{month_name} {day} {time_str} {year}", "%b %d %H:%M:%S %Y")
                dt = dt.replace(tzinfo=timezone(tz_offset))
                return dt.isoformat()
            except Exception:
                pass

        # 3. Standard YYYY-MM-DD HH:MM:SS
        try:
            dt = datetime.strptime(t, "%Y-%m-%d %H:%M:%S")
            return dt.replace(tzinfo=IST).isoformat()
        except Exception:
            pass

        return None

    def _extract_legacy_coordinates(
        self, area_info: dict[str, Any], rec: dict[str, Any]
    ) -> tuple[float | None, float | None, float, list[list[float]] | None]:
        """Extract centroid latitude, longitude, radius, and polygon from legacy CAP area fields."""
        lat = area_info.get("latitude") or rec.get("latitude") or rec.get("lat")
        lon = area_info.get("longitude") or rec.get("longitude") or rec.get("lon")
        radius = float(area_info.get("radius_km") or rec.get("radius_km") or 20.0)
        geom_poly: list[list[float]] | None = None

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
        if polygon and isinstance(polygon, str):
            pairs = polygon.strip().split()
            coords_list: list[list[float]] = []
            for p in pairs:
                if "," in p:
                    p_lat, p_lon = p.split(",")
                    coords_list.append([float(p_lat), float(p_lon)])
            if len(coords_list) >= 3:
                geom_poly = coords_list
                if lat is None or lon is None:
                    lat = sum(c[0] for c in coords_list) / len(coords_list)
                    lon = sum(c[1] for c in coords_list) / len(coords_list)

        if lat is not None and lon is not None:
            return float(lat), float(lon), radius, geom_poly
        return None, None, radius, None
