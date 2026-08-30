# DECISIONS.md — Architecture Decision Records (ADRs)

This document formally records foundational architectural decisions, rationale, engineering trade-offs, and implementation status across the Salvus platform.

---

## ADR-001: React 19 + Vite for Dual-Portal SPA

- **Context:** Disaster intelligence requires an ultra-responsive interface capable of rendering real-time Leaflet radar maps, high-frequency animated markers, and state machines with zero rendering lag.
- **Decision:** Adopt React 19 bootstrapped with Vite and Tailwind CSS v4.
- **Why:** Vite provides instant sub-second Hot Module Replacement (HMR) and optimized production builds under 400ms. React 19 provides efficient DOM reconciliation during high-frequency WebSocket telemetry streams.
- **Trade-offs:** Client-side rendering requires client-side SPA rewrite rules on edge hosts (`vercel.json`), but maximizes interactive responsiveness.
- **Status:** **Active / Implemented ✅**

---

## ADR-002: Explainable Deterministic Resource Allocation Engine

- **Context:** Distress beacons require immediate, optimal matching to available emergency response craft (e.g. inflatable boats vs. ambulances).
- **Decision:** Implement a mathematically auditable 6-factor scoring formula (Capability 30%, Availability 20%, Proximity 15%, Transit ETA 15%, Workload 10%, Severity Fit 10% = Max 100) with deterministic multi-level tie-breaking.
- **Why:** Generative AI models are stochastic, can hallucinate, and cannot provide legally auditable guarantees for life-safety asset allocation. A deterministic algorithm ensures 100% reproducible and explainable recommendations.
- **Trade-offs:** Requires manual calibration of factor weights, but ensures complete predictability.
- **Status:** **Active / Implemented ✅**

---

## ADR-003: Mandatory Human-in-the-Loop Verification for Dispatches

- **Context:** Emergency response assets are finite. Deploying personnel based on false alarms or misinterpreted reports puts lives at risk.
- **Decision:** Enforce mandatory human dispatcher verification for all AI triage recommendations and vehicle dispatches.
- **Why:** AI acts as a high-speed entity extraction and triage assistant, but physical deployment authority remains exclusively with certified emergency dispatchers.
- **Trade-offs:** Adds a single confirmation tap for dispatchers, which is an essential safety-critical requirement.
- **Status:** **Active / Implemented ✅**

---

## ADR-004: State-Focused Progressive Disclosure for Emergency UX

- **Context:** Citizens experiencing acute crises suffer from panic and cognitive overload. Rendering all emergency data cards simultaneously causes confusion and missed survival instructions.
- **Decision:** Implement **State-Focused Progressive Disclosure** where each state dynamically elevates only its primary focal point (AI Triage during `TRIAGING`, Tactical Radar during `EN_ROUTE`, Proximity Torch Cue during `NEARBY <100m`, Boarding Protocol during `ON_SCENE`).
- **Why:** Delivers 2-second visual comprehension and keeps immediate life-saving actions in direct focus.
- **Trade-offs:** Requires dynamic layout coordination across components, managed cleanly via `useEmergencyState.js`.
- **Status:** **Active / Implemented ✅**

---

## ADR-005: 1-Click Dual-Portal Navigation Architecture

- **Context:** Hackathon presentations, multi-agency training, and system tests require switching between the Citizen distress view and the Authority Command Center instantly without reloading the page.
- **Decision:** Implement a dual-portal SPA architecture with persistent, styled portal switchers (`[ 🛡️ Authority Center ]` and `[ 👤 Citizen App ]`) in top navigation bars.
- **Why:** Allows uninterrupted live demonstrations of real-time WebSocket sync across both viewpoints in a single browser session.
- **Trade-offs:** Requires distinct layout shells (`CitizenLayout` and `AuthorityLayout`) to maintain clean visual density boundaries.
- **Status:** **Active / Implemented ✅**

---

## ADR-006: In-App Drawers & Modals Over Native Browser Alerts

- **Context:** Prototype actions previously triggered native browser `alert()` popups or redirected users to irrelevant pages, breaking trust.
- **Decision:** Implement dedicated in-app modal drawers for all critical actions: `IncidentReportModal.jsx` for 3-step hazard logging, Safe Route Briefing for shelter guidance, and `AssignmentConfirmModal.jsx` for dispatch safeguards.
- **Why:** Delivers a production-grade, trustworthy application feel with zero dead buttons.
- **Trade-offs:** Requires authoring dedicated modal components and managing their open/closed states.
- **Status:** **Active / Implemented ✅**

---

## ADR-007: Python FastAPI for Backend Foundation

- **Context:** Disaster coordination requires high-throughput async REST endpoints, strict Pydantic data validation, and seamless integration with Python AI SDKs.
- **Decision:** Use Python 3.11/3.12 with FastAPI, Pydantic v2, and ASGI Async Server (`uvicorn`).
- **Why:** High async performance, automatic OpenAPI documentation at `/docs`, strict typing, and direct compatibility with Google Gemini and Groq AI toolchains.
- **Trade-offs:** Requires maintaining dual runtimes (Node.js for frontend, Python for backend), isolated cleanly in separate folders.
- **Status:** **Active / Implemented ✅**

---

## ADR-008: Async SQLite with WAL Mode & PostgreSQL/PostGIS Target

- **Context:** Local development, CI test suites, and hackathon demos require zero-configuration, instant database setup without cloud credential friction.
- **Decision:** Use `aiosqlite` with Write-Ahead Logging (`PRAGMA journal_mode=WAL`) and foreign keys enforced for Phase 1, structuring the schema for clean 1-to-1 migration to PostgreSQL + PostGIS in Phase 6.
- **Why:** Sub-millisecond local queries, instant test execution (204 tests in $<3$ minutes), atomic transactions, and zero external database infrastructure dependencies.
- **Trade-offs:** Ephemeral disk on free cloud tiers (mitigated via `AUTO_SEED=true` and persistent disk paths).
- **Status:** **Active / Implemented ✅**

---

## ADR-009: Restrained Semantic Color System & 85–90% Slate Neutral Budget

- **Context:** Command center dashboards often suffer from visual saturation with multiple competing neon accent colors, creating cognitive fatigue for dispatchers during long shifts.
- **Decision:** Adopt an **85–90% neutral slate budget** (`#080C12` base) with semantic colors reserved strictly for operational meaning: Red (Critical Threat / Active SOS), Amber (Triage / Warning / Proximity), Blue (Selected / Verified), Green (Resolved / Safe).
- **Why:** Emergency management interfaces must communicate calm intelligence during chaos. Restrained colors ensure critical threats instantly stand out.
- **Trade-offs:** Avoids flashy "cyberpunk/gamer" aesthetics in favor of serious emergency management standards.
- **Status:** **Active / Implemented ✅**

---

## ADR-010: Environment Configuration & Secret Management Architecture

- **Context:** Backend and frontend require distinct configuration parameters (CORS origins, API keys, database paths) without risking secret leaks to version control.
- **Decision:** Establish isolated `.env.example` templates for root and `backend/` with empty secret placeholders, paired with strict `.gitignore` rules forbidding `.env` files from being committed.
- **Why:** Guarantees security-first defaults, repeatable local onboarding, and clean CI/CD quality gate runs.
- **Trade-offs:** Developers must run `cp .env.example .env` during initial setup.
- **Status:** **Active / Implemented ✅**

---

## ADR-011: First-Class Assignment Domain Model & Controlled Lifecycle

- **Context:** Emergency operations require explicit assignment contracts, milestone timestamp tracking (`accepted_at`, `started_at`, `arrived_at`, `completed_at`, `cancelled_at`), transparent score breakdown storage, and auditable event histories.
- **Decision:** Elevate **Assignment** into an explicit first-class domain model (`incident ↔ assignment ↔ responder`) governed by a strict forward-only finite state machine (`PROPOSED` $\rightarrow$ `ASSIGNED` $\rightarrow$ `EN_ROUTE` $\rightarrow$ `NEARBY` $\rightarrow$ `ON_SCENE` $\rightarrow$ `COMPLETED` / `CANCELLED`).
- **Why:** Prevents race conditions, prevents duplicate active responder assignments, and guarantees legal and operational auditability across emergency rescue operations.
- **Trade-offs:** Enforces single active assignment constraints per responder and per incident.
- **Status:** **Active / Implemented ✅**

---

## ADR-012: Decomposed Domain Architecture for Authority Command Center

- **Context:** As features expanded (AI triage, OSRM routing, GPS telemetry simulation, real-time socket events, hazard zones, incident clusters, shelter logistics), `AuthorityCommandCenter.jsx` grew to ~1,875 lines, creating a monolithic maintenance bottleneck.
- **Decision:** Decompose the Authority Command Center into an **Orchestrator Page** (`AuthorityCommandCenter.jsx`, ~400 lines) + **Domain Feature Modules** (`src/features/authority/`) + **Cohesive Presentation Components** (`src/components/authority/`).
- **Why:** Keeps page components declarative, isolates socket listeners into domain owners to avoid redundant subscriptions, keeps presentation components testable, and prevents regression risks.
- **Trade-offs:** Introduces multiple smaller files and requires a clean feature barrel (`src/features/authority/index.js`).
- **Status:** **Active / Implemented ✅**

---

## ADR-013: Multi-Tier AI Provider Waterfall with Deterministic Local Fallback

- **Context:** External cloud LLM APIs can experience rate limits, latency spikes, or complete network outages during regional disasters.
- **Decision:** Implement a 3-tier provider waterfall: **Tier 1: Google Gemini 2.5 Flash $\rightarrow$ Tier 2: Groq Llama-3.3-70b $\rightarrow$ Tier 3: Deterministic Rule-Based Local Heuristics**.
- **Why:** Guarantees 100% uptime for triage operations even during complete internet or cloud provider outages.
- **Trade-offs:** Heuristic fallback has lower linguistic flexibility than LLMs, but extracts essential keywords and computes accurate urgency scores reliably.
- **Status:** **Active / Implemented ✅**

---

## ADR-014: OSRM Routing Engine with In-Memory TTL Cache and Fallback Vector Corridor

- **Context:** Computing real-world road and waterway routes is essential for accurate ETAs and animated rescue radar maps. Direct client-side calls to public routing servers can hit rate limits or fail outside road grids.
- **Decision:** Route all navigation requests through a backend routing service (`routing_service.py`) integrating OSRM with a 5-minute in-memory TTL cache and an automatic fallback 15-waypoint curved vector corridor generator.
- **Why:** Decouples the frontend from external routing APIs, eliminates rate-limit failures, and guarantees realistic curved path geometry even when routing servers are offline.
- **Trade-offs:** Public demo server latency is mitigated via backend caching and 3.0s timeout fallbacks.
- **Status:** **Active / Implemented ✅**

---

## ADR-015: Hackathon Authentication Gateway & Session Architecture

- **Context:** Previous prototype accepted arbitrary credentials and auto-minted unverified role tokens. A realistic, secure authentication foundation was required to enforce real credential validation, persistent demo accounts, and RBAC authorization without introducing heavy enterprise SSO overhead.
- **Decision:**
  1. Store persistent demo users (`CITIZEN`, `AUTHORITY`) in a dedicated `users` table with standard bcrypt password hashing (`rounds=12`).
  2. Implement `POST /api/auth/login` validating credentials against database hashes and issuing signed HMAC-SHA256 JWT tokens.
  3. Derive role identity strictly from server-side database records, ignoring frontend role assertions to prevent privilege escalation.
  4. Create a centralized `AuthContext` as the single frontend source of truth, backed by a 401 response interceptor for automatic session termination and clean stateless JWT logout.
- **Why:** Eliminates fake authentication, secures API endpoints, guarantees repeatable hackathon judge evaluation, and establishes a production-grade session layer.
- **Trade-offs:** Stateless JWT tokens are cleared client-side on logout (server-side token blacklists deferred to post-hackathon).
- **Status:** **Active / Implemented ✅**

---

## ADR-016: Two-Tier Role-Based Route Guards & Session Lifecycle Separation

- **Context:** Applications with multi-role portals (e.g. Citizen vs. Authority Dispatcher) require strict boundary enforcement to prevent cross-role URL tampering, token manipulation, and orphaned WebSocket/telemetry sessions after logout.
- **Decision:**
  1. Implement a reusable `<ProtectedRoute allowedRoles={[...]}>` component in React Router wrapping distinct role portal hierarchies.
  2. Implement an explicit 4-state authentication lifecycle (`INITIALIZING`, `AUTHENTICATED`, `UNAUTHENTICATED`, `AUTHENTICATION_ERROR`) ensuring zero dashboard flickering during session restoration.
  3. Enforce deterministic cross-role redirection (Citizen attempting `/authority` $\rightarrow$ redirected to `/citizen`; Authority attempting `/citizen` $\rightarrow$ redirected to `/authority`) with loop prevention.
  4. Implement comprehensive logout teardown: purges tokens, disconnects Socket.IO, emits room exit events, and resets identity state.
- **Why:** Separates UX routing guards from backend RBAC security while guaranteeing that neither role can access the other's domain or leak realtime telemetry.
- **Trade-offs:** Requires route wrapping and location state preservation for post-login return paths.
- **Status:** **Active / Implemented ✅**
