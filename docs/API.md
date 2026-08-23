# API.md - API Specifications

This document outlines the REST and WebSocket API contracts for the Salvus platform.

---

## 1. System Health & Diagnostics (IMPLEMENTED ✅)

### `GET /health`

Returns service health status.

- **Authentication:** None
- **Response (200 OK):**
  ```json
  {
    "status": "healthy",
    "service": "Salvus API",
    "version": "0.1.0"
  }
  ```

---

## 2. Incident Domain API (IMPLEMENTED ✅)

### `POST /api/incidents`

Creates a new emergency SOS beacon or citizen hazard report and emits `incident:new` over Socket.IO to the `authorities` room.

- **Authentication:** Public / Anonymous allowed
- **Request Payload:**
  ```json
  {
    "type": "flood",
    "severity": "CRITICAL",
    "description": "Water entering ground floor rapidly. Family of 3 trapped on balcony.",
    "reporter_name": "Aditi Roy",
    "reporter_phone": "+91 98301 24890",
    "latitude": 22.5726,
    "longitude": 88.3639,
    "affected_count": 3,
    "is_sos": true
  }
  ```
- **Response (201 Created):** Single `IncidentResponse` object with initial `CREATED` event.
- **Error Responses:**
  - `422 Unprocessable Entity`: Validation failure on coordinates, type, or missing required fields.

---

### `GET /api/incidents`

Lists all incidents in descending order of creation (newest first).

- **Authentication:** None (Public / Command Console)
- **Response (200 OK):** `IncidentListResponse` with `data` array and `count`.

---

### `GET /api/incidents/{id}`

Retrieves a single incident by its UUID along with its complete audit event history.

- **Authentication:** None
- **Response (200 OK):** Single `IncidentResponse` object.
- **Error Responses:**
  - `404 Not Found`: Incident UUID does not exist.

---

### `PATCH /api/incidents/{id}/status`

Transitions an incident to a new status governed by the state machine (`NEW` $\rightarrow$ `TRIAGE_PENDING` $\rightarrow$ `VERIFIED` $\rightarrow$ `RESOLVED` / `CANCELLED`) and emits `incident:status_changed` over Socket.IO to both `authorities` and `incident:{id}` rooms.

- **Authorization:** Operational status transitions (`TRIAGE_PENDING`, `VERIFIED`, `RESOLVED`) require authority role (`actor != "citizen"`). Citizens may only trigger `CANCELLED`.
- **Request Payload:**
  ```json
  {
    "status": "VERIFIED",
    "actor": "authority"
  }
  ```
- **Response (200 OK):** Updated `IncidentResponse` with new audit event appended.
- **Error Responses:**
  - `400 Bad Request`: Invalid state transition attempt (e.g. skipping steps or mutating terminal state).
  - `403 Forbidden`: Unauthorized attempt by a citizen actor to perform authority verification or resolution.
  - `404 Not Found`: Incident does not exist.

---

## 3. Responder Fleet API (IMPLEMENTED ✅)

### `GET /api/responders`

Lists all active rescue craft, ambulances, and disaster response units.

- **Response (200 OK):**
  ```json
  {
    "success": true,
    "data": [
      {
        "id": "resp-101",
        "unit_name": "NDRF Rescue Unit 4",
        "team_lead": "Capt. A. Roy",
        "vehicle_type": "Gemini Z-Craft Inflatable",
        "capability": "FLOOD_BOAT",
        "status": "AVAILABLE",
        "latitude": 22.574,
        "longitude": 88.372,
        "radio_channel": "VHF Ch. 4 (156.2 MHz)",
        "max_capacity": 8,
        "current_load": 0,
        "assigned_incident_id": null,
        "last_seen": "2026-08-23T14:20:00+00:00",
        "created_at": "2026-08-23T14:20:00+00:00",
        "updated_at": "2026-08-23T14:20:00+00:00"
      }
    ],
    "count": 4
  }
  ```

### `GET /api/responders/{id}`

Fetches single responder details.

### `PATCH /api/responders/{id}/status`

Updates responder operational status (`AVAILABLE`, `ASSIGNED`, `EN_ROUTE`, `ON_SCENE`, `OFFLINE`) or sets `assigned_incident_id`, emitting `responder:status_changed` over Socket.IO.

### `POST /api/responders/{id}/location`

Updates real-time GPS telemetry coordinates of a response unit and emits `responder:location_updated`.

---

## 4. Shelter Logistics API (IMPLEMENTED ✅)

### `GET /api/shelters`

Lists all registered evacuation shelters, bed occupancies, and supplies statuses.

- **Response (200 OK):**
  ```json
  {
    "success": true,
    "data": [
      {
        "id": "shl-01",
        "name": "Salt Lake Stadium Assembly Hub",
        "address": "Gate 3, Salt Lake Stadium Complex, Bidhannagar",
        "latitude": 22.568,
        "longitude": 88.406,
        "total_beds": 600,
        "available_beds": 420,
        "occupancy_rate": "68%",
        "supplies_status": "HIGH (3 days rations, generator backup)",
        "status": "OPEN",
        "is_active": true,
        "created_at": "2026-08-23T14:20:00+00:00",
        "updated_at": "2026-08-23T14:20:00+00:00"
      }
    ],
    "count": 3
  }
  ```

### `GET /api/shelters/{id}`

Fetches single evacuation shelter hub.

### `PATCH /api/shelters/{id}`

Updates shelter bed availability, occupancy percentage, or supplies readiness state.
