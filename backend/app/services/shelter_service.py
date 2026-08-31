"""Shelter logistics and capacity domain service.

Tracks safe evacuation shelters, bed occupancy, supplies availability,
and proximity-based suitability recommendations.
"""

import json
import logging
import math
from datetime import UTC, datetime

import aiosqlite

from app.models import PlaceProvenance, RecommendedShelterResponse, ShelterResponse

logger = logging.getLogger(__name__)


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


def format_distance(distance_meters: float) -> str:
    """Format straight-line geometric distance into human-readable proximity label."""
    if distance_meters < 1000:
        return f"Approx. {int(round(distance_meters))} m"
    km = distance_meters / 1000.0
    return f"Approx. {km:.1f} km"


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
    max_radius_km: float = 25.0,
    demo_mode: bool = False,
    include_mapped: bool = True,
) -> list[RecommendedShelterResponse]:
    """Rank shelters for a citizen or incident location based on:

    1. Verified Salvus shelters within max_radius_km (or all if demo_mode).
    2. Fallback to real-world mapped shelters (OSM) when no verified shelters are nearby.
    3. Open status and verified bed availability (never fabricated).
    4. Spatial proximity & estimated walking duration.
    5. Supplies readiness level and amenities matching.
    6. Hazard proximity safety verification (penalizes shelters in active hazard zones).
    """
    shelters = await get_all_shelters(db)
    now_iso = datetime.now(UTC).isoformat()

    # Ingest active hazards around location to ensure shelter safety
    from app.services.hazard_service import get_active_hazards

    active_hazards = await get_active_hazards(lat=latitude, lon=longitude)
    critical_hazards = [hz for hz in active_hazards if hz.severity in ("CRITICAL", "WARNING")]

    recommendations: list[RecommendedShelterResponse] = []

    # 1. Evaluate registered/verified shelters from DB
    if shelters:
        for shl in shelters:
            # Filter out deactivated or permanently closed shelters
            if not shl.is_active or shl.status == "CLOSED":
                continue

            dist_km = haversine_distance_km(latitude, longitude, shl.latitude, shl.longitude)

            # Enforce geographic radius boundary for normal non-demo mode
            if not demo_mode and dist_km > max_radius_km:
                continue

            dist_m = round(dist_km * 1000.0, 1)
            walk_min = max(1, math.ceil(dist_km * 12))  # ~5 km/h walking speed

            # Capacity score: higher available beds gives higher confidence
            capacity_score = (
                min(40, int((shl.available_beds / max(1, shl.total_beds)) * 40))
                if (shl.total_beds and shl.available_beds is not None)
                else 0
            )

            # Status score
            status_score = (
                30 if shl.status == "OPEN" else 10 if shl.status == "NEAR_CAPACITY" else 0
            )

            # Proximity score (closer = higher score, max 30)
            proximity_score = max(0, 30 - int(dist_km * 6))

            # Supplies readiness bonus
            supplies_bonus = 0
            if "HIGH" in (shl.supplies_status or "").upper():
                supplies_bonus = 15
            elif "MODERATE" in (shl.supplies_status or "").upper():
                supplies_bonus = 10
            elif "ADEQUATE" in (shl.supplies_status or "").upper():
                supplies_bonus = 5

            # Amenities match bonus
            amenities_bonus = 0
            if required_amenities:
                for req in required_amenities:
                    if any(req.lower() in a.lower() for a in shl.amenities):
                        amenities_bonus += 10
            elif any("medical" in a.lower() for a in shl.amenities):
                amenities_bonus += 5

            # Safety & Hazard Proximity Verification
            is_safe = True
            safety_status = "SAFE"
            hazard_warning = None
            safety_penalty = 0

            for hz in critical_hazards:
                hz_dist = haversine_distance_km(
                    shl.latitude, shl.longitude, hz.latitude, hz.longitude
                )
                if hz_dist <= max(0.6, hz.affected_radius_km * 0.5):
                    is_safe = False
                    safety_status = "HAZARD_PROXIMITY_WARNING"
                    hz_dist_m = int(hz_dist * 1000)
                    hazard_warning = (
                        f"Warning: Shelter in proximity ({hz_dist_m}m) of active {hz.title}"
                    )
                    safety_penalty = 50  # Heavy penalty so safe shelters rank first
                    break

            total_suitability = max(
                0,
                capacity_score
                + status_score
                + proximity_score
                + supplies_bonus
                + amenities_bonus
                - safety_penalty,
            )

            # Generate clear human rationale
            reason_parts = []
            if not is_safe:
                reason_parts.append("⚠️ Proximity to Hazard Zone")
            elif (
                shl.status == "OPEN" and shl.available_beds is not None and shl.available_beds > 50
            ):
                reason_parts.append(f"High Bed Capacity ({shl.available_beds} free)")
            elif shl.available_beds is not None and shl.available_beds > 0:
                reason_parts.append(f"{shl.available_beds} beds available")

            if dist_km <= 1.5:
                reason_parts.append(f"Short distance ({int(dist_km * 1000)}m)")
            else:
                reason_parts.append(f"{dist_km} km away")

            if any("medical" in a.lower() for a in shl.amenities):
                reason_parts.append("Medical triage active")

            reason = " · ".join(reason_parts) if reason_parts else "Safe evacuation assembly hub"

            provenance = (
                PlaceProvenance.SEEDED_DEMO
                if (demo_mode and dist_km > max_radius_km)
                else PlaceProvenance.SALVUS_VERIFIED
            )

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
                    distance_meters=dist_m,
                    distance_formatted=format_distance(dist_m),
                    estimated_walk_min=walk_min,
                    suitability_score=total_suitability,
                    recommendation_reason=reason,
                    amenities=shl.amenities,
                    contact_phone=getattr(shl, "contact_phone", None),
                    provenance=provenance,
                    source="Salvus Civil Defense",
                    source_id=shl.id,
                    is_safe=is_safe,
                    safety_status=safety_status,
                    hazard_proximity_warning=hazard_warning,
                    is_recommended=is_safe and shl.status == "OPEN",
                    fetched_at=now_iso,
                )
            )

    # 2. Discover Real-World Mapped Facilities when no verified shelters are nearby
    if not recommendations and include_mapped:
        try:
            from app.models import PlaceCategory
            from app.services import places_service

            query_radius_m = min(int(max_radius_km * 1000), 5000)
            mapped_places, _, _, _ = await places_service.get_nearby_places(
                lat=latitude,
                lon=longitude,
                radius=query_radius_m,
                categories=[PlaceCategory.SHELTER, PlaceCategory.EMERGENCY_SERVICE],
                include_verified=False,
                safe_places_priority=True,
                db=db,
            )

            for mp in mapped_places:
                mp_dist_km = haversine_distance_km(latitude, longitude, mp.latitude, mp.longitude)
                if mp_dist_km > max_radius_km:
                    continue

                mp_dist_m = round(mp_dist_km * 1000.0, 1)
                mp_walk_min = max(1, math.ceil(mp_dist_km * 12))

                # Hazard proximity check
                mp_is_safe = True
                mp_safety_status = "SAFE"
                mp_hazard_warning = None
                mp_safety_penalty = 0

                for hz in critical_hazards:
                    hz_dist = haversine_distance_km(
                        mp.latitude, mp.longitude, hz.latitude, hz.longitude
                    )
                    if hz_dist <= max(0.6, hz.affected_radius_km * 0.5):
                        mp_is_safe = False
                        mp_safety_status = "HAZARD_PROXIMITY_WARNING"
                        mp_hazard_warning = (
                            f"Warning: Facility near ({int(hz_dist * 1000)}m) active {hz.title}"
                        )
                        mp_safety_penalty = 50
                        break

                mp_suitability = max(0, 40 + max(0, 20 - int(mp_dist_km * 4)) - mp_safety_penalty)

                reason = (
                    f"⚠️ Near hazard zone · {mp.distance_formatted}"
                    if not mp_is_safe
                    else f"Mapped facility · {mp.distance_formatted}"
                )

                recommendations.append(
                    RecommendedShelterResponse(
                        id=mp.id,
                        name=mp.name,
                        address=mp.address or mp.city,
                        latitude=mp.latitude,
                        longitude=mp.longitude,
                        total_beds=None,
                        available_beds=None,
                        occupancy_rate=None,
                        supplies_status=None,
                        status=None,
                        distance_km=mp_dist_km,
                        distance_meters=mp_dist_m,
                        distance_formatted=mp.distance_formatted or format_distance(mp_dist_m),
                        estimated_walk_min=mp_walk_min,
                        suitability_score=mp_suitability,
                        recommendation_reason=reason,
                        amenities=mp.amenities or [],
                        contact_phone=mp.phone,
                        provenance=PlaceProvenance.OSM_MAPPED,
                        source=mp.source or "OpenStreetMap",
                        source_id=mp.source_id or mp.id,
                        is_safe=mp_is_safe,
                        safety_status=mp_safety_status,
                        hazard_proximity_warning=mp_hazard_warning,
                        is_recommended=False,
                        fetched_at=mp.fetched_at or now_iso,
                    )
                )
        except Exception as err:
            logger.debug(
                "[ShelterService] Real-world mapped shelter discovery fallback skipped: %s", err
            )

    # Sort descending by suitability score, then ascending by distance
    recommendations.sort(
        key=lambda r: (
            -r.suitability_score,
            r.distance_km if r.distance_km is not None else 9999.0,
        )
    )
    return recommendations
