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
    await test_db.execute("DELETE FROM incidents")
    await test_db.commit()
    await seed_database(test_db)
    yield


@pytest_asyncio.fixture
async def client(test_db):
    """Provide an async HTTP test client against the FastAPI app."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac
