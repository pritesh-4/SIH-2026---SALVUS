"""Geospatial Intelligence & Location-Relevance Engine (Phase 3).

Provides:
1. Exact point-in-polygon containment (Ray-Casting algorithm).
2. Boundary distance calculation for arbitrary polygon geofences.
3. Hazard-specific life-safety spatial envelopes (Earthquake, Flood, Cyclone, Weather).
4. Relevance tier classification (CRITICAL, HIGH, MODERATE, LOW, IRRELEVANT).
5. Relative time formatting for trusted citizen UX.
"""

from __future__ import annotations

import math
from datetime import UTC, datetime

from app.models import (
    HazardSeverity,
    HazardType,
    NormalizedAlert,
    RelevanceLevel,
)


def haversine_distance_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Calculate the great-circle distance between two GPS coordinates in kilometers."""
    radius_km = 6371.0
    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)
    a = (
        math.sin(dlat / 2) ** 2
        + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(dlon / 2) ** 2
    )
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
    return round(radius_km * c, 2)


def is_point_in_polygon(lat: float, lon: float, polygon: list[list[float]]) -> bool:
    """Determine if a GPS coordinate (lat, lon) is inside a polygon using Ray-Casting."""
    if not polygon or len(polygon) < 3:
        return False

    inside = False
    n = len(polygon)
    p1_lat, p1_lon = polygon[0][0], polygon[0][1]

    for i in range(1, n + 1):
        p2 = polygon[i % n]
        p2_lat, p2_lon = p2[0], p2[1]

        if min(p1_lat, p2_lat) < lat <= max(p1_lat, p2_lat):
            if lon <= max(p1_lon, p2_lon):
                if p1_lat != p2_lat:
                    x_inters = (lat - p1_lat) * (p2_lon - p1_lon) / (p2_lat - p1_lat) + p1_lon
                else:
                    x_inters = p1_lon

                if p1_lon == p2_lon or lon <= x_inters:
                    inside = not inside

        p1_lat, p1_lon = p2_lat, p2_lon

    return inside


def distance_point_to_segment_km(
    p_lat: float, p_lon: float, a_lat: float, a_lon: float, b_lat: float, b_lon: float
) -> float:
    """Calculate the shortest distance in km from point P to line segment AB."""
    # Convert lat/lon degrees approximately to planar km for local segment projection
    # 1 deg lat ~= 111 km, 1 deg lon ~= 111 * cos(avg_lat) km
    avg_lat_rad = math.radians((a_lat + b_lat + p_lat) / 3.0)
    cos_lat = math.cos(avg_lat_rad)

    ax, ay = a_lon * 111.32 * cos_lat, a_lat * 110.574
    bx, by = b_lon * 111.32 * cos_lat, b_lat * 110.574
    px, py = p_lon * 111.32 * cos_lat, p_lat * 110.574

    dx = bx - ax
    dy = by - ay
    seg_len_sq = dx * dx + dy * dy

    if seg_len_sq == 0.0:
        return haversine_distance_km(p_lat, p_lon, a_lat, a_lon)

    # Project point onto segment: t in [0, 1]
    t = max(0.0, min(1.0, ((px - ax) * dx + (py - ay) * dy) / seg_len_sq))
    proj_x = ax + t * dx
    proj_y = ay + t * dy

    dist_km = math.hypot(px - proj_x, py - proj_y)
    return round(dist_km, 2)


def distance_point_to_polygon_km(lat: float, lon: float, polygon: list[list[float]]) -> float:
    """Calculate the shortest distance in km from a GPS point to the polygon boundary."""
    if not polygon or len(polygon) < 2:
        return 0.0

    if is_point_in_polygon(lat, lon, polygon):
        return 0.0

    min_dist = float("inf")
    n = len(polygon)
    for i in range(n):
        p1 = polygon[i]
        p2 = polygon[(i + 1) % n]
        d = distance_point_to_segment_km(lat, lon, p1[0], p1[1], p2[0], p2[1])
        if d < min_dist:
            min_dist = d

    return round(min_dist, 2)


def format_relative_time(iso_time_str: str | None) -> str:
    """Format an ISO timestamp into a user-friendly relative freshness string."""
    if not iso_time_str:
        return "Unknown"

    try:
        clean_iso = iso_time_str.replace("Z", "+00:00")
        dt = datetime.fromisoformat(clean_iso)
        now = datetime.now(UTC)
        elapsed_seconds = max(0, int((now - dt).total_seconds()))

        if elapsed_seconds < 60:
            return "Just now"
        minutes = elapsed_seconds // 60
        if minutes < 60:
            return f"Updated {minutes} min ago"
        hours = minutes // 60
        if hours < 24:
            return f"Updated {hours} hr ago"
        days = hours // 24
        if days < 7:
            return f"Updated {days} days ago"
        return dt.strftime("%b %d")
    except Exception:
        return "Recently updated"


def evaluate_alert_relevance(
    alert: NormalizedAlert,
    lat: float | None,
    lon: float | None,
) -> tuple[RelevanceLevel, float | None, bool]:
    """Calculate the location-grounded life-safety relevance tier for a specific citizen location.

    Returns:
        (RelevanceLevel, distance_km, is_inside_geometry)
    """
    if lat is None or lon is None:
        # Overview mode (unscoped citizen coordinates)
        return RelevanceLevel.LOW, None, False

    # 1. Evaluate spatial containment (Polygon Geometry vs Circular Epicenter)
    has_polygon = alert.geometry is not None and len(alert.geometry) >= 3
    if has_polygon:
        is_inside = is_point_in_polygon(lat, lon, alert.geometry)  # type: ignore[arg-type]
        dist_km = (
            0.0 if is_inside else distance_point_to_polygon_km(lat, lon, alert.geometry)  # type: ignore[arg-type]
        )
    elif alert.latitude is not None and alert.longitude is not None:
        dist_km = haversine_distance_km(lat, lon, alert.latitude, alert.longitude)
        is_inside = dist_km <= alert.radius_km
    else:
        return RelevanceLevel.LOW, None, False

    sev = alert.severity
    ht = alert.hazard_type
    rad = alert.radius_km

    # 2. Hazard-Specific Relevance Envelopes

    # A. EARTHQUAKE
    if ht == HazardType.EARTHQUAKE:
        if is_inside:
            if sev == HazardSeverity.CRITICAL:
                return RelevanceLevel.CRITICAL, dist_km, True
            if sev == HazardSeverity.WARNING:
                return RelevanceLevel.HIGH, dist_km, True
            if sev == HazardSeverity.WATCH:
                return RelevanceLevel.MODERATE, dist_km, True
            return RelevanceLevel.LOW, dist_km, True
        if dist_km <= 1.5 * rad:
            if sev == HazardSeverity.CRITICAL:
                return RelevanceLevel.HIGH, dist_km, False
            if sev == HazardSeverity.WARNING:
                return RelevanceLevel.MODERATE, dist_km, False
            return RelevanceLevel.LOW, dist_km, False
        if dist_km <= 3.0 * rad and sev == HazardSeverity.CRITICAL:
            # Significant distant earthquake awareness
            return RelevanceLevel.LOW, dist_km, False
        return RelevanceLevel.IRRELEVANT, dist_km, False

    # B. FLOOD
    if ht == HazardType.FLOOD:
        if is_inside:
            if sev == HazardSeverity.CRITICAL:
                return RelevanceLevel.CRITICAL, dist_km, True
            if sev == HazardSeverity.WARNING:
                return RelevanceLevel.HIGH, dist_km, True
            return RelevanceLevel.MODERATE, dist_km, True
        if dist_km <= 3.0 or dist_km <= 1.5 * rad:
            if sev == HazardSeverity.CRITICAL:
                return RelevanceLevel.HIGH, dist_km, False
            if sev == HazardSeverity.WARNING:
                return RelevanceLevel.MODERATE, dist_km, False
            return RelevanceLevel.LOW, dist_km, False
        return RelevanceLevel.IRRELEVANT, dist_km, False

    # C. CYCLONE
    if ht == HazardType.CYCLONE:
        if is_inside:
            if sev == HazardSeverity.CRITICAL:
                return RelevanceLevel.CRITICAL, dist_km, True
            if sev == HazardSeverity.WARNING:
                return RelevanceLevel.HIGH, dist_km, True
            return RelevanceLevel.MODERATE, dist_km, True
        if dist_km <= 1.5 * rad:
            if sev == HazardSeverity.CRITICAL:
                return RelevanceLevel.HIGH, dist_km, False
            if sev == HazardSeverity.WARNING:
                return RelevanceLevel.MODERATE, dist_km, False
            return RelevanceLevel.LOW, dist_km, False
        if dist_km <= 2.0 * rad:
            return RelevanceLevel.LOW, dist_km, False
        return RelevanceLevel.IRRELEVANT, dist_km, False

    # D. WEATHER
    if ht == HazardType.WEATHER:
        if is_inside:
            if sev == HazardSeverity.WARNING:
                return RelevanceLevel.HIGH, dist_km, True
            if sev == HazardSeverity.WATCH:
                return RelevanceLevel.MODERATE, dist_km, True
            return RelevanceLevel.LOW, dist_km, True
        if dist_km <= 1.5 * rad:
            if sev == HazardSeverity.WARNING:
                return RelevanceLevel.MODERATE, dist_km, False
            return RelevanceLevel.LOW, dist_km, False
        return RelevanceLevel.IRRELEVANT, dist_km, False

    # E. FIRE, INFRASTRUCTURE & OTHER
    if is_inside:
        if sev == HazardSeverity.CRITICAL:
            return RelevanceLevel.CRITICAL, dist_km, True
        if sev == HazardSeverity.WARNING:
            return RelevanceLevel.HIGH, dist_km, True
        return RelevanceLevel.MODERATE, dist_km, True
    if dist_km <= 2.0:
        if sev in (HazardSeverity.CRITICAL, HazardSeverity.WARNING):
            return RelevanceLevel.MODERATE, dist_km, False
        return RelevanceLevel.LOW, dist_km, False

    return RelevanceLevel.IRRELEVANT, dist_km, False
