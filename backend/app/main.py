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
from app.middleware import generic_exception_handler, validation_exception_handler
from app.realtime.socket_manager import sio
from app.routes.assignments import router as assignments_router
from app.routes.hazards import router as hazards_router
from app.routes.health import router as health_router
from app.routes.incidents import router as incidents_router
from app.routes.responders import router as responders_router
from app.routes.routing import router as routing_router
from app.routes.shelters import router as shelters_router
from app.routes.simulation import router as simulation_router
from app.routes.triage import router as triage_router

load_dotenv()


# ---------------------------------------------------------------------------
# Application lifecycle
# ---------------------------------------------------------------------------


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup / shutdown lifecycle manager."""
    # --- Startup ---
    print("[SALVUS] Starting up...")
    db = await init_database()

    # Seed demo data in development mode
    env = os.getenv("ENVIRONMENT", "development")
    if env == "development":
        await seed_database(db)

    print("[SALVUS] Backend ready.")
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

# --- CORS ---
cors_origin = os.getenv("CORS_ORIGIN", "*")
app.add_middleware(
    CORSMiddleware,
    allow_origins=[cors_origin] if cors_origin != "*" else ["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- Error handlers ---
app.add_exception_handler(RequestValidationError, validation_exception_handler)
app.add_exception_handler(Exception, generic_exception_handler)

# --- Routes ---
app.include_router(assignments_router)
app.include_router(hazards_router)
app.include_router(health_router)
app.include_router(incidents_router)
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
    }


# ---------------------------------------------------------------------------
# Combined ASGI app (FastAPI + Socket.IO on the same port)
# ---------------------------------------------------------------------------

combined_asgi_app = socketio.ASGIApp(sio, app)
