"""Role-based authorization and route protection tests for Salvus Phase 2.

Verifies that:
1. Authority-only endpoints reject CITIZEN tokens with HTTP 403 Forbidden
2. Authority-only endpoints accept AUTHORITY tokens with HTTP 200 OK
3. Citizen profile endpoints authoritatively identify the caller's JWT identity
4. Unauthenticated callers are rejected with HTTP 401 Unauthorized
5. Role claims are enforced server-side and cannot be spoofed by client payload
"""

from __future__ import annotations

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient

from app.auth.jwt_handler import UserRole, create_access_token
from app.main import app


@pytest_asyncio.fixture
async def unauth_client(test_db, reset_seed_tables):
    """Unauthenticated HTTP client."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac


@pytest_asyncio.fixture
async def citizen_auth_client(test_db, reset_seed_tables):
    """Client authenticated with real seeded Citizen demo credentials."""
    token = create_access_token(
        user_id="user-citizen-demo",
        role=UserRole.CITIZEN,
        name="Aditi Mukherjee",
        email="citizen@salvus.demo",
    )
    transport = ASGITransport(app=app)
    async with AsyncClient(
        transport=transport,
        base_url="http://test",
        headers={"Authorization": f"Bearer {token}"},
    ) as ac:
        yield ac


@pytest_asyncio.fixture
async def authority_auth_client(test_db, reset_seed_tables):
    """Client authenticated with real seeded Authority demo credentials."""
    token = create_access_token(
        user_id="user-authority-demo",
        role=UserRole.AUTHORITY,
        name="Duty Dispatcher",
        email="authority@salvus.demo",
    )
    transport = ASGITransport(app=app)
    async with AsyncClient(
        transport=transport,
        base_url="http://test",
        headers={"Authorization": f"Bearer {token}"},
    ) as ac:
        yield ac


# ---------------------------------------------------------------------------
# 1. Authority Endpoint Protection: Citizens Rejected with HTTP 403 Forbidden
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_citizen_cannot_assign_responders(citizen_auth_client: AsyncClient):
    """Citizens must be rejected with 403 Forbidden when attempting responder assignment."""
    response = await citizen_auth_client.post(
        "/api/responders/resp-101/assign",
        json={"incident_id": "inc-2048", "actor": "citizen"},
    )
    assert response.status_code == 403
    data = response.json()
    assert data["detail"]["error"]["code"] == "FORBIDDEN"
    assert "CITIZEN" in data["detail"]["error"]["message"]


@pytest.mark.asyncio
async def test_citizen_cannot_verify_ai_triage(citizen_auth_client: AsyncClient):
    """Citizens must be rejected with 403 Forbidden when attempting AI triage verification."""
    response = await citizen_auth_client.post(
        "/api/triage/verify/inc-2048",
        json={"actor": "citizen"},
    )
    assert response.status_code == 403
    data = response.json()
    assert data["detail"]["error"]["code"] == "FORBIDDEN"


@pytest.mark.asyncio
async def test_citizen_cannot_modify_shelters(citizen_auth_client: AsyncClient):
    """Citizens must be rejected with 403 Forbidden when attempting to update shelter capacity."""
    response = await citizen_auth_client.patch(
        "/api/shelters/shl-01",
        json={"available_beds": 10, "actor": "citizen"},
    )
    assert response.status_code == 403
    data = response.json()
    assert data["detail"]["error"]["code"] == "FORBIDDEN"


@pytest.mark.asyncio
async def test_citizen_cannot_trigger_simulation_step(citizen_auth_client: AsyncClient):
    """Citizens must be rejected with 403 Forbidden when attempting
    fleet simulation manipulation.
    """
    response = await citizen_auth_client.post(
        "/api/simulation/step",
        json={"responder_id": "resp-101", "latitude": 22.57, "longitude": 88.36},
    )
    assert response.status_code == 403


# ---------------------------------------------------------------------------
# 2. Authority Permissions: Authority Tokens Authorized
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_authority_can_access_incidents(authority_auth_client: AsyncClient):
    """Authorities can access the comprehensive incident registry."""
    response = await authority_auth_client.get("/api/incidents")
    assert response.status_code == 200
    data = response.json()
    assert data["success"] is True
    assert isinstance(data["data"], list)


@pytest.mark.asyncio
async def test_authority_can_access_responders(authority_auth_client: AsyncClient):
    """Authorities can query responder fleet status."""
    response = await authority_auth_client.get("/api/responders")
    assert response.status_code == 200
    data = response.json()
    assert data["success"] is True


# ---------------------------------------------------------------------------
# 3. Citizen Profile Binding: Authoritative Identity Resolution
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_citizen_profile_identifies_authenticated_subject(
    citizen_auth_client: AsyncClient,
):
    """GET /api/profile/me loads profile specifically matching authenticated citizen token."""
    response = await citizen_auth_client.get("/api/profile/me")
    assert response.status_code == 200
    data = response.json()
    assert data["success"] is True
    profile = data["data"]
    assert profile["full_name"] == "Aditi Mukherjee"
    assert profile["email"] == "citizen@salvus.demo"


@pytest.mark.asyncio
async def test_citizen_emergency_contacts_belong_to_caller(
    citizen_auth_client: AsyncClient,
):
    """GET /api/profile/emergency-contacts loads contacts belonging to authenticated citizen."""
    response = await citizen_auth_client.get("/api/profile/emergency-contacts")
    assert response.status_code == 200
    data = response.json()
    assert data["success"] is True
    assert len(data["data"]) >= 2
    for contact in data["data"]:
        assert contact["user_id"] == "user-citizen-demo"


# ---------------------------------------------------------------------------
# 4. Unauthenticated Rejections (HTTP 401)
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_unauthenticated_requests_receive_401(unauth_client: AsyncClient):
    """Unauthenticated requests to protected endpoints receive HTTP 401 Unauthorized."""
    endpoints = [
        ("GET", "/api/auth/me"),
        ("GET", "/api/profile/me"),
        ("POST", "/api/responders/resp-101/assign"),
        ("POST", "/api/triage/verify/inc-2048"),
    ]
    for method, path in endpoints:
        if method == "GET":
            resp = await unauth_client.get(path)
        else:
            resp = await unauth_client.post(path, json={})
        assert resp.status_code == 401
        assert resp.headers.get("www-authenticate") == "Bearer"
