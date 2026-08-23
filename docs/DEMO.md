# DEMO.md - Hackathon Presentation & Demo Script

This document structures the 3-minute live demonstration flow for hackathon judges inspecting the Salvus platform.

---

## 1. 3-Minute Live Demo Timeline (Connected Pipeline)

| Timeline        | Stage                                     | Action & Visuals                                                                                                                                                                                                                           | Narrated Script                                                                                                                                                                                                                                         |
| :-------------- | :---------------------------------------- | :----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | :------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **0:00 - 0:45** | **Live Multi-Window Setup**               | Arrange two browser windows side-by-side: Left is **Citizen Portal** (`/citizen`), Right is **Authority Command Center** (`/authority`). Point out the live WebSocket grid connection badge.                                               | _"Welcome. This is Salvus. We are showing you a live, connected disaster intelligence pipeline. On the left is our Citizen application; on the right is the Authority Command Center connected in real time over Socket.IO and FastAPI."_               |
| **0:45 - 1:15** | **Citizen Hazard & SOS Beacon**           | Citizen triggers SOS or submits a hazard report with GPS coordinates. Observe the instant appearance of the incident in the Authority queue and tactical radar map on the right window with **zero page reload**.                          | _"When a citizen triggers an SOS, the beacon transmits live coordinates to our backend. Notice on the right: the incident appears instantly in the ingestion queue, the active counter increments, and a tactical map marker is plotted in real time."_ |
| **1:15 - 1:50** | **Authority Inspection & Verification**   | In the Authority Command Center, operator inspects the live incident, reviews the description and GPS tag, and clicks **"Verify Incident"**. Watch the Citizen window on the left immediately update to **"Request Reviewed & Approved"**. | _"The response coordinator inspects the incident telemetry and verifies dispatch. Notice how the citizen's phone on the left transitions instantly into the verified emergency state without refreshing the page."_                                     |
| **1:50 - 2:30** | **Tactical Operations & Lifecycle Close** | In Authority Command Center, operator clicks **"Resolve Incident"**. Citizen window immediately renders the safe resolution celebration and shelter guidance.                                                                              | _"When the rescue team completes the evacuation, the authority marks the incident resolved. The citizen receives the safe resolution debrief immediately, closing the operational loop with full audit accountability."_                                |
| **2:30 - 3:00** | **Offline Resilience & Demo Dock**        | Demonstrate the Demo Simulator Dock in Citizen view, toggle network connectivity simulation (`CONNECTED` $\rightarrow$ `LIMITED` $\rightarrow$ `OFFLINE`), and demonstrate standalone simulation controls.                                 | _"Salvus is engineered for mission-critical resilience. If cellular towers drop, cached guidance remains accessible. Salvus bridges the communication gap between citizens and authorities to save lives during extreme disasters."_                    |

---

## 2. Interactive Demo Controls & Fail-Safe Simulator

The Citizen Emergency Mode features a floating, collapsible **Demo Simulator Dock** positioned at the bottom of the screen:

- **⚡ Live SOS Button:** Instantly fires a live emergency SOS beacon into the backend database and broadcasts to the authority room in real time.
- **1-Click State Selection:** Instantly jump to any of the 8 states (`SOS`, `Triage`, `Verified`, `Assigned`, `En Route`, `Nearby`, `On Scene`, `Resolved`).
- **Auto Simulation:** Runs the end-to-end rescue journey automatically with smooth transitions.
- **Speed Multiplier:** Toggle between `1x`, `1.5x`, and `2x` simulation speeds.
- **Network Health Simulation:** Toggle between `CONNECTED`, `LIMITED_CONNECTION` (simulating SMS telemetry fallback), and `OFFLINE` (simulating local caching).
- **Dock Minimization:** Click `_` to minimize the dock so it never obscures critical mobile UI elements.
