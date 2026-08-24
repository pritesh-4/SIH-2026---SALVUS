"""Shelter logistics and capacity domain service.

Tracks safe evacuation shelters, bed occupancy, supplies availability,
and proximity-based suitability recommendations.
"""

from __future__ import annotations

import json
import math
from datetime import UTC, datetime

import aiosqlite

from app.models import RecommendedShelterResponse, ShelterResponse


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


def _row_to_shelter(row: aiosqlite.Row) -> ShelterResponse:
    """Convert an aiosqlite Row to ShelterResponse model."""
    raw_amenities = "[]"
    try:
        raw_amenities = row["amenities"]
    except (IndexError, KeyError):
        pass

    try:
        amenities = json.loads(raw_amenities) if raw_amenities else []
    except Exception:
        amenities = []

    return ShelterResponse(
        id=row["id"],
        name=row["name"],
        address=row["address"],
        latitude=row["latitude"],
        longitude=row["longitude"],
        total_beds=row["total_beds"],
        available_beds=row["available_beds"],
        occupancy_rate=row["occupancy_rate"],
        supplies_status=row["supplies_status"],
        status=row["status"],
        amenities=amenities,
        is_active=bool(row["is_active"]),
        created_at=row["created_at"],
        updated_at=row["updated_at"],
    )


async def get_all_shelters(db: aiosqlite.Connection) -> list[ShelterResponse]:
    """Fetch all registered shelters."""
    cursor = await db.execute("SELECT * FROM shelters ORDER BY name ASC")
    rows = await cursor.fetchall()
    return [_row_to_shelter(r) for r in rows]


async def get_shelter_by_id(db: aiosqlite.Connection, shelter_id: str) -> ShelterResponse | None:
    """Fetch single shelter by ID."""
    cursor = await db.execute("SELECT * FROM shelters WHERE id = ?", (shelter_id,))
    row = await cursor.fetchone()
    if not row:
        return None
    return _row_to_shelter(row)


async def update_shelter_occupancy(
    db: aiosqlite.Connection,
    shelter_id: str,
    available_beds: int | None = None,
    status: str | None = None,
    supplies_status: str | None = None,
) -> ShelterResponse | None:
    """Update shelter available beds, occupancy rate string, or status."""
    cursor = await db.execute("SELECT * FROM shelters WHERE id = ?", (shelter_id,))
    row = await cursor.fetchone()
    if not row:
        return None

    total_beds = row["total_beds"]
    new_avail = available_beds if available_beds is not None else row["available_beds"]
    new_avail = max(0, min(total_beds, new_avail))  # Boundary clamping
    new_status = status or row["status"]
    new_supplies = supplies_status or row["supplies_status"]

    # Calculate occupancy percentage mathematically from ground truth numbers
    occupied = max(0, total_beds - new_avail)
    occupancy_pct = int((occupied / total_beds) * 100) if total_beds > 0 else 0
    occupancy_rate = f"{occupancy_pct}%"

    if new_avail <= 0:
        new_status = "FULL"
    elif occupancy_pct >= 85 and new_status == "OPEN":
        new_status = "NEAR_CAPACITY"

    now = datetime.now(UTC).isoformat()
    await db.execute(
        """
        UPDATE shelters
        SET available_beds = ?, occupancy_rate = ?, supplies_status = ?,
            status = ?, updated_at = ?
        WHERE id = ?
        """,
        (new_avail, occupancy_rate, new_supplies, new_status, now, shelter_id),
    )
    await db.commit()
    return await get_shelter_by_id(db, shelter_id)


async def get_recommended_shelters(
    db: aiosqlite.Connection,
    latitude: float,
    longitude: float,
    required_amenities: list[str] | None = None,
) -> list[RecommendedShelterResponse]:
    """Rank all active shelters for a citizen or incident location based on:

    1. Open status and bed availability
    2. Spatial proximity & estimated walking duration
    3. Supplies readiness level
    4. Essential amenities matching (e.g. medical triage)
    """
    shelters = await get_all_shelters(db)
    if not shelters:
        return []

    recommendations: list[RecommendedShelterResponse] = []

    for shl in shelters:
        # Filter out deactivated or permanently closed shelters
        if not shl.is_active or shl.status == "CLOSED":
            continue

        dist_km = haversine_distance_km(latitude, longitude, shl.latitude, shl.longitude)
        walk_min = max(1, math.ceil(dist_km * 12))  # ~5 km/h walking speed

        # Capacity score: higher available beds gives higher confidence
        capacity_score = min(40, int((shl.available_beds / max(1, shl.total_beds)) * 40))

        # Status score
        status_score = 30 if shl.status == "OPEN" else 10 if shl.status == "NEAR_CAPACITY" else 0

        # Proximity score (closer = higher score, max 30)
        proximity_score = max(0, 30 - int(dist_km * 6))

        # Supplies readiness bonus
        supplies_bonus = 0
        if "HIGH" in shl.supplies_status.upper():
            supplies_bonus = 15
        elif "MODERATE" in shl.supplies_status.upper():
            supplies_bonus = 10
        elif "ADEQUATE" in shl.supplies_status.upper():
            supplies_bonus = 5

        # Amenities match bonus
        amenities_bonus = 0
        if required_amenities:
            for req in required_amenities:
                if any(req.lower() in a.lower() for a in shl.amenities):
                    amenities_bonus += 10
        elif any("medical" in a.lower() for a in shl.amenities):
            amenities_bonus += 5

        total_suitability = (
            capacity_score
            + status_score
            + proximity_score
            + supplies_bonus
            + amenities_bonus
        )

        # Generate clear human rationale
        reason_parts = []
        if shl.status == "OPEN" and shl.available_beds > 50:
            reason_parts.append(f"High Bed Capacity ({shl.available_beds} free)")
        elif shl.available_beds > 0:
            reason_parts.append(f"{shl.available_beds} beds available")

        if dist_km <= 1.5:
            reason_parts.append(f"Short distance ({int(dist_km * 1000)}m)")
        else:
            reason_parts.append(f"{dist_km} km away")

        if any("medical" in a.lower() for a in shl.amenities):
            reason_parts.append("Medical triage active")

        reason = " · ".join(reason_parts) if reason_parts else "Safe evacuation assembly hub"

        recommendations.append(
            RecommendedShelterResponse(
                id=shl.id,
                name=shl.name,
                address=shl.address,
                latitude=shl.latitude,
                longitude=shl.longitude,
                total_beds=shl.total_beds,
                available_beds=shl.available_beds,
                occupancy_rate=shl.occupancy_rate,
                supplies_status=shl.supplies_status,
                status=shl.status,
                distance_km=dist_km,
                estimated_walk_min=walk_min,
                suitability_score=total_suitability,
                recommendation_reason=reason,
                amenities=shl.amenities,
            )
        )

    # Sort descending by suitability score, then ascending by distance
    recommendations.sort(key=lambda r: (-r.suitability_score, r.distance_km))
    return recommendations

