# DECISIONS.md - Architecture Decision Records (ADR)

This file tracks important architecture design choices made on the Salvus project.

---

## ADR-001: Why React + Vite
* **Context:** We need a fast, interactive frontend app compatible with real-time geospatial widgets.
* **Decision:** Adopt React 19 bootstrapped with Vite.
* **Reason:** Vite provides instant Hot Module Replacement (HMR) during hackathon sprints, compiling Tailwind CSS and Leaflet components in milliseconds.
* **Trade-offs:** Single-page applications can experience initial bundle load latency compared to SSR frameworks, but this is negligible for our dashboard size.

---

## ADR-002: Why Supabase/PostgreSQL/PostGIS
* **Context:** The application coordinates maps, coordinates, active alerts, and geographic zones.
* **Decision:** PostgreSQL with PostGIS extensions hosted on Supabase.
* **Reason:** PostgreSQL provides robust relations, and PostGIS natively runs spatial computations (e.g. proximity checks). Supabase exposes real-time tables without introducing extra infrastructure.
* **Trade-offs:** PostGIS queries require strict syntax, but prevent writing manual calculation algorithms in JavaScript.

---

## ADR-003: Why Deterministic Allocation Over LLM Decision
* **Context:** Incidents require immediate assignment to appropriate responder units.
* **Decision:** Apply a deterministic weighted allocation formula instead of LLM-based choices.
* **Reason:** AI outputs can hallucinate and fluctuate. Emergency assignment requires predictable, auditable, and mathematical explanations based on proximity, workload, and matching capabilities.
* **Trade-offs:** Writing the math formula requires fine-tuning weights, but ensures complete predictability.

---

## ADR-004: Why Socket.io for Real-time State
* **Context:** Dashboards and citizens need to view responder positions and incident status updates immediately.
* **Decision:** Socket.io server connection.
* **Reason:** Sockets support low-latency bi-directional updates, which is essential for tracking active movements on a map.
* **Trade-offs:** Requires running an active Express backend process rather than relying on serverless functions.

---

## ADR-005: Why Simulated Responder Telemetry
* **Context:** Responder units cannot physically drive around during a local hackathon demo.
* **Decision:** Simulate responder GPS movements using step timers along OSRM paths.
* **Reason:** Provides judges with a realistic rendering of dispatch tracking, routing, and ETA alerts without needing real-world vehicle integrations.
* **Trade-offs:** We must label these tracks as `[SIMULATION]` to keep the presentation transparent.

---

## ADR-006: Why Human Verification for Dispatch Decisions
* **Context:** Allocating emergency responders involves critical resources.
* **Decision:** Implement a Human-in-the-loop validation step.
* **Reason:** Completely autonomous AI dispatch carries high liability risks (e.g., misdirecting resources based on a misparsed text). Requiring dispatcher confirmation prevents false alarms.
* **Trade-offs:** Adds an additional button click for the operator, which is a necessary precaution in safety-critical systems.
