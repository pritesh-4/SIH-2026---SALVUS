"""OpenStreetMap Overpass & Nominatim Provider Adapter (Resilient Fallback).

Provides a self-contained, keyless fallback when commercial providers
(Geoapify / Google Places) are unavailable, throttled, or unconfigured.

Key Enhancements:
- Efficient combined or category-isolated queries
- Per-mirror fast timeout (3.5s per mirror) to stay within client latency budgets
- Normalization directly into canonical `FacilityModel`
- Strict <= 10,000m local distance filtering
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
    compute_bounding_box,
    format_straight_line_distance,
    haversine_distance_km,
    haversine_distance_meters,
    is_within_strict_radius,
    normalize_phone_number,
)

logger = logging.getLogger("salvus.facilities.osm")

DEFAULT_OVERPASS_MIRRORS = [
    "https://lz4.overpass-api.de/api/interpreter",
    "https://overpass.kumi.systems/api/interpreter",
    "https://overpass-api.de/api/interpreter",
    "https://overpass.private.coffee/api/interpreter",
]

DEFAULT_NOMINATIM_URL = "https://nominatim.openstreetmap.org/search"
DEFAULT_TIMEOUT_SECONDS = 4.0


class OSMFacilityProvider(BaseFacilityProvider):
    """OpenStreetMap Overpass and Nominatim facility provider."""

    def __init__(
        self,
        mirrors: list[str] | None = None,
        timeout_seconds: float = DEFAULT_TIMEOUT_SECONDS,
    ):
        super().__init__(provider_id="osm", provider_name="OpenStreetMap Overpass")
        self._custom_mirrors = mirrors
        self.timeout_seconds = timeout_seconds

    def get_mirrors(self) -> list[str]:
        """Resolve available Overpass mirrors."""
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
        categories: list[FacilityCategory] | None = None,
    ) -> str:
        """Construct compact, high-efficiency Overpass QL query."""
        cat_set = set(categories) if categories else set(FacilityCategory)
        clauses: list[str] = []

        if FacilityCategory.HOSPITAL in cat_set:
            clauses.append(f'node["amenity"="hospital"](around:{radius_m},{lat},{lon});')
            clauses.append(f'way["amenity"="hospital"](around:{radius_m},{lat},{lon});')
            clauses.append(f'node["healthcare"="hospital"](around:{radius_m},{lat},{lon});')
            clauses.append(f'node["amenity"="clinic"](around:{radius_m},{lat},{lon});')
            clauses.append(f'way["amenity"="clinic"](around:{radius_m},{lat},{lon});')
            clauses.append(f'node["healthcare"="clinic"](around:{radius_m},{lat},{lon});')
            clauses.append(f'node["amenity"="doctors"](around:{radius_m},{lat},{lon});')

        if FacilityCategory.PHARMACY in cat_set:
            clauses.append(f'node["amenity"="pharmacy"](around:{radius_m},{lat},{lon});')
            clauses.append(f'way["amenity"="pharmacy"](around:{radius_m},{lat},{lon});')
            clauses.append(f'node["shop"="chemist"](around:{radius_m},{lat},{lon});')
            clauses.append(f'node["shop"="pharmacy"](around:{radius_m},{lat},{lon});')
            clauses.append(f'node["healthcare"="pharmacy"](around:{radius_m},{lat},{lon});')

        if FacilityCategory.POLICE in cat_set:
            clauses.append(f'node["amenity"="police"](around:{radius_m},{lat},{lon});')
            clauses.append(f'way["amenity"="police"](around:{radius_m},{lat},{lon});')
            clauses.append(f'node["amenity"="police_outpost"](around:{radius_m},{lat},{lon});')
            clauses.append(f'node["amenity"="police_station"](around:{radius_m},{lat},{lon});')
            clauses.append(
                f'node["office"="government"]["government"="police"](around:{radius_m},{lat},{lon});'
            )

        if FacilityCategory.FIRE_STATION in cat_set:
            clauses.append(f'node["amenity"="fire_station"](around:{radius_m},{lat},{lon});')
            clauses.append(f'way["amenity"="fire_station"](around:{radius_m},{lat},{lon});')
            clauses.append(f'node["emergency"="fire_station"](around:{radius_m},{lat},{lon});')
            clauses.append(f'node["emergency"="fire_service"](around:{radius_m},{lat},{lon});')

        if FacilityCategory.AMBULANCE in cat_set:
            clauses.append(f'node["emergency"="ambulance_station"](around:{radius_m},{lat},{lon});')
            clauses.append(f'way["emergency"="ambulance_station"](around:{radius_m},{lat},{lon});')
            clauses.append(f'node["emergency"="disaster_response"](around:{radius_m},{lat},{lon});')

        if FacilityCategory.SAFE_PLACE in cat_set:
            clauses.append(f'node["emergency"="evacuation_centre"](around:{radius_m},{lat},{lon});')
            clauses.append(f'way["emergency"="evacuation_centre"](around:{radius_m},{lat},{lon});')
            clauses.append(f'node["emergency"="shelter"](around:{radius_m},{lat},{lon});')
            clauses.append(f'way["emergency"="shelter"](around:{radius_m},{lat},{lon});')
            clauses.append(f'node["amenity"="community_centre"](around:{radius_m},{lat},{lon});')
            clauses.append(f'way["amenity"="community_centre"](around:{radius_m},{lat},{lon});')
            clauses.append(f'node["amenity"="townhall"](around:{radius_m},{lat},{lon});')

        if not clauses:
            clauses.append(
                f'node["amenity"~"hospital|pharmacy|police|fire_station|community_centre"](around:{radius_m},{lat},{lon});'
            )

        body = "\n  ".join(clauses)
        return f"""
[out:json][timeout:5];
(
  {body}
);
out center tags 80;
""".strip()

    def normalize_element(
        self,
        elem: dict[str, Any],
        origin_lat: float,
        origin_lon: float,
        now_iso: str,
        target_category: FacilityCategory | None = None,
    ) -> FacilityModel | None:
        """Normalize raw OSM node/way/relation element into FacilityModel."""
        elem_id = elem.get("id")
        elem_type = elem.get("type", "node")
        tags: dict[str, Any] = elem.get("tags") or {}

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

        amenity = str(tags.get("amenity", "")).lower()
        emergency = str(tags.get("emergency", "")).lower()
        healthcare = str(tags.get("healthcare", "")).lower()
        shop = str(tags.get("shop", "")).lower()

        # Category mapping
        category = target_category
        if category is None:
            if amenity == "hospital" or healthcare == "hospital" or "hospital" in amenity:
                category = FacilityCategory.HOSPITAL
            elif amenity in ("clinic", "doctors") or healthcare in ("clinic", "doctor"):
                category = FacilityCategory.HOSPITAL
            elif amenity in ("pharmacy", "chemist") or shop in (
                "chemist",
                "pharmacy",
                "medical_supply",
            ):
                category = FacilityCategory.PHARMACY
            elif (
                amenity in ("police", "police_station", "police_outpost")
                or tags.get("government") == "police"
            ):
                category = FacilityCategory.POLICE
            elif amenity == "fire_station" or emergency in ("fire_station", "fire_service"):
                category = FacilityCategory.FIRE_STATION
            elif emergency in ("ambulance_station", "emergency_ward_entrance"):
                category = FacilityCategory.AMBULANCE
            elif emergency in ("evacuation_centre", "shelter") or amenity in (
                "community_centre",
                "townhall",
            ):
                category = FacilityCategory.SAFE_PLACE
            else:
                category = FacilityCategory.OTHER

        raw_name = tags.get("name") or tags.get("name:en") or tags.get("operator")
        name = str(raw_name).strip() if raw_name else f"Nearby {category.value.title()}"

        # Address construction
        street = tags.get("addr:street")
        housenumber = tags.get("addr:housenumber")
        suburb = tags.get("addr:suburb") or tags.get("addr:district")
        postcode = tags.get("addr:postcode")
        city = tags.get("addr:city") or suburb

        addr_parts: list[str] = []
        if housenumber and street:
            addr_parts.append(f"{housenumber} {street}")
        elif street:
            addr_parts.append(str(street))
        if suburb:
            addr_parts.append(str(suburb))
        if postcode:
            addr_parts.append(str(postcode))

        formatted_address = ", ".join(addr_parts) if addr_parts else None

        phone = normalize_phone_number(tags.get("phone") or tags.get("contact:phone"))
        website = tags.get("website") or tags.get("contact:website")
        opening_hours = tags.get("opening_hours")

        dist_m = haversine_distance_meters(origin_lat, origin_lon, lat, lon)
        dist_km = haversine_distance_km(origin_lat, origin_lon, lat, lon)

        amenities: list[str] = []
        if tags.get("emergency") == "yes":
            amenities.append("Emergency Services")
        if tags.get("wheelchair") in ("yes", "designated"):
            amenities.append("Wheelchair Accessible")

        return FacilityModel(
            id=f"osm-{elem_type}-{elem_id}",
            provider="osm",
            provider_place_id=f"{elem_type}/{elem_id}",
            category=category,
            subcategory=tags.get("amenity") or tags.get("emergency") or tags.get("healthcare"),
            name=name,
            latitude=lat,
            longitude=lon,
            straight_line_distance_meters=dist_m,
            distance_km=dist_km,
            distance_formatted=format_straight_line_distance(dist_m),
            formatted_address=formatted_address,
            city=str(city).strip() if city else None,
            phone=phone,
            website=str(website).strip() if website else None,
            opening_hours=str(opening_hours).strip() if opening_hours else None,
            open_now=None,
            verified=False,
            confidence=0.85,
            amenities=amenities,
            safe_place_details=None,
            fetched_at=now_iso,
            raw_source_metadata={"osm_id": elem_id, "osm_type": elem_type, "tags": tags},
        )

    async def fetch_category(
        self,
        lat: float,
        lon: float,
        radius_m: int,
        category: FacilityCategory,
        client: httpx.AsyncClient | None = None,
    ) -> tuple[list[FacilityModel], str]:
        """Fetch category via Overpass with automatic fallback to Nominatim."""
        res_map = await self.fetch_all_categories_concurrent(
            lat=lat, lon=lon, radius_m=radius_m, categories=[category], client=client
        )
        return res_map.get(category, ([], "UNAVAILABLE"))

    async def fetch_all_categories_concurrent(
        self,
        lat: float,
        lon: float,
        radius_m: int,
        categories: list[FacilityCategory] | None = None,
        client: httpx.AsyncClient | None = None,
    ) -> dict[FacilityCategory, tuple[list[FacilityModel], str]]:
        """Fetch requested categories via Overpass with single unified query
        for high performance."""
        target_cats = (
            categories
            if categories
            else [
                FacilityCategory.HOSPITAL,
                FacilityCategory.PHARMACY,
                FacilityCategory.POLICE,
                FacilityCategory.FIRE_STATION,
                FacilityCategory.AMBULANCE,
                FacilityCategory.SAFE_PLACE,
            ]
        )

        query = self.build_query(lat, lon, radius_m, target_cats)
        mirrors = self.get_mirrors()
        now_iso = datetime.now(UTC).isoformat()
        clamped_radius = min(10000, max(100, radius_m))

        should_close = False
        http_client = client
        if http_client is None:
            http_client = httpx.AsyncClient(timeout=self.timeout_seconds)
            should_close = True

        headers = {
            "User-Agent": "SalvusDisasterCoordination/2.0 (Emergency Situational Awareness)",
            "Accept": "application/json",
        }

        start_t = time.perf_counter()
        overpass_success = False
        collected_by_cat: dict[FacilityCategory, list[FacilityModel]] = {c: [] for c in target_cats}

        try:
            for mirror_url in mirrors:
                try:
                    resp = await http_client.post(mirror_url, data={"data": query}, headers=headers)
                    if resp.status_code == 200:
                        overpass_success = True
                        data = resp.json()
                        raw_elements: list[dict[str, Any]] = data.get("elements", [])
                        for elem in raw_elements:
                            fac = self.normalize_element(elem, lat, lon, now_iso)
                            if fac and is_within_strict_radius(
                                lat, lon, fac.latitude, fac.longitude, clamped_radius
                            ):
                                if fac.category in collected_by_cat:
                                    collected_by_cat[fac.category].append(fac)
                                else:
                                    collected_by_cat[fac.category] = [fac]
                        break
                except Exception as exc:
                    logger.debug(f"[OSMProvider] Mirror {mirror_url} failed: {exc}")

            dur_ms = (time.perf_counter() - start_t) * 1000.0
            results_map: dict[FacilityCategory, tuple[list[FacilityModel], str]] = {}

            if overpass_success:
                for c in target_cats:
                    items = collected_by_cat.get(c, [])
                    status = "OK" if items else "EMPTY"
                    results_map[c] = (items, status)
                    self.log_observability(c, lat, lon, radius_m, len(items), dur_ms, status)
                return results_map

            # If Overpass failed, try Nominatim fallback per category
            for cat in target_cats:
                nom_places, nom_status = await self._fetch_nominatim_single(
                    lat, lon, clamped_radius, cat, http_client
                )
                results_map[cat] = (nom_places, nom_status)
                self.log_observability(cat, lat, lon, radius_m, len(nom_places), dur_ms, nom_status)

            return results_map

        finally:
            if should_close and http_client:
                await http_client.aclose()

    async def _fetch_nominatim_single(
        self,
        lat: float,
        lon: float,
        radius_m: int,
        category: FacilityCategory,
        client: httpx.AsyncClient,
    ) -> tuple[list[FacilityModel], str]:
        """Query Nominatim for single category fallback."""
        min_lat, min_lon, max_lat, max_lon = compute_bounding_box(lat, lon, radius_m)
        viewbox = f"{min_lon},{max_lat},{max_lon},{min_lat}"

        term_map = {
            FacilityCategory.HOSPITAL: "hospital",
            FacilityCategory.PHARMACY: "pharmacy",
            FacilityCategory.POLICE: "police",
            FacilityCategory.FIRE_STATION: "fire station",
            FacilityCategory.AMBULANCE: "ambulance station",
            FacilityCategory.SAFE_PLACE: "community centre",
        }
        term = term_map.get(category, category.value.lower())

        params = {
            "q": term,
            "viewbox": viewbox,
            "bounded": 1,
            "format": "jsonv2",
            "addressdetails": 1,
            "limit": 15,
        }
        headers = {
            "User-Agent": "SalvusDisasterCoordination/2.0 (contact: info@salvus.rescue)",
            "Accept": "application/json",
        }
        now_iso = datetime.now(UTC).isoformat()

        try:
            resp = await client.get(DEFAULT_NOMINATIM_URL, params=params, headers=headers)
            if resp.status_code == 200:
                items = resp.json()
                facilities: list[FacilityModel] = []
                for it in items:
                    raw_lat = it.get("lat")
                    raw_lon = it.get("lon")
                    if raw_lat and raw_lon:
                        try:
                            f_lat = float(raw_lat)
                            f_lon = float(raw_lon)
                            if is_within_strict_radius(lat, lon, f_lat, f_lon, radius_m):
                                dist_m = haversine_distance_meters(lat, lon, f_lat, f_lon)
                                name = (
                                    it.get("name")
                                    or it.get("display_name", "").split(",")[0]
                                    or f"Nearby {category.value.title()}"
                                )
                                facilities.append(
                                    FacilityModel(
                                        id=f"osm-nom-{it.get('place_id') or it.get('osm_id')}",
                                        provider="osm_nominatim",
                                        provider_place_id=str(
                                            it.get("place_id") or it.get("osm_id")
                                        ),
                                        category=category,
                                        subcategory=it.get("type"),
                                        name=name,
                                        latitude=f_lat,
                                        longitude=f_lon,
                                        straight_line_distance_meters=dist_m,
                                        distance_km=haversine_distance_km(lat, lon, f_lat, f_lon),
                                        distance_formatted=format_straight_line_distance(dist_m),
                                        formatted_address=it.get("display_name"),
                                        phone=None,
                                        website=None,
                                        opening_hours=None,
                                        verified=False,
                                        confidence=0.80,
                                        fetched_at=now_iso,
                                    )
                                )
                        except (ValueError, TypeError):
                            continue
                return facilities, "OK" if facilities else "EMPTY"
        except Exception as exc:
            logger.debug(f"[OSMProvider] Nominatim query failed: {exc}")

        return [], "UNAVAILABLE"
