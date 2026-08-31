"""Salvus API — FastAPI application entrypoint.

Run with:
    uvicorn app.main:combined_asgi_app --reload --host 0.0.0.0 --port 8000
"""

from __future__ import annotations

import os
from contextlib import asynccontextmanager

import socketio
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from starlette.exceptions import HTTPException as StarletteHTTPException

from app.db import close_database, init_database
from app.middleware import (
    CorrelationIdMiddleware,
    PayloadLimitMiddleware,
    RequestLoggingMiddleware,
    SecurityHeadersMiddleware,
    generic_exception_handler,
    http_exception_handler,
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


def get_cors_config() -> dict:
    """Parse CORS configuration from environment with spec-compliant credentials handling."""
    raw = os.getenv("CORS_ORIGIN", "").strip()
    if not raw:
        # Safe default when unset: local dev origins + regex for Vercel and Render deployments
        origins = [
            "http://localhost:5173",
            "http://localhost:3000",
            "http://localhost:4173",
            "http://localhost:8000",
            "http://127.0.0.1:5173",
            "http://127.0.0.1:3000",
            "http://127.0.0.1:4173",
            "http://127.0.0.1:8000",
        ]
        return {
            "allow_origins": origins,
            "allow_origin_regex": r"https://.*(\.vercel\.app|\.onrender\.com)",
            "allow_credentials": True,
        }

    origins = [item.strip() for item in raw.split(",") if item.strip()]
    if "*" in origins or raw == "*":
        return {
            "allow_origins": ["*"],
            "allow_origin_regex": None,
            "allow_credentials": False,
        }
    return {
        "allow_origins": origins,
        "allow_origin_regex": None,
        "allow_credentials": True,
    }


def get_cors_origins() -> list[str]:
    """Parse comma-separated CORS origins from environment (backwards-compatibility helper)."""
    return get_cors_config()["allow_origins"]


# ---------------------------------------------------------------------------
# Application lifecycle
# ---------------------------------------------------------------------------


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup / shutdown lifecycle manager."""
    # --- Startup ---
    print("[SALVUS] Starting up...")
    db = await init_database()

    # Always ensure authentication foundation exists for registered / demo accounts
    from app.db.seed import (
        cleanup_legacy_demo_records,
        seed_auth_users,
        seed_operational_dataset,
    )

    auth_counts = await seed_auth_users(db)

    # Seed operational data only if AUTO_SEED is true
    auto_seed = os.getenv("AUTO_SEED", "false").lower() in ("true", "1", "yes")
    if auto_seed:
        print("[SALVUS] AUTO_SEED=true: Seeding operational demo scenario into database...")
        operational_counts = await seed_operational_dataset(db)
        print(
            f"[SEED] Seeded {operational_counts['incidents']} incidents, "
            f"{operational_counts['responders']} responders, "
            f"{operational_counts['shelters']} shelters, "
            f"{auth_counts['citizen_profiles']} citizen profiles, "
            f"{operational_counts['emergency_contacts']} emergency contacts, "
            f"{auth_counts['users']} demo users."
        )
    else:
        # In Live Mode (AUTO_SEED=false): Prune any leftover demo records from previous runs
        cleaned = await cleanup_legacy_demo_records(db)
        if (
            cleaned["deleted_incidents"] > 0
            or cleaned["deleted_responders"] > 0
            or cleaned["deleted_shelters"] > 0
        ):
            print(
                f"[SALVUS] Live Cleanup: Pruned {cleaned['deleted_incidents']} demo incidents, "
                f"{cleaned['deleted_responders']} units, {cleaned['deleted_shelters']} shelters."
            )
        print("[SALVUS] Live Mode active (AUTO_SEED=false): Operational database clean.")

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
cors_cfg = get_cors_config()
app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_cfg["allow_origins"],
    allow_origin_regex=cors_cfg["allow_origin_regex"],
    allow_credentials=cors_cfg["allow_credentials"],
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["X-Request-ID"],
)


# --- Error handlers ---
app.add_exception_handler(RequestValidationError, validation_exception_handler)
app.add_exception_handler(HTTPException, http_exception_handler)
app.add_exception_handler(StarletteHTTPException, http_exception_handler)
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
