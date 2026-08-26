# ROADMAP.md - Development Milestones & Status

This roadmap tracks the development progress, completed frontend deliverables, and upcoming full-stack integration phases for Salvus.

---

## 1. Project Phases & Status

### Phase 1: Frontend V1.0 Foundation — **COMPLETED & VALIDATED** ✅

- [x] **Design System & Visual Language:** Sleek high-contrast dark theme, semantic disaster tokens (Emerald, Amber, Rose, Cyan).
- [x] **Citizen Safety Console (`/citizen`):**
  - [x] Citizen Home with safety status & active alert previews.
  - [x] In-App 3-step Hazard Reporting modal (`IncidentReportModal.jsx`).
  - [x] Situational Map with flood hydro-contours & in-app Safe Route Guidance.
  - [x] Hazard Advisory feed with Critical/Warning/Watch filters & safety guidance.
  - [x] Emergency Profile with verified identity, medical passport, and siren testing.
- [x] **State-Focused Progressive Disclosure Emergency Journey (`/citizen/emergency`):**
  - [x] Complete 8-state progression (`SOS_ACTIVE` → `TRIAGING` → `VERIFIED` → `ASSIGNED` → `EN_ROUTE` → `NEARBY` → `ON_SCENE` → `RESOLVED`).
  - [x] Tactical Rescue Radar with animated vessel telemetry, route corridor, and ETA countdown.
  - [x] AI Intelligence classification & Human Dispatcher verification approval stamp.
  - [x] Urgent proximity signaling guidance (<100m) & arrival handoff protocol.
  - [x] Safeguarded cancellation flow with instant re-trigger support.
- [x] **Authority Command Center (`/authority`):**
  - [x] High-density operational KPI metrics strip.
  - [x] Incident Priority Queue with AI urgency scoring & 1-click dispatch approval.
  - [x] Multi-layer Tactical Operational Command Map with marker telemetry inspection.
  - [x] Responder fleet tracking matrix & shelter supply logistics.
- [x] **Navigation & Presentation Excellence:**
  - [x] 1-Click dual-portal switcher in top navigation bars.
  - [x] Collapsible demo simulator dock with network health simulation (`Grid Connected`, `Limited SMS`, `Offline Cache`).
  - [x] Zero dead buttons, placeholder UI, or console warnings.

---

### Phase 2: Async Intelligence & Real-time Gateway — **COMPLETED & VALIDATED** ✅

- [x] **FastAPI API Gateway:** REST endpoints for incident lifecycle, responder fleet status, shelter capacity, hazard zones, and incident clusters.
- [x] **Bi-directional WebSockets (Socket.IO):** Instant event synchronization for `incident.created`, `responder.status_changed`, `assignment.created`, and telemetry updates with room isolation (`authorities`, `incident:{id}`).
- [x] **AI Intelligence Pipeline (Gemini / Groq LLM):** Dynamic triage classification, severity scoring, confidence rating, and situational summary briefing.
- [x] **OSRM Routing Engine:** Realistic road/water routing profiles with fallback vector corridor calculation.
- [x] **Deterministic Resource Allocation:** Auditable weighted scoring formula for unit recommendation.

---

### Phase 3: Authority Command Center Architecture Refactor — **COMPLETED & VALIDATED** ✅

- [x] **Monolithic Page Decomposition:** Refactored 1,875-line `AuthorityCommandCenter.jsx` into a clean orchestrator page (406 lines).
- [x] **Domain Feature Hooks (`src/features/authority/`):**
  - [x] `incidents/`: Incident state, out-of-order event protection, and status transitions.
  - [x] `fleet/`: Responder fleet state, capability/status filtering, and manual status overrides.
  - [x] `shelters/`: Evacuation hub capacity, bed intake adjustments, and hazard proximity alerts.
  - [x] `intelligence/`: Situation briefing, hazard feeds, clusters, and provenance state.
  - [x] `dispatch/`: Candidate recommendation ranking, OSRM routing, GPS movement simulation, and AI triage actions.
- [x] **Presentation Component Isolation (`src/components/authority/`):**
  - [x] `AuthorityHeader`, `OperationalMetrics`, `SituationBriefing`, `IncidentQueue`, `AuthorityMap`, `IncidentInspector`, `ResponderPanel`, `ShelterPanel`.
- [x] **Zero Visual or Behavioral Regressions:** 100% parity across triage, assignment, telemetry simulation, and shelter workflows.

---

### Phase 4: Hardware & Offline Resilience — **FUTURE ROADMAP** 🔮

- [ ] Low-bandwidth SMS & satellite mesh emergency beacon fallback.
- [ ] Direct integration with official emergency response dispatch protocols (CAP/EDXL).
- [ ] Mobile native applications (React Native / PWA offline caching).
