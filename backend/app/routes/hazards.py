"""Disaster Intelligence, Normalized Hazards, and Situation Summary REST API routes.

Endpoints:
    GET  /api/hazards            — Multi-source normalized hazards with location filtering
    GET  /api/hazards/clusters   — Spatial incident clusters
    GET  /api/situation/summary  — Grounded situation statistics & AI briefing
"""

from __future__ import annotations

from fastapi import APIRouter, Query

from app.db import get_database
from app.models import (
    AreaSafetyResponse,
    HazardListResponse,
    IncidentClusterListResponse,
    SituationSummaryResponse,
)
from app.services import (
    clustering_service,
    hazard_service,
    incident_service,
    situation_service,
)

router = APIRouter(tags=["disaster_intelligence"])


@router.get("/api/hazards", response_model=HazardListResponse)
async def list_hazards(
    lat: float | None = Query(default=None, ge=-90, le=90, description="Citizen latitude"),
    lon: float | None = Query(default=None, ge=-180, le=180, description="Citizen longitude"),
    max_distance_km: float | None = Query(default=None, ge=0.1, le=100.0),
):
    """Retrieve normalized active disaster signals with optional location filtering."""
    hazards = await hazard_service.get_active_hazards(
        lat=lat, lon=lon, max_distance_km=max_distance_km
    )
    return HazardListResponse(
        data=hazards,
        count=len(hazards),
        source_summary="Open-Meteo, USGS, GDACS, IMD Normalized Feeds",
    )


@router.get("/api/hazards/area-status", response_model=AreaSafetyResponse)
@router.get("/api/hazards/safety-status", response_model=AreaSafetyResponse)
async def get_area_safety_status(
    lat: float | None = Query(default=None, ge=-90, le=90, description="Citizen latitude"),
    lon: float | None = Query(default=None, ge=-180, le=180, description="Citizen longitude"),
):
    """Evaluate location-grounded area safety threat level.

    Possible levels: SAFE, WATCH, WARNING, CRITICAL, NO_DATA, LOCATION_REQUIRED.
    """
    db = await get_database()
    return await hazard_service.evaluate_area_safety(lat=lat, lon=lon, db=db)


@router.get("/api/hazards/clusters", response_model=IncidentClusterListResponse)
async def list_incident_clusters():
    """Retrieve spatial clusters of active emergency incidents."""
    db = await get_database()
    incidents = await incident_service.get_all_incidents(db)
    clusters = clustering_service.cluster_incidents(incidents)
    return IncidentClusterListResponse(data=clusters, count=len(clusters))


@router.get("/api/situation/summary", response_model=SituationSummaryResponse)
async def get_situation_summary():
    """Retrieve authority situational briefing and ground truth operational statistics."""
    db = await get_database()
    return await situation_service.get_situation_summary(db)
