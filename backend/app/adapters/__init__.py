"""Salvus Disaster Intelligence & External Alert Adapters (Phase 2).

Exposes modular, fault-isolated adapters for official alert providers:
- SachetAdapter (NDMA India / CAP ETag feed)
- GDACSAdapter (UN / EU Global Disaster Alert & Coordination System)
- USGSAdapter (USGS Earthquake Hazards Program)
- OpenMeteoAdapter (Contextual Meteorological Telemetry)
"""

from __future__ import annotations

from app.adapters.base import BaseAlertAdapter
from app.adapters.gdacs import GDACSAdapter
from app.adapters.open_meteo import OpenMeteoAdapter
from app.adapters.sachet import SachetAdapter
from app.adapters.usgs import USGSAdapter

__all__ = [
    "BaseAlertAdapter",
    "GDACSAdapter",
    "OpenMeteoAdapter",
    "SachetAdapter",
    "USGSAdapter",
]
