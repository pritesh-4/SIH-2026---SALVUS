"""Database schema migrations for Salvus."""

import aiosqlite


async def run_migrations(db: aiosqlite.Connection) -> None:
    """Create tables if they do not exist."""

    await db.execute("""
        CREATE TABLE IF NOT EXISTS incidents (
            id TEXT PRIMARY KEY,
            ticket_id TEXT UNIQUE NOT NULL,
            type TEXT NOT NULL,
            severity TEXT NOT NULL DEFAULT 'MEDIUM',
            description TEXT NOT NULL DEFAULT '',
            reporter_name TEXT NOT NULL DEFAULT 'Anonymous',
            reporter_phone TEXT,
            latitude REAL NOT NULL,
            longitude REAL NOT NULL,
            affected_count INTEGER NOT NULL DEFAULT 1,
            is_sos INTEGER NOT NULL DEFAULT 0,
            status TEXT NOT NULL DEFAULT 'NEW',
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        )
    """)

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

    # Indexes for common queries
    await db.execute("""
        CREATE INDEX IF NOT EXISTS idx_incidents_status ON incidents(status)
    """)
    await db.execute("""
        CREATE INDEX IF NOT EXISTS idx_incidents_coords ON incidents(latitude, longitude)
    """)
    await db.execute("""
        CREATE INDEX IF NOT EXISTS idx_incident_events_incident_id ON incident_events(incident_id)
    """)
    await db.execute("""
        CREATE INDEX IF NOT EXISTS idx_incidents_created_at ON incidents(created_at DESC)
    """)

    await db.commit()
    print("[DB] Migrations complete.")
