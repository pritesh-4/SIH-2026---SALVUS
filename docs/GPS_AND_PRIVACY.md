# GPS_AND_PRIVACY.md - Location Tracking & User Privacy

This document defines the protocols, intervals, and data retention standards for GPS coordinates on the Salvus platform.

---

## 1. Citizen Tracking Protocol

To ensure user privacy, continuous geolocation tracking must never execute by default.

- **Triggering Event:** Location tracking activates **only** when the user clicks the "Initiate SOS" button on the citizen portal.
- **Consent:** A browser prompt must explicitly request permission:
  > _"Salvus needs continuous access to your location to route rescue personnel directly to you during this emergency."_
- **Access Method:** Implementation uses the HTML5 Geolocation API:
  ```javascript
  navigator.geolocation.watchPosition(
    (position) => handleLocationUpdate(position),
    (error) => handleTrackingError(error),
    { enableHighAccuracy: true, timeout: 5000, maximumAge: 0 }
  )
  ```

---

## 2. Terminating Location Tracking

Once the emergency event ends, coordinates transmission must stop immediately:

- **Resolution Stop:** The server terminates socket subscription of `incident:<id>` when incident status updates to `'resolved'`.
- **Citizen-Side Reset:** The browser executes `clearWatch(watchId)` to turn off continuous tracking, returning the app state to passive monitoring.

---

## 3. Telemetry Simulation for Demo

Since real-world responder vehicles cannot be mapped on the fly during a hackathon, we apply a **telemetry simulation framework**:

- **Mechanism:** Telemetry routes are requested from the OSRM path engine. A local timer function iterates and publishes steps along that path.
- **Visual Guard:** These simulated points must be marked in the code and UI with a `[SIMULATION]` status indicator to distinguish them from live telemetry inputs.
