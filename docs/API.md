# API.md — REST & WebSocket API Specification

This document provides the complete API contracts, authentication rules, request/response schemas, error codes, and canonical Socket.IO event emissions for all implemented Salvus endpoints.

---

## 1. Authentication & Base Configuration

- **Base URL (Local):** `http://localhost:8000`
- **Base URL (Production):** `https://salvus-backend.onrender.com`
- **Authentication Scheme:** Bearer Token (`Authorization: Bearer <JWT_TOKEN>`)
- **Roles:** `CITIZEN`, `AUTHORITY`, `RESPONDER`, `SYSTEM`
- **Standard Error Format:**
  ```json
  {
    "success": false,
    "error": {
      "code": "ERROR_CODE_STRING",
      "message": "Human readable error description."
    }
  }
  ```

---

## 2. System Diagnostics

### `GET /health`

Returns service and database health status.

- **Auth:** None (Public)
- **Response (200 OK):**
  ```json
  {
    "status": "healthy",
    "service": "Salvus API",
    "version": "0.1.0"
  }
  ```

### `GET /`

Root identification endpoint.

- **Auth:** None (Public)
- **Response (200 OK):**
  ```json
  {
    "status": "online",
    "service": "Salvus API",
    "version": "0.1.0",
    "docs": "/docs",
    "health": "/health"
  }
  ```

---

## 3. Incident Domain API (`/api/incidents`)

### `POST /api/incidents`

Creates a new emergency SOS distress beacon or citizen hazard report. Automatically triggers asynchronous AI triage assessment.

- **Auth:** Public / Anonymous allowed
- **Request Payload:**
  ```json
  {
    "type": "flood",
    "severity": "CRITICAL",
    "description": "Rising surge flood entering ground floor. 3 people stranded on terrace.",
    "reporter_name": "Aditi Roy",
    "reporter_phone": "+91 98301 24890",
    "latitude": 22.5726,
    "longitude": 88.3639,
    "affected_count": 3,
    "is_sos": true
  }
  ```
- **Response (201 Created):**
  ```json
  {
    "success": true,
    "data": {
      "id": "909ec355-6bcf-46d4-a035-71fa2e022f42",
      "ticket_id": "SV-2048",
      "type": "flood",
      "severity": "CRITICAL",
      "description": "Rising surge flood entering ground floor. 3 people stranded on terrace.",
      "reporter_name": "Aditi Roy",
      "reporter_phone": "+91 98301 24890",
      "latitude": 22.5726,
      "longitude": 88.3639,
      "affected_count": 3,
      "is_sos": true,
      "status": "NEW",
      "ai_state": "NOT_STARTED",
      "triage_hash": null,
      "created_at": "2026-08-27T12:00:00+00:00",
      "updated_at": "2026-08-27T12:00:00+00:00",
      "events": [
        {
          "id": "evt-001",
          "incident_id": "909ec355-6bcf-46d4-a035-71fa2e022f42",
          "event_type": "CREATED",
          "previous_status": null,
          "new_status": "NEW",
          "actor": "citizen",
          "created_at": "2026-08-27T12:00:00+00:00"
        }
      ]
    }
  }
  ```
- **Socket Emission:** `incident.created` $\rightarrow$ `authorities` room.
- **Errors:** `422 Unprocessable Entity` (invalid coordinates or missing required fields).

---

### `GET /api/incidents`

Lists incidents in descending order of creation (newest first) with optional status filtering.

- **Auth:** None (Public / Command Console)
- **Query Params:** `status` (optional: `NEW`, `TRIAGE_PENDING`, `VERIFIED`, `ASSIGNED`, `EN_ROUTE`, `NEARBY`, `ON_SCENE`, `RESOLVED`, `CANCELLED`)
- **Response (200 OK):** `IncidentListResponse` (`data: IncidentResponse[]`, `count: int`).

---

### `GET /api/incidents/{id}`

Retrieves complete incident record and audit event timeline by UUID.

- **Auth:** None (Public / Scoped)
- **Response (200 OK):** `IncidentSingleResponse`
- **Errors:** `404 Not Found` (`INCIDENT_NOT_FOUND`).

---

### `PATCH /api/incidents/{id}/status`

Transitions an incident along its controlled lifecycle.

- **Auth:** Verified JWT (`CITIZEN` can only trigger `CANCELLED`; `AUTHORITY` / `SYSTEM` can trigger all transitions).
- **Request Payload:**
  ```json
  {
    "status": "VERIFIED",
    "actor": "dispatcher_alok"
  }
  ```
- **Response (200 OK):** `IncidentSingleResponse` with updated status and appended audit event.
- **Socket Emission:** `incident.response_state_changed` $\rightarrow$ `authorities` + `incident:{id}` rooms.
- **Errors:**
  - `400 Bad Request` (`INVALID_TRANSITION`): Illegal status jump or mutation on terminal state.
  - `403 Forbidden` (`FORBIDDEN`): Citizen actor attempting operational verification/resolution.
  - `404 Not Found` (`INCIDENT_NOT_FOUND`).

---

## 4. Assignment Domain API (`/api/assignments`)

### `POST /api/assignments`

Authoritatively creates a first-class assignment linking an emergency incident to a responder unit. Synchronously updates linked responder and incident records.

- **Auth:** `AUTHORITY` or `SYSTEM` role required.
- **Request Payload:**
  ```json
  {
    "incident_id": "909ec355-6bcf-46d4-a035-71fa2e022f42",
    "responder_id": "resp-101",
    "status": "ASSIGNED",
    "assigned_by": "dispatcher_alok",
    "score": 94.0,
    "score_breakdown": {
      "capability": 30.0,
      "availability": 20.0,
      "distance": 14.0,
      "eta": 12.0,
      "workload": 10.0,
      "severity_fit": 8.0
    },
    "assignment_reason": "Optimal flood boat capability match with direct waterway access corridor"
  }
  ```
- **Response (201 Created):**
  ```json
  {
    "success": true,
    "data": {
      "id": "c7a8b411-e40f-48d6-953e-862ad9b06822",
      "incident_id": "909ec355-6bcf-46d4-a035-71fa2e022f42",
      "responder_id": "resp-101",
      "status": "ASSIGNED",
      "assigned_by": "dispatcher_alok",
      "assigned_at": "2026-08-27T12:05:00+00:00",
      "accepted_at": "2026-08-27T12:05:00+00:00",
      "started_at": null,
      "nearby_at": null,
      "arrived_at": null,
      "completed_at": null,
      "cancelled_at": null,
      "score": 94.0,
      "score_breakdown": {
        "capability": 30.0,
        "availability": 20.0,
        "distance": 14.0,
        "eta": 12.0,
        "workload": 10.0,
        "severity_fit": 8.0
      },
      "assignment_reason": "Optimal flood boat capability match with direct waterway access corridor",
      "created_at": "2026-08-27T12:05:00+00:00",
      "updated_at": "2026-08-27T12:05:00+00:00"
    }
  }
  ```
- **Socket Emissions:** `assignment.created` and `incident.response_state_changed` $\rightarrow$ `authorities` + `incident:{id}` rooms.
- **Errors:**
  - `400 Bad Request` (`RESPONDER_ALREADY_ASSIGNED`): Unit already assigned to an active mission.
  - `400 Bad Request` (`INCIDENT_ALREADY_ASSIGNED`): Incident already has an active unit assigned.
  - `400 Bad Request` (`RESPONDER_OFFLINE`): Unit is marked OFFLINE.
  - `400 Bad Request` (`TERMINAL_INCIDENT`): Cannot assign to resolved/cancelled incident.
  - `403 Forbidden`: Citizens cannot create assignments.
  - `404 Not Found`: Incident or responder does not exist.

---

### `PATCH /api/assignments/{id}/status`

Transitions assignment along its milestone progression (`PROPOSED` $\rightarrow$ `ASSIGNED` $\rightarrow$ `EN_ROUTE` $\rightarrow$ `NEARBY` $\rightarrow$ `ON_SCENE` $\rightarrow$ `COMPLETED` / `CANCELLED`).

- **Auth:** `AUTHORITY`, `RESPONDER` (own mission), or `SYSTEM`.
- **Request Payload:**
  ```json
  {
    "status": "EN_ROUTE",
    "actor": "NDRF Rescue Unit 4",
    "notes": "Vessel navigating flood bypass corridor"
  }
  ```
- **Response (200 OK):** Updated `AssignmentResponse` with updated timestamp (`started_at`, `nearby_at`, etc.).
- **Socket Emission:** `assignment.status_changed` $\rightarrow$ `authorities` + `incident:{id}` rooms.
- **Errors:** `400 Bad Request` (`INVALID_TRANSITION`), `403 Forbidden`, `404 Not Found`.

---

## 5. Responder Fleet API (`/api/responders`)

### `GET /api/responders`

Lists all active disaster response craft, ambulances, and specialized teams.

- **Auth:** None (Public / Command Console)
- **Response (200 OK):** `ResponderListResponse` (`data: ResponderResponse[]`, `count: int`).

---

### `GET /api/responders/candidates/{incident_id}`

Computes deterministic 6-factor recommendation scores for all eligible fleet craft against an emergency incident.

- **Auth:** `AUTHORITY` or `SYSTEM` role.
- **Query Params:** `include_routes` (`true` to enrich top units with OSRM geometries).
- **Response (200 OK):**
  ```json
  {
    "incident_id": "909ec355-6bcf-46d4-a035-71fa2e022f42",
    "allocation_status": "RECOMMENDED",
    "message": null,
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
        "distance_km": 0.85,
        "eta_minutes": 4.0,
        "eta_formatted": "4 min",
        "match_score": 94,
        "match_reason": "Specialized Inflatable Flood Rescue Watercraft",
        "is_recommended": true,
        "rank": 1,
        "explanation": {
          "headline": "★ PRIMARY RECOMMENDATION — NDRF Rescue Unit 4",
          "positive_factors": [
            "✓ Specialized Inflatable Flood Rescue Watercraft (100% profile match)",
            "✓ Available immediately with zero active commitments",
            "✓ Rapid response transit (~4 min / 0.9 km)",
            "✓ Full crew availability (0/8 load)",
            "✓ High crew capacity (≥6) optimized for Critical Life Threat"
          ],
          "negative_factors": [],
          "breakdown": {
            "final_score": 94,
            "capability_score": 30,
            "availability_score": 20,
            "distance_score": 14,
            "eta_score": 13,
            "workload_score": 10,
            "severity_fit_score": 7,
            "max_weights": {
              "capability": 30,
              "availability": 20,
              "distance": 15,
              "eta": 15,
              "workload": 10,
              "severity_fit": 10
            }
          }
        },
        "route_geometry": [
          [22.574, 88.372],
          [22.573, 88.368],
          [22.5726, 88.3639]
        ],
        "route_status": "OPTIMAL_OSRM"
      }
    ],
    "count": 1
  }
  ```

---

### `POST /api/responders/{id}/location`

Updates GPS telemetry coordinates for an active responder unit.

- **Auth:** `RESPONDER` (own unit), `AUTHORITY`, or `SYSTEM`.
- **Request Payload:** `{"latitude": 22.5735, "longitude": 88.3680}`
- **Response (200 OK):** `ResponderSingleResponse`
- **Socket Emission:** `responder.location_updated` $\rightarrow$ `authorities` + `incident:{assigned_id}`.

---

## 6. AI Triage & Verification API (`/api/triage`)

### `POST /api/triage/analyze/{incident_id}`

Triggers multi-tier AI evaluation (Gemini 2.5 $\rightarrow$ Groq Llama-3.3 $\rightarrow$ Heuristics) on an incident.

- **Auth:** `AUTHORITY` or `SYSTEM` role.
- **Response (200 OK):**
  ```json
  {
    "data": {
      "incident_type": "flood",
      "severity": "CRITICAL",
      "severity_level": 4,
      "confidence": 0.94,
      "hazard_type": "Flash Flood & Surge Inundation",
      "affected_people": 3,
      "key_signals": ["SOS beacon active", "water entering ground floor", "terrace refuge"],
      "recommended_capability": "FLOOD_BOAT",
      "priority_reasoning": "High water velocity detected. Submerged ground floor structure with 3 individuals trapped on terrace.",
      "uncertainty_flags": [],
      "damage_type": "Structural Inundation",
      "hazard_detected": "Rising Floodwater",
      "water_depth_estimate": "1.4m Rising",
      "image_assessment_hint": null,
      "provider": "GeminiProvider",
      "model": "gemini-2.5-flash",
      "evaluated_at": "2026-08-27T12:01:00+00:00",
      "ai_state": "AVAILABLE",
      "needs_review": false,
      "review_status": "PENDING"
    }
  }
  ```
- **Socket Emission:** `incident.triage_updated` $\rightarrow$ `authorities` + `incident:{id}`.

---

### `POST /api/triage/verify/{incident_id}`

Operator verifies and approves the AI assessment, transitioning the incident to `VERIFIED`.

- **Auth:** `AUTHORITY` role required.
- **Request Payload:**
  ```json
  {
    "actor": "dispatcher_alok",
    "verified_severity": "CRITICAL",
    "verified_capability": "FLOOD_BOAT",
    "operator_notes": "Ground reports confirm flood level exceeds 1.2m"
  }
  ```
- **Response (200 OK):** `IncidentSingleResponse` (status: `VERIFIED`).
- **Socket Emissions:** `incident.triage_verified` and `incident.response_state_changed`.

---

## 7. Shelter Logistics API (`/api/shelters`)

### `GET /api/shelters`

Lists all registered evacuation shelters, bed occupancies, and supply statuses.

- **Auth:** None (Public)
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
        "occupancy_rate": "30%",
        "supplies_status": "HIGH (3 days rations, generator backup)",
        "status": "OPEN",
        "amenities": "[\"Medical Aid\", \"Clean Water\", \"Power Backup\", \"Childcare\"]",
        "is_active": true,
        "created_at": "2026-08-27T10:00:00+00:00",
        "updated_at": "2026-08-27T10:00:00+00:00"
      }
    ],
    "count": 3
  }
  ```

---

### `PATCH /api/shelters/{id}`

Updates bed intake, occupancy percentage, or supplies readiness status.

- **Auth:** `AUTHORITY` or `SYSTEM` role.
- **Socket Emission:** `shelter.updated` $\rightarrow$ `authorities`.

---

## 8. Routing & Navigational Geometry API (`/api/routes`)

### `GET /api/routes` / `GET /api/routing/route`

Calculates real-world distance, duration, ETA, and coordinate arrays between origin and destination coordinates using OSRM with automatic resilient fallback corridors.

- **Auth:** None (Public / System)
- **Query Params:** `origin_lat`, `origin_lng`, `dest_lat`, `dest_lng`, `profile` (`driving` / `walking` / `boat`)
- **Response (200 OK):**
  ```json
  {
    "success": true,
    "data": {
      "distance_km": 4.2,
      "distance_meters": 4200.5,
      "duration_seconds": 540.0,
      "duration_minutes": 9.0,
      "eta_seconds": 540.0,
      "eta_formatted": "9 min",
      "coordinates": [
        [22.5726, 88.3639],
        [22.575, 88.39],
        [22.58, 88.435]
      ],
      "geometry": [
        [22.5726, 88.3639],
        [22.575, 88.39],
        [22.58, 88.435]
      ],
      "profile": "driving",
      "status": "OPTIMAL_OSRM",
      "summary": "Sector V Expressway",
      "provider": "osrm",
      "calculated_at": "2026-08-27T12:00:00+00:00",
      "is_fallback": false
    }
  }
  ```

---

## 9. Disaster Intelligence & Hazards API (`/api/hazards`)

### `GET /api/hazards`

Retrieves normalized disaster signals from Open-Meteo, USGS, GDACS, and IMD feeds with optional location filtering.

- **Query Params:** `lat`, `lon`, `max_distance_km`
- **Response (200 OK):** `HazardListResponse` (`data: HazardSignal[]`, `count: int`, `source_summary: str`).

### `GET /api/hazards/clusters`

Computes spatial incident clusters to identify high-density disaster epicenters.

- **Response (200 OK):** `IncidentClusterListResponse`.

### `GET /api/situation/summary`

Generates grounded operational situation intelligence summary and active disaster statistics.

- **Response (200 OK):** `SituationSummaryResponse`.

---

## 10. Simulation & Fleet Controls (`/api/simulation`)

### `POST /api/simulation/step`

Advances simulated responder movement by one telemetry waypoint along the mission corridor.

- **Auth:** `AUTHORITY` or `SYSTEM` role.
- **Request Payload:**
  ```json
  {
    "responder_id": "resp-101",
    "latitude": 22.5735,
    "longitude": 88.368,
    "step_index": 3,
    "total_steps": 15,
    "target_status": "EN_ROUTE"
  }
  ```
- **Socket Emissions:** `responder.location_updated`, `responder.status_changed`, `assignment.status_changed`.

### `POST /api/simulation/reset-fleet`

Resets all responder coordinates and statuses to baseline seed values.

- **Auth:** `AUTHORITY` or `SYSTEM` role.

---

## 11. Authentication API (`/api/auth`)

### `POST /api/auth/token`

Issues a cryptographically signed HMAC-SHA256 JWT access token for a role.

- **Request Payload:** `{"role": "AUTHORITY", "name": "Duty Dispatcher"}`
- **Response (200 OK):**
  ```json
  {
    "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "token_type": "bearer",
    "role": "AUTHORITY",
    "user_id": "authority-a1b2c3d4",
    "name": "Duty Dispatcher",
    "expires_in": 86400
  }
  ```

### `GET /api/auth/me`

Retrieves verified identity, claims, and permission list for the calling token.

- **Auth:** Bearer Token.
- **Response (200 OK):** `UserProfileResponse`.
