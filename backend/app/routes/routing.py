"""Routing REST API routes.

Provides clean endpoints for calculating navigational geometries, distances,
durations, and ETAs between coordinates using the OSRM routing service.

Endpoints:
    GET   /api/routing/route — Query route between coordinates
    GET   /api/routes         — Architecture-consistent alias
    POST  /api/routing/route — Compute route via payload body
    POST  /api/routes         — Architecture-consistent payload route
"""

from __future__ import annotations

from fastapi import APIRouter, HTTPException, Query

from app.models import (
    RouteProfile,
    RouteRequest,
    RouteSingleResponse,
)
from app.services import routing_service

router = APIRouter(tags=["routing"])


def _parse_coord_param(
    lat: float | None,
    lon: float | None,
    coord_str: str | None,
    name: str,
) -> tuple[float, float]:
    """Parse coordinate tuple from either lat/lon numbers or comma-separated string."""
    if lat is not None and lon is not None:
        return lat, lon

    if coord_str:
        parts = coord_str.split(",")
        if len(parts) == 2:
            try:
                return float(parts[0].strip()), float(parts[1].strip())
            except ValueError as err:
                raise ValueError(f"Invalid coordinate string for {name}: '{coord_str}'") from err

    raise ValueError(f"Missing required coordinates for {name}")


async def _handle_route_calc(
    origin_lat: float,
    origin_lon: float,
    dest_lat: float,
    dest_lon: float,
    profile: RouteProfile | str,
) -> RouteSingleResponse:
    """Execute route calculation with normalized error handling."""
    try:
        route = await routing_service.get_route(
            origin_lat=origin_lat,
            origin_lon=origin_lon,
            dest_lat=dest_lat,
            dest_lon=dest_lon,
            profile=profile,
        )
        return RouteSingleResponse(data=route)
    except ValueError as ve:
        raise HTTPException(
            status_code=422,
            detail={
                "success": False,
                "error": {
                    "code": "INVALID_COORDINATES",
                    "message": str(ve),
                },
            },
        ) from ve
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail={
                "success": False,
                "error": {
                    "code": "ROUTE_UNAVAILABLE",
                    "message": f"Failed to compute route: {str(e)}",
                },
            },
        ) from e


@router.get("/api/routing/route", response_model=RouteSingleResponse)
@router.get("/api/routes", response_model=RouteSingleResponse)
async def get_route_query(
    origin_lat: float | None = Query(None, description="Origin latitude (-90 to 90)"),
    origin_lng: float | None = Query(None, description="Origin longitude (-180 to 180)"),
    origin_lon: float | None = Query(None, description="Origin longitude alias"),
    dest_lat: float | None = Query(None, description="Destination latitude (-90 to 90)"),
    dest_lng: float | None = Query(None, description="Destination longitude (-180 to 180)"),
    dest_lon: float | None = Query(None, description="Destination longitude alias"),
    origin: str | None = Query(None, description="Origin as 'lat,lon' string"),
    destination: str | None = Query(None, description="Destination as 'lat,lon' string"),
    profile: RouteProfile = Query(
        RouteProfile.DRIVING, description="Routing profile: driving, walking, or boat"
    ),
):
    """Calculate navigational route between origin and destination coordinates."""
    try:
        resolved_origin_lon = origin_lng if origin_lng is not None else origin_lon
        resolved_dest_lon = dest_lng if dest_lng is not None else dest_lon

        o_lat, o_lon = _parse_coord_param(origin_lat, resolved_origin_lon, origin, "origin")
        d_lat, d_lon = _parse_coord_param(dest_lat, resolved_dest_lon, destination, "destination")
    except ValueError as err:
        raise HTTPException(
            status_code=422,
            detail={
                "success": False,
                "error": {
                    "code": "INVALID_COORDINATES",
                    "message": str(err),
                },
            },
        ) from err

    return await _handle_route_calc(o_lat, o_lon, d_lat, d_lon, profile)


@router.post("/api/routing/route", response_model=RouteSingleResponse)
@router.post("/api/routes", response_model=RouteSingleResponse)
async def get_route_body(payload: RouteRequest):
    """Compute navigational route from request payload."""
    return await _handle_route_calc(
        origin_lat=payload.origin_latitude,
        origin_lon=payload.origin_longitude,
        dest_lat=payload.destination_latitude,
        dest_lon=payload.destination_longitude,
        profile=payload.profile,
    )
