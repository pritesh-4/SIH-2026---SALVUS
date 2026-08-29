"""Geoapify Places API v2 Provider Adapter (Primary Provider).

Implements real-world coordinate-based nearby search around citizen GPS:
- Centered on: `(USER_LONGITUDE, USER_LATITUDE)`
- Spatial filter: `circle:{lon},{lat},{radius_m}`
- Proximity ranking: `bias=proximity:{lon},{lat}`
- Strictly bounded radius (up to 10,000 meters)
- Category taxonomy mapping to Geoapify place categories
- Local Haversine distance calculation and strict local radius enforcement
- Safe contact extraction without data fabrication
"""

from __future__ import annotations

import logging
import os
import time
from datetime import UTC, datetime
from typing import Any

import httpx

from app.adapters.facilities.base import BaseFacilityProvider
from app.models import SourceStatus
from app.models.facility import FacilityCategory, FacilityModel
from app.utils.geospatial import (
    format_straight_line_distance,
    haversine_distance_km,
    haversine_distance_meters,
    is_within_strict_radius,
    normalize_phone_number,
)

logger = logging.getLogger("salvus.facilities.geoapify")

GEOAPIFY_PLACES_URL = "https://api.geoapify.com/v2/places"
DEFAULT_TIMEOUT_SECONDS = 7.5

# Geoapify category mapping
CATEGORY_GEOAPIFY_MAPPING: dict[FacilityCategory, str] = {
    FacilityCategory.HOSPITAL: "healthcare.hospital,healthcare.clinic",
    FacilityCategory.PHARMACY: "healthcare.pharmacy",
    FacilityCategory.POLICE: "service.police",
    FacilityCategory.FIRE_STATION: "service.fire_station",
    FacilityCategory.AMBULANCE: "healthcare.hospital,emergency",
    FacilityCategory.SAFE_PLACE: (
        "building.community_centre,service.social_facility.shelter,emergency"
    ),
    FacilityCategory.OTHER: "amenity.public_facility,emergency",
}


class GeoapifyFacilityProvider(BaseFacilityProvider):
    """Primary emergency facilities provider using Geoapify Places API v2."""

    def __init__(
        self,
        api_key: str | None = None,
        base_url: str = GEOAPIFY_PLACES_URL,
        timeout_seconds: float = DEFAULT_TIMEOUT_SECONDS,
    ):
        super().__init__(provider_id="geoapify", provider_name="Geoapify Places")
        self.api_key = (api_key or os.getenv("GEOAPIFY_API_KEY", "")).strip()
        self.base_url = base_url
        self.timeout_seconds = timeout_seconds

    def is_configured(self) -> bool:
        """Check if a valid Geoapify API key is configured."""
        return bool(self.api_key and len(self.api_key) > 5)

    def normalize_feature(
        self,
        feature: dict[str, Any],
        origin_lat: float,
        origin_lon: float,
        target_category: FacilityCategory,
        now_iso: str,
    ) -> FacilityModel | None:
        """Normalize Geoapify GeoJSON feature into canonical FacilityModel."""
        props: dict[str, Any] = feature.get("properties") or {}
        geometry: dict[str, Any] = feature.get("geometry") or {}
        coords = (
            geometry.get("coordinates") if isinstance(geometry.get("coordinates"), list) else None
        )

        # Coordinates: GeoJSON coordinates are [lon, lat]
        raw_lat = props.get("lat") or (coords[1] if coords and len(coords) >= 2 else None)
        raw_lon = props.get("lon") or (coords[0] if coords and len(coords) >= 2 else None)

        if raw_lat is None or raw_lon is None:
            return None

        try:
            lat = float(raw_lat)
            lon = float(raw_lon)
        except (ValueError, TypeError):
            return None

        # Resolve name
        name = props.get("name")
        if not name:
            formatted = props.get("formatted") or props.get("address_line1")
            name = (
                formatted.split(",")[0].strip()
                if formatted
                else f"Nearby {target_category.value.title()}"
            )

        # Category and Subcategory
        categories_list = props.get("categories") or []
        subcategory = categories_list[0] if categories_list else None

        # Address details
        formatted_address = props.get("formatted") or props.get("address_line2")
        city = (
            props.get("city") or props.get("suburb") or props.get("district") or props.get("state")
        )

        # Contact & operational details (strictly from provider)
        contact_dict = props.get("contact") or {}
        raw_datasource = props.get("datasource", {}).get("raw", {})
        raw_phone = contact_dict.get("phone") or raw_datasource.get("phone") or props.get("phone")
        phone = normalize_phone_number(raw_phone)

        website = (
            props.get("website") or contact_dict.get("website") or raw_datasource.get("website")
        )
        opening_hours = props.get("opening_hours") or raw_datasource.get("opening_hours")

        # Local distance computation
        dist_m = haversine_distance_meters(origin_lat, origin_lon, lat, lon)
        dist_km = haversine_distance_km(origin_lat, origin_lon, lat, lon)
        dist_formatted = format_straight_line_distance(dist_m)

        # Place ID
        place_id = str(props.get("place_id") or f"{lat:.5f}-{lon:.5f}")

        # Amenities
        amenities: list[str] = []
        for cat in categories_list:
            if "emergency" in cat:
                amenities.append("Emergency Support")
            if "hospital" in cat:
                amenities.append("Inpatient Care")
            if "pharmacy" in cat:
                amenities.append("Prescriptions")

        wheelchair_val = str(raw_datasource.get("wheelchair", "")).lower()
        if wheelchair_val in ("yes", "designated", "true", "1") or "wheelchair" in wheelchair_val:
            amenities.append("Wheelchair Accessible")

        return FacilityModel(
            id=f"geoapify-{place_id}",
            provider="geoapify",
            provider_place_id=place_id,
            category=target_category,
            subcategory=subcategory,
            name=name,
            latitude=lat,
            longitude=lon,
            straight_line_distance_meters=dist_m,
            distance_km=dist_km,
            distance_formatted=dist_formatted,
            formatted_address=formatted_address,
            city=str(city).strip() if city else None,
            phone=phone,
            website=str(website).strip() if website else None,
            opening_hours=str(opening_hours).strip() if opening_hours else None,
            open_now=None,
            verified=False,
            confidence=0.90,
            amenities=list(dict.fromkeys(amenities)),
            safe_place_details=None,
            fetched_at=now_iso,
            raw_source_metadata={
                "place_id": place_id,
                "categories": categories_list,
                "datasource": props.get("datasource", {}).get("sourcename", "geoapify"),
            },
        )

    async def fetch_category(
        self,
        lat: float,
        lon: float,
        radius_m: int,
        category: FacilityCategory,
        client: httpx.AsyncClient | None = None,
    ) -> tuple[list[FacilityModel], str]:
        """Query Geoapify Places API for a specific category within radius."""
        if not self.is_configured():
            logger.debug("[GeoapifyProvider] API key missing. Returning UNAVAILABLE status.")
            return [], "UNAVAILABLE"

        geoapify_cats = CATEGORY_GEOAPIFY_MAPPING.get(category, "amenity")
        clamped_radius = min(10000, max(100, radius_m))

        params = {
            "categories": geoapify_cats,
            "filter": f"circle:{lon},{lat},{clamped_radius}",
            "bias": f"proximity:{lon},{lat}",
            "limit": 35,
            "apiKey": self.api_key,
        }

        should_close = False
        http_client = client
        if http_client is None:
            http_client = httpx.AsyncClient(timeout=self.timeout_seconds)
            should_close = True

        headers = {
            "User-Agent": "SalvusDisasterIntelligence/2.0 (Emergency Situational Awareness)",
            "Accept": "application/json",
        }

        start_t = time.perf_counter()
        now_iso = datetime.now(UTC).isoformat()

        try:
            resp = await http_client.get(self.base_url, params=params, headers=headers)
            duration_ms = (time.perf_counter() - start_t) * 1000.0

            if resp.status_code == 200:
                data = resp.json()
                features = data.get("features") or []
                facilities: list[FacilityModel] = []

                for feat in features:
                    fac = self.normalize_feature(feat, lat, lon, category, now_iso)
                    # LOCAL DISTANCE VALIDATION: Strict <= 10,000m filter
                    if fac and is_within_strict_radius(
                        lat, lon, fac.latitude, fac.longitude, clamped_radius
                    ):
                        facilities.append(fac)

                self.update_health(SourceStatus.AVAILABLE, latency_ms=duration_ms)
                status = "OK" if facilities else "EMPTY"
                return facilities, status

            elif resp.status_code == 429:
                logger.warning("[GeoapifyProvider] Rate limited (HTTP 429)")
                self.update_health(
                    SourceStatus.FAILED, latency_ms=duration_ms, error="Rate limited (429)"
                )
                return [], "UNAVAILABLE"
            else:
                logger.warning(f"[GeoapifyProvider] HTTP {resp.status_code}: {resp.text[:200]}")
                self.update_health(
                    SourceStatus.FAILED, latency_ms=duration_ms, error=f"HTTP {resp.status_code}"
                )
                return [], "UNAVAILABLE"

        except httpx.TimeoutException:
            duration_ms = (time.perf_counter() - start_t) * 1000.0
            self.update_health(SourceStatus.FAILED, latency_ms=duration_ms, error="Request timeout")
            return [], "TIMEOUT"
        except Exception as exc:
            duration_ms = (time.perf_counter() - start_t) * 1000.0
            self.update_health(SourceStatus.FAILED, latency_ms=duration_ms, error=str(exc))
            return [], "UNAVAILABLE"
        finally:
            if should_close and http_client:
                await http_client.aclose()
