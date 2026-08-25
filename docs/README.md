# SALVUS Documentation Directory

Welcome to the Salvus knowledge base. This directory houses the primary documentation and architectural blueprints for developers, judges, and AI agents working on the platform.

---

## Document Index & Descriptions

| Document                                        | Purpose                                                                                      | Status                      |
| :---------------------------------------------- | :------------------------------------------------------------------------------------------- | :-------------------------- |
| 📖 **[PRODUCT.md](PRODUCT.md)**                 | Product strategy, user personas, dual-portal architecture, and core workflows.               | **Implemented / V1.0**      |
| 📖 **[ARCHITECTURE.md](ARCHITECTURE.md)**       | System architecture, frontend component layout, state machine, and Mermaid diagrams.         | **Implemented / V1.0**      |
| 📖 **[DEMO.md](DEMO.md)**                       | Step-by-step 3-minute hackathon judging script and simulation controls guide.                | **Implemented / V1.0**      |
| 📖 **[DECISIONS.md](DECISIONS.md)**             | Architecture Decision Records (ADRs) explaining engineering tradeoffs.                       | **Implemented / V1.0**      |
| 📖 **[DEVELOPMENT.md](DEVELOPMENT.md)**         | Local environment setup, coding guidelines, CI/CD gates, and Definition of Done.             | **Active / Enforced**       |
| 📖 **[AI_ARCHITECTURE.md](AI_ARCHITECTURE.md)** | Operational AI triage pipeline, classification taxonomy, and human verification model.       | **Implemented / Framework** |
| 📖 **[GPS_AND_PRIVACY.md](GPS_AND_PRIVACY.md)** | Location tracking protocols, privacy safeguards, and offline fallback telemetry.             | **Implemented / Framework** |
| 📖 **[TESTING.md](TESTING.md)**                 | Verification processes, linting standards, build validation, and DoD benchmarks.             | **Implemented / Enforced**  |
| 📖 **[ROADMAP.md](ROADMAP.md)**                 | Milestones, feature tiers, and completed V1.0 frontend deliverables.                         | **Updated / V1.0 Done**     |
| 📖 **[DATA_SOURCES.md](DATA_SOURCES.md)**       | External weather, seismic, and geocoding feeds integration roadmap.                          | **Documented**              |
| 📖 **[API.md](API.md)**                         | Backend REST endpoints and WebSocket event specifications.                                   | **Implemented / V1.0**      |
| 📖 **[DATABASE.md](DATABASE.md)**               | SQLite (dev) / PostgreSQL/PostGIS (prod) database schema definitions and geospatial indexes. | **Implemented / V1.0**      |
| 📖 **[REALTIME.md](REALTIME.md)**               | Real-time WebSocket room architecture and reconnect synchronization.                         | **Implemented / V1.0**      |
| 📖 **[DEPLOYMENT.md](DEPLOYMENT.md)**           | Production environment setup, secrets management, and hosting parameters.                    | **Documented**              |
| 📖 **[GITHUB_SETUP.md](GITHUB_SETUP.md)**       | Branch protection rules and GitHub Actions CI workflow instructions.                         | **Implemented / Active**    |

---

## General Rules

- All documentation must be kept synchronized with the codebase.
- No secrets, credentials, or private keys may ever be stored in these files.
- All internal markdown links must remain relative to ensure seamless GitHub browsing.
