# ARCHITECTURE.md - System Architecture & Data Flow

This document details the architectural layout of the Salvus platform.

## 1. System Architecture Diagram

```mermaid
graph TB
    subgraph Client Layer
        CitizenApp[Citizen Web App]
        AdminApp[Authority Dashboard]
    end

    subgraph API Gateway & Server
        Server[Express Node.js Server]
        Sockets[Socket.io Server]
    end

    subgraph AI Orchestration
        Gemini[Gemini API]
        Groq[Groq API Fallback]
    end

    subgraph Data Sources
        USGS[USGS Earthquake Feed]
        GDACS[GDACS Alert Feed]
        OpenMeteo[Open-Meteo Weather API]
    end

    subgraph Persistence Layer
        PostgreSQL[PostgreSQL Database]
        PostGIS[PostGIS Geospatial Engine]
    end

    subgraph Routing Engines
        OSRM[OSRM Routing Server]
    end

    %% Client Communication
    CitizenApp -->|HTTP Post / SOS| Server
    CitizenApp <-->|WebSocket Telemetry| Sockets
    AdminApp <-->|WebSocket Realtime State| Sockets
    AdminApp -->|HTTP Requests| Server

    %% Internal Orchestration
    Server -->|Triage Pipeline| Gemini
    Gemini -.->|Fallback| Groq
    Server -->|Poll Feeds| Data
    Data --> GDACS
    Data --> USGS
    Data --> OpenMeteo

    %% Persistence
    Server -->|Queries & Updates| PostgreSQL
    PostgreSQL --> PostGIS

    %% Routing
    Server -->|Compute ETA & Path| OSRM
```

---

## 2. Component Designations

### Frontend App (Vite + React)
- **Role:** Interactive UI for citizens and authority users.
- **State Management:** Zustand manages application states (e.g. active incident feeds, responder tracks).
- **Caching:** React Query manages API caching and limits network congestion.

### Backend Server (Node.js + Express)
- **Role:** Implements HTTP routes and handles client requests.
- **WebSockets:** Socket.io handles continuous state synchronization, map overlays, and incident telemetry.

### Geospatial DB (Supabase/PostgreSQL + PostGIS)
- **Role:** Stores user records, shelter capacities, incident details, and coordinate indexes.
- **PostGIS:** Computes spatial queries like nearest-neighbor shelter lookup and responder distance metrics.

### AI Processing Node
- **Role:** Categorizes, ranks, and aggregates incoming notifications.
- **Fail-Safe Processing:** If Gemini times out, the server falls back to Groq, then to basic keyword match strings if both fail.
