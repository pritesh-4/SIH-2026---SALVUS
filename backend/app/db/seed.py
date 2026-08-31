"""Seed data for demo/development — Kolkata flood scenario matching frontend mocks."""

import json
import uuid
from datetime import UTC, datetime

from app.auth.password import hash_password

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


# Demo authentication accounts — passwords are bcrypt-hashed at import time.
# Plaintext passwords are ONLY documented in docs/DEMO.md for hackathon evaluators.
SEED_DEMO_USERS = [
    {
        "id": "user-citizen-demo",
        "email": "citizen@salvus.demo",
        "password_hash": hash_password("Salvus@Citizen2026"),
        "full_name": "Aditi Mukherjee",
        "role": "CITIZEN",
        "is_active": 1,
    },
    {
        "id": "user-authority-demo",
        "email": "authority@salvus.demo",
        "password_hash": hash_password("Salvus@Authority2026"),
        "full_name": "Duty Dispatcher",
        "role": "AUTHORITY",
        "is_active": 1,
    },
]

SEED_CITIZEN_PROFILES = [
    {
        "id": "cit-default",
        "emergency_id": "SLV-CIT-7829",
        "full_name": "Aditi Mukherjee",
        "phone": "+91 98301 23456",
        "email": "aditi.m@salvus.local",
        "registered_address": "Flat 4B, Greenwood Apts, Sector 12, Salt Lake, Kolkata",
        "blood_group": "O+",
        "avatar_initials": "AM",
        "avatar_url": None,
        "medical_info": json.dumps(
            {
                "conditions": ["Mild Asthma (Carries Inhaler)"],
                "allergies": ["Penicillin Allergy"],
                "mobilityNote": "Fully Mobile / Ambulatory",
            }
        ),
        "is_verified": 1,
    },
    {
        "id": "user-citizen-demo",
        "emergency_id": "SLV-CIT-DEMO",
        "full_name": "Aditi Mukherjee",
        "phone": "+91 98301 23456",
        "email": "citizen@salvus.demo",
        "registered_address": "Flat 4B, Greenwood Apts, Sector 12, Salt Lake, Kolkata",
        "blood_group": "O+",
        "avatar_initials": "AM",
        "avatar_url": None,
        "medical_info": json.dumps(
            {
                "conditions": ["Mild Asthma (Carries Inhaler)"],
                "allergies": ["Penicillin Allergy"],
                "mobilityNote": "Fully Mobile / Ambulatory",
            }
        ),
        "is_verified": 1,
    },
]

SEED_EMERGENCY_CONTACTS = [
    {
        "id": "ec-101",
        "user_id": "cit-default",
        "name": "Dr. Sourav Mukherjee",
        "relationship": "Father",
        "phone": "+91 98300 11223",
        "priority": 1,
        "is_primary": 1,
        "notify_on_sos": 1,
    },
    {
        "id": "ec-102",
        "user_id": "cit-default",
        "name": "Priya Das",
        "relationship": "Sister / Neighbor",
        "phone": "+91 98311 44556",
        "priority": 2,
        "is_primary": 0,
        "notify_on_sos": 1,
    },
    {
        "id": "ec-demo-101",
        "user_id": "user-citizen-demo",
        "name": "Dr. Sourav Mukherjee",
        "relationship": "Father",
        "phone": "+91 98300 11223",
        "priority": 1,
        "is_primary": 1,
        "notify_on_sos": 1,
    },
    {
        "id": "ec-demo-102",
        "user_id": "user-citizen-demo",
        "name": "Priya Das",
        "relationship": "Sister / Neighbor",
        "phone": "+91 98311 44556",
        "priority": 2,
        "is_primary": 0,
        "notify_on_sos": 1,
    },
]


async def seed_auth_users(db) -> dict:
    """Insert seed demo users and citizen profiles idempotently for authentication."""
    now = datetime.now(UTC).isoformat()
    created_users = []
    created_profiles = []

    # 1. Seed Citizen Profiles
    for prof in SEED_CITIZEN_PROFILES:
        cursor = await db.execute("SELECT id FROM citizen_profiles WHERE id = ?", (prof["id"],))
        existing = await cursor.fetchone()
        if existing:
            continue

        await db.execute(
            """
            INSERT OR IGNORE INTO citizen_profiles (
                id, emergency_id, full_name, phone, email, registered_address,
                blood_group, avatar_initials, avatar_url, medical_info,
                is_verified, created_at, updated_at
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                prof["id"],
                prof["emergency_id"],
                prof["full_name"],
                prof["phone"],
                prof["email"],
                prof["registered_address"],
                prof["blood_group"],
                prof["avatar_initials"],
                prof["avatar_url"],
                prof["medical_info"],
                prof["is_verified"],
                now,
                now,
            ),
        )
        created_profiles.append(prof)

    # 2. Seed Demo Users (Authentication Foundation)
    for usr in SEED_DEMO_USERS:
        cursor = await db.execute("SELECT id FROM users WHERE email = ?", (usr["email"],))
        existing = await cursor.fetchone()
        if existing:
            continue

        await db.execute(
            """
            INSERT OR IGNORE INTO users (
                id, email, password_hash, full_name, role, is_active,
                created_at, updated_at
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                usr["id"],
                usr["email"],
                usr["password_hash"],
                usr["full_name"],
                usr["role"],
                usr["is_active"],
                now,
                now,
            ),
        )
        created_users.append(usr)

    await db.commit()
    return {
        "citizen_profiles": len(created_profiles),
        "users": len(created_users),
    }


async def seed_operational_dataset(db) -> dict:
    """Insert seed incidents, responders, shelters, and emergency contacts for demo scenarios."""
    now = datetime.now(UTC).isoformat()
    created_incidents = []
    created_responders = []
    created_shelters = []
    created_contacts = []

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

    # 4. Seed Emergency Contacts
    for ec in SEED_EMERGENCY_CONTACTS:
        cursor = await db.execute("SELECT id FROM emergency_contacts WHERE id = ?", (ec["id"],))
        existing = await cursor.fetchone()
        if existing:
            continue

        await db.execute(
            """
            INSERT OR IGNORE INTO emergency_contacts (
                id, user_id, name, relationship, phone, priority, is_primary, notify_on_sos,
                created_at, updated_at
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                ec["id"],
                ec["user_id"],
                ec["name"],
                ec["relationship"],
                ec["phone"],
                ec["priority"],
                ec["is_primary"],
                ec["notify_on_sos"],
                now,
                now,
            ),
        )
        created_contacts.append(ec)

    await db.commit()
    return {
        "incidents": len(created_incidents),
        "responders": len(created_responders),
        "shelters": len(created_shelters),
        "emergency_contacts": len(created_contacts),
    }


DEMO_INCIDENT_IDS = ("inc-2048", "inc-1982", "inc-1910", "inc-1844")
DEMO_TICKET_IDS = ("SV-2048", "SV-1982", "SV-1910", "SV-1844")
DEMO_RESPONDER_IDS = ("resp-101", "resp-102", "resp-103", "resp-104")
DEMO_SHELTER_IDS = ("shl-01", "shl-02", "shl-03")


async def cleanup_legacy_demo_records(db) -> dict:
    """Safely prune known seeded demo operational records from previous AUTO_SEED runs.

    Preserves authentication foundation, real citizen-created incidents,
    real response units, and active operational shelter registrations.
    """
    placeholders_inc = ",".join("?" for _ in DEMO_INCIDENT_IDS)
    placeholders_tkt = ",".join("?" for _ in DEMO_TICKET_IDS)
    placeholders_resp = ",".join("?" for _ in DEMO_RESPONDER_IDS)
    placeholders_shl = ",".join("?" for _ in DEMO_SHELTER_IDS)

    # 1. Prune cascade dependencies for demo incidents
    await db.execute(
        f"DELETE FROM ai_triage_assessments WHERE incident_id IN ({placeholders_inc})",
        DEMO_INCIDENT_IDS,
    )
    await db.execute(
        f"DELETE FROM incident_events WHERE incident_id IN ({placeholders_inc})",
        DEMO_INCIDENT_IDS,
    )
    await db.execute(
        f"DELETE FROM assignments WHERE incident_id IN ({placeholders_inc})",
        DEMO_INCIDENT_IDS,
    )
    await db.execute(
        f"DELETE FROM incident_attachments WHERE incident_id IN ({placeholders_inc})",
        DEMO_INCIDENT_IDS,
    )

    # 2. Prune demo incidents
    query_del_inc = (
        f"DELETE FROM incidents "
        f"WHERE id IN ({placeholders_inc}) OR ticket_id IN ({placeholders_tkt})"
    )
    cursor = await db.execute(query_del_inc, DEMO_INCIDENT_IDS + DEMO_TICKET_IDS)
    deleted_incidents = cursor.rowcount

    # 3. Prune demo responders and their assignments
    await db.execute(
        f"DELETE FROM assignments WHERE responder_id IN ({placeholders_resp})",
        DEMO_RESPONDER_IDS,
    )
    cursor = await db.execute(
        f"DELETE FROM responders WHERE id IN ({placeholders_resp})",
        DEMO_RESPONDER_IDS,
    )
    deleted_responders = cursor.rowcount

    # 4. Prune demo shelters
    cursor = await db.execute(
        f"DELETE FROM shelters WHERE id IN ({placeholders_shl})",
        DEMO_SHELTER_IDS,
    )
    deleted_shelters = cursor.rowcount

    await db.commit()
    return {
        "deleted_incidents": deleted_incidents,
        "deleted_responders": deleted_responders,
        "deleted_shelters": deleted_shelters,
    }


async def seed_database(db) -> dict:
    """Insert seed incidents, responders, shelters, and demo users.
    Returns dict of created counts.
    """
    auth_counts = await seed_auth_users(db)
    operational_counts = await seed_operational_dataset(db)

    print(
        f"[SEED] Seeded {operational_counts['incidents']} incidents, "
        f"{operational_counts['responders']} responders, "
        f"{operational_counts['shelters']} shelters, "
        f"{auth_counts['citizen_profiles']} citizen profiles, "
        f"{operational_counts['emergency_contacts']} emergency contacts, "
        f"{auth_counts['users']} demo users."
    )
    return {**auth_counts, **operational_counts}
