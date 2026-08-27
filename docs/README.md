# SALVUS Technical Documentation System

Welcome to the **Salvus** Master Technical Documentation System. This directory houses the comprehensive architectural specifications, data schemas, API contracts, security models, and operational runbooks for engineers, maintainers, and judges.

---

## Master Document Directory

| Document                                        | Title & Focus Area                         | Scope & Coverage                                                                                                                                                                                  | Status                     |
| :---------------------------------------------- | :----------------------------------------- | :------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | :------------------------- |
| 📐 **[ARCHITECTURE.md](ARCHITECTURE.md)**       | **System Architecture & Layer Boundaries** | End-to-end component flow, Layer responsibilities, 4 Mermaid diagrams (System, Incident, Dispatch, Realtime), Technology rationale, and Code Reference Map.                                       | **Production / Active** ✅ |
| 🎯 **[PRODUCT.md](PRODUCT.md)**                 | **Product Strategy, Personas & Workflows** | Crisis coordination problem, Persona workflows (Citizen, Dispatcher, Responder, Shelter Lead), Feature decision rationale (WHO, WHY, WHEN, DECISION), and Progressive Disclosure.                 | **Production / Active** ✅ |
| 🔌 **[API.md](API.md)**                         | **REST & WebSocket API Reference**         | Complete specification for all 10 API route modules with exact request/response schemas, RBAC constraints, error codes, and canonical Socket.IO event emissions.                                  | **Production / Active** ✅ |
| 🗄️ **[DATABASE.md](DATABASE.md)**               | **Database Schema & Storage Engine**       | Async SQLite WAL architecture, Foreign key constraints, Complete 6-table data model, Mermaid ER Diagram, 11 performance indexes, and Render ephemeral disk behaviors.                             | **Production / Active** ✅ |
| ⚡ **[REALTIME.md](REALTIME.md)**               | **Real-Time State & Socket.IO Engine**     | Cryptographic token handshake, Room authorization (`authorities`, `incident:{id}`), Canonical dot-notation event catalog, Out-of-order guards, and Reconnect state resync.                        | **Production / Active** ✅ |
| 🤖 **[AI_ARCHITECTURE.md](AI_ARCHITECTURE.md)** | **AI Decision Support & Triage Waterfall** | Strict "AI DOES NOT DISPATCH" principle, 3-tier provider waterfall (Gemini 2.5 $\rightarrow$ Groq Llama-3.3 $\rightarrow$ Heuristics), PII redaction, Pydantic validation, and Human review loop. | **Production / Active** ✅ |
| 🛡️ **[SECURITY.md](SECURITY.md)**               | **Security, RBAC & Privacy Governance**    | HMAC-SHA256 JWT authentication, 4-tier RBAC permission matrix, Socket room access controls, Middleware security headers, 5MB payload limits, and PII protection.                                  | **Production / Active** ✅ |
| 🚀 **[DEPLOYMENT.md](DEPLOYMENT.md)**           | **Production Deployment & Infrastructure** | Vercel SPA frontend and Render Python web service hosting, Infrastructure as Code (`render.yaml`), Environment variables reference, and SQLite disk persistence.                                  | **Production / Active** ✅ |
| 🗺️ **[GEO_AND_ROUTING.md](GEO_AND_ROUTING.md)** | **Geospatial Intelligence & Routing**      | Browser geolocation accuracy tiers, Landmark fallbacks, Dark Leaflet map engine, OSRM routing with 5-min TTL cache, 15-waypoint fallback vector corridor, and Shelter hazard analysis.            | **Production / Active** ✅ |
| 🎨 **[UX_GUIDELINES.md](UX_GUIDELINES.md)**     | **Calm Intelligence Design System**        | Core UX philosophy "Calm Intelligence During Chaos", 85–90% neutral slate budget, Semantic color hierarchy, State-focused emergency UI, Typography, Spacing, and Accessibility.                   | **Production / Active** ✅ |
| 🧪 **[TESTING.md](TESTING.md)**                 | **Quality Assurance & Verification**       | Complete testing guide with verified count of **204 passing backend tests** across 19 suites, ESLint 0-error gate, Prettier compliance, and 12-step E2E realtime resilience loop.                 | **Production / Active** ✅ |
| 🎬 **[DEMO.md](DEMO.md)**                       | **Judge-Ready Golden Demo Runbook**        | Minute-by-minute 3-minute live pitch script, Dual-window presentation setup, Action-to-technology verification matrix, Failure recovery simulation, and DevDemoControls.                          | **Production / Active** ✅ |
| 🗺️ **[ROADMAP.md](ROADMAP.md)**                 | **Development Milestones & Status**        | Phased progression tracking across Completed deliverables (Phases 1, 2, 3, 5), Current active priorities, Next phase targets (PostgreSQL/PostGIS), and Future horizon goals.                      | **Production / Active** ✅ |
| ⚖️ **[DECISIONS.md](DECISIONS.md)**             | **Architecture Decision Records (ADRs)**   | 14 formal ADRs (ADR-001 through ADR-014) documenting context, decisions, rationale, trade-offs, and implementation status across the stack.                                                       | **Production / Active** ✅ |

---

## Architectural Principles & Truth Standards

1. **Truth Over Aspiration:** No feature is documented as implemented unless it exists and is tested in the active codebase. Unimplemented capabilities are strictly marked as `PLANNED` or `FUTURE`.
2. **Data Provenance Transparency:** Every data stream in the system is explicitly categorized as `LIVE`, `CACHED`, `SIMULATED`, `HYBRID`, `AI ESTIMATE`, or `FALLBACK`.
3. **Decoupled AI Boundaries:** Generative AI is strictly an unstructured extraction and triage assistant. Dispatch execution, asset allocation, and emergency routing are governed by deterministic algorithms and certified by human operators.
