# DATABASE.md - Database Schema & Storage Architecture

This document describes the current database schema, storage engine, and future migration path for Salvus.

---

## 1. Storage Architecture

- **Phase 1 Implementation:** Asynchronous local SQLite (`aiosqlite`) stored in `backend/data/salvus.db`.
  - Configured with Write-Ahead Logging (`PRAGMA journal_mode=WAL`) for concurrent reading and writing.
  - Foreign key enforcement enabled (`PRAGMA foreign_keys=ON`).
- **Production Target (Phase 2):** PostgreSQL with PostGIS extension on Supabase / Render for geospatial indexing and multi-region replication.

---

## 2. Implemented Tables (IMPLEMENTED ✅)

### Table: `incidents`

Stores emergency SOS distress beacons and citizen hazard reports.

| Column           | Type      | Constraints                    | Description                                                               |
| ---------------- | --------- | ------------------------------ | ------------------------------------------------------------------------- |
| `id`             | `TEXT`    | `PRIMARY KEY`                  | UUIDv4 string                                                             |
| `ticket_id`      | `TEXT`    | `UNIQUE NOT NULL`              | Public identifier (e.g. `SV-2048`)                                        |
| `type`           | `TEXT`    | `NOT NULL`                     | `flood`, `fire`, `medical`, `hazard`, `power_line`, `structural`, `other` |
| `severity`       | `TEXT`    | `NOT NULL DEFAULT 'MEDIUM'`    | `CRITICAL`, `HIGH`, `MEDIUM`, `LOW`                                       |
| `description`    | `TEXT`    | `NOT NULL DEFAULT ''`          | Detailed hazard / rescue description                                      |
| `reporter_name`  | `TEXT`    | `NOT NULL DEFAULT 'Anonymous'` | Name of reporting citizen                                                 |
| `reporter_phone` | `TEXT`    | `NULL`                         | Contact phone number                                                      |
| `latitude`       | `REAL`    | `NOT NULL`                     | Latitude coordinate (-90 to 90)                                           |
| `longitude`      | `REAL`    | `NOT NULL`                     | Longitude coordinate (-180 to 180)                                        |
| `affected_count` | `INTEGER` | `NOT NULL DEFAULT 1`           | Estimated number of people in danger                                      |
| `is_sos`         | `INTEGER` | `NOT NULL DEFAULT 0`           | 1 if high-priority SOS, 0 if hazard report                                |
| `status`         | `TEXT`    | `NOT NULL DEFAULT 'NEW'`       | `NEW`, `TRIAGE_PENDING`, `VERIFIED`, `RESOLVED`, `CANCELLED`              |
| `created_at`     | `TEXT`    | `NOT NULL`                     | ISO 8601 UTC timestamp                                                    |
| `updated_at`     | `TEXT`    | `NOT NULL`                     | ISO 8601 UTC timestamp                                                    |

### Table: `incident_events`

Immutable audit trail logging every state transition and action on an incident.

| Column            | Type   | Constraints                                       | Description                                    |
| ----------------- | ------ | ------------------------------------------------- | ---------------------------------------------- |
| `id`              | `TEXT` | `PRIMARY KEY`                                     | UUIDv4 string                                  |
| `incident_id`     | `TEXT` | `NOT NULL, FK -> incidents(id) ON DELETE CASCADE` | Associated incident                            |
| `event_type`      | `TEXT` | `NOT NULL`                                        | `CREATED`, `STATUS_CHANGE`, `ASSIGNMENT`, etc. |
| `previous_status` | `TEXT` | `NULL`                                            | Status before transition                       |
| `new_status`      | `TEXT` | `NULL`                                            | Status after transition                        |
| `actor`           | `TEXT` | `NOT NULL DEFAULT 'system'`                       | User/service who triggered event               |
| `metadata`        | `TEXT` | `NULL`                                            | Optional JSON metadata payload                 |
| `created_at`      | `TEXT` | `NOT NULL`                                        | ISO 8601 UTC timestamp                         |

### Database Indexes

```sql
CREATE INDEX idx_incidents_status ON incidents(status);
CREATE INDEX idx_incidents_coords ON incidents(latitude, longitude);
CREATE INDEX idx_incidents_created_at ON incidents(created_at DESC);
CREATE INDEX idx_incident_events_incident_id ON incident_events(incident_id);
```

---

## 3. Future Schema Blueprint (PLANNED 🔮)

The following tables will be introduced in subsequent phases for full responder fleet allocation:

- **`users`**: Authentication & role management (`citizen`, `dispatcher`, `responder`).
- **`responders`**: Rescue crews with specialized capabilities (`water_rescue`, `medical`, `heavy_debris`).
- **`assignments`**: Junction linking responders to incidents with ETA telemetry.
- **`shelters`**: Evacuation center capacities, occupancy, and medical supply levels.
