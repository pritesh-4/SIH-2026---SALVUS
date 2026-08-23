# TESTING.md - Quality Verification & Benchmarks

This document details the quality assurance processes, automated testing commands, and verification criteria enforced in Salvus across both frontend and backend.

---

## 1. Quality Assurance Suite

### Frontend Quality Verification

```bash
# 1. Automated code formatting verification (Prettier)
npm run format:check

# 2. Automated code formatting fix
npm run format

# 3. ESLint syntax and rule verification
npm run lint

# 4. Production build compilation (Vite)
npm run build
```

### Backend Quality Verification

```bash
# Navigate to backend directory
cd backend

# 1. Run Ruff Linter
ruff check app tests

# 2. Check Python code formatting (Ruff)
ruff format --check app tests

# 3. Run Pytest Test Suite
python -m pytest -v
```

---

## 2. Automated Realtime & Resilience E2E Test (`scripts/test-realtime-loop.mjs`)

```bash
node scripts/test-realtime-loop.mjs
```

### Test Verification Matrix (12 Steps):

1. **Authority Connection**: Socket.IO connects & joins `"authorities"` room.
2. **Citizen SOS Creation**: `POST /api/incidents` creates critical beacon.
3. **Live WebSocket Arrival**: Authority dashboard receives `incident:new` with full payload without page reload.
4. **Citizen Room Subscription**: Citizen client subscribes to `incident:{id}`.
5. **Operational Triage**: Authority transitions `NEW` $\rightarrow$ `TRIAGE_PENDING`.
6. **Realtime Triage Sync**: Both Authority and Citizen receive `TRIAGE_PENDING`.
7. **Dispatch Verification**: Authority transitions `TRIAGE_PENDING` $\rightarrow$ `VERIFIED`.
8. **Realtime Verification Sync**: Both Authority and Citizen receive `VERIFIED`.
9. **Safe Resolution**: Authority transitions `VERIFIED` $\rightarrow$ `RESOLVED`.
10. **Realtime Resolution Sync**: Both Authority and Citizen receive `RESOLVED`.
11. **State Machine Terminal Guard**: Rejects illegal mutation on terminal state (`400 Bad Request`).
12. **Hazard Report & Stand-Down**: Tests hazard report lifecycle $\rightarrow$ `CANCELLED`.

---

## 3. Two-Browser Product Failure & Recovery Scenario

1. **Window A (Citizen)**: Open `http://localhost:5173/citizen`, confirm location (accuracy `High Precision ±4m`), trigger SOS.
2. **Window B (Authority)**: Open `http://localhost:5173/authority`, observe instant queue entry & OpenStreetMap pin.
3. **Simulate Connection Outage**: In Authority or Citizen, click `🛠️ DEV TOOLS` $\rightarrow$ `📶 Drop Socket (5s)`.
   - Observe indicator switches to `RECONNECTING...`.
   - In Citizen SOS, observe reassurance banner: _"Emergency request remains active in dispatcher queue."_
4. **Automatic Reconnection**:
   - Connection restores, indicator flips to `LIVE`.
   - Status updates synchronize without requiring a page refresh.
5. **Resolve & Clean Close**:
   - Authority operator verifies and resolves the incident.
   - Citizen view transitions to completed evacuation celebration.
