"""Database schema migrations for Salvus."""

import aiosqlite


async def run_migrations(db: aiosqlite.Connection) -> None:
    """Create tables and indexes if they do not exist."""

    # 1. Incidents Table
    await db.execute("""
        CREATE TABLE IF NOT EXISTS incidents (
            id TEXT PRIMARY KEY,
            ticket_id TEXT UNIQUE NOT NULL,
            type TEXT NOT NULL,
            severity TEXT NOT NULL DEFAULT 'MEDIUM',
            description TEXT NOT NULL DEFAULT '',
            reporter_name TEXT NOT NULL DEFAULT 'Anonymous',
            reporter_phone TEXT,
            reporter_id TEXT,
            latitude REAL NOT NULL,
            longitude REAL NOT NULL,
            affected_count INTEGER NOT NULL DEFAULT 1,
            is_sos INTEGER NOT NULL DEFAULT 0,
            status TEXT NOT NULL DEFAULT 'NEW',
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        )
    """)

    # 2. Incident Audit Events Table
    await db.execute("""
        CREATE TABLE IF NOT EXISTS incident_events (
            id TEXT PRIMARY KEY,
            incident_id TEXT NOT NULL,
            event_type TEXT NOT NULL,
            previous_status TEXT,
            new_status TEXT,
            actor TEXT NOT NULL DEFAULT 'system',
            metadata TEXT,
            created_at TEXT NOT NULL,
            FOREIGN KEY (incident_id) REFERENCES incidents(id) ON DELETE CASCADE
        )
    """)

    # 3. Responders Fleet Table
    await db.execute("""
        CREATE TABLE IF NOT EXISTS responders (
            id TEXT PRIMARY KEY,
            unit_name TEXT NOT NULL,
            team_lead TEXT NOT NULL,
            vehicle_type TEXT NOT NULL,
            capability TEXT NOT NULL,
            status TEXT NOT NULL DEFAULT 'AVAILABLE',
            latitude REAL NOT NULL,
            longitude REAL NOT NULL,
            radio_channel TEXT NOT NULL,
            max_capacity INTEGER NOT NULL DEFAULT 6,
            current_load INTEGER NOT NULL DEFAULT 0,
            assigned_incident_id TEXT,
            last_seen TEXT NOT NULL,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            FOREIGN KEY (assigned_incident_id) REFERENCES incidents(id) ON DELETE SET NULL
        )
    """)

    # 4. Shelters Table
    await db.execute("""
        CREATE TABLE IF NOT EXISTS shelters (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            address TEXT NOT NULL,
            latitude REAL NOT NULL,
            longitude REAL NOT NULL,
            total_beds INTEGER NOT NULL,
            available_beds INTEGER NOT NULL,
            occupancy_rate TEXT NOT NULL DEFAULT '0%',
            supplies_status TEXT NOT NULL DEFAULT 'ADEQUATE',
            status TEXT NOT NULL DEFAULT 'OPEN',
            amenities TEXT NOT NULL DEFAULT '[]',
            is_active INTEGER NOT NULL DEFAULT 1,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        )
    """)

    # 5. AI Triage Assessments Table (Full Decision Support Audit Trail)
    await db.execute("""
        CREATE TABLE IF NOT EXISTS ai_triage_assessments (
            id TEXT PRIMARY KEY,
            incident_id TEXT NOT NULL,
            provider TEXT NOT NULL,
            model TEXT NOT NULL,
            assessment TEXT NOT NULL,
            confidence REAL NOT NULL,
            review_status TEXT NOT NULL DEFAULT 'PENDING',
            operator_adjustments TEXT,
            operator_id TEXT,
            created_at TEXT NOT NULL,
            reviewed_at TEXT,
            FOREIGN KEY (incident_id) REFERENCES incidents(id) ON DELETE CASCADE
        )
    """)

    # 6. Responder Assignments Table
    await db.execute("""
        CREATE TABLE IF NOT EXISTS assignments (
            id TEXT PRIMARY KEY,
            incident_id TEXT NOT NULL,
            responder_id TEXT NOT NULL,
            status TEXT NOT NULL DEFAULT 'PROPOSED',
            assigned_by TEXT NOT NULL DEFAULT 'authority',
            assigned_at TEXT NOT NULL,
            accepted_at TEXT,
            started_at TEXT,
            nearby_at TEXT,
            arrived_at TEXT,
            completed_at TEXT,
            cancelled_at TEXT,
            score REAL,
            score_breakdown TEXT,
            assignment_reason TEXT,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            FOREIGN KEY (incident_id) REFERENCES incidents(id) ON DELETE CASCADE,
            FOREIGN KEY (responder_id) REFERENCES responders(id) ON DELETE CASCADE
        )
    """)

    # Column migrations if table already existed without amenities or nearby_at
    try:
        await db.execute("ALTER TABLE shelters ADD COLUMN amenities TEXT NOT NULL DEFAULT '[]'")
    except Exception:
        pass  # Column already exists

    try:
        await db.execute("ALTER TABLE assignments ADD COLUMN nearby_at TEXT")
    except Exception:
        pass  # Column already exists

    try:
        await db.execute("ALTER TABLE incidents ADD COLUMN reporter_id TEXT")
    except Exception:
        pass  # Column already exists

    # Indexes for high-performance spatial & status queries
    await db.execute("CREATE INDEX IF NOT EXISTS idx_incidents_status ON incidents(status)")
    await db.execute(
        "CREATE INDEX IF NOT EXISTS idx_incidents_coords ON incidents(latitude, longitude)"
    )
    await db.execute(
        "CREATE INDEX IF NOT EXISTS idx_incident_events_incident_id ON incident_events(incident_id)"
    )
    await db.execute(
        "CREATE INDEX IF NOT EXISTS idx_incidents_created_at ON incidents(created_at DESC)"
    )
    await db.execute("CREATE INDEX IF NOT EXISTS idx_responders_status ON responders(status)")
    await db.execute(
        "CREATE INDEX IF NOT EXISTS idx_responders_assigned ON responders(assigned_incident_id)"
    )
    await db.execute("CREATE INDEX IF NOT EXISTS idx_shelters_status ON shelters(status)")
    await db.execute(
        "CREATE INDEX IF NOT EXISTS idx_ai_triage_incident_id ON ai_triage_assessments(incident_id)"
    )
    await db.execute(
        "CREATE INDEX IF NOT EXISTS idx_assignments_incident ON assignments(incident_id)"
    )
    await db.execute(
        "CREATE INDEX IF NOT EXISTS idx_assignments_responder ON assignments(responder_id)"
    )
    await db.execute("CREATE INDEX IF NOT EXISTS idx_assignments_status ON assignments(status)")

    await db.commit()
    print("[DB] Migrations complete with triage audit and assignment tables.")
