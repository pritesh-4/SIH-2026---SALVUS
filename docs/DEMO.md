# DEMO.md — Judge-Ready Golden Demo Script & Simulation Runbook

This document provides the minute-by-minute live presentation script, dual-window demonstration workflow, technology mapping, failure recovery protocols, and simulation controls for hackathon judges inspecting Salvus.

---

## 0. Demo Authentication Credentials

Salvus uses real credential-validated authentication. The following demo accounts are pre-seeded on startup:

| Role          | Email                   | Password               |
| :------------ | :---------------------- | :--------------------- |
| **Citizen**   | `citizen@salvus.demo`   | `Salvus@Citizen2026`   |
| **Authority** | `authority@salvus.demo` | `Salvus@Authority2026` |

> **Security Note**: Passwords are stored as bcrypt hashes in the database. These plaintext values are documented here solely for hackathon evaluation purposes.

---

## 1. Demo Setup & Preparation (30 Seconds Pre-Demo)

1. Open your browser and navigate to `http://localhost:5173/login`.
2. **For Citizen window**:
   - Click **👤 Demo Citizen** (or enter `citizen@salvus.demo` / `Salvus@Citizen2026`).
   - The real `POST /api/auth/login` request validates against bcrypt records and securely routes you to the Citizen Safety Console (`/citizen`).
3. **For Authority window**:
   - Open a second browser window, navigate to `http://localhost:5173/login`.
   - Click **🛡️ Demo Authority** (or enter `authority@salvus.demo` / `Salvus@Authority2026`).
   - The real `POST /api/auth/login` request validates and securely routes you to the Authority Command Center (`/authority`).
4. Arrange both windows side-by-side.
5. In the Authority window, confirm the bottom-right connection status badge displays `LIVE` (green dot).
6. If needed, click `🛠️ DEV DEMO CONTROLS` → **⚡ Seed Demo Data** to ensure baseline fleet and shelter records are present.

---

## 2. 3-Minute Live Golden Path Script

| Timestamp       | Stage                                         | Action & Visuals                                                                                                                    | Technology Behind It                                                                                                                        | What Judge Sees & Expected Result                                                                                                                                                                                         |
| :-------------- | :-------------------------------------------- | :---------------------------------------------------------------------------------------------------------------------------------- | :------------------------------------------------------------------------------------------------------------------------------------------ | :------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **0:00 – 0:45** | **Platform Introduction & Operational State** | Point to dual-window layout. Highlight the calm 85–90% slate color budget and live Leaflet tactical map.                            | React 19, Leaflet dark-theme CSS filter, Tailwind v4 design tokens.                                                                         | _"Salvus closes the critical coordination gap between citizens and disaster coordinators through real-time geospatial synchronization."_                                                                                  |
| **0:45 – 1:15** | **Citizen Distress SOS Trigger**              | In Left Window (Citizen), click **SEND SOS**, hold button for 1.5s confirmation safeguard.                                          | Browser Geolocation API (`watchEmergencyLocation()`), `POST /api/incidents`.                                                                | Citizen transitions to `SOS_ACTIVE` with ticket `#SV-2048`. On the Right Window, the incident **appears in the priority queue and map instantly without page reload** via `incident.created` Socket.IO event.             |
| **1:15 – 1:45** | **Automated AI Triage & Verification**        | Select the incident in the Authority queue. Review the embedded AI Assessment Card. Click **Verify Triage**.                        | `AIService` (Gemini 2.5 $\rightarrow$ Groq $\rightarrow$ Heuristic waterfall), PII sanitization, `POST /api/triage/verify/{id}`.            | Card displays: Urgency 9.4/10, Flash Flood, Flood Boat required. Upon verification, Left Window (Citizen) **instantly flips from `TRIAGING` to `VERIFIED`** in real time.                                                 |
| **1:45 – 2:15** | **Deterministic Allocation & Dispatch**       | Review the **Dispatch Recommendations Panel**. Observe top candidate **NDRF Unit 4** with 94/100 score. Click **Confirm Dispatch**. | `allocation_engine.py` (6-factor formula: Capability 30, Availability 20, Distance 15, ETA 15, Workload 10, Severity Fit 10), OSRM routing. | Transparent mathematical justification bullets appear. Clicking dispatch creates a first-class assignment (`POST /api/assignments`). Citizen screen transitions to `ASSIGNED` showing allocated vessel and VHF channel.   |
| **2:15 – 2:45** | **Live Telemetry & Proximity Signaling**      | Observe animated rescue craft moving along the OSRM route corridor toward the citizen coordinates.                                  | `routing_service.py` (OSRM + vector corridor), `POST /api/simulation/step`, Socket.IO `responder.location_updated`.                         | Citizen Tactical Rescue Radar displays animated vessel approaching, distance updating (850m), and ETA countdown (4m). At $<100\text{m}$, screen flashes **amber proximity beacon** with torch/whistle signaling guidance. |
| **2:45 – 3:00** | **Shelter Reception & Safe Resolution**       | Authority transitions mission to `ON_SCENE` then `RESOLVED`.                                                                        | Atomic SQLite transaction, `incident_events` audit append, `incident.response_state_changed`.                                               | Citizen receives peaceful resolution screen showing total response time (8m 42s) and Salt Lake Stadium shelter check-in information. Zero orphaned records.                                                               |

---

## 3. Demo Failure Recovery & Resilience Protocols

If network disruption or unexpected external API latency occurs during a live presentation:

### Scenario A: Wi-Fi or Socket Drops

- **Symptom:** Connection indicator switches to `RECONNECTING...`.
- **Explanation to Judge:** _"In extreme disasters, cellular networks fluctuate. Salvus is built defensively: the citizen is immediately reassured that their SOS remains queued on the server. When connection recovers, the client automatically re-subscribes and catches up without refreshing the page."_
- **Recovery:** Socket reconnects automatically within 3 seconds.

### Scenario B: AI Provider Rate Limits / Missing API Keys

- **Symptom:** External LLM key is absent or rate-limited.
- **Explanation to Judge:** _"Salvus enforces a 3-tier provider waterfall. If Gemini is unreachable, the system fails over to Groq Llama-3.3, and if cloud networks are completely down, local deterministic heuristics take over seamlessly with zero service disruption."_
- **Recovery:** The card renders clean heuristic triage with a `[RULE-BASED TRIAGE]` badge.

---

## 4. Developer Demo Controls Dock (`DevDemoControls`)

Located in the bottom-right corner of all screens, the floating developer dock provides 1-click tools for presentation management:

- **⚡ Seed Demo Data:** Populates active Kolkata flood incidents, responders, and shelters.
- **🗑️ Reset Database:** Cleans database state and restores a clean baseline.
- **🚨 Fire Live SOS:** Submits a real emergency distress beacon from current device coordinates.
- **📶 Drop Socket (5s):** Simulates a 5-second network outage to demonstrate automatic client recovery.
- **⏱️ Telemetry Speed:** Toggles GPS movement simulation between 1x, 2x, and 5x speeds.

---

## 5. Live vs. Simulated Boundaries for Judges

| Component                  | Status for Live Demo | Architecture in Production                                             |
| :------------------------- | :------------------- | :--------------------------------------------------------------------- |
| **SOS Ingestion & Triage** | **GENUINE (LIVE)**   | Real SQLite database insert, Pydantic validation, Socket.IO broadcast. |
| **Allocation Scoring**     | **GENUINE (LIVE)**   | Real-time mathematical calculation over live fleet data.               |
| **OSRM Route Geometry**    | **GENUINE (LIVE)**   | Live HTTP query to OpenStreetMap routing engine with cache.            |
| **Responder GPS Movement** | **SIMULATED**        | Deterministic telemetry simulation streaming waypoints over WebSocket. |
| **Evacuation Shelters**    | **GENUINE (LIVE)**   | Real database storage with live bed capacity arithmetic.               |
