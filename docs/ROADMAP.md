# ROADMAP.md - 10-Day Development Plan

This roadmap organizes project milestones to ensure team progress during the hackathon.

---

## 1. Priority Tiers

### 🔴 Tier 1: MUST BUILD (Core MVP)

- **Single-Tap SOS:** Immediate GPS beacon broadcast.
- **Incident Queue:** Admin dashboard list displaying incoming reports.
- **Interactive Map Overlay:** Incident pins and active shelters.
- **Deterministic Matcher:** Basic dispatch score calculations.
- **Clean CI/CD Pipeline:** Guard branch rules.

### 🟡 Tier 2: HIGH VALUE (Rich Interactivity)

- **Weather & Hazard Layer:** Meteorological maps displaying current wind and storm paths (Open-Meteo).
- **Live Telemetry:** Active responder tracking along computed routes (OSRM).
- **Supabase Realtime Sync:** Automatic database sync on status changes.
- **AI Parser Integration:** Triage categorization and severity classifications.

### 🟢 Tier 3: ADVANCED / STRETCH (Polish)

- **Multi-Modal AI Ingestion:** Gemini analyzing image uploads for emergency cues.
- **Dynamic Shelter Inventories:** Automated alerts when supply thresholds fall below set metrics.
- **Offline Fallbacks:** Local browser database (IndexedDB) caching maps and reports if connection is lost.

### 🔵 Tier 4: NARRATED (Future Scope)

- Multi-channel SMS and satellite integrations.
- Native mobile applications.
- Official emergency response center integrations.

---

## 2. 10-Day Milestones

- **Days 1 - 3: Foundation**
  - Setup core React routing and state managers.
  - Establish base Leaflet map and center coordinate views.
  - Setup Supabase tables and triggers.
- **Days 4 - 6: Ingestion & AI Triage**
  - Integrate meteorological feeds.
  - Connect Gemini API to parse text inputs.
- **Days 7 - 8: Dispatch & Telemetry**
  - Write proximity allocation formulas.
  - Wire WebSocket servers for GPS simulation updates.
- **Days 9 - 10: Integration & Polishing**
  - Connect client-to-server workflows.
  - Conduct presentation demo dry-runs.
