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

### Phase 2: Real-time Backend & Ingestion Pipeline — **NEXT PHASE** 🚀

- [ ] **FastAPI API Gateway:** REST endpoints for incident creation, triage ingestion, and shelter queries.
- [ ] **Live Geospatial Database (Supabase / PostgreSQL + PostGIS):** Coordinate indexing and nearest-neighbor spatial queries.
- [ ] **Bi-directional WebSockets (Socket.io):** Instant state synchronization between citizen emergency beacons and authority command centers.
- [ ] **Live AI Pipeline (Gemini / Groq LLM):** Dynamic parsing of raw text messages and multi-modal photo analysis.
- [ ] **External Disaster Feeds:** Live ingestion from USGS Earthquake API and Open-Meteo Weather API.

---

### Phase 3: Hardware & Offline Resilience — **FUTURE ROADMAP** 🔮

- [ ] Low-bandwidth SMS & satellite mesh emergency beacon fallback.
- [ ] Direct integration with official emergency response dispatch protocols (CAP/EDXL).
- [ ] Mobile native applications (React Native / PWA offline caching).
