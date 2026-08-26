"""Tests for production deployment readiness, security middleware, and health probes."""

import os
from unittest.mock import patch

import pytest
from httpx import ASGITransport, AsyncClient

from app.db import resolve_database_path
from app.main import app, get_cors_origins


@pytest.mark.asyncio
async def test_health_check_endpoints():
    """Verify /health, /healthz, and /api/health return 200 with database connectivity."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        for path in ["/health", "/healthz", "/api/health"]:
            response = await client.get(path)
            assert response.status_code == 200
            data = response.json()
            assert data["status"] == "healthy"
            assert data["database"] == "connected"
            assert data["service"] == "Salvus API"
            assert "timestamp" in data


@pytest.mark.asyncio
async def test_root_endpoint_metadata():
    """Verify root / endpoint returns service identification and doc links."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.get("/")
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "online"
        assert data["service"] == "Salvus API"
        assert data["health"] == "/health"
        assert data["docs"] == "/docs"


@pytest.mark.asyncio
async def test_security_headers_injected():
    """Verify production security headers are set on API responses."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.get("/health")
        assert response.headers.get("x-content-type-options") == "nosniff"
        assert response.headers.get("x-frame-options") == "DENY"
        assert response.headers.get("x-xss-protection") == "1; mode=block"
        assert response.headers.get("referrer-policy") == "strict-origin-when-cross-origin"
        assert "geolocation=(self)" in response.headers.get("permissions-policy", "")


@pytest.mark.asyncio
async def test_payload_limit_middleware_rejects_oversized():
    """Verify request bodies exceeding MAX_CONTENT_LENGTH_BYTES receive HTTP 413."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # Simulate a 6MB payload header
        headers = {"content-length": str(6 * 1024 * 1024), "content-type": "application/json"}
        response = await client.post("/api/incidents", content="{}", headers=headers)
        assert response.status_code == 413
        data = response.json()
        assert data["success"] is False
        assert data["error"]["code"] == "PAYLOAD_TOO_LARGE"


def test_cors_origins_parsing():
    """Verify multi-origin CORS strings are properly parsed."""
    cors_str = "https://salvus.vercel.app, https://salvus.onrender.com, http://localhost:5173"
    with patch.dict(os.environ, {"CORS_ORIGIN": cors_str}):
        origins = get_cors_origins()
        assert origins == [
            "https://salvus.vercel.app",
            "https://salvus.onrender.com",
            "http://localhost:5173",
        ]

    with patch.dict(os.environ, {"CORS_ORIGIN": "*"}):
        assert get_cors_origins() == ["*"]


def test_database_path_resolution():
    """Verify database path resolution handles direct paths and sqlite:// prefixes."""
    with patch.dict(os.environ, {"DATABASE_PATH": "/var/data/salvus.db"}, clear=False):
        assert resolve_database_path() == "/var/data/salvus.db"

    env_overrides = {"DATABASE_PATH": "", "DATABASE_URL": "sqlite:////var/data/prod.db"}
    with patch.dict(os.environ, env_overrides, clear=False):
        assert resolve_database_path() == "/var/data/prod.db"
