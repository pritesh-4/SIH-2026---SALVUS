# PRODUCT.md — Product Strategy, Personas & Workflows

This document details the product philosophy, user personas, operational workflows, and feature decision rationales for the Salvus platform.

---

## 1. The Core Crisis Problem

When major disasters strike (e.g. urban flash floods, cyclone surges, structural collapses), disaster management agencies rarely fail due to a shortage of physical rescue personnel. The breakdown is an acute **information and coordination bottleneck** during the first 1 to 4 golden hours.

Emergency operations suffer from severe systemic friction:

```
[Fragmented Citizen Reports] ──┐
[Uncertain Threat Severity]  ──┼─► [COORDINATION GAP] ─► Delayed Response & Loss of Life
[Asset & Route Blind Spots]  ──┤
[Shelter Overcapacity]       ──┘
```

1. **Unstructured Data Overload:** Citizens broadcast chaotic distress messages across phone lines, WhatsApp, and social media without standard terminology or verified GPS pins.
2. **Severity Ambiguity:** Dispatchers cannot quickly differentiate between life-threatening entrapment (e.g. non-ambulatory elderly trapped in rising water) and routine advisory requests.
3. **Asset Mismatches:** Deploying an ambulance to a flooded avenue or an inflatable boat to a dry debris zone wastes finite resources and delays critical rescues.
4. **Dynamic Environmental Hazards:** Blocked roads, downed power lines, and flood hydro-contours invalidate traditional navigation tools.
5. **Shelter Blind Spots:** Evacuees are directed to shelters that have already exhausted bed capacity or lack clean water reserves.
6. **Citizen Panic:** Lack of transparent status updates leads victims to make dangerous, unguided evacuation attempts.

---

## 2. Product Solution: Synchronized Coordination Ecosystem

Salvus eliminates the coordination gap through a two-sided platform that unites citizens, dispatchers, and first responders into a synchronized operational pipeline.

```
Citizen Distress SOS
       ↓
Automated AI Triage & Entity Extraction
       ↓
Human Authority Verification & Approval
       ↓
Explainable Deterministic Resource Allocation
       ↓
Tactical Geospatial Routing (OSRM + Resilient Fallback)
       ↓
Realtime GPS Vessel Telemetry Sync (Socket.IO)
       ↓
Proximity Alert (<100m) & Safe Evacuation Handoff
       ↓
Evacuation Shelter Reception & Resolution
```

---

## 3. Target Personas & Operational Roles

| Persona                                  | Operational Context                                                                                                     | Primary Pain Points                                                                         | Salvus Value Proposition                                                                                                |
| :--------------------------------------- | :---------------------------------------------------------------------------------------------------------------------- | :------------------------------------------------------------------------------------------ | :---------------------------------------------------------------------------------------------------------------------- |
| **Stranded Citizen** (`CITIZEN`)         | Experiencing acute emergency (flooding, injury, structural hazard); high panic, low battery, intermittent connectivity. | No visibility into help; confusing forms; fear of being forgotten.                          | 1-touch SOS beacon; 2-second safety comprehension; progressive disclosure emergency journey; live rescue vessel radar.  |
| **Emergency Dispatcher** (`AUTHORITY`)   | Managing multi-sector crisis in central operations hub; high cognitive load; multi-screen fatigue.                      | Visual noise; fragmented queues; non-transparent AI "black boxes"; manual distance lookups. | High-density 85-90% slate cockpit; AI urgency scoring; deterministic 6-factor vehicle recommendation; 1-click dispatch. |
| **First Responder Lead** (`RESPONDER`)   | Operating in the field (Zodiac boat, ALS ambulance, debris crew); hazardous transit conditions.                         | Unclear mission priority; vague victim locations; radio channel clutter.                    | Direct mission dispatch; real-time corridor navigation; live proximity alerts when approaching victims.                 |
| **Shelter Logistics Lead** (`AUTHORITY`) | Overseeing municipal evacuation centers, gyms, and stadium reception hubs.                                              | Unexpected evacuee surges; ration stockouts; lack of intake tracking.                       | Live bed capacity meters; occupancy rate tracking; 72-hour supply readiness status; hazard proximity warnings.          |

---

## 4. Feature Decision Rationale

Every major feature in Salvus is built to answer four fundamental operational questions: **WHO? WHY? WHEN? WHAT DECISION DOES IT ENABLE?**

### 4.1 In-App 3-Step Hazard Reporting (`IncidentReportModal.jsx`)

- **WHO:** Citizens observing localized hazards (floods, downed lines, structural damage, debris).
- **WHY:** Traditional emergency hotlines become congested; citizens need a low-friction method to log structured field intelligence without phone queue delays.
- **WHEN:** Immediately upon discovering an obstacle or localized hazard before it causes accidents.
- **WHAT DECISION DOES IT ENABLE:** Enables authorities to map hazard polygons, exclude impassable streets from routing engines, and reroute evacuation convoys.

### 4.2 State-Focused Progressive Disclosure (`CitizenEmergency.jsx`)

- **WHO:** Stranded citizens during an active SOS distress beacon.
- **WHY:** In acute crises, cognitive bandwidth drops drastically. Cluttered dashboards cause panic and missed instructions.
- **WHEN:** Throughout the active emergency lifecycle (`SOS_ACTIVE` $\rightarrow$ `RESOLVED`).
- **WHAT DECISION DOES IT ENABLE:** Enables the citizen to focus strictly on the immediate survival action (e.g. moving to higher ground during `TRIAGING`, waving a flashlight/whistle during `NEARBY <100m`, boarding safely during `ON_SCENE`).

### 4.3 Automated AI Triage & Urgency Scoring (`AIService`)

- **WHO:** Central Command Dispatchers.
- **WHY:** Parsing hundreds of incoming text descriptions manually creates life-threatening dispatch delays.
- **WHEN:** Instantly upon SOS beacon ingestion.
- **WHAT DECISION DOES IT ENABLE:** Extracts critical signals (e.g. trapped victim count, water velocity, medical vulnerabilities) and ranks the queue by urgency so dispatchers triage the most critical life-threats first.

### 4.4 Explainable Deterministic Allocation Engine (`allocation_engine.py`)

- **WHO:** Emergency Dispatchers allocating finite response craft.
- **WHY:** Generative AI models are stochastic and non-auditable for life-safety dispatching. Asset assignment requires transparent mathematical justification.
- **WHEN:** When assigning a responder to a verified emergency incident.
- **WHAT DECISION DOES IT ENABLE:** Computes the mathematically optimal rescue craft based on capability, proximity, availability, ETA, workload, and severity fit, providing dispatchers with an auditable checklist of reasons to confirm or override.

### 4.5 Tactical Geospatial Surface & Vector Corridors (`routing_service.py`, `AuthorityMap.jsx`)

- **WHO:** Central Dispatchers and Field Responders.
- **WHY:** Dispatchers need spatial situational awareness of active threats, responder vectors, and shelter capacities on a unified tactical surface.
- **WHEN:** Continuously during crisis monitoring and active mission tracking.
- **WHAT DECISION DOES IT ENABLE:** Visualizes live transit progress, detects bottleneck intersections, and calculates accurate ETAs using OSRM with resilient offline corridor fallbacks.

### 4.6 Shelter Capacity Logistics (`ShelterPanel.jsx`)

- **WHO:** Evacuation Coordinators and Field Responders.
- **WHY:** Sending evacuees to overflowing shelters causes dangerous bottlenecks and logistical chaos.
- **WHEN:** During active evacuation routing and victim check-in.
- **WHAT DECISION DOES IT ENABLE:** Directs ambulances and rescue boats to facilities with open bed capacity and adequate 72-hour food/medical supplies.

---

## 5. State-Focused Progressive Disclosure Architecture

Emergency UX must eliminate cognitive overload. Rather than rendering 6+ cards simultaneously, Salvus progressively elevates the single most critical focal point per state:

```
┌─────────────────────────┐
│ SOS_ACTIVE              │ ──► Focus: Distress Telemetry + Ticket ID + High-Ground Protocol
├─────────────────────────┤
│ TRIAGING                │ ──► Focus: AI Triage In-Progress + Urgency Classification Breakdown
├─────────────────────────┤
│ VERIFIED                │ ──► Focus: Central Command Verification Stamp + Dispatcher Identity
├─────────────────────────┤
│ ASSIGNED                │ ──► Focus: Allocated Unit Profile + VHF Radio Link + Craft Class
├─────────────────────────┤
│ EN_ROUTE                │ ──► Focus: Tactical Rescue Radar + Animated Vessel + Real-Time ETA
├─────────────────────────┤
│ NEARBY (<100m)          │ ──► Focus: Urgent Amber Proximity Beacon ("Wave Torch / Whistle")
├─────────────────────────┤
│ ON_SCENE                │ ──► Focus: Arrival Confirmation & Safe Evacuation Handoff Protocol
├─────────────────────────┤
│ RESOLVED                │ ──► Focus: Resolution Summary (Response Time) + Shelter Reception Info
└─────────────────────────┘
```

---

## 6. Dual-Portal Experience Summary

```
┌────────────────────────────────────────────────────────────────────────┐
│                                 SALVUS                                 │
├───────────────────────────────────┬────────────────────────────────────┤
│ 👤 CITIZEN SAFETY CONSOLE         │ 🛡️ AUTHORITY COMMAND CENTER        │
│ (/citizen)                        │ (/authority)                       │
├───────────────────────────────────┼────────────────────────────────────┤
│ • Low-bandwidth personal safety   │ • High-density operational cockpit │
│ • 1-tap SOS distress trigger      │ • Priority queue sorted by urgency │
│ • 3-step in-app hazard reporting  │ • Full-screen Leaflet dark map     │
│ • Step-by-step safe shelter route │ • AI triage review & adjustment    │
│ • Progressive emergency journey   │ • Deterministic craft allocation   │
│ • Tactical vessel radar tracking  │ • Fleet matrix & radio channels    │
│ • Torch/whistle proximity cue     │ • Shelter bed & ration logistics   │
│ • Offline emergency pass storage  │ • Live simulation controls         │
└───────────────────────────────────┴────────────────────────────────────┘
```
