# DATABASE.md - Database Schema Blueprint (PLANNED)

The database layers are configured inside Supabase (PostgreSQL with the PostGIS spatial extension). No tables are currently implemented.

---

## 1. Intended Tables Schema

### Table: `users`

- **Purpose:** Stores core user profile records.
- **Fields:**
  - `id` (uuid, Primary Key)
  - `email` (varchar, unique)
  - `role` (varchar) - `'citizen'` | `'dispatcher'` | `'responder'`
  - `created_at` (timestamp)

### Table: `incidents`

- **Purpose:** Log of all emergency SOS pings and hazards.
- **Fields:**
  - `id` (uuid, Primary Key)
  - `location` (geometry(Point, 4326)) - **Geospatial coordinates**
  - `category` (varchar) - `'Flood'` | `'Fire'` | `'Medical'` | `'Hazard'` | `'Other'`
  - `severity` (varchar) - `'Critical'` | `'High'` | `'Moderate'` | `'Low'`
  - `status` (varchar) - `'active'` | `'dispatched'` | `'resolved'` | `'cancelled'`
  - `summary` (text)
  - `citizen_phone` (varchar)
  - `created_at` (timestamp)

### Table: `responders`

- **Purpose:** Rescue crew accounts and status.
- **Fields:**
  - `id` (uuid, Primary Key)
  - `name` (varchar)
  - `capability` (varchar[]) - e.g. `['water_rescue', 'first_aid']`
  - `current_status` (varchar) - `'idle'` | `'en_route'` | `'busy'` | `'offline'`
  - `last_location` (geometry(Point, 4326))
  - `updated_at` (timestamp)

### Table: `assignments`

- **Purpose:** Maps responders to active incidents.
- **Fields:**
  - `id` (uuid, Primary Key)
  - `incident_id` (uuid, Foreign Key -> `incidents.id`)
  - `responder_id` (uuid, Foreign Key -> `responders.id`)
  - `status` (varchar) - `'assigned'` | `'en_route'` | `'at_scene'` | `'completed'`
  - `assigned_at` (timestamp)

### Table: `shelters`

- **Purpose:** Shelter facilities monitoring.
- **Fields:**
  - `id` (uuid, Primary Key)
  - `name` (varchar)
  - `location` (geometry(Point, 4326))
  - `capacity` (integer)
  - `current_occupancy` (integer)
  - `resource_status` (jsonb) - tracks medicine/water levels

---

## 2. Spatial Indexes (PostGIS)

To ensure near-instantaneous proximity routing, spatial indexes must be applied:

```sql
CREATE INDEX idx_incidents_location ON incidents USING GIST (location);
CREATE INDEX idx_responders_location ON responders USING GIST (last_location);
CREATE INDEX idx_shelters_location ON shelters USING GIST (location);
```

These allow efficient queries using distance calculations:

```sql
-- Find nearest open shelter within 10km (10000m)
SELECT id, name, ST_Distance(location, ST_MakePoint(longitude, latitude)::geography) as dist
FROM shelters
WHERE current_occupancy < capacity
AND ST_DWithin(location, ST_MakePoint(longitude, latitude)::geography, 10000)
ORDER BY dist ASC;
```
