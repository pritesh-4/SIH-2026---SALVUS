# DEMO.md - Hackathon Presentation & Demo Script

This document structures the 3-minute live demonstration flow for hackathon judges inspecting the Salvus platform.

---

## 1. 3-Minute Live Demo Timeline

| Timeline        | Stage                                 | Action & Visuals                                                                                                                                                                                                                | Narrated Script                                                                                                                                                                                                                                                                       |
| :-------------- | :------------------------------------ | :------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | :------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **0:00 - 0:45** | **Authority Command Center**          | Open `/authority`. Highlight the top KPI bar (14 active incidents, 8 units deployed, 68% shelter occupancy). Select critical flood incident in queue to show AI triage score and 1-click dispatch.                              | _"Welcome. This is Salvus, a real-time disaster intelligence and rescue coordination ecosystem. Coordinators open the Authority Command Center to see live crisis KPIs, tactical flood hydrographic overlays, and an active incident queue prioritized by AI urgency index."_         |
| **0:45 - 1:15** | **Citizen Safety Console**            | Click `[ 👤 Citizen App ]` in the top bar to switch instantly. Show the calm safety status. Click "Report Incident" to demonstrate the in-app 3-step hazard reporting modal. Switch to Map to show offline safe route guidance. | _"For citizens, Salvus provides a calm, low-cognitive-load safety console. Citizens can report localized hazards in-app or view offline safe-route guidance that bypasses submerged underpasses to reach evacuation shelters."_                                                       |
| **1:15 - 1:50** | **Citizen SOS & AI Triage**           | On Citizen Home, click "SEND SOS". Hold to confirm. Observe instant transition to Emergency Mode (`#SV-2048`). Notice progressive disclosure elevating the AI triage breakdown.                                                 | _"When trapped by rising water, the citizen triggers an SOS. Live GPS telemetry streaming begins immediately. Our operational AI categorizes the crisis as a Tier 4 Flash Flood and recommends Zodiac inflatable craft deployment."_                                                  |
| **1:50 - 2:30** | **Dispatch & Live Tracking**          | Transition through `ASSIGNED` to `EN_ROUTE`. Observe the center card seamlessly transition into the Tactical Rescue Radar with moving vessel icon and dynamic ETA countdown (4m).                                               | _"A human dispatcher confirms the order, assigning NDRF Unit 4. As Capt. Roy navigates the transit channel, the citizen sees live vessel coordinates, route vectors, and ETA countdowns on their rescue radar."_                                                                      |
| **2:30 - 3:00** | **Proximity, Arrival & Safe Debrief** | Transition through `NEARBY` (<100m torch pulse instructions) to `ON_SCENE` and `RESOLVED` (total time 8m 42s).                                                                                                                  | _"Within 100 meters, Salvus provides visual torch signaling guidance. Responders reach the location, fit life jackets, and transport evacuees to the stadium shelter. The incident resolves with complete response audit metrics. Salvus closes the coordination gap to save lives."_ |

---

## 2. Interactive Demo Controls & Fail-Safe Simulator

The Citizen Emergency Mode features a floating, collapsible **Demo Simulator Dock** positioned at the bottom of the screen:

- **1-Click State Selection:** Instantly jump to any of the 8 states (`SOS`, `Triage`, `Verified`, `Assigned`, `En Route`, `Nearby`, `On Scene`, `Resolved`).
- **Auto Simulation:** Runs the end-to-end rescue journey automatically with smooth transitions.
- **Speed Multiplier:** Toggle between `1x`, `1.5x`, and `2x` simulation speeds.
- **Network Health Simulation:** Toggle between `CONNECTED`, `LIMITED_CONNECTION` (simulating SMS telemetry fallback), and `OFFLINE` (simulating local caching).
- **Dock Minimization:** Click `_` to minimize the dock so it never obscures critical mobile UI elements.
