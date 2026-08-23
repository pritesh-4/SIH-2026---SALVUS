# REALTIME.md - Real-time State & WebSockets

This document describes the real-time communication layer in Salvus for live incident synchronization across citizen clients and authority dashboards.

---

## 1. Socket.IO Architecture (IMPLEMENTED ✅)

The backend exposes an asynchronous Socket.IO engine (`python-socketio`) running on the same ASGI server alongside FastAPI:

- **Server Instance:** `app.realtime.socket_manager.sio`
- **Transport:** Async ASGI with WebSockets + Long-Polling fallback
- **CORS:** Configured for cross-origin local and cloud clients

---

## 2. Channels, Rooms & Events

### Room: `authorities` (IMPLEMENTED ✅)

- **Subscribers:** Emergency dispatchers, coordinators, command center dashboards.
- **Events Emitted:**
  - `incident:new`: Emitted whenever a citizen submits a new SOS beacon or hazard report.
    ```json
    {
      "incident_id": "e5cffddc-318c-4a1f-b69e-ba4bfc5e0faa",
      "ticket_id": "SV-2048",
      "type": "flood",
      "severity": "CRITICAL",
      "latitude": 22.5726,
      "longitude": 88.3639,
      "is_sos": true,
      "status": "NEW",
      "created_at": "2026-08-23T12:59:26.520142+00:00"
    }
    ```
  - `incident:status_changed`: Emitted when any incident advances its lifecycle state.

---

### Room: `incident:{incident_id}` (IMPLEMENTED ✅)

- **Subscribers:** The stranded citizen who created the ticket and assigned responders.
- **Events Emitted:**
  - `incident:status_changed`: Live progression update (e.g. `NEW` $\rightarrow$ `TRIAGE_PENDING` $\rightarrow$ `VERIFIED` $\rightarrow$ `RESOLVED`).

---

## 3. High-Frequency Telemetry Ingestion (PLANNED 🔮)

Planned for responder tracking:

```
 Responder GPS updates (5s Interval)
   │
   ├── Sockets ingest telemetry ping
   ├── Push coordinates to `authorities` room (updates admin map)
   ├── Push to `incident:<id>` room (updates citizen rescue radar)
   └── Batch write to DB every 15s
```
