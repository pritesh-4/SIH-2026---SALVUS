# ARCHITECTURE.md - System Architecture & Component Design

This document details the architectural layout, component boundaries, state management models, geospatial mapping engine, and backend foundation of the Salvus platform.

---

## 1. System Architecture Diagram

```mermaid
flowchart TB
    subgraph Client_App ["Client Application Layer (React 19 + Leaflet + Vite)"]
        direction TB
        CitizenPortal["Citizen Safety Console (/citizen)"]
        CitizenMap["Situational Map (/citizen/map - Leaflet)"]
        CitizenEmergency["Progressive Emergency Console (/citizen/sos)"]
        AuthorityCenter["Authority Command Center (/authority - Leaflet)"]
        RealtimeSocket["Realtime Socket Manager (src/lib/realtime/socket.js)"]
        APIService["API Client Service (src/services/api.js)"]
        DevDemoPanel["Developer Resilience Suite (DevDemoControls)"]

        CitizenPortal <--> CitizenEmergency
        CitizenPortal <-->|"1-Click Switcher"| AuthorityCenter
        CitizenPortal --> APIService
        CitizenEmergency --> APIService
        CitizenEmergency <--> RealtimeSocket
        AuthorityCenter --> APIService
        AuthorityCenter <--> RealtimeSocket
    end

    subgraph Backend_App ["Backend Foundation Layer (Python FastAPI)"]
        direction TB
        APIGateway["FastAPI REST Endpoints (/api/incidents, /health, /dev/*)"]
        SocketEngine["Async Socket.IO Server (Rooms: authorities, incident:id)"]
        DomainService["Incident Service & Deterministic State Machine"]
        DBLayer["Async SQLite Storage (aiosqlite + WAL Mode)"]

        APIGateway <--> DomainService
        SocketEngine <--> DomainService
        DomainService <--> DBLayer
    end

    %% Wiring
    APIService -.->|HTTP/REST| APIGateway
    RealtimeSocket -.->|WebSockets| SocketEngine
```

---

## 2. Geospatial Foundation

- **Engine:** Leaflet (`L.map`, `L.tileLayer`, `L.divIcon`, `L.circle`).
- **Base Layer:** OpenStreetMap dark-mode filtered tiles.
- **Markers:**
  - Citizen distress beacons (pulsing red for Critical/NEW, sky for Verified, emerald for Resolved, slate for Cancelled).
  - Safe Evacuation Shelters (emerald assembly points with capacity info).
  - Responder Fleet (sky craft pins).
  - Citizen Current GPS location (pulsing blue dot with accuracy ring).
- **Auto-Centering:** Smooth programmatic camera panning when selecting queue items without disorienting zoom.

---

## 3. Data Provenance & Badging Architecture

- `<LiveBadge />`: Stamped on all genuine, database-backed records synced over WebSockets.
- `<SimulatedBadge />`: Stamped on mock background datasets (fleet matrix, simulated weather, mock shelter supply).

---

## 4. Frontend Component Hierarchy

```
src/
├── layouts/
│   ├── CitizenLayout.jsx          # Top Navbar + BottomNav + DevDemoControls + Outlet
│   └── AuthorityLayout.jsx        # Command Bar + Status + DevDemoControls + Outlet
├── pages/
│   ├── CitizenHome.jsx            # Safety status, live SOS trigger, hazard report modal
│   ├── CitizenMap.jsx             # Situational Leaflet map + Safe Route Briefing modal
│   ├── CitizenAlerts.jsx          # Categorized advisory stream & safety recommendations
│   ├── CitizenProfile.jsx         # Identity, medical passport, contacts, siren test
│   ├── CitizenEmergency.jsx       # State-focused progressive emergency experience
│   └── AuthorityCommandCenter.jsx # Realtime metrics, live incident queue, Leaflet map
├── components/
│   ├── common/
│   │   ├── SalvusLeafletMap.jsx   # Reusable dark-styled Leaflet map
│   │   ├── SimulatedBadge.jsx     # Visual data provenance badges
│   │   └── DevDemoControls.jsx    # Developer demo & resilience control dock
│   └── citizen/
│       ├── IncidentReportModal.jsx # Location confirmation, draft auto-save, deduplication
│       └── emergency/
│           ├── LocationStatusBanner.jsx # Emergency location & offline trust banner
│           ├── RescueRadarMap.jsx       # Tactical vector map with simulated badge
│           └── ResponderPreviewCard.jsx # Responder details with simulated badge
├── features/
│   ├── authority/
│   │   └── useAuthorityIncidents.js # Out-of-order guards & silent reconnect sync
│   └── citizen/emergency/
│       └── useEmergencyState.js     # Live emergency lifecycle hook with room sync
├── lib/
│   ├── location.js                # Accuracy tier ratings, landmark catalog, privacy guards
│   └── realtime/
│       └── socket.js              # Socket.IO client with room rejoining on reconnect
└── services/
    └── api.js                     # Centralized REST client with dev tools support
```
