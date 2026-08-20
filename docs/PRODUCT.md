# PRODUCT.md - Product Context & Strategy

## 1. The Problem
During disasters, emergency services face critical data fragmentation. Citizens send disjointed updates via phone, social media, or message boards, and responders struggle to identify where the highest threats exist. 

This results in:
* Response delays due to unverified location signals.
* Misallocated rescue units (e.g., dispatching boat units to dry zones).
* Underutilized shelters because vacancy counts are updated manually.

---

## 2. The Solution
**Salvus** acts as a unified disaster intelligence layer. It aggregates weather data and citizen-generated report feeds, parses raw messages using LLMs to structure incident classifications and severity ratings, and presents responders with a dynamic, map-based command center.

---

## 3. Target User Personas
* **Stranded Citizens:** Individuals requiring evacuation, immediate aid, or navigational routing to active shelters.
* **Incident Dispatchers / Responders:** Emergency operators who prioritize rescue assignments and dispatch ground crews.
* **Shelter Managers:** Coordinators who oversee shelter capacity, medical supplies, and general utility conditions.

---

## 4. Platform Experiences

### Citizen Experience (Web Portal)
* **SOS Broadcast:** Active GPS broadcast indicating physical location and threat categorization.
* **Hazard Reporting:** Reporting local blockages, rising water levels, and utility outages.
* **Risk Visualization:** View live weather warnings and nearby evacuation center metrics.

### Authority / Responder Experience (Command Dashboard)
* **Real-time Map:** Interactive display of incident markers, responder tracks, and shelters.
* **Incident Queue:** Prioritized feed grouping incoming cases by severity and category.
* **Resource Tracker:** Real-time metrics tracking occupancy and resource levels in shelter networks.

---

## 5. Core Operational Workflow

```
 Citizen submits SOS
   │
   ├── Realtime ingestion (Socket.io)
   │
   ├── AI Triage Processing (Gemini API structures severity & classification)
   │
   ├── Incident appears in Dispatch Queue
   │
   ├── Allocation algorithm suggests optimal responder units
   │
   └── Dispatcher approves order ──► Responder receives path & rescues citizen
```

---

## 6. Feature Tiers

### MVP Features (Must Build)
* Single-Tap citizen SOS.
* Interactive Leaflet command map.
* AI ingestion pipeline for incident triage.
* Predictable weighted responder allocation engine.
* Real-time sync via Socket.io.
* Demo telemetry generator.

### Non-MVP / Advanced Features
* Verification of photo attachments using multi-modal AI.
* Dynamic shelter supply calculation.
* OSRM multi-destination routing.

### Future Roadmap
* Satellite and low-bandwidth SMS integrations.
* Predictive threat models mapping flash-flood projections.
