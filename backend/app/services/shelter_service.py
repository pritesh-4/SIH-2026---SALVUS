"""Shelter logistics and capacity domain service.

Tracks safe evacuation shelters, bed occupancy, and supplies availability.
"""

from __future__ import annotations

from datetime import UTC, datetime

import aiosqlite

from app.models import ShelterResponse


def _row_to_shelter(row: aiosqlite.Row) -> ShelterResponse:
    """Convert an aiosqlite Row to ShelterResponse model."""
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
    new_status = status or row["status"]
    new_supplies = supplies_status or row["supplies_status"]

    # Calculate occupancy percentage
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
