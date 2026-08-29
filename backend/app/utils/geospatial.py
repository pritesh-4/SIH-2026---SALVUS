"""Salvus Geospatial Engine — Mathematical & Distance Validation Foundation.

Provides:
- Exact Great-Circle Haversine geodesic distance calculation (km and meters).
- Strict 10 km (10,000 meters) boundary validation and filtering.
- Coordinate grid cell snapping (~100m) for location-sensitive cache optimization.
- Standardized straight-line distance formatting ("850 m away", "1.3 km away").
- Safe telephone normalization without inventing missing numbers.
- Normalized name similarity matching for multi-provider deduplication.
"""

from __future__ import annotations

import math
import re
from typing import Any

# Earth radius in kilometers (WGS-84 mean radius)
EARTH_RADIUS_KM = 6371.0
EARTH_RADIUS_METERS = 6371000.0
STRICT_MAX_RADIUS_METERS = 10000.0  # 10 km strict ceiling


def haversine_distance_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Calculate the great-circle straight-line distance between two GPS coordinates in km."""
    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)
    a = (
        math.sin(dlat / 2) ** 2
        + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(dlon / 2) ** 2
    )
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
    return round(EARTH_RADIUS_KM * c, 3)


def haversine_distance_meters(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Calculate the great-circle straight-line distance between two GPS coordinates in meters."""
    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)
    a = (
        math.sin(dlat / 2) ** 2
        + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(dlon / 2) ** 2
    )
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
    return round(EARTH_RADIUS_METERS * c, 1)


def is_within_strict_radius(
    origin_lat: float,
    origin_lon: float,
    target_lat: float,
    target_lon: float,
    max_radius_meters: float = STRICT_MAX_RADIUS_METERS,
) -> bool:
    """Strictly validate whether target coordinates fall within the maximum radius.

    Any facility with distance > max_radius_meters must be excluded.
    """
    if (
        math.isnan(origin_lat)
        or math.isnan(origin_lon)
        or math.isnan(target_lat)
        or math.isnan(target_lon)
    ):
        return False

    dist_m = haversine_distance_meters(origin_lat, origin_lon, target_lat, target_lon)
    return dist_m <= max_radius_meters


def format_straight_line_distance(distance_meters: float | None) -> str:
    """Format straight-line distance into clear, user-facing label.

    Rules:
    - Under 1 km: '850 m away'
    - Over 1 km:  '1.3 km away'
    """
    if distance_meters is None or math.isnan(distance_meters) or distance_meters < 0:
        return "Distance unknown"

    if distance_meters < 1000:
        return f"{int(round(distance_meters))} m away"

    km = distance_meters / 1000.0
    return f"{km:.1f} km away"


def snap_coordinate_to_grid(coord: float, precision: int = 3) -> float:
    """Snap coordinate to ~100m grid cell resolution to maximize cache hit rates."""
    return round(coord, precision)


def normalize_phone_number(raw_phone: Any) -> str | None:
    """Normalize raw phone strings safely without fabricating missing details."""
    if not raw_phone:
        return None
    cleaned = str(raw_phone).strip()
    if not cleaned or cleaned.lower() in ("none", "null", "n/a", "unknown"):
        return None
    # Split on common multiple number delimiters and take primary
    for delim in ("/", ";", ","):
        if delim in cleaned:
            parts = [p.strip() for p in cleaned.split(delim) if p.strip()]
            if parts:
                cleaned = parts[0]
    # Collapse multiple consecutive whitespaces
    cleaned = " ".join(cleaned.split())
    return cleaned if len(cleaned) >= 5 else None


def normalize_place_name(name: str) -> str:
    """Normalize place name for fuzzy matching (case-folded, alphanumeric only)."""
    if not name:
        return ""
    return re.sub(r"[^a-z0-9]", "", str(name).lower())


def compute_bounding_box(
    lat: float, lon: float, radius_meters: float
) -> tuple[float, float, float, float]:
    """Compute (min_lat, min_lon, max_lat, max_lon) for a given center coordinate and radius."""
    radius_km = radius_meters / 1000.0
    dlat = radius_km / 111.0
    cos_lat = max(0.01, math.cos(math.radians(lat)))
    dlon = radius_km / (111.0 * cos_lat)

    return (
        round(lat - dlat, 6),
        round(lon - dlon, 6),
        round(lat + dlat, 6),
        round(lon + dlon, 6),
    )
