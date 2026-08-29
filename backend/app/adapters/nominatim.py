"""OpenStreetMap Nominatim Places Provider Adapter (Multi-Source Resilience).

Provides a secondary, structured geospatial query fallback when Overpass mirrors
are experiencing latency, 502/504 errors, or connection throttling.

Key Responsibilities:
- Bounded spatial search around citizen GPS coordinate
- Honest tag and category mapping to controlled `PlaceCategory`
- Safe address extraction from structured Nominatim address details
- Straight-line Haversine distance calculation and human formatting
- Zero data fabrication (missing phones or operational details remain null)
- Strict provenance attribution (`PlaceProvenance.OSM_MAPPED`, `source="OpenStreetMap (Nominatim)"`)
"""

from __future__ import annotations

import logging
import math
import os
import time
from datetime import UTC, datetime
from typing import Any

import httpx

from app.adapters.places import (
    NearbyPlacesProvider,
    deduplicate_places,
    format_distance,
    haversine_distance_km,
    normalize_phone_number,
)
from app.models import (
    PlaceCategory,
    PlaceModel,
    PlaceProvenance,
    SourceStatus,
)

logger = logging.getLogger(__name__)

DEFAULT_NOMINATIM_URL = "https://nominatim.openstreetmap.org/search"
DEFAULT_NOMINATIM_TIMEOUT_SECONDS = 6.0


def compute_viewbox(lat: float, lon: float, radius_m: int) -> str:
    """Compute bounded bounding box string in Nominatim viewbox format."""
    radius_km = max(100, radius_m) / 1000.0
    dlat = radius_km / 111.0
    # Guard against division by zero at poles
    cos_lat = max(0.01, math.cos(math.radians(lat)))
    dlon = radius_km / (111.0 * cos_lat)

    min_lon = lon - dlon
    max_lat = lat + dlat
    max_lon = lon + dlon
    min_lat = lat - dlat

    return f"{min_lon:.6f},{max_lat:.6f},{max_lon:.6f},{min_lat:.6f}"


CATEGORY_SEARCH_TERMS: dict[PlaceCategory, list[str]] = {
    PlaceCategory.HOSPITAL: ["hospital"],
    PlaceCategory.CLINIC: ["clinic", "doctors"],
    PlaceCategory.PHARMACY: ["pharmacy", "chemist"],
    PlaceCategory.POLICE: ["police", "police station"],
    PlaceCategory.FIRE_STATION: ["fire station"],
    PlaceCategory.SHELTER: [
        "emergency shelter",
        "evacuation centre",
        "community centre",
        "townhall",
    ],
    PlaceCategory.EMERGENCY_SERVICE: ["ambulance station", "emergency service"],
}


class NominatimPlacesAdapter(NearbyPlacesProvider):
    """Secondary places adapter querying OpenStreetMap via Nominatim search API."""

    def __init__(
        self,
        base_url: str = DEFAULT_NOMINATIM_URL,
        timeout_seconds: float = DEFAULT_NOMINATIM_TIMEOUT_SECONDS,
    ):
        super().__init__(source_id="osm_nominatim", source_name="OpenStreetMap (Nominatim)")
        self.base_url = os.getenv("NOMINATIM_URL", base_url).strip() or DEFAULT_NOMINATIM_URL
        self.timeout_seconds = timeout_seconds

    def normalize_item(
        self,
        item: dict[str, Any],
        origin_lat: float,
        origin_lon: float,
        target_category: PlaceCategory,
        now_iso: str,
    ) -> PlaceModel | None:
        """Normalize a raw Nominatim search result into PlaceModel."""
        osm_type = str(item.get("osm_type", "node")).lower()
        osm_id = item.get("osm_id")
        place_id = item.get("place_id") or osm_id

        raw_lat = item.get("lat")
        raw_lon = item.get("lon")
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

        # Resolve name
        name = item.get("name")
        if not name:
            display_name = item.get("display_name", "")
            name = display_name.split(",")[0].strip() if display_name else None

        # Determine category & fallback name
        category = target_category
        nom_type = str(item.get("type", "")).lower()
        nom_class = str(item.get("category", item.get("class", ""))).lower()

        if nom_type == "hospital" or nom_class == "healthcare":
            category = PlaceCategory.HOSPITAL
            fallback_name = "Hospital / Medical Facility"
        elif nom_type in ("clinic", "doctors"):
            category = PlaceCategory.CLINIC
            fallback_name = "Health Clinic"
        elif nom_type in ("pharmacy", "chemist"):
            category = PlaceCategory.PHARMACY
            fallback_name = "Pharmacy / Chemist"
        elif nom_type == "police":
            category = PlaceCategory.POLICE
            fallback_name = "Police Station"
        elif nom_type == "fire_station":
            category = PlaceCategory.FIRE_STATION
            fallback_name = "Fire & Rescue Station"
        elif nom_type in ("shelter", "community_centre", "townhall", "evacuation_centre"):
            category = PlaceCategory.SHELTER
            fallback_name = "Community Shelter (OSM Mapped)"
        else:
            fallback_name = "Public Emergency Facility"

        final_name = name if name else fallback_name

        # Construct structured address
        addr_dict = item.get("address") or {}
        road = addr_dict.get("road")
        house_num = addr_dict.get("house_number")
        suburb = (
            addr_dict.get("suburb") or addr_dict.get("neighbourhood") or addr_dict.get("district")
        )
        city = (
            addr_dict.get("city")
            or addr_dict.get("town")
            or addr_dict.get("municipality")
            or suburb
        )
        postcode = addr_dict.get("postcode")

        addr_parts: list[str] = []
        if house_num and road:
            addr_parts.append(f"{house_num} {road}")
        elif road:
            addr_parts.append(str(road))
        if suburb and suburb != city:
            addr_parts.append(str(suburb))
        if postcode:
            addr_parts.append(str(postcode))

        address = ", ".join(addr_parts) if addr_parts else None

        # Distance calculation
        dist_km = haversine_distance_km(origin_lat, origin_lon, lat, lon)
        dist_m = round(dist_km * 1000.0, 1)

        # Phone extraction if present
        extratags = item.get("extratags") or {}
        raw_phone = extratags.get("phone") or extratags.get("contact:phone")
        phone = normalize_phone_number(raw_phone)

        # Unique identifier
        identifier = f"osm-nom-{osm_type}-{osm_id}" if osm_id else f"osm-nom-{place_id}"

        return PlaceModel(
            id=identifier,
            source="OpenStreetMap (Nominatim)",
            source_id=f"{osm_type}/{osm_id}" if osm_id else str(place_id),
            provenance=PlaceProvenance.OSM_MAPPED,
            category=category,
            name=final_name,
            latitude=lat,
            longitude=lon,
            address=address,
            city=str(city).strip() if city else None,
            phone=phone,
            website=None,
            opening_hours=None,
            distance_km=dist_km,
            route_distance_m=None,
            route_duration_s=None,
            fetched_at=now_iso,
            distance_meters=dist_m,
            distance_formatted=format_distance(dist_m),
            amenities=[],
        )

    async def fetch_nearby(
        self,
        lat: float,
        lon: float,
        radius_m: int,
        categories: list[PlaceCategory] | None = None,
        client: httpx.AsyncClient | None = None,
    ) -> list[PlaceModel]:
        """Fetch nearby places from Nominatim bounded viewbox search."""
        viewbox = compute_viewbox(lat, lon, radius_m)
        target_categories = categories if categories else list(CATEGORY_SEARCH_TERMS.keys())
        now_iso = datetime.now(UTC).isoformat()
        start_time = time.perf_counter()

        should_close_client = False
        http_client = client
        if http_client is None:
            http_client = httpx.AsyncClient(timeout=self.timeout_seconds)
            should_close_client = True

        headers = {
            "User-Agent": "SalvusDisasterCoordination/2.0 (contact: info@salvus.rescue)",
            "Accept": "application/json",
        }

        any_success = False
        collected_places: list[PlaceModel] = []
        max_dist_km = (radius_m / 1000.0) * 1.05  # 5% buffer for bounding box corners

        try:
            for cat in target_categories:
                terms = CATEGORY_SEARCH_TERMS.get(cat, [cat.value.lower().replace("_", " ")])
                for term in terms[:2]:  # Limit queries to at most 2 primary terms per category
                    params = {
                        "q": term,
                        "viewbox": viewbox,
                        "bounded": 1,
                        "format": "jsonv2",
                        "addressdetails": 1,
                        "extratags": 1,
                        "limit": 15,
                    }
                    try:
                        resp = await http_client.get(self.base_url, params=params, headers=headers)
                        if resp.status_code == 200:
                            any_success = True
                            items: list[dict[str, Any]] = resp.json()
                            for it in items:
                                place = self.normalize_item(it, lat, lon, cat, now_iso)
                                if (
                                    place
                                    and place.distance_km is not None
                                    and place.distance_km <= max_dist_km
                                ):
                                    collected_places.append(place)
                        else:
                            logger.warning(
                                "[NominatimAdapter] Query for '%s' returned HTTP %d",
                                term,
                                resp.status_code,
                            )
                    except Exception as exc:
                        logger.warning(
                            "[NominatimAdapter] Query for '%s' failed: %s",
                            term,
                            str(exc),
                        )

            latency_ms = (time.perf_counter() - start_time) * 1000.0
            if any_success:
                deduped = deduplicate_places(collected_places)
                self.update_health(SourceStatus.AVAILABLE, latency_ms=latency_ms)
                return deduped
            else:
                self.update_health(
                    SourceStatus.FAILED,
                    latency_ms=latency_ms,
                    error="Nominatim queries failed or unreachable",
                )
                return []

        except Exception as exc:
            latency_ms = (time.perf_counter() - start_time) * 1000.0
            self.update_health(
                SourceStatus.FAILED,
                latency_ms=latency_ms,
                error=f"Nominatim fetch failed: {exc}",
            )
            return []

        finally:
            if should_close_client and http_client:
                await http_client.aclose()
