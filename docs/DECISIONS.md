# DECISIONS.md - Architecture Decision Records (ADRs)

This document records foundational architectural decisions, rationale, and engineering trade-offs made across the Salvus platform.

---

## ADR-001: React 19 + Vite for Dual-Portal SPA

- **Context:** We require an ultra-responsive, instant-feedback web application compatible with real-time geospatial radar canvases and complex state machines.
- **Decision:** Adopt React 19 bootstrapped with Vite and Tailwind CSS.
- **Reason:** Vite delivers sub-second Hot Module Replacement (HMR) and optimized production builds under 400ms. React 19 ensures smooth component rendering during high-frequency telemetry updates.
- **Trade-offs:** Client-side rendering requires robust offline caching strategies, which we addressed via progressive fallback banners.

---

## ADR-002: Deterministic Resource Allocation Engine

- **Context:** Distress beacons require immediate, optimal assignment to emergency rescue units.
- **Decision:** Apply a deterministic weighted scoring formula rather than autonomous LLM-driven dispatch choices.
- **Reason:** Generative AI models can hallucinate and exhibit non-deterministic behavior. Emergency asset allocation requires transparent, mathematically auditable decisions based on proximity, equipment capability match (e.g., Zodiac boat vs. ambulance), and current crew workload.
- **Trade-offs:** Requires calibrating formula weights, but ensures complete predictability and legal auditability.

---

## ADR-003: Human-in-the-Loop Verification for Dispatches

- **Context:** Dispatching life-safety assets involves finite, critical emergency personnel.
- **Decision:** Enforce mandatory human dispatcher verification for all AI-recommended dispatches.
- **Reason:** Eliminates the risk of false-alarm deployments while allowing AI to do the heavy lifting of unstructured text classification, entity extraction, and urgency ranking.
- **Trade-offs:** Adds a single confirmation click for dispatchers, which is essential for safety-critical operations.

---

## ADR-004: State-Focused Progressive Disclosure for Emergency UX

- **Context:** Citizens experiencing acute disasters suffer from extreme panic and cognitive overload. Rendering all emergency cards simultaneously creates visual noise and long mobile scrolling.
- **Decision:** Implement **State-Focused Progressive Disclosure** where each state dynamically elevates only its primary focal point (`AI Triage` during verification, `Tactical Radar` during en route tracking, `Proximity Torch Cue` when nearby, `Arrival Protocol` on scene).
- **Reason:** Provides maximum comprehension in under 2 seconds and keeps actionable guidance directly in view.
- **Trade-offs:** Requires dynamic layout coordination across components, managed cleanly via `useEmergencyState`.

---

## ADR-005: 1-Click Dual-Portal Navigation for Hackathon Presentations

- **Context:** Live hackathon demonstrations require judges to see both the citizen distress experience and the authority command center within 3 minutes without page refreshes.
- **Decision:** Implement a dual-portal SPA architecture with persistent, styled portal switchers (`[ 🛡️ Authority Center ]` and `[ 👤 Citizen App ]`) in top navigation bars.
- **Reason:** Allows uninterrupted live presentation flow and demonstrates end-to-end system cohesion.
- **Trade-offs:** Requires distinct layout wrappers (`CitizenLayout` and `AuthorityLayout`), maintaining clean design density separation.

---

## ADR-006: In-App Drawers & Modals Over Native Browser Alerts

- **Context:** Prototype actions previously triggered native browser `alert()` popups or redirected users to irrelevant pages.
- **Decision:** Replace all placeholder interactions with rich in-app components: `IncidentReportModal.jsx` for 3-step hazard logging, Safe Route Briefing for shelter navigation, and `EmergencyCancelModal.jsx` for cancellation safeguards.
- **Reason:** Zero dead interactions; delivers a production-grade, trustworthy application feel.
- **Trade-offs:** Requires authoring dedicated modal components and managing their open/closed states.

---

## ADR-007: Python FastAPI for Backend Foundation

- **Context:** The disaster intelligence ecosystem requires high-performance async API processing, clean data validation, and seamless integration with future AI & geospatial models.
- **Decision:** Use Python 3.12+ with FastAPI, Pydantic v2, and ASGI Async Server.
- **Reason:** FastAPI provides automatic OpenAPI schemas, strict typing, high throughput with async coroutines, and direct compatibility with Python data science/AI toolchains (Groq, Gemini SDKs).
- **Trade-offs:** Requires maintaining dual ecosystems (Node.js for frontend, Python for backend), mitigated via separate directory trees and isolated CI quality gates.

---

## ADR-008: Async SQLite for Local Foundation with Postgres/PostGIS Migration Path

- **Context:** Early phases and demo presentations require zero-configuration, reliable persistence without cloud database latency or credential lockouts.
- **Decision:** Use `aiosqlite` with Write-Ahead Logging (WAL) mode for Phase 1, structuring the schema for 1-to-1 migration to PostgreSQL + PostGIS in production.
- **Reason:** Instant local spin-up, zero external dependencies, robust transactional integrity, and easy tear-down for testing.
- **Trade-offs:** Lacks native spatial indexing (GIST) in Phase 1, which will be unlocked when migrating to PostGIS in the deployment phase.

---

## ADR-009: Restrained Semantic Color System & Operational Hierarchy for Authority Command Center

- **Context:** The previous command center dashboard suffered from visual saturation with 6+ competing accent colors, giant emoji metric cards, and unguided incident selection layouts, creating cognitive strain for dispatchers.
- **Decision:** Adopt an **85–90% neutral slate budget** with a structured 3-column operational layout (Queue -> Tactical Map -> Command Inspector). Restrict colors strictly to semantic meaning: Red (Critical/SOS only), Amber (Triage/Warning), Blue (Selected/Active/Verified), and Green (Resolved/Safe capacity). Standardize cards and popups into a unified C2 military/emergency operations design language.
- **Reason:** Emergency management interfaces must communicate calm intelligence during chaos. When everything is bright and highlighted, nothing stands out.
- **Trade-offs:** Subtler aesthetic rather than flashy "gamer/cyberpunk" dashboard styling, which aligns with serious governmental and NGO operations.

---

## ADR-010: Environment Configuration & Secret Management Architecture

- **Context:** Backend and frontend need distinct configuration parameters (CORS origins, API keys, database paths) without risking secret leaks to version control.
- **Decision:** Establish isolated `.env.example` templates for root and `backend/` with empty secret placeholders, paired with strict `.gitignore` rules forbidding any `.env*` files from being committed.
- **Reason:** Guarantees security-first defaults, repeatable local developer onboarding, and smooth CI/CD quality gate runs without dependency on external secret stores during development.
- **Trade-offs:** Developers must run `cp .env.example .env` during initial setup.
