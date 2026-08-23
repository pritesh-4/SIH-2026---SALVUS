# GPS_AND_PRIVACY.md - Location Tracking Protocols & Privacy Safeguards

This document specifies the GPS telemetry protocols, location precision safeguards, and privacy controls implemented across Salvus.

---

## 1. Privacy & Battery Policy: Emergency-Only Tracking

Salvus enforces a strict privacy and battery conservation architecture:

1. **Regular Hazard Reporting (On-Demand Only):**
   - Single, one-off location acquisition via `getCurrentLocation()` triggered only when the citizen opens the report dialog or explicitly refreshes.
   - Continuous location tracking outside active emergency mode is **strictly prohibited**.
2. **Active SOS Mode (Emergency Telemetry):**
   - Continuous high-accuracy GPS telemetry streaming (`watchEmergencyLocation()`) is activated **strictly and only upon user SOS confirmation**.
   - Clear on-screen confirmation displays: **"YOUR EMERGENCY LOCATION"** with active coordinates, accuracy rating, and explicit assurance.
   - User is always aware of when and what coordinates are transmitted.
3. **Termination on Close:**
   - Location streaming terminates immediately and cleans up geolocation watch handles when the incident transitions to `RESOLVED` or `CANCELLED`.

---

## 2. Location Accuracy Translation

Rather than exposing confusing technical raw numbers, accuracy in meters is translated into clear operational ratings:

| Raw Accuracy Range | Humanized UI Label          | Tier Rating   | UI Badge Styling |
| :----------------- | :-------------------------- | :------------ | :--------------- |
| $\le 15\text{ m}$  | `High Precision (±Xm)`      | `HIGH`        | Emerald Badge    |
| $\le 50\text{ m}$  | `Good Accuracy (±Xm)`       | `GOOD`        | Sky Badge        |
| $\le 200\text{ m}$ | `Approximate (±Xm)`         | `APPROXIMATE` | Amber Badge      |
| $> 200\text{ m}$   | `Cell / Grid Triangulation` | `LOW`         | Orange Badge     |

---

## 3. Manual Landmark Confirmation Fallback

If browser geolocation permission is denied, timed out, or unavailable, the system defaults gracefully to the sector centroid while presenting a one-click **Landmark Selector**:

- Sector 12 Community Hub (`22.5726° N, 88.3639° E`)
- Karunamoyee Central Bus Terminus (`22.5867° N, 88.4178° E`)
- Salt Lake Stadium Evacuation Gate (`22.5680° N, 88.4060° E`)
- Sector 5 Electronics Complex (`22.5800° N, 88.4350° E`)
- Eastern Metropolitan Bypass Junction (`22.5510° N, 88.3980° E`)
- Ultadanga Transit Hub (`22.5960° N, 88.3880° E`)

---

## 4. Offline Resilience & SOS Reassurance

When network disruption occurs during an active SOS beacon:

- The UI explicitly displays: **"Emergency request remains active in dispatcher queue. Live updates temporarily reconnecting."**
- Distress timestamp and last known coordinates are preserved in local memory to ensure uninterrupted operational safety.
