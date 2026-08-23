# REALTIME.md - Real-time State & WebSockets

This document describes the real-time communication layer in Salvus for live incident synchronization across citizen clients and authority dashboards.

---

## 1. Socket.IO Architecture (IMPLEMENTED ✅)

The backend exposes an asynchronous Socket.IO engine (`python-socketio`) running on the same ASGI server alongside FastAPI:

- **Server Instance:** `app.realtime.socket_manager.sio`
- **Transport:** Async ASGI with WebSockets + Long-Polling fallback
- **Frontend Client:** `src/lib/realtime/socket.js` (Singleton `socket.io-client` with auto-reconnection and room management)

---

## 2. Event Ordering Protection & Out-of-Order Guards

To prevent network latency or replayed packets from regressing UI state (e.g. `RESOLVED` regressing to `VERIFIED`), both client and backend enforce lifecycle status ranking:

$$\text{NEW (1)} \rightarrow \text{TRIAGE\_PENDING (2)} \rightarrow \text{VERIFIED (3)} \rightarrow \text{RESOLVED (4)} \text{ and } \text{CANCELLED (4)}$$

If an incoming WebSocket event arrives with a numeric rank lower than the incident's current local state, the packet is ignored by the state updater with an operational log notice.

---

## 3. Duplicate Incident Protection & Idempotency

1. **Client Submission Locking:** Submit buttons are immediately disabled and switch to `Transmitting Report...` upon first tap.
2. **Draft Auto-Saving:** Citizen form inputs are preserved in `sessionStorage` (`salvus_draft_incident_report`) to prevent data loss on accidental navigation or network drops.
3. **Backend Deduplication Window:** `create_incident` checks if an identical report (`type`, `description`, `latitude`, `longitude`) was logged within the preceding 4 seconds; if detected, the existing incident is returned without duplicating database records.

---

## 4. Reconnect State Recovery

When connection drops and recovers:

1. `onSocketStatusChange` transitions from `CONNECTED` $\rightarrow$ `RECONNECTING` $\rightarrow$ `CONNECTED`.
2. Socket client re-emits room joins for all active subscriptions (`authorities`, `incident:{id}`).
3. The dashboard executes a silent background refetch (`refetch(true)`) to synchronize any missed status transitions during the disconnect gap.
