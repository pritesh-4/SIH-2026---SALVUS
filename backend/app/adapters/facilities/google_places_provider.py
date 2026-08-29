"""Google Places Provider Adapter (Optional Configured Fallback).

Uses Nearby Search around the user's coordinates:
- Minimal field mask to prevent expensive unnecessary data transfer
- Center: (latitude, longitude) with strict radius
- Category mapping to Google Places primary types
- Normalization into canonical FacilityModel
- Strictly server-side (private API key never sent to client)
"""

from __future__ import annotations

import logging
import os
import time
from datetime import UTC, datetime
from typing import Any

import httpx

from app.adapters.facilities.base import BaseFacilityProvider
from app.models.facility import FacilityCategory, FacilityModel
from app.utils.geospatial import (
    format_straight_line_distance,
    haversine_distance_km,
    haversine_distance_meters,
    is_within_strict_radius,
    normalize_phone_number,
)

logger = logging.getLogger("salvus.facilities.google")

GOOGLE_NEARBY_SEARCH_URL = "https://places.googleapis.com/v1/places:searchNearby"
DEFAULT_TIMEOUT_SECONDS = 7.0

# Google Places (New) includedTypes mapping
CATEGORY_GOOGLE_TYPES_MAPPING: dict[FacilityCategory, list[str]] = {
    FacilityCategory.HOSPITAL: ["hospital", "medical_clinic"],
    FacilityCategory.PHARMACY: ["pharmacy", "drugstore"],
    FacilityCategory.POLICE: ["police"],
    FacilityCategory.FIRE_STATION: ["fire_station"],
    FacilityCategory.AMBULANCE: ["hospital", "emergency_room"],
    FacilityCategory.SAFE_PLACE: ["community_center", "city_hall", "civic_centre"],
    FacilityCategory.OTHER: ["local_government_office"],
}


class GooglePlacesFacilityProvider(BaseFacilityProvider):
    """Optional secondary fallback provider using Google Places API (New)."""

    def __init__(
        self,
        api_key: str | None = None,
        timeout_seconds: float = DEFAULT_TIMEOUT_SECONDS,
    ):
        super().__init__(provider_id="google_places", provider_name="Google Places")
        self.api_key = (
            api_key or os.getenv("GOOGLE_PLACES_API_KEY") or os.getenv("GOOGLE_MAPS_API_KEY", "")
        ).strip()
        self.timeout_seconds = timeout_seconds

    def is_configured(self) -> bool:
        """Return True if Google Places API key is present and configured."""
        return bool(self.api_key and len(self.api_key) > 5)

    def normalize_place(
        self,
        raw_place: dict[str, Any],
        origin_lat: float,
        origin_lon: float,
        target_category: FacilityCategory,
        now_iso: str,
    ) -> FacilityModel | None:
        """Normalize Google Place entity into canonical FacilityModel."""
        place_id = raw_place.get("id")
        display_name_obj = raw_place.get("displayName") or {}
        name = display_name_obj.get("text") or f"Nearby {target_category.value.title()}"

        location = raw_place.get("location") or {}
        raw_lat = location.get("latitude")
        raw_lon = location.get("longitude")

        if raw_lat is None or raw_lon is None:
            return None

        try:
            lat = float(raw_lat)
            lon = float(raw_lon)
        except (ValueError, TypeError):
            return None

        dist_m = haversine_distance_meters(origin_lat, origin_lon, lat, lon)
        dist_km = haversine_distance_km(origin_lat, origin_lon, lat, lon)

        formatted_address = raw_place.get("formattedAddress")
        phone = normalize_phone_number(raw_place.get("nationalPhoneNumber"))
        website = raw_place.get("websiteUri")

        # Opening hours
        regular_hours = raw_place.get("regularOpeningHours") or {}
        weekday_descriptions = regular_hours.get("weekdayDescriptions")
        opening_hours = weekday_descriptions[0] if weekday_descriptions else None

        current_hours = raw_place.get("currentOpeningHours") or {}
        open_now = current_hours.get("openNow")

        primary_type = raw_place.get("primaryType") or target_category.value.lower()

        return FacilityModel(
            id=f"google-{place_id}",
            provider="google_places",
            provider_place_id=place_id,
            category=target_category,
            subcategory=primary_type,
            name=name,
            latitude=lat,
            longitude=lon,
            straight_line_distance_meters=dist_m,
            distance_km=dist_km,
            distance_formatted=format_straight_line_distance(dist_m),
            formatted_address=formatted_address,
            city=None,
            phone=phone,
            website=website,
            opening_hours=opening_hours,
            open_now=open_now,
            verified=False,
            confidence=0.92,
            amenities=[],
            safe_place_details=None,
            fetched_at=now_iso,
            raw_source_metadata={"place_id": place_id, "primary_type": primary_type},
        )

    async def fetch_category(
        self,
        lat: float,
        lon: float,
        radius_m: int,
        category: FacilityCategory,
        client: httpx.AsyncClient | None = None,
    ) -> tuple[list[FacilityModel], str]:
        """Execute Google Places Nearby Search for a specific category within radius."""
        if not self.is_configured():
            logger.debug("[GooglePlacesProvider] API key missing. Returning UNAVAILABLE status.")
            return [], "UNAVAILABLE"

        types = CATEGORY_GOOGLE_TYPES_MAPPING.get(category, ["establishment"])
        clamped_radius = min(10000.0, max(100.0, float(radius_m)))

        payload = {
            "includedTypes": types,
            "maxResultCount": 20,
            "locationRestriction": {
                "circle": {
                    "center": {"latitude": lat, "longitude": lon},
                    "radius": clamped_radius,
                }
            },
        }

        # Keep requested fields minimal
        headers = {
            "Content-Type": "application/json",
            "X-Goog-Api-Key": self.api_key,
            "X-Goog-FieldMask": (
                "places.id,places.displayName,places.formattedAddress,places.location,"
                "places.primaryType,places.nationalPhoneNumber,places.websiteUri,"
                "places.regularOpeningHours,places.currentOpeningHours"
            ),
        }

        should_close = False
        http_client = client
        if http_client is None:
            http_client = httpx.AsyncClient(timeout=self.timeout_seconds)
            should_close = True

        start_t = time.perf_counter()
        now_iso = datetime.now(UTC).isoformat()

        try:
            resp = await http_client.post(GOOGLE_NEARBY_SEARCH_URL, json=payload, headers=headers)
            duration_ms = (time.perf_counter() - start_t) * 1000.0

            if resp.status_code == 200:
                data = resp.json()
                raw_places = data.get("places") or []
                facilities: list[FacilityModel] = []

                for item in raw_places:
                    fac = self.normalize_place(item, lat, lon, category, now_iso)
                    if fac and is_within_strict_radius(
                        lat, lon, fac.latitude, fac.longitude, clamped_radius
                    ):
                        facilities.append(fac)

                self.log_query_observability(
                    category=category.value,
                    lat=lat,
                    lon=lon,
                    radius_m=clamped_radius,
                    result_count=len(facilities),
                    duration_ms=duration_ms,
                    status="OK" if facilities else "EMPTY",
                )
                return facilities, "OK" if facilities else "EMPTY"

            status_str = "UNAVAILABLE" if resp.status_code >= 500 else "PROVIDER_UNAVAILABLE"
            self.log_query_observability(
                category=category.value,
                lat=lat,
                lon=lon,
                radius_m=clamped_radius,
                result_count=0,
                duration_ms=duration_ms,
                status=status_str,
                error=f"HTTP {resp.status_code}",
            )
            return [], status_str
        except Exception as exc:
            duration_ms = (time.perf_counter() - start_t) * 1000.0
            self.log_query_observability(
                category=category.value,
                lat=lat,
                lon=lon,
                radius_m=clamped_radius,
                result_count=0,
                duration_ms=duration_ms,
                status="UNAVAILABLE",
                error=str(exc),
            )
            return [], "UNAVAILABLE"
        finally:
            if should_close:
                await http_client.aclose()
