"""Disaster Intelligence, Normalized Hazards, and Situation Summary REST API routes.

Endpoints:
    GET  /api/hazards            — Multi-source normalized hazards with location filtering
    GET  /api/hazards/clusters   — Spatial incident clusters
    GET  /api/situation/summary  — Grounded situation statistics & AI briefing
"""

from __future__ import annotations

from datetime import UTC, datetime

from fastapi import APIRouter, Query

from app.db import get_database
from app.models import (
    AlertStatus,
    AreaSafetyResponse,
    HazardListResponse,
    HazardSeverity,
    IncidentClusterListResponse,
    SituationSummaryResponse,
    WeatherIntelligenceResponse,
)
from app.services import (
    clustering_service,
    hazard_service,
    incident_service,
    situation_service,
)
from app.services.alert_context_service import generate_deterministic_briefing

router = APIRouter(tags=["disaster_intelligence"])


@router.get("/api/weather", response_model=WeatherIntelligenceResponse)
@router.get("/api/weather/current", response_model=WeatherIntelligenceResponse)
async def get_weather(
    lat: float = Query(..., ge=-90, le=90, description="Citizen latitude"),
    lon: float = Query(..., ge=-180, le=180, description="Citizen longitude"),
):
    """Retrieve normalized real-time weather and hourly forecast intelligence."""
    return await hazard_service.get_weather_intelligence(lat=lat, lon=lon)


@router.get("/api/hazards", response_model=HazardListResponse)
@router.get("/api/alerts", response_model=HazardListResponse)
async def list_hazards(
    lat: float | None = Query(default=None, ge=-90, le=90, description="Citizen latitude"),
    lon: float | None = Query(default=None, ge=-180, le=180, description="Citizen longitude"),
    max_distance_km: float | None = Query(default=None, ge=0.1, le=100.0),
    include_simulation: bool = Query(
        default=False, description="Include simulated alerts for testing/demo"
    ),
):
    """Retrieve normalized active disaster signals with optional location filtering."""
    now_iso = datetime.now(UTC).isoformat()
    hazards = await hazard_service.get_active_hazards(
        lat=lat,
        lon=lon,
        max_distance_km=max_distance_km,
        include_simulation=include_simulation,
    )
    data_quality = hazard_service.compute_data_quality()

    # Weather telemetry if coordinates are provided
    weather_cond = None
    if lat is not None and lon is not None:
        try:
            weather_resp = await hazard_service.get_weather_intelligence(lat=lat, lon=lon)
            weather_cond = weather_resp.current
        except Exception:
            pass

    active_warnings = sum(
        1 for h in hazards if h.severity in (HazardSeverity.CRITICAL, HazardSeverity.WARNING)
    )
    upcoming_risks = sum(
        1
        for h in hazards
        if h.severity in (HazardSeverity.WATCH, HazardSeverity.ADVISORY)
        or h.status == AlertStatus.UPCOMING
    )

    summary_text = generate_deterministic_briefing(
        active_alerts=hazards,
        weather=weather_cond,
        data_quality=data_quality,
    )

    return HazardListResponse(
        data=hazards,
        count=len(hazards),
        data_quality=data_quality,
        current_conditions_summary=summary_text,
        active_local_warnings_count=active_warnings,
        upcoming_risks_count=upcoming_risks,
        last_updated=now_iso,
        source_summary=(
            "Open-Meteo Weather, IMD Warnings, OSDMA SATARK, Odisha Flood Authority, "
            "USGS Earthquakes, SACHET NDMA, GDACS"
        ),
        sources=hazard_service.get_source_statuses(),
        sources_health=hazard_service.get_source_health_reports(),
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
