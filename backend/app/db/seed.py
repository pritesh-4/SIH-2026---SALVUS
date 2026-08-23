"""Seed data for demo/development — Kolkata flood scenario matching frontend mocks."""

import uuid
from datetime import UTC, datetime

SEED_INCIDENTS = [
    {
        "id": str(uuid.uuid4()),
        "ticket_id": "SV-2048",
        "type": "flood",
        "severity": "CRITICAL",
        "description": (
            "Water entering ground floor rapidly. Family of 3 trapped on balcony. "
            "Water depth approximately 1.4m and rising."
        ),
        "reporter_name": "Aditi Roy",
        "reporter_phone": "+91 98301 24890",
        "latitude": 22.5726,
        "longitude": 88.3639,
        "affected_count": 3,
        "is_sos": 1,
        "status": "NEW",
    },
    {
        "id": str(uuid.uuid4()),
        "ticket_id": "SV-1982",
        "type": "power_line",
        "severity": "CRITICAL",
        "description": (
            "Live 11kV power line submerged in flood corridor at Block C intersection. "
            "Feeder trip signal triggered automatically."
        ),
        "reporter_name": "P. Sengupta",
        "reporter_phone": "+91 98312 99014",
        "latitude": 22.5841,
        "longitude": 88.4120,
        "affected_count": 12,
        "is_sos": 0,
        "status": "TRIAGE_PENDING",
    },
    {
        "id": str(uuid.uuid4()),
        "ticket_id": "SV-1910",
        "type": "medical",
        "severity": "HIGH",
        "description": (
            "Non-ambulatory senior citizen requires stretcher transfer to dry shelter facility. "
            "Water level at 0.6m."
        ),
        "reporter_name": "R. K. Mukherjee",
        "reporter_phone": "+91 98300 11234",
        "latitude": 22.5680,
        "longitude": 88.4310,
        "affected_count": 2,
        "is_sos": 0,
        "status": "VERIFIED",
    },
    {
        "id": str(uuid.uuid4()),
        "ticket_id": "SV-1844",
        "type": "flood",
        "severity": "MEDIUM",
        "description": (
            "Vehicle stalled in flooded underpass on Eastern Metropolitan Bypass. "
            "Driver evacuated safely. Road blocked."
        ),
        "reporter_name": "S. Das",
        "reporter_phone": "+91 98305 77123",
        "latitude": 22.5510,
        "longitude": 88.3980,
        "affected_count": 1,
        "is_sos": 0,
        "status": "RESOLVED",
    },
]


async def seed_database(db) -> list[dict]:
    """Insert seed incidents and their initial events. Returns list of created incidents."""
    now = datetime.now(UTC).isoformat()
    created = []

    for inc in SEED_INCIDENTS:
        # Check if ticket already exists
        cursor = await db.execute(
            "SELECT id FROM incidents WHERE ticket_id = ?", (inc["ticket_id"],)
        )
        existing = await cursor.fetchone()
        if existing:
            continue

        await db.execute(
            """
            INSERT INTO incidents (id, ticket_id, type, severity, description,
                reporter_name, reporter_phone, latitude, longitude,
                affected_count, is_sos, status, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                inc["id"],
                inc["ticket_id"],
                inc["type"],
                inc["severity"],
                inc["description"],
                inc["reporter_name"],
                inc["reporter_phone"],
                inc["latitude"],
                inc["longitude"],
                inc["affected_count"],
                inc["is_sos"],
                inc["status"],
                now,
                now,
            ),
        )

        # Create initial CREATED event
        await db.execute(
            """
            INSERT INTO incident_events (id, incident_id, event_type,
                previous_status, new_status, actor, created_at)
            VALUES (?, ?, 'CREATED', NULL, ?, 'system', ?)
            """,
            (str(uuid.uuid4()), inc["id"], inc["status"], now),
        )

        created.append(inc)

    await db.commit()
    if created:
        print(f"[SEED] Seeded {len(created)} demo incidents.")
    return created
