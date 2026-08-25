"""Routing REST API routes.

Provides clean endpoints for calculating navigational geometries, distances,
durations, and ETAs between coordinates using the OSRM routing service.

Endpoints:
    GET   /api/routing/route — Query route between coordinates
    POST  /api/routing/route — Compute route via payload body
"""

from __future__ import annotations

from fastapi import APIRouter, HTTPException, Query

from app.models import (
    RouteProfile,
    RouteRequest,
    RouteSingleResponse,
)
from app.services import routing_service

router = APIRouter(prefix="/api/routing", tags=["routing"])


@router.get("/route", response_model=RouteSingleResponse)
async def get_route_query(
    origin_lat: float = Query(..., ge=-90, le=90, description="Origin latitude"),
    origin_lng: float = Query(..., ge=-180, le=180, description="Origin longitude"),
    dest_lat: float = Query(..., ge=-90, le=90, description="Destination latitude"),
    dest_lng: float = Query(..., ge=-180, le=180, description="Destination longitude"),
    profile: RouteProfile = Query(
        RouteProfile.DRIVING, description="Routing profile: driving, walking, or boat"
    ),
):
    """Calculate navigational route between origin and destination coordinates."""
    try:
        route = await routing_service.get_route(
            origin_lat=origin_lat,
            origin_lon=origin_lng,
            dest_lat=dest_lat,
            dest_lon=dest_lng,
            profile=profile,
        )
        return RouteSingleResponse(data=route)
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail={
                "success": False,
                "error": {
                    "code": "ROUTING_FAILED",
                    "message": f"Failed to compute route: {str(e)}",
                },
            },
        ) from e


@router.post("/route", response_model=RouteSingleResponse)
async def get_route_body(payload: RouteRequest):
    """Compute navigational route from request payload."""
    try:
        route = await routing_service.get_route(
            origin_lat=payload.origin_latitude,
            origin_lon=payload.origin_longitude,
            dest_lat=payload.destination_latitude,
            dest_lon=payload.destination_longitude,
            profile=payload.profile,
        )
        return RouteSingleResponse(data=route)
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail={
                "success": False,
                "error": {
                    "code": "ROUTING_FAILED",
                    "message": f"Failed to compute route: {str(e)}",
                },
            },
        ) from e
