"""External Nearby Places Provider Adapter (Phase 1: Real-World Places Intelligence).

Encapsulates external geographic data fetching (e.g. OpenStreetMap Overpass API)
behind the `NearbyPlacesProvider` interface.

Key Responsibilities:
- Multi-mirror failover rotation with strict timeout guards
- Isolated Overpass QL query construction (query syntax never leaks outside)
- Ground-truth OSM tag mapping to controlled `PlaceCategory`
- Zero data fabrication: missing phone, website, opening hours, address, or city return None
- Strict provenance attribution (`PlaceProvenance.OSM_MAPPED`, `source="OpenStreetMap"`)
- Element deduplication and straight-line Haversine distance calculation
"""

from __future__ import annotations

import logging
import math
import os
import time
from abc import ABC, abstractmethod
from datetime import UTC, datetime
from typing import Any

import httpx

from app.models import (
    PlaceCategory,
    PlaceModel,
    PlaceProvenance,
    SourceHealthReport,
    SourceStatus,
    SourceType,
)

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Default Overpass Public Mirrors & Thresholds
# ---------------------------------------------------------------------------

DEFAULT_OVERPASS_MIRRORS = [
    "https://overpass-api.de/api/interpreter",
    "https://maps.mail.ru/osm/tools/overpass/api/interpreter",
    "https://overpass.kumi.systems/api/interpreter",
]

DEFAULT_TIMEOUT_SECONDS = 4.5


def haversine_distance_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Calculate the great-circle straight-line distance between two GPS coordinates in km."""
    radius_km = 6371.0
    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)
    a = (
        math.sin(dlat / 2) ** 2
        + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(dlon / 2) ** 2
    )
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
    return round(radius_km * c, 3)


def format_distance(distance_meters: float) -> str:
    """Format straight-line geometric distance into human-readable proximity label."""
    if distance_meters < 1000:
        return f"Approx. {int(round(distance_meters))} m"
    km = distance_meters / 1000.0
    return f"Approx. {km:.1f} km"


# ---------------------------------------------------------------------------
# Abstract Provider Base Class
# ---------------------------------------------------------------------------


class NearbyPlacesProvider(ABC):
    """Abstract interface for external real-world nearby places providers."""

    def __init__(self, source_id: str, source_name: str):
        self.source_id = source_id
        self.source_name = source_name
        self._health = SourceHealthReport(
            source_id=source_id,
            source_name=source_name,
            source_type=SourceType.GEOSPATIAL_PROVIDER,
            status=SourceStatus.AVAILABLE,
            last_fetched_at=None,
            last_successful_at=None,
            last_error=None,
            latency_ms=None,
            active_alerts_count=0,
        )

    def get_health(self) -> SourceHealthReport:
        """Return provider health status telemetry."""
        return self._health.model_copy()

    def update_health(
        self,
        status: SourceStatus,
        latency_ms: float | None = None,
        error: str | None = None,
    ) -> None:
        """Update provider health report."""
        now_iso = datetime.now(UTC).isoformat()
        self._health.status = status
        self._health.last_fetched_at = now_iso
        if latency_ms is not None:
            self._health.latency_ms = round(latency_ms, 2)
        if error is not None:
            self._health.last_error = error
        if status == SourceStatus.AVAILABLE:
            self._health.last_successful_at = now_iso
            self._health.last_error = None

    @abstractmethod
    async def fetch_nearby(
        self,
        lat: float,
        lon: float,
        radius_m: int,
        categories: list[PlaceCategory] | None = None,
        client: httpx.AsyncClient | None = None,
    ) -> list[PlaceModel]:
        """Fetch and normalize nearby places within radius_m around (lat, lon)."""
        raise NotImplementedError


# ---------------------------------------------------------------------------
# Concrete OpenStreetMap / Overpass Adapter Implementation
# ---------------------------------------------------------------------------


class OverpassPlacesAdapter(NearbyPlacesProvider):
    """Real-world geographic places adapter querying OpenStreetMap via Overpass API."""

    def __init__(
        self,
        mirrors: list[str] | None = None,
        timeout_seconds: float = DEFAULT_TIMEOUT_SECONDS,
    ):
        super().__init__(source_id="osm_overpass", source_name="OpenStreetMap Overpass")
        self._custom_mirrors = mirrors
        self.timeout_seconds = timeout_seconds

    def get_mirrors(self) -> list[str]:
        """Resolve mirror endpoints dynamically from custom list, environment, or defaults."""
        if self._custom_mirrors:
            return list(self._custom_mirrors)
        env_url = os.getenv("OVERPASS_URL", "").strip()
        if env_url:
            return [env_url] + [m for m in DEFAULT_OVERPASS_MIRRORS if m != env_url]
        return list(DEFAULT_OVERPASS_MIRRORS)

    def build_query(
        self,
        lat: float,
        lon: float,
        radius_m: int,
        categories: list[PlaceCategory] | None = None,
    ) -> str:
        """Construct a compact Overpass QL query around center coordinate."""
        cat_set = set(categories) if categories else set(PlaceCategory)

        clauses: list[str] = []

        if PlaceCategory.HOSPITAL in cat_set:
            clauses.append(f'node["amenity"="hospital"](around:{radius_m},{lat},{lon});')
            clauses.append(f'way["amenity"="hospital"](around:{radius_m},{lat},{lon});')
            clauses.append(f'node["healthcare"="hospital"](around:{radius_m},{lat},{lon});')
            clauses.append(f'way["healthcare"="hospital"](around:{radius_m},{lat},{lon});')

        if PlaceCategory.CLINIC in cat_set:
            clauses.append(f'node["amenity"="clinic"](around:{radius_m},{lat},{lon});')
            clauses.append(f'way["amenity"="clinic"](around:{radius_m},{lat},{lon});')
            clauses.append(f'node["healthcare"~"clinic|centre"](around:{radius_m},{lat},{lon});')
            clauses.append(f'way["healthcare"~"clinic|centre"](around:{radius_m},{lat},{lon});')

        if PlaceCategory.PHARMACY in cat_set:
            clauses.append(f'node["amenity"="pharmacy"](around:{radius_m},{lat},{lon});')
            clauses.append(f'way["amenity"="pharmacy"](around:{radius_m},{lat},{lon});')
            clauses.append(f'node["healthcare"="pharmacy"](around:{radius_m},{lat},{lon});')
            clauses.append(f'way["healthcare"="pharmacy"](around:{radius_m},{lat},{lon});')

        if PlaceCategory.POLICE in cat_set:
            clauses.append(f'node["amenity"="police"](around:{radius_m},{lat},{lon});')
            clauses.append(f'way["amenity"="police"](around:{radius_m},{lat},{lon});')

        if PlaceCategory.FIRE_STATION in cat_set:
            clauses.append(f'node["amenity"="fire_station"](around:{radius_m},{lat},{lon});')
            clauses.append(f'way["amenity"="fire_station"](around:{radius_m},{lat},{lon});')

        if PlaceCategory.EMERGENCY_SERVICE in cat_set:
            clauses.append(
                f'node["emergency"~"ambulance_station|disaster_response|emergency_ward_entrance"](around:{radius_m},{lat},{lon});'
            )
            clauses.append(
                f'way["emergency"~"ambulance_station|disaster_response|emergency_ward_entrance"](around:{radius_m},{lat},{lon});'
            )

        if PlaceCategory.SHELTER in cat_set:
            clauses.append(f'node["amenity"="shelter"](around:{radius_m},{lat},{lon});')
            clauses.append(f'way["amenity"="shelter"](around:{radius_m},{lat},{lon});')
            clauses.append(f'node["building"="shelter"](around:{radius_m},{lat},{lon});')
            clauses.append(f'way["building"="shelter"](around:{radius_m},{lat},{lon});')

        if not clauses:
            # Fallback if other categories requested
            clauses.append(
                f'node["amenity"~"hospital|clinic|pharmacy|police|fire_station|shelter"](around:{radius_m},{lat},{lon});'
            )
            clauses.append(
                f'way["amenity"~"hospital|clinic|pharmacy|police|fire_station|shelter"](around:{radius_m},{lat},{lon});'
            )

        body = "\n  ".join(clauses)
        query = f"""
[out:json][timeout:5];
(
  {body}
);
out center tags 60;
""".strip()
        return query

    def normalize_element(
        self,
        elem: dict[str, Any],
        origin_lat: float,
        origin_lon: float,
        now_iso: str,
    ) -> PlaceModel | None:
        """Normalize raw OpenStreetMap node/way element into project-owned PlaceModel."""
        elem_id = elem.get("id")
        elem_type = elem.get("type", "node")
        tags: dict[str, Any] = elem.get("tags") or {}

        # Coordinate extraction (node has lat/lon; way has center {lat, lon})
        center_dict = elem.get("center") if isinstance(elem.get("center"), dict) else {}
        raw_lat = elem.get("lat") or center_dict.get("lat")
        raw_lon = elem.get("lon") or center_dict.get("lon")

        if raw_lat is None or raw_lon is None:
            return None

        try:
            lat = float(raw_lat)
            lon = float(raw_lon)
        except (ValueError, TypeError):
            return None

        if math.isnan(lat) or lat < -90.0 or lat > 90.0:
            return None
        if math.isnan(lon) or lon < -180.0 or lon > 180.0:
            return None

        # -----------------------------------------------------------------------
        # Category Mapping based on standard OSM semantics
        # -----------------------------------------------------------------------
        amenity = str(tags.get("amenity", "")).lower()
        emergency = str(tags.get("emergency", "")).lower()
        healthcare = str(tags.get("healthcare", "")).lower()
        building = str(tags.get("building", "")).lower()

        if amenity == "hospital" or healthcare == "hospital":
            category = PlaceCategory.HOSPITAL
            fallback_name = "Hospital / Medical Facility"
        elif amenity == "clinic" or healthcare in ("clinic", "centre"):
            category = PlaceCategory.CLINIC
            fallback_name = "Health Clinic"
        elif amenity == "pharmacy" or healthcare == "pharmacy":
            category = PlaceCategory.PHARMACY
            fallback_name = "Pharmacy / Chemist"
        elif amenity == "police":
            category = PlaceCategory.POLICE
            fallback_name = "Police Station"
        elif amenity == "fire_station":
            category = PlaceCategory.FIRE_STATION
            fallback_name = "Fire & Rescue Station"
        elif emergency in ("ambulance_station", "disaster_response", "emergency_ward_entrance"):
            category = PlaceCategory.EMERGENCY_SERVICE
            fallback_name = "Emergency Response Facility"
        elif amenity == "shelter" or building == "shelter":
            category = PlaceCategory.SHELTER
            fallback_name = "Community Shelter (OSM Mapped)"
        else:
            category = PlaceCategory.OTHER_RELEVANT
            fallback_name = "Public Emergency Facility"

        raw_name = tags.get("name") or tags.get("name:en") or tags.get("operator")
        name = str(raw_name).strip() if raw_name else fallback_name

        # -----------------------------------------------------------------------
        # Address & City Construction (strictly from available provider tags)
        # -----------------------------------------------------------------------
        street = tags.get("addr:street")
        housenumber = tags.get("addr:housenumber")
        suburb = tags.get("addr:suburb") or tags.get("addr:district")
        postcode = tags.get("addr:postcode")
        city = tags.get("addr:city") or tags.get("addr:suburb") or tags.get("addr:district")

        addr_parts: list[str] = []
        if housenumber and street:
            addr_parts.append(f"{housenumber} {street}")
        elif street:
            addr_parts.append(str(street))
        if suburb:
            addr_parts.append(str(suburb))
        if postcode:
            addr_parts.append(str(postcode))

        address = ", ".join(addr_parts) if addr_parts else None

        # -----------------------------------------------------------------------
        # Contact & Operational Details (No fabrication: null if missing)
        # -----------------------------------------------------------------------
        raw_phone = tags.get("phone") or tags.get("contact:phone")
        phone = str(raw_phone).strip() if raw_phone else None

        raw_website = tags.get("website") or tags.get("contact:website")
        website = str(raw_website).strip() if raw_website else None

        raw_opening_hours = tags.get("opening_hours")
        opening_hours = str(raw_opening_hours).strip() if raw_opening_hours else None

        # Straight-line distance calculation
        dist_km = haversine_distance_km(origin_lat, origin_lon, lat, lon)
        dist_m = round(dist_km * 1000.0, 1)

        # Amenities / operational tags
        amenities: list[str] = []
        if tags.get("emergency") == "yes" or (emergency and emergency != "no"):
            amenities.append("Emergency Services")
        if tags.get("wheelchair") in ("yes", "designated"):
            amenities.append("Wheelchair Accessible")
        if tags.get("dispensing") == "yes":
            amenities.append("Prescription Dispensing")
        if tags.get("healthcare:speciality"):
            amenities.append(str(tags["healthcare:speciality"]).replace(";", ", "))

        return PlaceModel(
            id=f"osm-{elem_type}-{elem_id}",
            source="OpenStreetMap",
            source_id=f"{elem_type}/{elem_id}",
            provenance=PlaceProvenance.OSM_MAPPED,
            category=category,
            name=name,
            latitude=lat,
            longitude=lon,
            address=address,
            city=str(city).strip() if city else None,
            phone=phone,
            website=website,
            opening_hours=opening_hours,
            distance_km=dist_km,
            route_distance_m=None,
            route_duration_s=None,
            fetched_at=now_iso,
            distance_meters=dist_m,
            distance_formatted=format_distance(dist_m),
            amenities=amenities,
        )

    async def fetch_nearby(
        self,
        lat: float,
        lon: float,
        radius_m: int,
        categories: list[PlaceCategory] | None = None,
        client: httpx.AsyncClient | None = None,
    ) -> list[PlaceModel]:
        """Query Overpass mirrors in sequence with automatic fallback."""
        mirrors = self.get_mirrors()
        query = self.build_query(lat, lon, radius_m, categories)
        now_iso = datetime.now(UTC).isoformat()
        start_time = time.perf_counter()

        should_close_client = False
        http_client = client
        if http_client is None:
            http_client = httpx.AsyncClient(timeout=self.timeout_seconds)
            should_close_client = True

        try:
            for mirror_url in mirrors:
                try:
                    resp = await http_client.post(
                        mirror_url,
                        data={"data": query},
                        headers={
                            "User-Agent": "SalvusDisasterCoordination/1.0 (https://github.com/salvus-rescue)",
                            "Accept": "application/json",
                        },
                    )
                    if resp.status_code == 200:
                        data = resp.json()
                        raw_elements: list[dict[str, Any]] = data.get("elements", [])
                        places: list[PlaceModel] = []
                        seen_ids: set[str] = set()

                        for elem in raw_elements:
                            place = self.normalize_element(elem, lat, lon, now_iso)
                            if place and place.id not in seen_ids:
                                seen_ids.add(place.id)
                                places.append(place)

                        # Sort ascending by straight-line distance
                        places.sort(
                            key=lambda p: p.distance_km if p.distance_km is not None else 9999.0
                        )
                        latency_ms = (time.perf_counter() - start_time) * 1000.0

                        self.update_health(SourceStatus.AVAILABLE, latency_ms=latency_ms)
                        return places
                    else:
                        logger.warning(
                            "[OverpassAdapter] Mirror %s returned HTTP %d, falling back...",
                            mirror_url,
                            resp.status_code,
                        )
                except Exception as exc:
                    logger.warning(
                        "[OverpassAdapter] Mirror %s request failed (%s), trying next mirror...",
                        mirror_url,
                        str(exc),
                    )

            # All mirrors exhausted
            latency_ms = (time.perf_counter() - start_time) * 1000.0
            self.update_health(
                SourceStatus.FAILED,
                latency_ms=latency_ms,
                error="All Overpass mirrors unreachable or timed out",
            )
            logger.warning("[OverpassAdapter] All mirrors exhausted. Returning empty result list.")
            return []

        finally:
            if should_close_client and http_client:
                await http_client.aclose()
