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

Creates a new emergency SOS beacon or citizen hazard report.

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
- **Response (201 Created):**
  ```json
  {
    "success": true,
    "data": {
      "id": "e5cffddc-318c-4a1f-b69e-ba4bfc5e0faa",
      "ticket_id": "SV-2048",
      "type": "flood",
      "severity": "CRITICAL",
      "description": "Water entering ground floor rapidly. Family of 3 trapped on balcony.",
      "reporter_name": "Aditi Roy",
      "reporter_phone": "+91 98301 24890",
      "latitude": 22.5726,
      "longitude": 88.3639,
      "affected_count": 3,
      "is_sos": true,
      "status": "NEW",
      "created_at": "2026-08-23T12:59:26.520142+00:00",
      "updated_at": "2026-08-23T12:59:26.520142+00:00",
      "events": [
        {
          "id": "a5549cfb-072f-4d23-86c5-92c3f2b0ce70",
          "incident_id": "e5cffddc-318c-4a1f-b69e-ba4bfc5e0faa",
          "event_type": "CREATED",
          "previous_status": null,
          "new_status": "NEW",
          "actor": "citizen",
          "metadata": null,
          "created_at": "2026-08-23T12:59:26.520142+00:00"
        }
      ]
    }
  }
  ```
- **Error Responses:**
  - `422 Unprocessable Entity`: Validation failure on coordinates, type, or missing required fields.

---

### `GET /api/incidents`

Lists all incidents in descending order of creation (newest first).

- **Authentication:** None (Public / Command Console)
- **Response (200 OK):**
  ```json
  {
    "success": true,
    "data": [
      {
        "id": "e5cffddc-318c-4a1f-b69e-ba4bfc5e0faa",
        "ticket_id": "SV-2048",
        "type": "flood",
        "severity": "CRITICAL",
        "description": "Water entering ground floor rapidly.",
        "reporter_name": "Aditi Roy",
        "reporter_phone": "+91 98301 24890",
        "latitude": 22.5726,
        "longitude": 88.3639,
        "affected_count": 3,
        "is_sos": true,
        "status": "NEW",
        "created_at": "2026-08-23T12:59:26+00:00",
        "updated_at": "2026-08-23T12:59:26+00:00",
        "events": [...]
      }
    ],
    "count": 1
  }
  ```

---

### `GET /api/incidents/{id}`

Retrieves a single incident by its UUID along with its complete audit event history.

- **Authentication:** None
- **Response (200 OK):** Single `IncidentResponse` object.
- **Error Responses:**
  - `404 Not Found`: Incident UUID does not exist.

---

### `PATCH /api/incidents/{id}/status`

Transitions an incident to a new status governed by the state machine (`NEW` $\rightarrow$ `TRIAGE_PENDING` $\rightarrow$ `VERIFIED` $\rightarrow$ `RESOLVED` / `CANCELLED`).

- **Request Payload:**
  ```json
  {
    "status": "TRIAGE_PENDING",
    "actor": "ai_triage_engine"
  }
  ```
- **Response (200 OK):** Updated `IncidentResponse` with new audit event appended.
- **Error Responses:**
  - `400 Bad Request`: Invalid state transition attempt (e.g. skipping steps or mutating terminal state).
  - `404 Not Found`: Incident does not exist.

---

## 3. Responder & Allocation API (PLANNED 🔮)

### `POST /api/incidents/{id}/assign` (PLANNED)

Assigns a rescue responder unit to an active incident.

- **Request Payload:**
  ```json
  {
    "responder_id": "3c4d5e6f-4a1b-4c2d-9e0f-8a7b6c5d4e3f"
  }
  ```
- **Response (200 OK):**
  ```json
  {
    "assignment_id": "7b8c9d0e-2a1b-4c3d-8e9f-0a1b2c3d4e5f",
    "status": "en_route",
    "eta_minutes": 14
  }
  ```
