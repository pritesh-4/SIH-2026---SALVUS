# DEMO.md - Hackathon Presentation & Demo Script

This document structures the 3-minute live demonstration flow for hackathon judges inspecting the Salvus platform.

---

## 1. 3-Minute Live Demo Timeline (Connected Pipeline)

| Timeline        | Stage                              | Action & Visuals                                                                                                                                                                                                                                      | Narrated Script                                                                                                                                                                                                                                                   |
| :-------------- | :--------------------------------- | :---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | :---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **0:00 - 0:45** | **Live Multi-Window Setup**        | Arrange two browser windows side-by-side: Left is **Citizen Portal** (`/citizen`), Right is **Authority Command Center** (`/authority`). Point out the live WebSocket grid connection badge and OpenStreetMap surface.                                | _"Welcome to Salvus. We are showing you a live, connected disaster intelligence pipeline. On the left is our Citizen application; on the right is the Authority Command Center connected in real time over Socket.IO and OpenStreetMap."_                         |
| **0:45 - 1:15** | **Citizen Hazard & SOS Beacon**    | Citizen triggers SOS or submits a hazard report with GPS coordinates. Observe the instant appearance of the incident in the Authority queue and tactical OpenStreetMap on the right window with **zero page reload**.                                 | _"When a citizen triggers an SOS, the beacon transmits live coordinates to our backend. Notice on the right: the incident appears instantly in the ingestion queue, the active counter increments, and a tactical OpenStreetMap marker is plotted in real time."_ |
| **1:15 - 1:50** | **Authority Inspection & Triage**  | In Authority Command Center, operator inspects the live incident, reviews the description and GPS tag, and clicks **"Begin Triage"** then **"Verify Dispatch"**. Watch the Citizen window on the left immediately update without refreshing the page. | _"The response coordinator inspects the incident telemetry and verifies dispatch. Notice how the citizen's phone on the left transitions instantly into the verified emergency state without refreshing the page."_                                               |
| **1:50 - 2:30** | **Simulated Failure & Recovery**   | Click `🛠️ DEV TOOLS` $\rightarrow$ `Drop Socket (5s)`. Show the citizen reassurance banner (_"Emergency request remains active"_). Reconnect seamlessly and click **"Resolve Incident"**.                                                             | _"During extreme crises, cell connectivity can drop. Salvus reassures the citizen that their emergency remains in the dispatch queue. When connection restores, updates catch up automatically without user intervention."_                                       |
| **2:30 - 3:00** | **Transparency & Data Provenance** | Highlight the `<SimulatedBadge />` labels marking mock fleet assets vs the `<LiveBadge />` marking real database records.                                                                                                                             | _"Salvus enforces strict architectural integrity: genuine citizen distress records are backed by real database persistence and WebSockets, while mock background simulations are visibly stamped."_                                                               |

---

## 2. Developer Demo Controls (`DevDemoControls`)

Accessible via the floating `🛠️ DEV DEMO CONTROLS` drawer in the bottom right corner:

- **⚡ Seed Demo Data:** Seeds standard Kolkata flood incidents into the database.
- **🗑️ Reset Database:** Cleans database state and restores clean baseline.
- **🚨 Fire Live SOS:** Transmits real random distress beacon from current device GPS coordinates.
- **📶 Drop Socket (5s):** Simulates 5-second socket network failure to prove reconnect recovery.
