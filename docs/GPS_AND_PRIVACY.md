# GPS_AND_PRIVACY.md - Location Tracking Protocols & Privacy Safeguards

This document specifies the GPS telemetry protocols, location precision safeguards, and privacy controls implemented across Salvus.

---

## 1. Location Telemetry Lifecycle

- **Normal Mode:** Location access is requested purely on-demand when the user views the situational map to calculate distances to nearby shelters.
- **Active SOS Mode:** Continuous high-accuracy GPS telemetry streaming is activated immediately upon confirming the distress beacon.
- **Resolution / Cancellation:** Location broadcast terminates automatically when the incident status changes to `RESOLVED` or `CANCELLED`.

---

## 2. Telemetry Metadata Structure

```json
{
  "ticketId": "SV-2048",
  "coordinates": {
    "latitude": 22.5726,
    "longitude": 88.3639
  },
  "address": "Sector 12, Salt Lake, Bidhannagar, Kolkata",
  "accuracyMeters": 4.2,
  "telemetryStatus": "LIVE_BROADCASTING",
  "gridConnectivity": "GRID_CONNECTED"
}
```

---

## 3. Network Resilience & Fallback Telemetry

During catastrophic disasters, cellular grid infrastructure can become degraded:

1. **`CONNECTED` (Full Grid):** Continuous high-frequency GPS coordinate sync via WebSocket telemetry.
2. **`LIMITED_CONNECTION` (SMS Telemetry Mode):** Low-frequency delta coordinate compression simulated for SMS fallback channels.
3. **`OFFLINE` (Local Cache Mode):** Distress timestamp and last known coordinates cached in browser storage, accompanied by an explicit warning and offline life-safety instructions.
