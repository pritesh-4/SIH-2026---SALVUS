# API.md - API Specifications (PLANNED)

All endpoints listed below are planned for the Express backend and must be implemented following these schemas. No routes are currently implemented.

---

## 1. Authentication Endpoints (Supabase Managed)

Authentication is handled directly via Supabase client SDKs. The frontend signs in and attaches the JWT header where required.

---

## 2. Citizens & Incidents API

### `POST /api/incidents/sos` (PLANNED)

Triggers an emergency SOS.

- **Authentication:** Optional (anonymous report allowed if context is urgent).
- **Request Payload:**
  ```json
  {
    "latitude": 37.7749,
    "longitude": -122.4194,
    "citizen_phone": "+15550199",
    "raw_text": "Water entering my ground floor. Trapped inside with family."
  }
  ```
- **Response (Success - 201 Created):**
  ```json
  {
    "incident_id": "8a7b3c2d-9e0f-4a3b-2c1d-0e9f8a7b6c5d",
    "status": "active",
    "category": "Flood",
    "severity": "High",
    "created_at": "2026-08-21T00:46:14Z"
  }
  ```
- **Errors:**
  - `400 Bad Request`: Missing lat/lng coordinates.
  - `503 Service Unavailable`: AI processing failed and fallback failed.

### `GET /api/incidents` (PLANNED)

Fetch active incidents.

- **Authentication:** Required (Authority Role JWT).
- **Response (Success - 200 OK):**
  ```json
  [
    {
      "incident_id": "8a7b3c2d-...",
      "latitude": 37.7749,
      "longitude": -122.4194,
      "category": "Flood",
      "severity": "High",
      "status": "active",
      "summary": "Water entering ground floor, family trapped."
    }
  ]
  ```

---

## 3. Responder API

### `POST /api/incidents/:id/assign` (PLANNED)

Manually override and assign a responder to an active incident.

- **Authentication:** Required (Authority Role JWT).
- **Request Payload:**
  ```json
  {
    "responder_id": "3c4d5e6f-..."
  }
  ```
- **Response (Success - 200 OK):**
  ```json
  {
    "assignment_id": "7b8c9d0e-...",
    "status": "en_route",
    "eta": "14 minutes"
  }
  ```
- **Side Effects:** Triggers a realtime socket push to both Citizen App and Responder clients indicating dispatch status change.
