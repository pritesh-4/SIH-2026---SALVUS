# AGENTS.md

Welcome, AI Agent or Developer. This is the primary instruction file and ruleset for all AI coding agents and human contributors working on the **Salvus** project.

Every modification must strictly align with this document.

---

## 1. Project Identity & Core Principle

**Salvus** is an AI-powered Disaster Intelligence & Rescue Coordination Platform.

Our core operating principle is:
$$\text{Detect} \longrightarrow \text{Understand} \longrightarrow \text{Prioritize} \longrightarrow \text{Assign} \longrightarrow \text{Rescue} \longrightarrow \text{Resolve}$$

---

## 2. Core Architecture Principles

Conceptually, Salvus consists of:

1. **Citizen Application**: High-performance, low-bandwidth portal for geo-tagged SOS reporting and shelter discovery (React 19 + Leaflet + Vite + Tailwind CSS).
2. **Authority/Responder Dashboard**: Map-centric command center monitoring incidents, resources, and dispatches (React 19 + Leaflet + Vite + Tailwind CSS), architected as a thin orchestrator page with domain feature modules (`incidents`, `fleet`, `shelters`, `intelligence`, `dispatch`).
3. **Backend API**: **Python FastAPI 3.12+** server with async SQLite (aiosqlite + WAL Mode) for development, PostgreSQL/PostGIS migration path for production.
4. **Realtime Communication**: **Socket.IO** WebSocket server with room-based architecture (authorities room, incident:{id} rooms) pushing incident and GPS telemetry updates instantaneously.
5. **Database/Geospatial Layer**: **SQLite (dev) → PostgreSQL/PostGIS (prod)** running spatial queries (e.g. proximity, containment).
6. **AI Orchestration Layer**: **Gemini (primary) + Groq (fallback)** handling classification, severity scoring, entity extraction — **HUMAN-IN-THE-LOOP ONLY**.
7. **External Disaster Feeds**: GDACS, USGS, Open-Meteo (live); Nominatim, OSRM (live with fallbacks); Responder GPS, Flood Sensors (simulated).
8. **Routing Engines**: OSRM/Nominatim for rescue route planning with Euclidean fallback.

---

## 3. Non-Negotiable Engineering Rules

As an agent, you **MUST**:

1. **Inspect Before You Code**: View the file list and read relevant code/definitions before modifying or creating components.
2. **Reuse Existing Components**: Do not duplicate styling, className wrappers, helper tools, or layout systems.
3. **Avoid Unnecessary Rewrites**: Do not overwrite complete files for simple tweaks.
4. **Decouple UI, Feature Logic, and State**:
   - Keep page views thin orchestration layers (e.g., `AuthorityCommandCenter.jsx`).
   - Isolate server state, caching, and realtime socket events into domain feature hooks (`src/features/authority/*`, `src/features/citizen/*`).
   - Keep presentation components visual, receiving structured data and callbacks without direct Axios or socket calls (`src/components/authority/*`, `src/components/citizen/*`).
5. **Enforce Explicit API Contracts**: Always handle backend errors, latency, and parse statuses before rendering.
6. **Validate User Inputs**: Implement robust formatting checks on user coordinates and inputs.
7. **Never Hardcode Secrets**: Access keys using `import.meta.env` (frontend) / `os.getenv()` (backend) and document placeholders in `.env.example`.
8. **Handle Lifecycle & States**: Gracefully render loading spinners, empty lists, and failure error messages.
9. **Never Disable CI Quality Gates**: Do not mock, modify `.github/workflows/ci.yml`, or bypass hooks to make a PR pass.
10. **Never Invent APIs**: Do not write mock routes or pretend backend endpoints exist unless they are officially introduced.

---

## 4. AI-Specific Rules & Safety Guards

- **Allocation Exclusion**: AI is **NOT** allowed to make emergency dispatch assignments. Responder matches are computed deterministically (via weighted distance, capability, and workload formulas) to ensure audits are transparent.
- **Approved AI Scope**:
  - Incident categorization (e.g., _Flood_, _Fire_, _Medical_)
  - Severity and confidence scoring
  - Extraction of structured fields from conversational text
  - Situation brief synthesis
  - Alerts generation
  - Visual analysis as unverified hints
- **Resilience Framework**:
  - Every API call must have a timeout.
  - Implement fallback parsing if JSON structure deviates.
  - If both Gemini and Groq fail, return a fallback regex-extracted structure.

---

## 5. Real vs. Simulated Telemetry

- **Visual Labeling**: Simulated movements or mocked flood sensor data must be labeled with `[SIMULATION]` or `[MOCKED]` badges in the UI.
- **Transparency**: Never display generated test data as live emergency telemetry.
- **Data Provenance Badges**: All external data sources must display `LiveBadge` (green) or `SimulatedBadge` (amber) indicators per `docs/ARCHITECTURE.md`.

---

## 6. GPS & Privacy Controls

- **Consent First**: Location tracking must only trigger when the user explicitly clicks the emergency toggle.
- **Automatic Termination**: Continuous tracking must immediately stop when the incident is resolved or cancelled.
- **Emergency-Only Tracking**: Use `getCurrentLocation` (on-demand) and `watchEmergencyLocation` (SOS-only) — no background tracking.
- **Accuracy Translation**: 4-tier accuracy display (Precise → Approximate → Coarse → Unknown) with landmark fallback selectors.

---

## 7. Agent Change Management Workflow

### Phase A: Before Coding

1. Read this `AGENTS.md` file.
2. Read the corresponding `docs/` file relating to the component (e.g. `docs/DATABASE.md` for schemas).
3. Check for any existing modules or helper scripts.
4. Verbally explain planned changes, including target files, packages, and side-effects.

### Phase B: While Coding

1. Follow the existing ESLint flat configuration standards.
2. Keep modifications localized.
3. Do not modify unrelated lines or components.

### Phase C: After Coding

1. Run local verification: `npm run lint` and `npm run build` (frontend); `ruff check` and `pytest` (backend).
2. Update relevant documentation if architecture changes were approved (e.g. update `docs/API.md` when introducing routes).
3. Summarize all files edited.
4. Flag any risks or remaining gaps for human review.
