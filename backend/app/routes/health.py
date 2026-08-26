"""Production health and readiness probe route."""

from __future__ import annotations

import os
from datetime import UTC, datetime

from fastapi import APIRouter
from fastapi.responses import JSONResponse

from app.db import get_database

router = APIRouter()


@router.get("/health")
@router.get("/healthz")
@router.get("/api/health")
async def health_check():
    """Production health & readiness probe with database connectivity verification."""
    now_iso = datetime.now(UTC).isoformat()
    env = os.getenv("ENVIRONMENT", "development")

    db_status = "disconnected"
    try:
        db = await get_database()
        cursor = await db.execute("SELECT 1")
        row = await cursor.fetchone()
        if row and row[0] == 1:
            db_status = "connected"
    except Exception as exc:
        db_status = f"unhealthy: {exc}"

    is_healthy = db_status == "connected"
    status_code = 200 if is_healthy else 503

    payload = {
        "status": "healthy" if is_healthy else "degraded",
        "service": "Salvus API",
        "version": "0.1.0",
        "environment": env,
        "database": db_status,
        "timestamp": now_iso,
    }

    return JSONResponse(status_code=status_code, content=payload)
