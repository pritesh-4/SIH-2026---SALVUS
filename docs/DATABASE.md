# DATABASE.md - Database Schema & Storage Architecture

This document describes the current database schema, storage engine, and future migration path for Salvus.

---

## 1. Storage Architecture

- **Primary Storage:** Asynchronous local SQLite (`aiosqlite`) stored in `backend/data/salvus.db`.
  - Configured with Write-Ahead Logging (`PRAGMA journal_mode=WAL`) for high-concurrency read and write throughput.
  - Foreign key constraints strictly enforced (`PRAGMA foreign_keys=ON`).
- **Production Target (Future):** PostgreSQL with PostGIS extension for multi-region replication.

---

## 2. Implemented Tables (IMPLEMENTED ✅)

### Table: `incidents`

Stores emergency SOS distress beacons and citizen hazard reports.

| Column           | Type      | Constraints                    | Description                                                                                      |
| ---------------- | --------- | ------------------------------ | ------------------------------------------------------------------------------------------------ |
| `id`             | `TEXT`    | `PRIMARY KEY`                  | UUIDv4 string                                                                                    |
| `ticket_id`      | `TEXT`    | `UNIQUE NOT NULL`              | Public identifier (e.g. `SV-2048`)                                                               |
| `type`           | `TEXT`    | `NOT NULL`                     | `flood`, `fire`, `medical`, `hazard`, `power_line`, `structural`, `other`                        |
| `severity`       | `TEXT`    | `NOT NULL DEFAULT 'MEDIUM'`    | `CRITICAL`, `HIGH`, `MEDIUM`, `LOW`                                                              |
| `description`    | `TEXT`    | `NOT NULL DEFAULT ''`          | Detailed hazard / rescue description                                                             |
| `reporter_name`  | `TEXT`    | `NOT NULL DEFAULT 'Anonymous'` | Name of reporting citizen                                                                        |
| `reporter_phone` | `TEXT`    | `NULL`                         | Contact phone number                                                                             |
| `latitude`       | `REAL`    | `NOT NULL`                     | Latitude coordinate (-90 to 90)                                                                  |
| `longitude`      | `REAL`    | `NOT NULL`                     | Longitude coordinate (-180 to 180)                                                               |
| `affected_count` | `INTEGER` | `NOT NULL DEFAULT 1`           | Estimated number of people in danger                                                             |
| `is_sos`         | `INTEGER` | `NOT NULL DEFAULT 0`           | 1 if high-priority SOS, 0 if hazard report                                                       |
| `status`         | `TEXT`    | `NOT NULL DEFAULT 'NEW'`       | `NEW`, `TRIAGE_PENDING`, `VERIFIED`, `ASSIGNED`, `EN_ROUTE`, `ON_SCENE`, `RESOLVED`, `CANCELLED` |
| `created_at`     | `TEXT`    | `NOT NULL`                     | ISO 8601 UTC timestamp                                                                           |
| `updated_at`     | `TEXT`    | `NOT NULL`                     | ISO 8601 UTC timestamp                                                                           |

### Table: `incident_events`

Immutable audit trail logging every state transition and operational action on an incident.

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

### Table: `responders`

Active rescue craft, medical ambulances, and disaster response units.

| Column                 | Type      | Constraints                                    | Description                                                           |
| ---------------------- | --------- | ---------------------------------------------- | --------------------------------------------------------------------- |
| `id`                   | `TEXT`    | `PRIMARY KEY`                                  | Unique responder unit ID (e.g. `resp-101`)                            |
| `unit_name`            | `TEXT`    | `NOT NULL`                                     | Public unit title (e.g. `NDRF Rescue Unit 4`)                         |
| `team_lead`            | `TEXT`    | `NOT NULL`                                     | Commander / lead officer name                                         |
| `vehicle_type`         | `TEXT`    | `NOT NULL`                                     | Craft / vehicle class (e.g. `Gemini Z-Craft Inflatable`)              |
| `capability`           | `TEXT`    | `NOT NULL`                                     | `FLOOD_BOAT`, `AMBULANCE`, `STRETCHER_TEAM`, `DEBRIS_CLEAR`, `HAZMAT` |
| `status`               | `TEXT`    | `NOT NULL DEFAULT 'AVAILABLE'`                 | `AVAILABLE`, `ASSIGNED`, `EN_ROUTE`, `ON_SCENE`, `OFFLINE`            |
| `latitude`             | `REAL`    | `NOT NULL`                                     | Current GPS latitude coordinate                                       |
| `longitude`            | `REAL`    | `NOT NULL`                                     | Current GPS longitude coordinate                                      |
| `radio_channel`        | `TEXT`    | `NOT NULL`                                     | VHF tactical communication frequency                                  |
| `max_capacity`         | `INTEGER` | `NOT NULL DEFAULT 6`                           | Maximum passenger/evacuee capacity                                    |
| `current_load`         | `INTEGER` | `NOT NULL DEFAULT 0`                           | Current evacuees on board                                             |
| `assigned_incident_id` | `TEXT`    | `NULL, FK -> incidents(id) ON DELETE SET NULL` | Active incident ticket assigned                                       |
| `last_seen`            | `TEXT`    | `NOT NULL`                                     | ISO 8601 timestamp of last GPS ping                                   |
| `created_at`           | `TEXT`    | `NOT NULL`                                     | ISO 8601 UTC timestamp                                                |
| `updated_at`           | `TEXT`    | `NOT NULL`                                     | ISO 8601 UTC timestamp                                                |

### Table: `assignments`

First-class domain entity linking one incident to one responder with explicit lifecycle milestones and audit score breakdown.

| Column              | Type   | Constraints                                        | Description                                                                        |
| ------------------- | ------ | -------------------------------------------------- | ---------------------------------------------------------------------------------- |
| `id`                | `TEXT` | `PRIMARY KEY`                                      | UUIDv4 string                                                                      |
| `incident_id`       | `TEXT` | `NOT NULL, FK -> incidents(id) ON DELETE CASCADE`  | Linked emergency incident                                                          |
| `responder_id`      | `TEXT` | `NOT NULL, FK -> responders(id) ON DELETE CASCADE` | Linked rescue unit                                                                 |
| `status`            | `TEXT` | `NOT NULL DEFAULT 'PROPOSED'`                      | `PROPOSED`, `ASSIGNED`, `EN_ROUTE`, `NEARBY`, `ON_SCENE`, `COMPLETED`, `CANCELLED` |
| `assigned_by`       | `TEXT` | `NOT NULL DEFAULT 'authority'`                     | Dispatcher actor or authority ID                                                   |
| `assigned_at`       | `TEXT` | `NOT NULL`                                         | ISO 8601 UTC creation timestamp                                                    |
| `accepted_at`       | `TEXT` | `NULL`                                             | ISO 8601 UTC timestamp when assignment transitioned to `ASSIGNED`                  |
| `started_at`        | `TEXT` | `NULL`                                             | ISO 8601 UTC timestamp when responder moved `EN_ROUTE`                             |
| `arrived_at`        | `TEXT` | `NULL`                                             | ISO 8601 UTC timestamp when responder arrived `ON_SCENE`                           |
| `completed_at`      | `TEXT` | `NULL`                                             | ISO 8601 UTC timestamp when mission `COMPLETED`                                    |
| `cancelled_at`      | `TEXT` | `NULL`                                             | ISO 8601 UTC timestamp when assignment was `CANCELLED`                             |
| `score`             | `REAL` | `NULL`                                             | Match score (0-100)                                                                |
| `score_breakdown`   | `TEXT` | `NULL`                                             | JSON `{ capability, distance, eta, workload, severity_fit }`                       |
| `assignment_reason` | `TEXT` | `NULL`                                             | Tactical justification text                                                        |
| `created_at`        | `TEXT` | `NOT NULL`                                         | ISO 8601 UTC timestamp                                                             |
| `updated_at`        | `TEXT` | `NOT NULL`                                         | ISO 8601 UTC timestamp                                                             |

### Table: `shelters`

Designated evacuation shelters and disaster supply hubs with live bed occupancy.

| Column            | Type      | Constraints               | Description                                                  |
| ----------------- | --------- | ------------------------- | ------------------------------------------------------------ |
| `id`              | `TEXT`    | `PRIMARY KEY`             | Unique shelter ID (e.g. `shl-01`)                            |
| `name`            | `TEXT`    | `NOT NULL`                | Shelter facility name                                        |
| `address`         | `TEXT`    | `NOT NULL`                | Street address / landmark location                           |
| `latitude`        | `REAL`    | `NOT NULL`                | GPS latitude coordinate                                      |
| `longitude`       | `REAL`    | `NOT NULL`                | GPS longitude coordinate                                     |
| `total_beds`      | `INTEGER` | `NOT NULL`                | Total capacity of facility                                   |
| `available_beds`  | `INTEGER` | `NOT NULL`                | Vacant beds available for immediate check-in                 |
| `occupancy_rate`  | `TEXT`    | `NOT NULL DEFAULT '0%'`   | Calculated occupancy percentage                              |
| `supplies_status` | `TEXT`    | `NOT NULL`                | Food, clean water, power generator & medical readiness state |
| `status`          | `TEXT`    | `NOT NULL DEFAULT 'OPEN'` | `OPEN`, `NEAR_CAPACITY`, `FULL`, `CLOSED`                    |
| `is_active`       | `INTEGER` | `NOT NULL DEFAULT 1`      | 1 if accepting evacuees, 0 if deactivated                    |
| `created_at`      | `TEXT`    | `NOT NULL`                | ISO 8601 UTC timestamp                                       |
| `updated_at`      | `TEXT`    | `NOT NULL`                | ISO 8601 UTC timestamp                                       |

### Database Indexes

```sql
CREATE INDEX idx_incidents_status ON incidents(status);
CREATE INDEX idx_incidents_coords ON incidents(latitude, longitude);
CREATE INDEX idx_incidents_created_at ON incidents(created_at DESC);
CREATE INDEX idx_incident_events_incident_id ON incident_events(incident_id);
CREATE INDEX idx_responders_status ON responders(status);
CREATE INDEX idx_responders_assigned ON responders(assigned_incident_id);
CREATE INDEX idx_assignments_incident ON assignments(incident_id);
CREATE INDEX idx_assignments_responder ON assignments(responder_id);
CREATE INDEX idx_assignments_status ON assignments(status);
CREATE INDEX idx_shelters_status ON shelters(status);
```
