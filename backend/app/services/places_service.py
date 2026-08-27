"""Salvus Places Service — Real-world nearby geographic context via OpenStreetMap (Overpass).

Key Architectural Pillars:
- Multi-mirror Overpass endpoint rotation with fast fallback
- In-memory TTL cache with ~100m grid cell coordinate snapping
- In-flight request deduplication to prevent hammering public OSM infrastructure
- Strict provenance classification: OSM_MAPPED vs SALVUS_VERIFIED
- High-performance Haversine distance calculation and human-friendly formatting
"""

from __future__ import annotations

import asyncio
import logging
import math
import os
import time
from datetime import UTC, datetime
from typing import Any

import httpx

from app.models import PlaceCategory, PlaceModel, PlaceProvenance

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Configuration & Mirror Endpoints
# ---------------------------------------------------------------------------

DEFAULT_OVERPASS_MIRRORS = [
    "https://overpass-api.de/api/interpreter",
    "https://maps.mail.ru/osm/tools/overpass/api/interpreter",
    "https://overpass.kumi.systems/api/interpreter",
]

REQUEST_TIMEOUT_SECONDS = 4.5
CACHE_TTL_SECONDS = 300.0  # 5-minute TTL cache
MAX_QUERY_RADIUS_METERS = 5000
MIN_QUERY_RADIUS_METERS = 300
DEFAULT_QUERY_RADIUS_METERS = 2000

# In-memory TTL Cache: {cache_key: (list[PlaceModel], expire_timestamp)}
_PLACES_CACHE: dict[tuple[float, float, int, tuple[str, ...]], tuple[list[PlaceModel], float]] = {}

# In-flight request deduplication mapping
_IN_FLIGHT_TASKS: dict[
    tuple[float, float, int, tuple[str, ...]], asyncio.Task[list[PlaceModel]]
] = {}


def get_overpass_mirrors() -> list[str]:
    """Resolve Overpass API mirror URLs from environment or defaults."""
    env_url = os.getenv("OVERPASS_URL", "").strip()
    if env_url:
        return [env_url] + [m for m in DEFAULT_OVERPASS_MIRRORS if m != env_url]
    return list(DEFAULT_OVERPASS_MIRRORS)


def haversine_distance_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Calculate great-circle distance between two GPS coordinates in kilometers."""
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
    """Format meter distance into human-readable label with initial proximity note."""
    if distance_meters < 1000:
        return f"Approx. {int(round(distance_meters))} m"
    km = distance_meters / 1000.0
    return f"Approx. {km:.1f} km"


def snap_coordinate_to_grid(coord: float, precision: int = 3) -> float:
    """Snap coordinate to ~100m grid cell resolution to maximize cache hits."""
    return round(coord, precision)


def build_overpass_query(
    lat: float,
    lon: float,
    radius: int,
    categories: list[str] | None = None,
) -> str:
    """Construct compact Overpass QL query around given center coordinate."""
    # Target amenities based on requested categories
    amenity_tags = ["hospital", "clinic", "pharmacy", "police", "fire_station"]
    if categories:
        filtered = []
        for cat in categories:
            cat_clean = cat.strip().lower()
            if cat_clean in ("hospital", "hospitals"):
                filtered.extend(["hospital", "clinic"])
            elif cat_clean in ("clinic", "clinics"):
                filtered.append("clinic")
            elif cat_clean in ("pharmacy", "pharmacies"):
                filtered.append("pharmacy")
            elif cat_clean == "police":
                filtered.append("police")
            elif cat_clean in ("fire", "fire_station", "fire_stations"):
                filtered.append("fire_station")
            elif cat_clean in ("shelter", "shelters"):
                filtered.append("shelter")
        if filtered:
            amenity_tags = list(set(filtered))

    regex_amenities = "|".join(amenity_tags)

    query = f"""
[out:json][timeout:5];
(
  node["amenity"~"{regex_amenities}"](around:{radius},{lat},{lon});
  way["amenity"~"{regex_amenities}"](around:{radius},{lat},{lon});
  node["emergency"~"ambulance_station|disaster_response"](around:{radius},{lat},{lon});
  way["emergency"~"ambulance_station|disaster_response"](around:{radius},{lat},{lon});
);
out center tags 50;
"""
    return query.strip()


def normalize_osm_element(
    elem: dict[str, Any],
    origin_lat: float,
    origin_lon: float,
    now_iso: str,
) -> PlaceModel | None:
    """Normalize raw OpenStreetMap node/way element into project-owned PlaceModel."""
    elem_id = elem.get("id")
    elem_type = elem.get("type", "node")
    tags = elem.get("tags") or {}

    # Coordinate extraction (node has lat/lon; way has center {lat, lon})
    lat = elem.get("lat") or (elem.get("center", {}).get("lat") if "center" in elem else None)
    lon = elem.get("lon") or (elem.get("center", {}).get("lon") if "center" in elem else None)

    if lat is None or lon is None:
        return None

    # Determine place category
    amenity = tags.get("amenity", "").lower()
    emergency = tags.get("emergency", "").lower()

    if amenity == "hospital":
        category = PlaceCategory.HOSPITAL
        fallback_name = "Medical Facility / Hospital"
    elif amenity == "clinic":
        category = PlaceCategory.CLINIC
        fallback_name = "Health Clinic"
    elif amenity == "pharmacy":
        category = PlaceCategory.PHARMACY
        fallback_name = "Pharmacy / Chemist"
    elif amenity == "police":
        category = PlaceCategory.POLICE
        fallback_name = "Police Station"
    elif amenity == "fire_station":
        category = PlaceCategory.FIRE_STATION
        fallback_name = "Fire & Rescue Station"
    elif emergency in ("ambulance_station", "disaster_response"):
        category = PlaceCategory.EMERGENCY_FACILITY
        fallback_name = "Emergency Response Post"
    elif amenity == "shelter":
        category = PlaceCategory.SHELTER
        fallback_name = "Community Shelter (OSM Mapped)"
    else:
        category = PlaceCategory.OTHER
        fallback_name = "Public Facility"

    name = tags.get("name") or tags.get("name:en") or tags.get("operator") or fallback_name

    # Address construction
    street = tags.get("addr:street")
    housenumber = tags.get("addr:housenumber")
    suburb = tags.get("addr:suburb") or tags.get("addr:district") or tags.get("addr:city")
    postcode = tags.get("addr:postcode")

    addr_parts = []
    if housenumber and street:
        addr_parts.append(f"{housenumber} {street}")
    elif street:
        addr_parts.append(street)
    if suburb:
        addr_parts.append(suburb)
    if postcode:
        addr_parts.append(postcode)

    address = ", ".join(addr_parts) if addr_parts else None

    # Distance calculation
    dist_km = haversine_distance_km(origin_lat, origin_lon, float(lat), float(lon))
    dist_m = round(dist_km * 1000, 1)

    # Amenities extraction
    amenities: list[str] = []
    if tags.get("emergency") == "yes" or tags.get("emergency"):
        amenities.append("Emergency Services")
    if tags.get("wheelchair") in ("yes", "designated"):
        amenities.append("Wheelchair Accessible")
    if tags.get("dispensing") == "yes":
        amenities.append("Prescription Dispensing")
    if tags.get("healthcare:speciality"):
        amenities.append(tags["healthcare:speciality"].replace(";", ", "))

    return PlaceModel(
        id=f"osm-{elem_type}-{elem_id}",
        name=name,
        category=category,
        latitude=float(lat),
        longitude=float(lon),
        address=address,
        distance_meters=dist_m,
        distance_formatted=format_distance(dist_m),
        source="OPENSTREETMAP",
        provenance=PlaceProvenance.OSM_MAPPED,
        amenities=amenities,
        phone=tags.get("phone") or tags.get("contact:phone"),
        opening_hours=tags.get("opening_hours"),
        fetched_at=now_iso,
    )


# ---------------------------------------------------------------------------
# Core Service API
# ---------------------------------------------------------------------------


async def _execute_overpass_query(
    lat: float,
    lon: float,
    radius: int,
    categories: list[str] | None = None,
) -> list[PlaceModel]:
    """Execute Overpass query against mirrors in sequence with timeout guards."""
    mirrors = get_overpass_mirrors()
    query = build_overpass_query(lat, lon, radius, categories)
    now_iso = datetime.now(UTC).isoformat()

    async with httpx.AsyncClient(timeout=REQUEST_TIMEOUT_SECONDS) as client:
        for mirror_url in mirrors:
            try:
                response = await client.post(
                    mirror_url,
                    data={"data": query},
                    headers={
                        "User-Agent": "SalvusDisasterCoordination/0.2 (https://github.com/salvus-rescue)",
                        "Accept": "application/json",
                    },
                )
                if response.status_code == 200:
                    data = response.json()
                    elements = data.get("elements", [])
                    places: list[PlaceModel] = []
                    for elem in elements:
                        place = normalize_osm_element(elem, lat, lon, now_iso)
                        if place:
                            places.append(place)

                    # Sort by proximity
                    places.sort(key=lambda p: p.distance_meters)
                    return places
                else:
                    logger.warning(
                        "[Overpass] Mirror %s returned HTTP %d, trying next...",
                        mirror_url,
                        response.status_code,
                    )
            except Exception as e:
                logger.warning(
                    "[Overpass] Failed query on mirror %s (%s), trying next...",
                    mirror_url,
                    str(e),
                )

    logger.warning(
        "[Overpass] All public mirrors unavailable or timed out. Returning empty fallback."
    )
    return []


async def get_nearby_places(
    lat: float,
    lon: float,
    radius: int = DEFAULT_QUERY_RADIUS_METERS,
    categories: list[str] | None = None,
) -> tuple[list[PlaceModel], bool]:
    """Retrieve nearby geographic places with caching and request deduplication.

    Returns:
        tuple[list[PlaceModel], bool]: (places_list, is_cached)
    """
    # 1. Validate and clamp radius
    clamped_radius = max(MIN_QUERY_RADIUS_METERS, min(MAX_QUERY_RADIUS_METERS, radius))
    cat_key = tuple(sorted([c.strip().lower() for c in (categories or []) if c.strip()]))

    # 2. Snap coordinates to ~100m grid for cache lookup
    grid_lat = snap_coordinate_to_grid(lat, 3)
    grid_lon = snap_coordinate_to_grid(lon, 3)
    cache_key = (grid_lat, grid_lon, clamped_radius, cat_key)

    now = time.time()

    # 3. Cache check
    if cache_key in _PLACES_CACHE:
        cached_places, expire_time = _PLACES_CACHE[cache_key]
        if now < expire_time:
            # Re-compute exact distances from actual user coordinates
            recalculated = []
            for p in cached_places:
                dist_km = haversine_distance_km(lat, lon, p.latitude, p.longitude)
                dist_m = round(dist_km * 1000, 1)
                p_copy = p.model_copy(
                    update={
                        "distance_meters": dist_m,
                        "distance_formatted": format_distance(dist_m),
                    }
                )
                recalculated.append(p_copy)
            recalculated.sort(key=lambda x: x.distance_meters)
            return recalculated, True
        else:
            del _PLACES_CACHE[cache_key]

    # 4. In-flight request deduplication
    if cache_key in _IN_FLIGHT_TASKS:
        task = _IN_FLIGHT_TASKS[cache_key]
        places = await task
        return places, False

    # 5. Create new asynchronous fetch task
    task = asyncio.create_task(_execute_overpass_query(lat, lon, clamped_radius, categories))
    _IN_FLIGHT_TASKS[cache_key] = task

    try:
        places = await task
        # Store in cache
        _PLACES_CACHE[cache_key] = (places, now + CACHE_TTL_SECONDS)
        return places, False
    finally:
        _IN_FLIGHT_TASKS.pop(cache_key, None)


def clear_places_cache() -> None:
    """Clear in-memory places cache (useful for testing)."""
    _PLACES_CACHE.clear()
    _IN_FLIGHT_TASKS.clear()
