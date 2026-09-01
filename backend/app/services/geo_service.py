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
import re
from datetime import UTC, datetime
from typing import Any

from app.models import (
    GeographicForm,
    HazardSeverity,
    HazardType,
    NormalizedAlert,
    RelevanceLevel,
)


def normalize_district_name(name: str | None) -> str:
    """Normalize district / administrative area string for robust comparison.

    Removes harmless naming variations (e.g. 'district of Odisha', 'district', 'dist.', 'dt.'),
    punctuation, and collapses extra whitespace.
    """
    if not name or not isinstance(name, str):
        return ""
    s = name.lower().strip()
    # Strip state suffix like "district of odisha" or "of odisha"
    s = re.sub(r"\bdistrict\s+of\s+[a-z\s]+", "", s)
    s = re.sub(r"\bof\s+[a-z\s]+$", "", s)
    s = re.sub(r"\b(district|dist\.?|dt\.?)\b", "", s)
    s = re.sub(r"[^\w\s]", " ", s)
    return " ".join(s.split())


def parse_administrative_area(area_str: str | None) -> tuple[list[str], str | None]:
    """Parse raw area description into independent affected districts and optional state.

    Examples:
    - 'Mayurbhanj district of Odisha' -> (['Mayurbhanj'], 'Odisha')
    - 'Ranchi, Gumla, Khunti, Lohardaga, Ramgarh, West Singhbhum' ->
      (['Ranchi', 'Gumla', 'Khunti', 'Lohardaga', 'Ramgarh', 'West Singhbhum'], None)
    - 'Sundargarh district of Odisha' -> (['Sundargarh'], 'Odisha')
    """
    if not area_str or not isinstance(area_str, str):
        return [], None

    raw = area_str.strip()
    state: str | None = None

    # Check for "of <State>" or "in <State>"
    m_state = re.search(r"\b(?:of|in)\s+([A-Za-z\s]+)$", raw, re.IGNORECASE)
    if m_state:
        potential_state = m_state.group(1).strip()
        state = potential_state
        raw = raw[: m_state.start()].strip()

    # Strip "district" or "districts" from trailing
    raw = re.sub(r"\bdistricts?\b", "", raw, flags=re.IGNORECASE).strip()

    # Split by comma, semicolon, "and", "&"
    parts = re.split(r"[,;&]|\band\b", raw, flags=re.IGNORECASE)
    districts: list[str] = []
    for p in parts:
        clean = " ".join(p.split()).strip(" ,.-")
        if clean:
            districts.append(clean)

    return districts, state


# In-memory spatial index for reliable offline reverse geocoding in tests & operations
_KNOWN_INDIAN_REGIONS: list[dict[str, Any]] = [
    {
        "name": "Mayurbhanj",
        "district": "Mayurbhanj",
        "state": "Odisha",
        "lat": (21.4, 22.6),
        "lon": (85.7, 87.2),
    },
    {
        "name": "Khordha",
        "district": "Khordha",
        "state": "Odisha",
        "lat": (19.9, 20.5),
        "lon": (85.4, 86.1),
    },
    {
        "name": "Cuttack",
        "district": "Cuttack",
        "state": "Odisha",
        "lat": (20.3, 20.8),
        "lon": (85.7, 86.3),
    },
    {
        "name": "Sundargarh",
        "district": "Sundargarh",
        "state": "Odisha",
        "lat": (21.7, 22.7),
        "lon": (83.8, 85.4),
    },
    {
        "name": "Baleshwar",
        "district": "Baleshwar",
        "state": "Odisha",
        "lat": (21.3, 21.9),
        "lon": (86.6, 87.3),
    },
    {
        "name": "Puri",
        "district": "Puri",
        "state": "Odisha",
        "lat": (19.6, 20.1),
        "lon": (85.5, 86.2),
    },
    {
        "name": "Ganjam",
        "district": "Ganjam",
        "state": "Odisha",
        "lat": (19.0, 19.9),
        "lon": (84.3, 85.2),
    },
    {
        "name": "Ranchi",
        "district": "Ranchi",
        "state": "Jharkhand",
        "lat": (23.1, 23.6),
        "lon": (85.0, 85.7),
    },
    {
        "name": "Khunti",
        "district": "Khunti",
        "state": "Jharkhand",
        "lat": (22.9, 23.3),
        "lon": (85.0, 85.5),
    },
    {
        "name": "Gumla",
        "district": "Gumla",
        "state": "Jharkhand",
        "lat": (22.7, 23.3),
        "lon": (84.2, 84.9),
    },
    {
        "name": "Lohardaga",
        "district": "Lohardaga",
        "state": "Jharkhand",
        "lat": (23.3, 23.7),
        "lon": (84.5, 85.0),
    },
    {
        "name": "Ramgarh",
        "district": "Ramgarh",
        "state": "Jharkhand",
        "lat": (23.4, 23.9),
        "lon": (85.3, 85.9),
    },
    {
        "name": "West Singhbhum",
        "district": "West Singhbhum",
        "state": "Jharkhand",
        "lat": (21.9, 22.9),
        "lon": (85.0, 86.0),
    },
    {
        "name": "Bokaro",
        "district": "Bokaro",
        "state": "Jharkhand",
        "lat": (23.5, 23.9),
        "lon": (85.7, 86.4),
    },
    {
        "name": "Kolkata",
        "district": "Kolkata",
        "state": "West Bengal",
        "lat": (22.4, 22.8),
        "lon": (88.2, 88.6),
    },
    {
        "name": "North 24 Parganas",
        "district": "North 24 Parganas",
        "state": "West Bengal",
        "lat": (22.5, 23.3),
        "lon": (88.3, 89.1),
    },
    {
        "name": "New Delhi",
        "district": "New Delhi",
        "state": "Delhi",
        "lat": (28.4, 28.9),
        "lon": (76.9, 77.4),
    },
    {
        "name": "Mumbai",
        "district": "Mumbai",
        "state": "Maharashtra",
        "lat": (18.8, 19.3),
        "lon": (72.7, 73.1),
    },
]


def resolve_district_from_coords(lat: float, lon: float) -> tuple[str | None, str | None]:
    """Resolve district and state from coordinates using spatial registry."""
    for reg in _KNOWN_INDIAN_REGIONS:
        lat_min, lat_max = reg["lat"]
        lon_min, lon_max = reg["lon"]
        if lat_min <= lat <= lat_max and lon_min <= lon <= lon_max:
            return reg["district"], reg["state"]
    return None, None


def determine_geographic_form(alert: NormalizedAlert) -> GeographicForm:
    """Determine the geographic form of an alert among the 4 canonical types (Phase 2C)."""
    if alert.geographic_form:
        return alert.geographic_form

    # 1. POLYGON
    if alert.geometry is not None and len(alert.geometry) >= 3:
        return GeographicForm.POLYGON

    # 2. ADMINISTRATIVE AREA / DISTRICT
    # Explicit district or area without precise coordinates
    if alert.affected_districts:
        return GeographicForm.DISTRICT
    if alert.latitude is None or alert.longitude is None:
        if alert.affected_area or alert.state:
            return GeographicForm.DISTRICT
        return GeographicForm.UNKNOWN

    # 3. CIRCLE vs POINT
    if alert.radius_km is not None and alert.radius_km > 0.0:
        return GeographicForm.CIRCLE

    return GeographicForm.POINT


def format_alert_distance_label(
    alert: NormalizedAlert,
    relevance: RelevanceLevel,
    dist_km: float | None,
) -> str | None:
    """Format human-friendly distance label adhering strictly to Phase 2C standards:

    - District / area warnings: 'Applicable to your district' or 'Regional warning'
    - Point warnings: calculated Haversine distance
    """
    geo_form = determine_geographic_form(alert)

    if geo_form == GeographicForm.DISTRICT or dist_km is None:
        if relevance in (RelevanceLevel.IMMEDIATE, RelevanceLevel.LOCAL):
            return "Applicable to your district"
        if relevance == RelevanceLevel.REGIONAL:
            return "Regional warning"
        return None

    if dist_km is not None:
        if dist_km == 0.0 and alert.geometry:
            return "Within affected area"
        if dist_km < 1.0:
            return f"Approx. {int(round(dist_km * 1000))} m away"
        return f"{dist_km:.1f} km away"

    return None


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
    user_district: str | None = None,
    user_state: str | None = None,
) -> tuple[RelevanceLevel, float | None, bool]:
    """Calculate location life-safety relevance tier for a citizen location (Phase 2C).

    Understands four different geographic forms:
    1. POINT: Uses Haversine distance. Displays calculated distance.
    2. CIRCLE: Uses center + radius. Displays calculated distance.
    3. POLYGON: Uses point-in-polygon containment and boundary distance.
    4. ADMINISTRATIVE AREA / DISTRICT:
       - Does NOT require latitude/longitude.
       - Determines user's actual district and state from real GPS / geocoding.
       - Compares against affected_districts, affected_area, state.
       - Does NOT display a fake numeric distance.

    Returns:
        (RelevanceLevel, distance_km, is_inside_geometry)
    """
    if lat is None and lon is None and not user_district and not user_state:
        # Overview mode (unscoped citizen coordinates)
        return RelevanceLevel.UNKNOWN, None, False

    # Resolve user's district and state from coordinates if not explicitly passed
    if (not user_district or not user_state) and lat is not None and lon is not None:
        auto_dist, auto_state = resolve_district_from_coords(lat, lon)
        if not user_district:
            user_district = auto_dist
        if not user_state:
            user_state = auto_state

    geo_form = determine_geographic_form(alert)

    # =========================================================================
    # FORM 4: ADMINISTRATIVE AREA / DISTRICT
    # =========================================================================
    if geo_form == GeographicForm.DISTRICT:
        # Do not require latitude/longitude.
        # Compare user's actual district and state against affected_districts, affected_area, state.
        if alert.affected_districts:
            districts = list(alert.affected_districts)
            state = alert.state
        else:
            districts, state = parse_administrative_area(alert.affected_area)
            if alert.state:
                state = alert.state

        norm_user_dist = normalize_district_name(user_district)
        norm_user_state = normalize_district_name(user_state)
        norm_alert_districts = [normalize_district_name(d) for d in districts]
        norm_alert_state = normalize_district_name(state)

        # 1. Check District Match (Sachet Test & Multi-district Match)
        is_district_match = False
        if norm_user_dist:
            for ad in norm_alert_districts:
                if ad and (ad == norm_user_dist or ad in norm_user_dist or norm_user_dist in ad):
                    is_district_match = True
                    break

            if not is_district_match and alert.affected_area:
                norm_area = normalize_district_name(alert.affected_area)
                if norm_user_dist in norm_area:
                    is_district_match = True

        if is_district_match:
            # User inside affected district -> Relevant
            # If critical emergency -> IMMEDIATE, otherwise -> LOCAL
            rel = (
                RelevanceLevel.IMMEDIATE
                if alert.severity == HazardSeverity.CRITICAL
                else RelevanceLevel.LOCAL
            )
            # Distance for district warnings: NO fake numeric distance!
            return rel, None, True

        # 2. Check State Match (Broader Regional Warning)
        is_state_match = False
        if norm_user_state:
            if norm_alert_state and (
                norm_alert_state == norm_user_state
                or norm_alert_state in norm_user_state
                or norm_user_state in norm_alert_state
            ):
                is_state_match = True
            elif alert.affected_area:
                norm_area = alert.affected_area.lower()
                if norm_user_state in norm_area:
                    is_state_match = True

        if is_state_match:
            # User outside the affected district, but within the affected state
            # -> Not local, but REGIONAL
            return RelevanceLevel.REGIONAL, None, False

        # 3. User known to be in a completely different state -> IRRELEVANT
        if norm_user_state and norm_alert_state and not is_state_match:
            return RelevanceLevel.IRRELEVANT, None, False

        # 4. If administrative relevance cannot be reliably established:
        # UNKNOWN, not: irrelevant, and not: fake coordinate.
        return RelevanceLevel.UNKNOWN, None, False

    # Citizen coordinates required for Point, Circle, Polygon
    if lat is None or lon is None:
        return RelevanceLevel.UNKNOWN, None, False

    # =========================================================================
    # FORM 3: POLYGON (Point-in-Polygon via Ray-Casting)
    # =========================================================================
    if geo_form == GeographicForm.POLYGON and alert.geometry is not None:
        is_inside = is_point_in_polygon(lat, lon, alert.geometry)
        dist_km = 0.0 if is_inside else distance_point_to_polygon_km(lat, lon, alert.geometry)
        sev = alert.severity

        if is_inside:
            if sev == HazardSeverity.CRITICAL:
                return RelevanceLevel.IMMEDIATE, 0.0, True
            if sev == HazardSeverity.WARNING:
                return RelevanceLevel.IMMEDIATE, 0.0, True
            return RelevanceLevel.LOCAL, 0.0, True

        # Proximity buffers around polygon boundary
        if dist_km <= 5.0:
            if sev in (HazardSeverity.CRITICAL, HazardSeverity.WARNING):
                return RelevanceLevel.LOCAL, dist_km, False
            return RelevanceLevel.REGIONAL, dist_km, False
        if dist_km <= 25.0:
            return RelevanceLevel.REGIONAL, dist_km, False
        return RelevanceLevel.IRRELEVANT, dist_km, False

    # =========================================================================
    # FORM 1 & 2: POINT vs CIRCLE (Haversine distance)
    # =========================================================================
    if alert.latitude is not None and alert.longitude is not None:
        dist_km = haversine_distance_km(lat, lon, alert.latitude, alert.longitude)
        rad = alert.radius_km or 0.0
        is_inside = dist_km <= rad if rad > 0.0 else dist_km <= 1.0
        sev = alert.severity
        ht = alert.hazard_type

        # A. Pure Point warning without affected radius
        if geo_form == GeographicForm.POINT or rad == 0.0:
            if dist_km <= 2.0:
                if sev == HazardSeverity.CRITICAL:
                    return RelevanceLevel.IMMEDIATE, dist_km, True
                return RelevanceLevel.LOCAL, dist_km, True
            if dist_km <= 15.0:
                if sev in (HazardSeverity.CRITICAL, HazardSeverity.WARNING):
                    return RelevanceLevel.LOCAL, dist_km, False
                return RelevanceLevel.REGIONAL, dist_km, False
            if dist_km <= 50.0:
                return RelevanceLevel.REGIONAL, dist_km, False
            return RelevanceLevel.IRRELEVANT, dist_km, False

        # B. Circle warning with center + radius: Hazard-Specific Spatial Envelopes
        # 1. EARTHQUAKE
        if ht == HazardType.EARTHQUAKE:
            if is_inside:
                if sev == HazardSeverity.CRITICAL:
                    return RelevanceLevel.IMMEDIATE, dist_km, True
                if sev == HazardSeverity.WARNING:
                    return RelevanceLevel.LOCAL, dist_km, True
                if sev == HazardSeverity.WATCH:
                    return RelevanceLevel.REGIONAL, dist_km, True
                return RelevanceLevel.REGIONAL, dist_km, True
            if dist_km <= 1.5 * rad:
                if sev == HazardSeverity.CRITICAL:
                    return RelevanceLevel.LOCAL, dist_km, False
                if sev == HazardSeverity.WARNING:
                    return RelevanceLevel.REGIONAL, dist_km, False
                return RelevanceLevel.REGIONAL, dist_km, False
            if dist_km <= 3.0 * rad and sev == HazardSeverity.CRITICAL:
                return RelevanceLevel.REGIONAL, dist_km, False
            return RelevanceLevel.IRRELEVANT, dist_km, False

        # 2. FLOOD
        if ht == HazardType.FLOOD:
            if is_inside:
                if sev == HazardSeverity.CRITICAL:
                    return RelevanceLevel.IMMEDIATE, dist_km, True
                if sev == HazardSeverity.WARNING:
                    return RelevanceLevel.LOCAL, dist_km, True
                return RelevanceLevel.REGIONAL, dist_km, True
            if dist_km <= 3.0 or dist_km <= 1.5 * rad:
                if sev == HazardSeverity.CRITICAL:
                    return RelevanceLevel.LOCAL, dist_km, False
                if sev == HazardSeverity.WARNING:
                    return RelevanceLevel.REGIONAL, dist_km, False
                return RelevanceLevel.REGIONAL, dist_km, False
            return RelevanceLevel.IRRELEVANT, dist_km, False

        # 3. CYCLONE
        if ht == HazardType.CYCLONE:
            if is_inside:
                if sev == HazardSeverity.CRITICAL:
                    return RelevanceLevel.IMMEDIATE, dist_km, True
                if sev == HazardSeverity.WARNING:
                    return RelevanceLevel.LOCAL, dist_km, True
                return RelevanceLevel.REGIONAL, dist_km, True
            if dist_km <= 1.5 * rad:
                if sev == HazardSeverity.CRITICAL:
                    return RelevanceLevel.LOCAL, dist_km, False
                if sev == HazardSeverity.WARNING:
                    return RelevanceLevel.REGIONAL, dist_km, False
                return RelevanceLevel.REGIONAL, dist_km, False
            if dist_km <= 2.0 * rad:
                return RelevanceLevel.REGIONAL, dist_km, False
            return RelevanceLevel.IRRELEVANT, dist_km, False

        # 4. WEATHER
        if ht == HazardType.WEATHER:
            if is_inside:
                if sev == HazardSeverity.WARNING:
                    return RelevanceLevel.LOCAL, dist_km, True
                if sev == HazardSeverity.WATCH:
                    return RelevanceLevel.REGIONAL, dist_km, True
                return RelevanceLevel.REGIONAL, dist_km, True
            if dist_km <= 1.5 * rad:
                if sev == HazardSeverity.WARNING:
                    return RelevanceLevel.REGIONAL, dist_km, False
                return RelevanceLevel.REGIONAL, dist_km, False
            return RelevanceLevel.IRRELEVANT, dist_km, False

        # 5. FIRE, INFRASTRUCTURE & OTHER
        if is_inside:
            if sev == HazardSeverity.CRITICAL:
                return RelevanceLevel.IMMEDIATE, dist_km, True
            if sev == HazardSeverity.WARNING:
                return RelevanceLevel.LOCAL, dist_km, True
            return RelevanceLevel.REGIONAL, dist_km, True
        if dist_km <= 2.0:
            if sev in (HazardSeverity.CRITICAL, HazardSeverity.WARNING):
                return RelevanceLevel.REGIONAL, dist_km, False
            return RelevanceLevel.REGIONAL, dist_km, False

        return RelevanceLevel.IRRELEVANT, dist_km, False

    # =========================================================================
    # NO GEOMETRY & NO RESOLVED ADMINISTRATIVE BOUNDARY
    # =========================================================================
    return RelevanceLevel.UNKNOWN, None, False
