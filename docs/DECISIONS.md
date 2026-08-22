# DECISIONS.md - Architecture Decision Records (ADRs)

This document records the foundational architectural decisions, rationale, and engineering trade-offs made across the Salvus platform.

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
