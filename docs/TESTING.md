# TESTING.md — Quality Verification & Test Benchmarks

This document details the automated testing suites, quality gates, test execution instructions, and verified benchmark metrics for Salvus across both backend and frontend codebases.

---

## 1. Quality Assurance Suite & Commands

### 1.1 Backend Quality & Test Commands:

```bash
# Navigate to backend directory
cd backend

# 1. Run complete Pytest test suite (204 tests)
pytest -v

# 2. Run Ruff Linter
ruff check app tests

# 3. Check Python code formatting (Ruff)
ruff format --check app tests
```

### 1.2 Frontend Quality & Build Commands:

```bash
# In repository root:

# 1. ESLint syntax and code quality verification
npm run lint

# 2. Automated code formatting check (Prettier)
npm run format:check

# 3. Automated code formatting auto-fix
npm run format

# 4. Production build compilation (Vite)
npm run build
```

---

## 2. Verified Test Suite Breakdown (204 Tests)

The backend test suite executes 204 automated tests across 19 specialized modules with 100% passing status:

| Test Module                                                                             | Test Count | Domain Coverage                                                                                                            |
| :-------------------------------------------------------------------------------------- | :--------: | :------------------------------------------------------------------------------------------------------------------------- |
| [`test_state_machine.py`](../backend/tests/test_state_machine.py)                       |   **64**   | Exhaustive finite state machine matrix, forward transitions, terminal state immutability, role permissions.                |
| [`test_security_hardening.py`](../backend/tests/test_security_hardening.py)             |   **11**   | HMAC-SHA256 JWT minting, verification, expiration, RBAC dependency guards, middleware headers, payload limits.             |
| [`test_allocation_engine.py`](../backend/tests/test_allocation_engine.py)               |   **10**   | 6-factor deterministic scoring, normalization formulas, explainable justifications, multi-level tie-breaking.              |
| [`test_candidate_generation.py`](../backend/tests/test_candidate_generation.py)         |   **11**   | Responder eligibility partitioning, capability hard filtering, exclusion reasons.                                          |
| [`test_routing_service.py`](../backend/tests/test_routing_service.py)                   |   **14**   | OSRM integration, profiles, 5-minute TTL cache hit/miss, 15-waypoint fallback vector corridor, Haversine accuracy.         |
| [`test_ai_triage.py`](../backend/tests/test_ai_triage.py)                               |   **14**   | PII sanitization regex, strict Pydantic `LLMTriageOutputSchema` validation, Gemini/Groq providers, fallback to heuristics. |
| [`test_assignments_api.py`](../backend/tests/test_assignments_api.py)                   |   **11**   | Assignment REST API, single active assignment constraints, score storage, milestone timestamps.                            |
| [`test_incident_api.py`](../backend/tests/test_incident_api.py)                         |   **14**   | Distress beacon ingestion, 4-second deduplication window, status filtering, audit event creation.                          |
| [`test_async_intelligence.py`](../backend/tests/test_async_intelligence.py)             |   **10**   | Async background worker tasks, telemetry logging, SHA-256 triage hash caching.                                             |
| [`test_phase5_intelligence.py`](../backend/tests/test_phase5_intelligence.py)           |   **9**    | Grounded situation briefing synthesis, active incident metrics.                                                            |
| [`test_responders_api.py`](../backend/tests/test_responders_api.py)                     |   **8**    | Fleet inventory, GPS telemetry updates, manual lifecycle overrides.                                                        |
| [`test_shelters_api.py`](../backend/tests/test_shelters_api.py)                         |   **6**    | Shelter logistics, bed intake adjustments, occupancy percentage derivations.                                               |
| [`test_production_deployment.py`](../backend/tests/test_production_deployment.py)       |   **6**    | Render health checks (`/health`), root identification (`/`), CORS origin parsing.                                          |
| [`test_disaster_intelligence.py`](../backend/tests/test_disaster_intelligence.py)       |   **5**    | Normalized hazard feeds (Open-Meteo, USGS), spatial distance filters.                                                      |
| [`test_realtime_assignment_sync.py`](../backend/tests/test_realtime_assignment_sync.py) |   **4**    | Socket.IO assignment event broadcast to `authorities` and `incident:{id}` rooms.                                           |
| [`test_assignment_flow.py`](../backend/tests/test_assignment_flow.py)                   |   **4**    | Transactional consistency across incident, assignment, and responder state commits.                                        |
| [`test_realtime_dispatch_loop.py`](../backend/tests/test_realtime_dispatch_loop.py)     |   **3**    | End-to-end realtime dispatch cycle from creation to verification and resolution.                                           |
| **TOTAL**                                                                               |  **204**   | **100% Passed (0 Failures, 0 Errors, 0 Regressions)**                                                                      |

---

## 3. Automated Realtime Resilience E2E Test (`test-realtime-loop.mjs`)

Salvus includes a standalone Node.js automated test script (`scripts/test-realtime-loop.mjs`) to verify bi-directional Socket.IO event flow:

```bash
node scripts/test-realtime-loop.mjs
```

### 12-Step Verification Sequence:

1. **Authority Connection:** Socket.IO connects and authenticates to `"authorities"` room.
2. **Citizen Beacon Ingestion:** `POST /api/incidents` transmits a live SOS distress beacon.
3. **Live WebSocket Reception:** Authority dashboard receives `incident.created` event with zero latency.
4. **Citizen Room Isolation:** Citizen socket subscribes to `incident:{id}`.
5. **AI Triage Ingestion:** `POST /api/triage/analyze/{id}` triggers assessment.
6. **Realtime Triage Sync:** Both Authority and Citizen receive `incident.triage_updated`.
7. **Dispatcher Verification:** Authority approves assessment via `POST /api/triage/verify/{id}`.
8. **Realtime Verification Sync:** Both windows receive `incident.response_state_changed` (`VERIFIED`).
9. **Deterministic Dispatch:** Authority creates assignment via `POST /api/assignments`.
10. **Realtime Mission Sync:** Citizen receives `assignment.created` with craft class and VHF channel.
11. **Safe Resolution:** Authority completes mission $\rightarrow$ `RESOLVED`.
12. **State Machine Terminal Guard:** Rejects illegal mutation attempts on the closed incident (`400 Bad Request`).

---

## 4. Multi-Window Failure & Recovery Runbook

To manually verify resilience in browser testing:

1. **Window A (Citizen Portal):** Open `http://localhost:5173/citizen`. Confirm location accuracy (`High Precision ±4m`), tap **SEND SOS**, hold to confirm.
2. **Window B (Authority Center):** Open `http://localhost:5173/authority`. Observe immediate appearance in the queue and Leaflet tactical map pin.
3. **Simulate Connection Failure:** In Window A or B, open `🛠️ DEV DEMO CONTROLS` and click **📶 Drop Socket (5s)**.
   - Observe connection indicator switches to `RECONNECTING...`.
   - Citizen screen displays reassuring banner: _"Emergency request remains active in dispatcher queue."_
4. **Automatic Reconnection:**
   - Socket restores, indicator flips back to `LIVE`.
   - Active rooms are automatically re-joined.
   - Any state transitions made during the disconnect gap catch up immediately.
5. **Resolve Mission:** Authority verifies and resolves the incident. Citizen interface transitions cleanly to the completed evacuation debriefing.
