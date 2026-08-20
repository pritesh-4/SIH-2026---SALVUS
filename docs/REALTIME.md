# REALTIME.md - Real-time State & WebSockets (PLANNED)

Real-time synchronization across the command console and active citizen pages is driven by Socket.io and Supabase Realtime triggers.

---

## 1. Socket.io Channels & Rooms

### Room: `authorities`

- **Subscribers:** Active dispatchers/dashboard operators.
- **Payloads Broadcasted:**
  - `incident:new` -> Emits structured triage payload when citizen triggers SOS.
  - `responder:telemetry` -> Emits GPS updates of en route units.
  - `shelter:occupancy_update` -> Emits vacancy alerts.

### Room: `incident:<incident_id>`

- **Subscribers:** Stranded citizen who submitted SOS, assigned responders.
- **Payloads Broadcasted:**
  - `assignment:status_change` -> Broadcasts when dispatcher assigns crew.
  - `responder:location` -> Provides real-time coordinates of assigned responder.

---

## 2. Telemetry Ingestion Flow

```
 Responder GPS updates
   │
   ├── Emits client-side ping (Interval: 5s)
   │
   ├── Socket server picks up telemetry
   │
   ├── 1. Push coordinates to `authorities` room (updates admin maps)
   │   2. Push to `incident:<incident_id>` room (updates citizen map)
   │   3. Buffer location in server memory
   │
   └── Batch write to PostgreSQL every 15s (optimizes write rates)
```

---

## 3. Disconnection & Network Failures

- **Local State Buffering:** If the connection drops, client maps preserve the last known coordinate markers.
- **Heartbeats:** Sockets emit an active heartbeat ping every 10 seconds. If missing for 3 consecutive iterations, the dashboard flags the responder status as `'offline'`.
- **Automatic Reconnects:** Reconnect attempts execute exponentially at 1s, 2s, 4s, 8s intervals before failing.
