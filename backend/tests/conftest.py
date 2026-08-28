"""Pytest configuration and shared fixtures for Salvus backend tests."""

from __future__ import annotations

import asyncio
import os
import sys

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient

# Ensure the backend root is on sys.path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from app.auth.jwt_handler import UserRole, create_access_token
from app.db import close_database, init_database
from app.db.seed import seed_database
from app.main import app


@pytest.fixture(scope="session")
def event_loop():
    """Create a shared event loop for the entire test session."""
    loop = asyncio.new_event_loop()
    yield loop
    loop.close()


@pytest_asyncio.fixture(scope="session")
async def test_db():
    """Initialize an in-memory SQLite database for the test session."""
    db = await init_database(":memory:")
    yield db
    await close_database()


@pytest_asyncio.fixture(autouse=True)
async def reset_seed_tables(test_db):
    """Reset and seed tables before each test to guarantee repeatable test isolation."""
    await test_db.execute("DELETE FROM incident_events")
    await test_db.execute("DELETE FROM incident_attachments")
    await test_db.execute("DELETE FROM assignments")
    await test_db.execute("DELETE FROM responders")
    await test_db.execute("DELETE FROM shelters")
    await test_db.execute("DELETE FROM incidents")
    await test_db.commit()
    await seed_database(test_db)
    yield


@pytest.fixture
def authority_token():
    """Generate signed JWT token with AUTHORITY role."""
    return create_access_token(
        user_id="test-authority-1",
        role=UserRole.AUTHORITY,
        name="Dispatcher Mukherjee",
    )


@pytest.fixture
def citizen_token():
    """Generate signed JWT token with CITIZEN role."""
    return create_access_token(
        user_id="test-citizen-1",
        role=UserRole.CITIZEN,
        name="Test Citizen User",
        scoped_incident_id="inc-2048",
    )


@pytest.fixture
def responder_token():
    """Generate signed JWT token with RESPONDER role."""
    return create_access_token(
        user_id="test-responder-1",
        role=UserRole.RESPONDER,
        name="NDRF Unit 4",
        scoped_responder_id="resp-101",
    )


@pytest.fixture
def authority_headers(authority_token):
    return {"Authorization": f"Bearer {authority_token}"}


@pytest.fixture
def citizen_headers(citizen_token):
    return {"Authorization": f"Bearer {citizen_token}"}


@pytest.fixture
def responder_headers(responder_token):
    return {"Authorization": f"Bearer {responder_token}"}


@pytest_asyncio.fixture
async def client(test_db, authority_headers):
    """Provide an async HTTP test client against the FastAPI app with default authority auth."""
    transport = ASGITransport(app=app)
    async with AsyncClient(
        transport=transport, base_url="http://test", headers=authority_headers
    ) as ac:
        yield ac


@pytest_asyncio.fixture
async def anon_client(test_db):
    """Provide an unauthenticated async HTTP test client."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac
