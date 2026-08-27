# ROADMAP.md — Development Milestones & Strategic Roadmap

This document tracks completed engineering deliverables, current operational focus areas, upcoming architectural upgrades, and long-term future horizons for Salvus.

---

## 1. Roadmap Progression & Status Overview

```
[Phase 1: Frontend V1.0 Foundation] ────────► COMPLETED & VALIDATED ✅
[Phase 2: Realtime & Async Intelligence] ───► COMPLETED & VALIDATED ✅
[Phase 3: Authority Domain Refactor] ───────► COMPLETED & VALIDATED ✅
[Phase 5: Security Hardening & Allocation] ─► COMPLETED & VALIDATED ✅
[Current Focus: Master Docs & Deployment] ──► ACTIVE EXECUTION 🚀
[Phase 6: PostgreSQL / PostGIS Migration] ──► NEXT PHASE ⏳
[Phase 7: Satellite Mesh & Native Mobile] ──► FUTURE HORIZONS 🔮
```

---

## 2. Completed Milestones (Validated in Codebase)

### Phase 1: Frontend V1.0 Foundation ✅

- [x] **Calm Intelligence Design System:** High-contrast dark theme, 85–90% neutral slate budget (`#080C12`), strictly semantic tokens (Red = Critical, Amber = Triage, Blue = Active, Green = Safe).
- [x] **Citizen Safety Console (`/citizen`):**
  - [x] Citizen Home with 2-second safety status and active advisory stream.
  - [x] In-app 3-step hazard reporting modal with GPS coordinates and deduplication locking.
  - [x] Situational Leaflet map with flood hydro-contours and in-app shelter safe route guidance.
  - [x] Categorized advisory feed with Critical, Warning, and Watch filters.
  - [x] Emergency Profile with verified identity, medical passport, and siren testing.
- [x] **8-State Progressive Emergency Journey (`/citizen/emergency`):**
  - [x] Full state lifecycle (`SOS_ACTIVE` $\rightarrow$ `TRIAGING` $\rightarrow$ `VERIFIED` $\rightarrow$ `ASSIGNED` $\rightarrow$ `EN_ROUTE` $\rightarrow$ `NEARBY` $\rightarrow$ `ON_SCENE` $\rightarrow$ `RESOLVED`).
  - [x] Tactical Rescue Radar with animated vessel telemetry and dynamic ETA countdown.
  - [x] Urgent proximity signaling guidance (<100m) with torch/whistle visual cues.
  - [x] Safeguarded cancellation confirmation with instant re-trigger support.

### Phase 2: Realtime Gateway & Async Intelligence ✅

- [x] **FastAPI REST API Gateway:** High-performance async endpoints for incidents, assignments, responders, shelters, routing, triage, and hazards.
- [x] **Bi-Directional Socket.IO Server:** Real-time event synchronization with room authorization (`authorities`, `incident:{id}`).
- [x] **AI Decision Support Pipeline:** Multi-tier waterfall (Gemini 2.5 Flash $\rightarrow$ Groq Llama-3.3 $\rightarrow$ Deterministic Heuristics) with PII sanitization and strict Pydantic validation.
- [x] **Routing Layer:** OSRM async routing engine with 5-minute TTL caching and 15-waypoint fallback vector corridor calculation.

### Phase 3: Authority Command Center Architecture Refactor ✅

- [x] **Monolithic Page Decomposition:** Refactored 1,875-line `AuthorityCommandCenter.jsx` into a clean 400-line orchestrator page.
- [x] **Domain Feature Modules (`src/features/authority/`):**
  - [x] `incidents/`: Out-of-order event guards and status transitions.
  - [x] `fleet/`: Responder inventory, filtering, and manual status overrides.
  - [x] `shelters/`: Evacuation capacity, bed intake arithmetic, and hazard proximity alerts.
  - [x] `intelligence/`: Situation briefing, normalized hazards, and spatial clusters.
  - [x] `dispatch/`: Deterministic recommendation ranking, OSRM routing, GPS movement simulation, and AI triage actions.

### Phase 5: Security Hardening & Allocation Engine ✅

- [x] **Explainable Deterministic Allocation Engine:** 6-factor auditable scoring formula (Capability 30, Availability 20, Distance 15, ETA 15, Workload 10, Severity Fit 10 = Max 100) with multi-level tie-breaking.
- [x] **Cryptographic Authentication & RBAC:** HMAC-SHA256 JWT token minting, verification, and role-based permissions (`CITIZEN`, `AUTHORITY`, `RESPONDER`, `SYSTEM`).
- [x] **Defensive Middleware Hardening:** Security headers (CSP, HSTS, X-Frame-Options), 5MB payload limits, and correlation ID propagation.
- [x] **Test Suite Verification:** **204 passing automated tests** across 19 backend test suites with zero regressions.

---

## 3. Current Focus Area (Production Polish)

- [x] **Master Technical Documentation System Overhaul:** 100% codebase alignment across README and 14 technical manuals.
- [x] **Production Infrastructure & Deployment Validation:** Dual-platform hosting on Vercel (frontend) and Render (backend) with Infrastructure as Code (`render.yaml`).

---

## 4. Next Phase: Enterprise Scaling (Phase 6) ⏳

- [ ] **PostgreSQL 16 + PostGIS Migration:**
  - Transition from local SQLite to managed PostgreSQL with native spatial indexing (GIST / `ST_DWithin`).
  - Support multi-region active-active replication for disaster redundancy.
- [ ] **Redis Pub/Sub Socket.IO Adapter:**
  - Enable multi-instance backend clustering behind load balancers using `socketio.AsyncRedisManager`.
- [ ] **Web Push & SMS Dispatcher Alerts:**
  - Browser Web Push Notifications (VAPID) for high-urgency citizen proximity alerts when the screen is locked.
  - Twilio / Infobip SMS fallback for low-bandwidth citizen notifications.

---

## 5. Future Horizons (Phase 7) 🔮

- [ ] **Low-Bandwidth Satellite & Mesh Beaconry:**
  - Integration with Iridium / Garmin inReach and LoRa mesh radio hardware for zero-cellular disaster zones.
- [ ] **Official Emergency Protocol Interoperability (CAP / EDXL):**
  - Common Alerting Protocol (CAP v1.2) XML export and ingestion for direct integration with NDMA / FEMA emergency broadcasting systems.
- [ ] **Offline Progressive Web App (PWA):**
  - ServiceWorker offline tile caching for complete map functionality in zero-connectivity air-gapped environments.
