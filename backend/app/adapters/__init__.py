"""Salvus Disaster Intelligence & External Alert Adapters (Phase 2 & Phase 3).

Exposes modular, fault-isolated adapters for official alert providers & places:
- SachetAdapter (NDMA India / CAP ETag feed)
- GDACSAdapter (UN / EU Global Disaster Alert & Coordination System)
- USGSAdapter (USGS Earthquake Hazards Program)
- OpenMeteoAdapter (Contextual Meteorological Telemetry)
- OverpassPlacesAdapter (Primary OSM Overpass Places Provider)
- NominatimPlacesAdapter (Secondary OSM Nominatim Places Provider)
"""

from __future__ import annotations

from app.adapters.base import BaseAlertAdapter
from app.adapters.gdacs import GDACSAdapter
from app.adapters.imd import IMDAdapter
from app.adapters.nominatim import NominatimPlacesAdapter
from app.adapters.odisha_flood import OdishaFloodAdapter
from app.adapters.open_meteo import OpenMeteoAdapter
from app.adapters.osdma import OSDMAAdapter
from app.adapters.places import NearbyPlacesProvider, OverpassPlacesAdapter
from app.adapters.sachet import SachetAdapter
from app.adapters.usgs import USGSAdapter

__all__ = [
    "BaseAlertAdapter",
    "GDACSAdapter",
    "IMDAdapter",
    "NearbyPlacesProvider",
    "NominatimPlacesAdapter",
    "OdishaFloodAdapter",
    "OpenMeteoAdapter",
    "OSDMAAdapter",
    "OverpassPlacesAdapter",
    "SachetAdapter",
    "USGSAdapter",
]
