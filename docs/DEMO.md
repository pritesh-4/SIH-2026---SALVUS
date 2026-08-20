# DEMO.md - Hackathon Presentation & Demo Script

This document structures the 3-minute live demonstration flow for hackathon judges.

---

## 1. 3-Minute Demo Timeline

| Timeline        | Stage                         | Action & Visuals                                                                                                                                                                                    | Narrated Script                                                                                                                                                                                  |
| :-------------- | :---------------------------- | :-------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | :----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **0:00 - 0:30** | **Live Command Center**       | Load authority dashboard. Show active weather alerts (Open-Meteo), earthquake pins (USGS), and responder/shelter status indicators.                                                                 | _"Welcome. This is Salvus, a live disaster intelligence center. We monitor weather alerts and USGS seismic events, tracking active shelters and responder status in real-time."_                 |
| **0:30 - 1:15** | **Citizen SOS Trigger**       | Load Citizen portal on a mobile layout. Click "SOS" and type: _"Water is up to my waist. Trapped on the roof of my house."_                                                                         | _"In a crisis, a citizen opens our portal, triggers an SOS, and types their situation. Instantly, GPS tracking initiates, and the raw report is sent for AI parsing."_                           |
| **1:15 - 2:00** | **AI Triage & Allocation**    | Switch back to Admin Dashboard. An active incident appears at the top: **Category:** _Flood_, **Severity:** _Critical_, **AI Confidence:** _98%_. Click incident to display recommended responders. | _"Our backend instantly processes the message using LLMs to structure incident classification and severity. Salvus calculates optimized assignments using proximity, capability, and workload."_ |
| **2:00 - 2:30** | **Dispatch & Route Tracking** | Dispatcher clicks "Approve Dispatch". The responder marker updates to _En Route_ and starts moving along the OSRM route.                                                                            | _"We assign the closest responder with flood rescue capability. As the dispatcher approves, the responder tracks toward the coordinate, providing ETAs instantly to the citizen."_               |
| **2:30 - 3:00** | **Resolution & Wrap-up**      | Mark incident resolved. Dashboard updates capacity stats. Display final roadmap.                                                                                                                    | _"Once the citizen is rescued, they are directed to the nearest high-capacity shelter. The incident resolves, and the command map updates. Salvus bridges the coordination gap to save lives."_  |

---

## 2. Fail-Safe Fallback Plan

### Fallback: AI API Interruption

- **Risk:** Gemini or Groq keys hit rate limits or lose connectivity.
- **Mitigation:** The dashboard features a mock-override toggle. Clicking this skips LLM API calls and applies regex matching to mock the structured JSON output.

### Fallback: Wi-Fi / Local Server Failure

- **Risk:** Loss of local connection during presentation.
- **Mitigation:** The application includes a self-contained local seed generator. Toggling **Demo Mock Mode** runs all steps entirely in memory, removing API and DB connection requirements.
