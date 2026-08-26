"""Seed data for demo/development — Kolkata flood scenario matching frontend mocks."""

import json
import uuid
from datetime import UTC, datetime

SEED_INCIDENTS = [
    {
        "id": "inc-2048",
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
        "id": "inc-1982",
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
        "id": "inc-1910",
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
        "id": "inc-1844",
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

SEED_RESPONDERS = [
    {
        "id": "resp-101",
        "unit_name": "NDRF Rescue Unit 4",
        "team_lead": "Capt. A. Roy",
        "vehicle_type": "Gemini Z-Craft Inflatable",
        "capability": "FLOOD_BOAT",
        "status": "AVAILABLE",
        "latitude": 22.5740,
        "longitude": 88.3720,
        "radio_channel": "VHF Ch. 4 (156.2 MHz)",
        "max_capacity": 8,
        "current_load": 0,
        "assigned_incident_id": None,
    },
    {
        "id": "resp-102",
        "unit_name": "SDRF Rapid Response Boat 2",
        "team_lead": "Sub-Inspector Ghosh",
        "vehicle_type": "Aluminum Hull Flood Craft",
        "capability": "FLOOD_BOAT",
        "status": "AVAILABLE",
        "latitude": 22.5620,
        "longitude": 88.3850,
        "radio_channel": "VHF Ch. 2 (156.1 MHz)",
        "max_capacity": 6,
        "current_load": 0,
        "assigned_incident_id": None,
    },
    {
        "id": "resp-103",
        "unit_name": "Kolkata Police Disaster Ambulance 09",
        "team_lead": "Paramedic M. Das",
        "vehicle_type": "4x4 High-Water Ambulance",
        "capability": "AMBULANCE",
        "status": "AVAILABLE",
        "latitude": 22.5800,
        "longitude": 88.4200,
        "radio_channel": "VHF Ch. 7 (156.35 MHz)",
        "max_capacity": 4,
        "current_load": 0,
        "assigned_incident_id": None,
    },
    {
        "id": "resp-104",
        "unit_name": "Civil Defence Stretcher Team B",
        "team_lead": "Havaldar Barman",
        "vehicle_type": "All-Terrain Rescue Rover",
        "capability": "STRETCHER_TEAM",
        "status": "AVAILABLE",
        "latitude": 22.5880,
        "longitude": 88.4100,
        "radio_channel": "VHF Ch. 9 (156.45 MHz)",
        "max_capacity": 5,
        "current_load": 0,
        "assigned_incident_id": None,
    },
]

SEED_SHELTERS = [
    {
        "id": "shl-01",
        "name": "Salt Lake Stadium Assembly Hub",
        "address": "Gate 3, Salt Lake Stadium Complex, Bidhannagar",
        "latitude": 22.5680,
        "longitude": 88.4060,
        "total_beds": 600,
        "available_beds": 420,
        "occupancy_rate": "30%",
        "supplies_status": "HIGH (3 days rations, generator backup)",
        "status": "OPEN",
        "amenities": [
            "Emergency Medical Triage",
            "Drinking Water Tanker",
            "Generator Power Backup",
            "Wheelchair Accessible",
            "Hot Meal Distribution",
        ],
        "is_active": 1,
    },
    {
        "id": "shl-02",
        "name": "Karunamoyee Multi-Purpose Shelter",
        "address": "Karunamoyee Central Terminus Complex, Sector II",
        "latitude": 22.5867,
        "longitude": 88.4178,
        "total_beds": 250,
        "available_beds": 180,
        "occupancy_rate": "28%",
        "supplies_status": "MODERATE (2 days rations, first aid active)",
        "status": "OPEN",
        "amenities": [
            "First Aid Post",
            "Purified Water",
            "Dry Rations",
            "Infant Care Kits",
        ],
        "is_active": 1,
    },
    {
        "id": "shl-03",
        "name": "Sector 5 Youth Hostel Hub",
        "address": "Block EP, Sector V Tech Corridor, Salt Lake",
        "latitude": 22.5800,
        "longitude": 88.4350,
        "total_beds": 150,
        "available_beds": 22,
        "occupancy_rate": "85%",
        "supplies_status": "RESTOCKING (Medical triage stationed)",
        "status": "NEAR_CAPACITY",
        "amenities": [
            "Medical Triage",
            "Emergency Charging Desk",
            "Restroom Facilities",
        ],
        "is_active": 1,
    },
]


async def seed_database(db) -> dict:
    """Insert seed incidents, responders, and shelters. Returns dict of created counts."""
    now = datetime.now(UTC).isoformat()
    created_incidents = []
    created_responders = []
    created_shelters = []

    # 1. Seed Incidents
    for inc in SEED_INCIDENTS:
        cursor = await db.execute(
            "SELECT id FROM incidents WHERE id = ? OR ticket_id = ?",
            (inc["id"], inc["ticket_id"]),
        )
        existing = await cursor.fetchone()
        if existing:
            continue

        await db.execute(
            """
            INSERT OR IGNORE INTO incidents (id, ticket_id, type, severity, description,
                reporter_name, reporter_phone, latitude, longitude,
                affected_count, is_sos, status, ai_state, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'AVAILABLE', ?, ?)
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

        await db.execute(
            """
            INSERT INTO incident_events (id, incident_id, event_type,
                previous_status, new_status, actor, created_at)
            VALUES (?, ?, 'CREATED', NULL, ?, 'system', ?)
            """,
            (str(uuid.uuid4()), inc["id"], inc["status"], now),
        )

        # Seed initial AI triage decision-support assessment
        from app.services.ai_triage_service import _local_heuristic_triage

        triage_assessment = _local_heuristic_triage(inc)
        if inc["status"] in ("VERIFIED", "ASSIGNED", "EN_ROUTE", "NEARBY", "ON_SCENE", "RESOLVED"):
            triage_assessment.review_status = "VERIFIED"
            triage_assessment.needs_review = False

        await db.execute(
            """
            INSERT INTO ai_triage_assessments (
                id, incident_id, provider, model, assessment,
                confidence, review_status, created_at
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                str(uuid.uuid4()),
                inc["id"],
                triage_assessment.provider,
                triage_assessment.model,
                triage_assessment.model_dump_json(),
                triage_assessment.confidence,
                triage_assessment.review_status,
                now,
            ),
        )
        created_incidents.append(inc)

    # 2. Seed Responders
    for resp in SEED_RESPONDERS:
        cursor = await db.execute("SELECT id FROM responders WHERE id = ?", (resp["id"],))
        existing = await cursor.fetchone()
        if existing:
            continue

        await db.execute(
            """
            INSERT OR IGNORE INTO responders (id, unit_name, team_lead, vehicle_type, capability,
                status, latitude, longitude, radio_channel, max_capacity, current_load,
                assigned_incident_id, last_seen, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                resp["id"],
                resp["unit_name"],
                resp["team_lead"],
                resp["vehicle_type"],
                resp["capability"],
                resp["status"],
                resp["latitude"],
                resp["longitude"],
                resp["radio_channel"],
                resp["max_capacity"],
                resp["current_load"],
                resp["assigned_incident_id"],
                now,
                now,
                now,
            ),
        )
        created_responders.append(resp)

    # 3. Seed Shelters
    for shl in SEED_SHELTERS:
        cursor = await db.execute("SELECT id FROM shelters WHERE id = ?", (shl["id"],))
        existing = await cursor.fetchone()
        if existing:
            continue

        await db.execute(
            """
            INSERT OR IGNORE INTO shelters (id, name, address, latitude, longitude,
                total_beds, available_beds, occupancy_rate, supplies_status,
                status, amenities, is_active, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                shl["id"],
                shl["name"],
                shl["address"],
                shl["latitude"],
                shl["longitude"],
                shl["total_beds"],
                shl["available_beds"],
                shl["occupancy_rate"],
                shl["supplies_status"],
                shl["status"],
                json.dumps(shl.get("amenities", [])),
                shl["is_active"],
                now,
                now,
            ),
        )
        created_shelters.append(shl)

    await db.commit()
    print(
        f"[SEED] Seeded {len(created_incidents)} incidents, "
        f"{len(created_responders)} responders, {len(created_shelters)} shelters."
    )
    return {
        "incidents": len(created_incidents),
        "responders": len(created_responders),
        "shelters": len(created_shelters),
    }
