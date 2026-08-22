# PRODUCT.md - Product Context & Strategy

## 1. The Problem

During disasters, emergency response systems suffer from acute data fragmentation. Citizens send disjointed updates across phone lines, social media, and message boards, while coordinators struggle to determine:

- **Urgency & Triage:** Who requires immediate life-saving assistance versus who needs non-critical shelter transport?
- **Exact Coordinates:** Where are victims located when street signs and power landmarks are submerged or destroyed?
- **Asset Suitability:** Which responder unit has the necessary equipment (e.g. inflatable rescue boat vs. high-water truck) and is closest?
- **Shelter Availability:** Which shelters have open beds and available emergency rations?

This breakdown leads to response delays, asset misallocation, and avoidable loss of life.

---

## 2. The Solution

**Salvus** introduces a synchronized disaster intelligence ecosystem built around two primary personas:

1. **Citizen Safety Console (`/citizen`):** A calm personal safety hub that enables citizens to view local risks, report in-app hazards, access offline safe-routing to shelters, and trigger a **State-Focused Progressive Disclosure SOS Emergency Journey**.
2. **Authority Command Center (`/authority`):** A high-density operational cockpit for emergency dispatchers to view live crisis KPIs, inspect real-time AI triage classifications, authorize dispatches with 1 click, and oversee shelter logistics.

---

## 3. Target User Personas

- **Citizens in Distress:** Individuals requiring immediate rescue, hazard guidance, or offline routing to active evacuation centers.
- **Crisis Dispatchers & Coordinators:** Emergency operations managers who verify AI classifications, assign specialized rescue craft, and monitor fleet logistics.
- **Shelter Managers & First Responders:** Ground teams executing evacuations, managing bed capacities, and distributing emergency rations.

---

## 4. Platform Experiences

### A. Citizen Safety Console (`/citizen`)

- **Safety Status:** Instant 2-second overview of personal safety state and active municipal warnings.
- **In-App Hazard Reporting:** 3-step reporting workflow with category tagging (Floods, Downed Lines, Debris, Trapped Persons), severity ranking, GPS tag, and photo upload simulation.
- **Interactive Situational Map (`/citizen/map`):** Radar canvas with flood inundation overlays, medical posts, and step-by-step **Offline Safe Route Guidance** to shelters.
- **Hazard Advisories (`/citizen/alerts`):** Categorized advisory feed (Critical, Warning, Watch) with actionable safety protocols and safe haven recommendations.
- **Emergency Readiness Profile (`/citizen/profile`):** Verified citizen identity, blood group, medical/allergy profile, speed-dial emergency contacts, siren tone testing, and offline emergency pass storage.

### B. Complete Citizen Emergency Journey (`/citizen/emergency`)

- **`SOS_ACTIVE`:** Beacon transmitting live GPS telemetry (Ticket `#SV-2048`), high-ground protocol active.
- **`TRIAGING`:** Operational AI classification breakdown (`Flash Flood & Surge Inundation`, `Critical Tier 4`, `94% confidence`, `Zodiac Craft Required`).
- **`VERIFIED`:** Human-in-the-loop validation by Central Command Dispatcher S. Mukherjee (Kolkata Central Hub).
- **`ASSIGNED`:** NDRF Unit 4 (Capt. A. Roy) allocated with Zodiac Rescue Boat Mk-II and VHF Ch. 4 radio link.
- **`EN_ROUTE`:** Tactical Rescue Radar live tracking with animated vessel navigation, route corridor, distance (850m), and dynamic ETA countdown (4m).
- **`NEARBY` (<100m):** Urgent amber proximity beacon with visual/acoustic signaling instructions (torch pulse, bright cloth, boat horn detection).
- **`ON_SCENE`:** Arrival confirmation, life jacket fitting protocol, and crew boarding handoff.
- **`RESOLVED`:** Peaceful evacuation completion summary with total response time (8 min 42 sec) and shelter reception registry.
- **`CANCELLED`:** Stand-down safeguard confirmation for false alarms with instant re-trigger capability.

### C. Authority Command Center (`/authority`)

- **Operational KPI Metrics:** Active Incidents, Deployed Fleet, Evacuated Citizens, Shelter Occupancy %, and AI Triage Accuracy.
- **Incident Priority Queue:** Real-time feed sorted by AI Urgency Score with 1-click **"Approve & Dispatch Unit"** authorization.
- **Tactical Operational Map:** Multi-layer geospatial radar displaying incidents, active responder vectors, and shelter capacities.
- **Responder Fleet & Shelter Logistics:** Live status of rescue units (Unit 4, Unit 2, SDRF Ambulance) with VHF radio frequencies + Shelter bed availability and 72-hour supply rations.

---

## 5. State-Focused Progressive Disclosure Architecture

Emergency UX must eliminate cognitive overload. Rather than rendering 7 dense cards simultaneously, Salvus progressively elevates the single most critical focal point per state:

```
[SOS_ACTIVE / TRIAGING / VERIFIED]
  ↳ Focus: Distress Telemetry + AI Hazard Classification + Dispatcher Verification

[ASSIGNED / EN_ROUTE]
  ↳ Focus: Tactical Rescue Radar + Live Vessel Coordinates + Real-Time ETA Countdown

[NEARBY (<100m)]
  ↳ Focus: Urgent Amber Proximity Beacon ("Wave Torch / Whistle / Bright Cloth")

[ON_SCENE]
  ↳ Focus: Arrival Confirmation & Safe Evacuation Handoff Protocol

[RESOLVED]
  ↳ Focus: Peaceful Resolution Summary (Total Time: 8m 42s) + Reception Registry Info + Return Home
```

---

## 6. Rescue Allocation Algorithm

Salvus deliberately rejects unpredictable LLM-driven dispatch decisions. Instead, rescue assets are matched using a deterministic, weighted scoring system:

$$\text{Score} = (w_1 \cdot \text{Severity}) - (w_2 \cdot \text{Distance}) - (w_3 \cdot \text{ETA}) + (w_4 \cdot \text{Capability Match}) - (w_5 \cdot \text{Current Workload})$$

Every allocation is mathematically explainable, auditable, and subject to human dispatcher confirmation.
