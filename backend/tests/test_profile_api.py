"""Comprehensive tests for Salvus Citizen Profile REST API and persistence."""

from __future__ import annotations

import pytest
from httpx import ASGITransport, AsyncClient

from app.auth.jwt_handler import UserRole, create_access_token
from app.main import app


@pytest.mark.asyncio
async def test_profile_unauthenticated_rejected(anon_client: AsyncClient):
    """Anonymous/unauthenticated callers must be rejected with HTTP 401."""
    resp = await anon_client.get("/api/profile/me")
    assert resp.status_code == 401
    body = resp.json()
    assert body.get("detail", {}).get("error", {}).get("code") == "UNAUTHORIZED"

    patch_resp = await anon_client.patch("/api/profile/me", json={"full_name": "Attacker"})
    assert patch_resp.status_code == 401


@pytest.mark.asyncio
async def test_get_seeded_citizen_profile(test_db):
    """Seeded default citizen profile can be fetched with seed token."""
    token = create_access_token(
        user_id="cit-default", role=UserRole.CITIZEN, name="Aditi Mukherjee"
    )
    transport = ASGITransport(app=app)
    async with AsyncClient(
        transport=transport, base_url="http://test", headers={"Authorization": f"Bearer {token}"}
    ) as client:
        resp = await client.get("/api/profile/me")
        assert resp.status_code == 200
        body = resp.json()
        assert body["success"] is True
        data = body["data"]
        assert data["id"] == "cit-default"
        assert data["emergency_id"] == "SLV-CIT-7829"
        assert data["full_name"] == "Aditi Mukherjee"
        assert data["blood_group"] == "O+"
        assert data["phone"] == "+91 98301 23456"
        assert data["avatar_initials"] == "AM"
        assert data["is_verified"] is True
        assert "medical_info" in data


@pytest.mark.asyncio
async def test_get_or_create_new_citizen_profile(test_db):
    """Newly authenticated citizen automatically gets persistent profile created in DB."""
    token = create_access_token(user_id="cit-user-9988", role=UserRole.CITIZEN, name="Rohit Sen")
    transport = ASGITransport(app=app)
    async with AsyncClient(
        transport=transport, base_url="http://test", headers={"Authorization": f"Bearer {token}"}
    ) as client:
        resp = await client.get("/api/profile/me")
        assert resp.status_code == 200
        body = resp.json()
        assert body["success"] is True
        data = body["data"]
        assert data["id"] == "cit-user-9988"
        assert data["emergency_id"].startswith("SLV-CIT-")
        assert data["full_name"] == "Rohit Sen"
        assert data["avatar_initials"] == "RS"
        assert data["blood_group"] == "UNKNOWN"

        # Subsequent fetch returns the same record
        resp2 = await client.get("/api/profile/me")
        assert resp2.status_code == 200
        data2 = resp2.json()["data"]
        assert data2["id"] == data["id"]
        assert data2["emergency_id"] == data["emergency_id"]
        assert data2["created_at"] == data["created_at"]


@pytest.mark.asyncio
async def test_patch_profile_editable_fields(test_db):
    """Citizen can update editable fields (name, phone, email, blood group, address)."""
    token = create_access_token(user_id="cit-edit-test", role=UserRole.CITIZEN, name="Initial Name")
    transport = ASGITransport(app=app)
    async with AsyncClient(
        transport=transport, base_url="http://test", headers={"Authorization": f"Bearer {token}"}
    ) as client:
        # Initial create
        get_res = await client.get("/api/profile/me")
        assert get_res.status_code == 200

        # Patch fields
        patch_payload = {
            "full_name": "Pooja Banerjee",
            "phone": "+91 98311 55443",
            "email": "pooja.b@example.com",
            "blood_group": "B+",
            "registered_address": "88 Park Street, Kolkata",
        }
        patch_res = await client.patch("/api/profile/me", json=patch_payload)
        assert patch_res.status_code == 200
        data = patch_res.json()["data"]
        assert data["full_name"] == "Pooja Banerjee"
        assert data["phone"] == "+91 98311 55443"
        assert data["email"] == "pooja.b@example.com"
        assert data["blood_group"] == "B+"
        assert data["registered_address"] == "88 Park Street, Kolkata"
        assert data["avatar_initials"] == "PB"

        # Persistence check
        fetch_res = await client.get("/api/profile/me")
        assert fetch_res.status_code == 200
        saved_data = fetch_res.json()["data"]
        assert saved_data["full_name"] == "Pooja Banerjee"
        assert saved_data["blood_group"] == "B+"


@pytest.mark.asyncio
async def test_protected_fields_cannot_be_overwritten(test_db):
    """Protected system fields like id and emergency_id cannot be overwritten via PATCH payload."""
    token = create_access_token(
        user_id="cit-protect-test", role=UserRole.CITIZEN, name="Secure User"
    )
    transport = ASGITransport(app=app)
    async with AsyncClient(
        transport=transport, base_url="http://test", headers={"Authorization": f"Bearer {token}"}
    ) as client:
        init_res = await client.get("/api/profile/me")
        original_emergency_id = init_res.json()["data"]["emergency_id"]

        # Attempt to tamper with protected fields
        tamper_payload = {
            "id": "hacked-id",
            "emergency_id": "SLV-CIT-9999",
            "is_verified": False,
            "full_name": "Updated Name",
        }
        patch_res = await client.patch("/api/profile/me", json=tamper_payload)
        assert patch_res.status_code == 200
        data = patch_res.json()["data"]
        assert data["id"] == "cit-protect-test"
        assert data["emergency_id"] == original_emergency_id
        assert data["full_name"] == "Updated Name"


@pytest.mark.asyncio
async def test_user_isolation_boundary(test_db):
    """User A cannot access or overwrite User B's profile."""
    token_a = create_access_token(user_id="citizen-alice", role=UserRole.CITIZEN, name="Alice Roy")
    token_b = create_access_token(user_id="citizen-bob", role=UserRole.CITIZEN, name="Bob Sen")

    transport = ASGITransport(app=app)

    # Alice initializes her profile
    async with AsyncClient(
        transport=transport, base_url="http://test", headers={"Authorization": f"Bearer {token_a}"}
    ) as client_a:
        res_a = await client_a.patch(
            "/api/profile/me",
            json={"full_name": "Alice In Wonderland", "blood_group": "A+", "phone": "111"},
        )
        assert res_a.status_code == 200
        assert res_a.json()["data"]["full_name"] == "Alice In Wonderland"

    # Bob fetches his profile and verifies he gets Bob's profile, not Alice's
    async with AsyncClient(
        transport=transport, base_url="http://test", headers={"Authorization": f"Bearer {token_b}"}
    ) as client_b:
        res_b = await client_b.get("/api/profile/me")
        assert res_b.status_code == 200
        bob_data = res_b.json()["data"]
        assert bob_data["id"] == "citizen-bob"
        assert bob_data["full_name"] == "Bob Sen"
        assert bob_data["phone"] is None

        # Bob updates his profile
        res_b_patch = await client_b.patch("/api/profile/me", json={"full_name": "Bob Builder"})
        assert res_b_patch.status_code == 200
        assert res_b_patch.json()["data"]["full_name"] == "Bob Builder"

    # Verify Alice's profile was unaffected
    async with AsyncClient(
        transport=transport, base_url="http://test", headers={"Authorization": f"Bearer {token_a}"}
    ) as client_a:
        res_a_check = await client_a.get("/api/profile/me")
        assert res_a_check.status_code == 200
        assert res_a_check.json()["data"]["full_name"] == "Alice In Wonderland"
        assert res_a_check.json()["data"]["blood_group"] == "A+"


@pytest.mark.asyncio
async def test_validation_errors(test_db):
    """Blank full_name is rejected with HTTP 422."""
    token = create_access_token(
        user_id="cit-val-test", role=UserRole.CITIZEN, name="Validation Test"
    )
    transport = ASGITransport(app=app)
    async with AsyncClient(
        transport=transport, base_url="http://test", headers={"Authorization": f"Bearer {token}"}
    ) as client:
        # Blank name validation error
        res = await client.patch("/api/profile/me", json={"full_name": "   "})
        assert res.status_code == 422
