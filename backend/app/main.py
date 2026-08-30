"""Salvus API — FastAPI application entrypoint.

Run with:
    uvicorn app.main:combined_asgi_app --reload --host 0.0.0.0 --port 8000
"""

from __future__ import annotations

import os
from contextlib import asynccontextmanager

import socketio
from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware

from app.db import close_database, init_database
from app.db.seed import seed_database
from app.middleware import (
    CorrelationIdMiddleware,
    PayloadLimitMiddleware,
    RequestLoggingMiddleware,
    SecurityHeadersMiddleware,
    generic_exception_handler,
    validation_exception_handler,
)
from app.realtime.socket_manager import sio
from app.routes.assignments import router as assignments_router
from app.routes.attachments import router as attachments_router
from app.routes.auth import router as auth_router
from app.routes.hazards import router as hazards_router
from app.routes.health import router as health_router
from app.routes.incidents import router as incidents_router
from app.routes.places import router as places_router
from app.routes.profile import router as profile_router
from app.routes.responders import router as responders_router
from app.routes.routing import router as routing_router
from app.routes.shelters import router as shelters_router
from app.routes.simulation import router as simulation_router
from app.routes.triage import router as triage_router

load_dotenv()


def get_cors_origins() -> list[str]:
    """Parse comma-separated CORS origins from environment."""
    raw = os.getenv("CORS_ORIGIN", "*").strip()
    if not raw or raw == "*":
        return ["*"]
    origins = [item.strip() for item in raw.split(",") if item.strip()]
    return origins if origins else ["*"]


# ---------------------------------------------------------------------------
# Application lifecycle
# ---------------------------------------------------------------------------


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup / shutdown lifecycle manager."""
    # --- Startup ---
    print("[SALVUS] Starting up...")
    db = await init_database()

    # Seed demo data in development mode, if AUTO_SEED=true, or if database is empty
    env = os.getenv("ENVIRONMENT", "development").lower()
    auto_seed = os.getenv("AUTO_SEED", "false").lower() in ("true", "1", "yes")

    cursor = await db.execute("SELECT COUNT(*) FROM responders")
    row = await cursor.fetchone()
    responder_count = row[0] if row else 0

    if env == "development" or auto_seed or responder_count == 0:
        print(
            f"[SALVUS] Seeding emergency coordination dataset "
            f"(env={env}, auto_seed={auto_seed}, initial_responders={responder_count})..."
        )
        await seed_database(db)

    print("[SALVUS] Backend ready for production traffic.")
    yield

    # --- Shutdown ---
    print("[SALVUS] Shutting down...")
    await close_database()


# ---------------------------------------------------------------------------
# FastAPI application
# ---------------------------------------------------------------------------

app = FastAPI(
    title="Salvus API",
    description="Salvus Disaster Intelligence & Rescue Coordination Platform Backend",
    version="0.1.0",
    lifespan=lifespan,
)

# --- Middleware (Executed in reverse order of addition) ---
app.add_middleware(SecurityHeadersMiddleware)
app.add_middleware(PayloadLimitMiddleware)
app.add_middleware(RequestLoggingMiddleware)
app.add_middleware(CorrelationIdMiddleware)

# --- CORS ---
allowed_origins = get_cors_origins()
app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["X-Request-ID"],
)


# --- Error handlers ---
app.add_exception_handler(RequestValidationError, validation_exception_handler)
app.add_exception_handler(Exception, generic_exception_handler)

# --- Routes ---
app.include_router(auth_router)
app.include_router(assignments_router)
app.include_router(attachments_router)
app.include_router(hazards_router)
app.include_router(health_router)
app.include_router(incidents_router)
app.include_router(places_router)
app.include_router(profile_router)
app.include_router(responders_router)
app.include_router(routing_router)
app.include_router(shelters_router)

app.include_router(simulation_router)
app.include_router(triage_router)


@app.get("/")
async def root():
    """Root endpoint — service identification."""
    return {
        "status": "online",
        "service": "Salvus API",
        "version": "0.1.0",
        "docs": "/docs",
        "health": "/health",
    }


# ---------------------------------------------------------------------------
# Combined ASGI app (FastAPI + Socket.IO on the same port)
# ---------------------------------------------------------------------------

combined_asgi_app = socketio.ASGIApp(sio, app)
