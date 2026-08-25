"""Spatial Incident Clustering Domain Service.

Groups geographic incident reports within proximity threshold (e.g., 1.2 km) into
coherent situational clusters, reducing tactical map clutter while preserving
full ticket auditability.
"""

from __future__ import annotations

import math
from collections import Counter

from app.models import IncidentCluster, IncidentResponse


def haversine_distance_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Calculate distance between two GPS coordinates in km."""
    radius_km = 6371.0
    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)
    a = (
        math.sin(dlat / 2) ** 2
        + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(dlon / 2) ** 2
    )
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
    return round(radius_km * c, 2)


def cluster_incidents(
    incidents: list[IncidentResponse], cluster_radius_km: float = 1.2
) -> list[IncidentCluster]:
    """Group active non-terminal incidents into spatial clusters."""
    active_incidents = [inc for inc in incidents if inc.status not in ("RESOLVED", "CANCELLED")]
    if not active_incidents:
        return []

    visited = set()
    clusters: list[list[IncidentResponse]] = []

    for inc in active_incidents:
        if inc.id in visited:
            continue

        current_cluster = [inc]
        visited.add(inc.id)

        for other in active_incidents:
            if other.id in visited:
                continue

            dist = haversine_distance_km(
                inc.latitude, inc.longitude, other.latitude, other.longitude
            )
            if dist <= cluster_radius_km:
                current_cluster.append(other)
                visited.add(other.id)

        clusters.append(current_cluster)

    results: list[IncidentCluster] = []
    for idx, member_list in enumerate(clusters):
        count = len(member_list)
        mean_lat = sum(m.latitude for m in member_list) / count
        mean_lon = sum(m.longitude for m in member_list) / count

        critical_count = sum(1 for m in member_list if m.severity == "CRITICAL" or m.is_sos)
        verified_count = sum(
            1
            for m in member_list
            if m.status in ("VERIFIED", "ASSIGNED", "EN_ROUTE", "NEARBY", "ON_SCENE")
        )

        type_counts = Counter(m.type for m in member_list)
        primary_type = type_counts.most_common(1)[0][0] if type_counts else "hazard"

        # Determine cluster name
        area_name = "Sector 12" if mean_lon < 88.40 else "Salt Lake East"
        cluster_name = f"{area_name} {primary_type.title()} Cluster"
        if count == 1:
            cluster_name = f"{area_name} Isolated {primary_type.title()} Report"

        # Determine cluster span radius
        max_dist = max(
            (
                haversine_distance_km(mean_lat, mean_lon, m.latitude, m.longitude)
                for m in member_list
            ),
            default=0.4,
        )

        results.append(
            IncidentCluster(
                cluster_id=f"cluster-{idx + 1}",
                cluster_name=cluster_name,
                centroid_lat=round(mean_lat, 4),
                centroid_lon=round(mean_lon, 4),
                incident_count=count,
                critical_count=critical_count,
                verified_count=verified_count,
                radius_km=round(max(0.4, max_dist), 2),
                incident_ids=[m.id for m in member_list],
                primary_hazard_type=primary_type,
            )
        )

    # Sort descending by priority (critical count first, then total count)
    results.sort(key=lambda c: (-c.critical_count, -c.incident_count))
    return results
