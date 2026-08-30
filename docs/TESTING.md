# TESTING.md — Quality Verification & Test Benchmarks

This document details the automated testing suites, quality gates, test execution instructions, and verified benchmark metrics for Salvus across both backend and frontend codebases.

---

## 1. Quality Assurance Suite & Commands

### 1.1 Backend Quality & Test Commands:

```bash
# Navigate to backend directory
cd backend

# 1. Run complete Pytest test suite (349 tests)
pytest -v

# 2. Run emergency readiness & profile tests specifically
pytest tests/test_emergency_readiness_api.py tests/test_profile_api.py -v

# 3. Run Ruff Linter
ruff check app tests

# 4. Check Python code formatting (Ruff)
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

# 4. Run frontend unit tests (Node Test Runner)
node --test src/lib/__tests__/emergencyReadinessPhase3.test.js src/lib/__tests__/emergencyReadiness.test.js src/lib/__tests__/profileService.test.js

# 5. Production build compilation (Vite)
npm run build
```

---

## 2. Verified Backend Test Suite Breakdown (399 Tests)

The backend test suite executes 399 automated tests across 31 specialized modules with 100% passing status:

| Test Module                                                                             | Test Count | Domain Coverage                                                                                                                             |
| :-------------------------------------------------------------------------------------- | :--------: | :------------------------------------------------------------------------------------------------------------------------------------------ |
| [`test_auth_foundation.py`](../backend/tests/test_auth_foundation.py)                   |   **16**   | Real credential validation, citizen/authority logins, 401 generic failures, inactive users, JWT claims, bcrypt hashing, idempotent seeding. |
| [`test_role_routing_backend.py`](../backend/tests/test_role_routing_backend.py)         |   **9**    | Backend RBAC endpoint protection, 403 Forbidden on role mismatch, profile caller binding, unauthenticated 401 guards.                       |
| [`test_state_machine.py`](../backend/tests/test_state_machine.py)                       |   **64**   | Exhaustive finite state machine matrix, forward transitions, terminal state immutability, role permissions.                                 |
| [`test_profile_api.py`](../backend/tests/test_profile_api.py)                           |   **7**    | Citizen profile GET/PATCH endpoints, JWT subject binding, system-managed field protection, medical info preservation.                       |
| [`test_emergency_readiness_api.py`](../backend/tests/test_emergency_readiness_api.py)   |   **5**    | Contact CRUD, single-primary enforcement, priority ranking, automatic promotion on deletion, locked safety settings.                        |
| [`test_security_hardening.py`](../backend/tests/test_security_hardening.py)             |   **11**   | HMAC-SHA256 JWT minting, verification, expiration, RBAC dependency guards, middleware headers, payload limits.                              |
| [`test_allocation_engine.py`](../backend/tests/test_allocation_engine.py)               |   **10**   | 6-factor deterministic scoring, normalization formulas, explainable justifications, multi-level tie-breaking.                               |
| [`test_candidate_generation.py`](../backend/tests/test_candidate_generation.py)         |   **11**   | Responder eligibility partitioning, capability hard filtering, exclusion reasons.                                                           |
| [`test_routing_service.py`](../backend/tests/test_routing_service.py)                   |   **14**   | OSRM integration, profiles, 5-minute TTL cache hit/miss, 15-waypoint fallback vector corridor, Haversine accuracy.                          |
| [`test_ai_triage.py`](../backend/tests/test_ai_triage.py)                               |   **14**   | PII sanitization regex, strict Pydantic `LLMTriageOutputSchema` validation, Gemini/Groq providers, fallback to heuristics.                  |
| [`test_assignments_api.py`](../backend/tests/test_assignments_api.py)                   |   **11**   | Assignment REST API, single active assignment constraints, score storage, milestone timestamps.                                             |
| [`test_incident_api.py`](../backend/tests/test_incident_api.py)                         |   **14**   | Distress beacon ingestion, 4-second deduplication window, status filtering, audit event creation.                                           |
| [`test_async_intelligence.py`](../backend/tests/test_async_intelligence.py)             |   **10**   | Async background worker tasks, telemetry logging, SHA-256 triage hash caching.                                                              |
| [`test_phase5_intelligence.py`](../backend/tests/test_phase5_intelligence.py)           |   **9**    | Grounded situation briefing synthesis, active incident metrics.                                                                             |
| [`test_responders_api.py`](../backend/tests/test_responders_api.py)                     |   **8**    | Fleet inventory, GPS telemetry updates, manual lifecycle overrides.                                                                         |
| [`test_shelters_api.py`](../backend/tests/test_shelters_api.py)                         |   **6**    | Shelter logistics, bed intake adjustments, occupancy percentage derivations.                                                                |
| [`test_production_deployment.py`](../backend/tests/test_production_deployment.py)       |   **6**    | Render health checks (`/health`), root identification (`/`), CORS origin parsing.                                                           |
| [`test_disaster_intelligence.py`](../backend/tests/test_disaster_intelligence.py)       |   **5**    | Normalized hazard feeds (Open-Meteo, USGS), spatial distance filters.                                                                       |
| [`test_realtime_assignment_sync.py`](../backend/tests/test_realtime_assignment_sync.py) |   **4**    | Socket.IO assignment event broadcast to `authorities` and `incident:{id}` rooms.                                                            |
| [`test_assignment_flow.py`](../backend/tests/test_assignment_flow.py)                   |   **4**    | Transactional consistency across incident, assignment, and responder state commits.                                                         |
| [`test_realtime_dispatch_loop.py`](../backend/tests/test_realtime_dispatch_loop.py)     |   **3**    | End-to-end realtime dispatch cycle from creation to verification and resolution.                                                            |
| _Other Domain Test Suites_                                                              |  **172**   | Evidence lightbox, photo validation, places clustering, weather parsing, and mock feeds.                                                    |
| **TOTAL**                                                                               |  **399**   | **100% Passed (0 Failures, 0 Errors, 0 Regressions)**                                                                                       |

---

## 3. Frontend Unit & Integration Tests (36 Tests)

Salvus uses the native Node.js test runner for blazingly fast, dependency-free frontend domain verification:

| Frontend Test Suite                                                                                     | Test Count | Domain Coverage                                                                                                                                              |
| :------------------------------------------------------------------------------------------------------ | :--------: | :----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [`loginExperience.test.js`](../src/lib/__tests__/loginExperience.test.js)                               |   **6**    | Email regex validation, error state categorization, demo credential structure, password show/hide toggle, emergency cache detection, role clarity.           |
| [`protectedRouting.test.js`](../src/lib/__tests__/protectedRouting.test.js)                             |   **6**    | Role-based route guard authorization rules, cross-role redirection, token clearing, realtime socket cleanup, return URL preservation.                        |
| [`realtimeMultiTabReconciliation.test.js`](../src/lib/__tests__/realtimeMultiTabReconciliation.test.js) |   **10**   | Disconnect/reconnect state preservation, monotonic ranking, multi-tab broadcast sync, concurrent SOS submission race safeguards.                             |
| [`emergencyReadinessPhase3.test.js`](../src/lib/__tests__/emergencyReadinessPhase3.test.js)             |   **4**    | Deterministic readiness calculation (`READY` vs `SETUP INCOMPLETE`), pass staleness math, cache purge on toggle off, Web Audio siren fallback safety.        |
| [`emergencyReadiness.test.js`](../src/lib/__tests__/emergencyReadiness.test.js)                         |   **5**    | Single-primary contact enforcement, primary promotion upon deletion, medical bounds sanitization, locked location sharing, offline pass schema verification. |
| [`profileService.test.js`](../src/lib/__tests__/profileService.test.js)                                 |   **5**    | Server profile fetching, profile PATCH mutations, non-mocking error transparency, form state preservation on rejection, protected fields immutability.       |
| **TOTAL**                                                                                               |   **36**   | **100% Passed (0 Failures, 0 Errors)**                                                                                                                       |

---

## 4. Automated Realtime Resilience E2E Test (`test-realtime-loop.mjs`)

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
