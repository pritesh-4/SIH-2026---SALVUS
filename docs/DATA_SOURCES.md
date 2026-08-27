# DATA_SOURCES.md — Data Source Matrix & Integration Registry

This document tracks all external weather, seismic, mapping, sensor, and AI APIs integrated into the Salvus ecosystem, along with their live vs. simulated status and fallback strategies.

---

## 1. External Data Source Matrix

| Data Source                                | Status            | Protocol              | Operational Purpose                                                          | Fallback / Resilience Strategy                                                |
| :----------------------------------------- | :---------------- | :-------------------- | :--------------------------------------------------------------------------- | :---------------------------------------------------------------------------- |
| **Open-Meteo Weather API**                 | **LIVE**          | HTTP GET              | Pulls precipitation, flood risk, and wind velocity signals.                  | In-memory cache with fallback to regional disaster baseline.                  |
| **USGS Earthquake Hazards Feed**           | **LIVE**          | HTTP GeoJSON          | Ingests active global seismic events and shake intensities.                  | Cached local seismic event store.                                             |
| **OpenStreetMap Raster Tiles**             | **LIVE**          | HTTPS Tiles           | Base layer tactical radar map tiles.                                         | Dark CSS-filtered raster server with browser caching.                         |
| **OSRM Routing Engine**                    | **LIVE**          | HTTP API              | Calculates real-world road and water travel distances, geometries, and ETAs. | 5-minute TTL cache; automatic fallback to 15-waypoint curved vector corridor. |
| **Google Gemini API (`gemini-2.5-flash`)** | **LIVE / HYBRID** | HTTPS REST            | Unstructured text extraction, triage classification, urgency scoring.        | Automatic waterfall to Groq Llama-3.3 $\rightarrow$ Deterministic Heuristics. |
| **Groq Cloud API (`llama-3.3-70b`)**       | **LIVE / HYBRID** | HTTPS REST            | Secondary low-latency LLM inference.                                         | Automatic waterfall to Deterministic Heuristics.                              |
| **Citizen Distress Beacons**               | **LIVE**          | HTTP POST / Socket.IO | Emergency distress telemetry, victim headcounts, GPS pins.                   | Local `sessionStorage` draft persistence if network drops.                    |
| **Responder Fleet Telemetry**              | **SIMULATED**     | Internal Engine       | Deterministic GPS movement along calculated route corridors.                 | Visually stamped with `<SimulatedBadge />` in UI.                             |
| **Sensor Water Level Inundation**          | **SIMULATED**     | Seed Generator        | Hydro-contour flood visualization overlays on Leaflet.                       | Visually stamped with `<SimulatedBadge />` in UI.                             |

---

## 2. Rate Limits & Geospatial Caching

1. **OSRM Route Rate Management:** Public OSRM endpoints can rate-limit high-frequency polling. `routing_service.py` implements an in-memory TTL cache with coordinates rounded to 4 decimals ($\sim 11\text{m}$ precision), reducing external network requests by $>80\%$.
2. **AI Provider Fallback Latency:** Each LLM provider is bounded by a strict 3.0-second timeout. If a provider fails or times out, the system fails over immediately without blocking the ASGI event loop.
