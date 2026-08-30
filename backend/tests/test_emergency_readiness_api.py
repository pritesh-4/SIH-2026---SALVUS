"""Comprehensive test suite for Salvus Emergency Readiness APIs.

Covers Emergency Contacts CRUD, single-primary enforcement, medical records,
privacy preferences, and security boundaries.
"""

from __future__ import annotations

import pytest
from httpx import ASGITransport, AsyncClient

from app.auth.jwt_handler import UserRole, create_access_token
from app.main import app


@pytest.mark.asyncio
async def test_emergency_contacts_crud_and_primary_enforcement(test_db):
    """Full lifecycle testing of emergency contacts with primary enforcement."""
    token = create_access_token(
        user_id="cit-contact-tester", role=UserRole.CITIZEN, name="Contact Tester"
    )
    transport = ASGITransport(app=app)
    async with AsyncClient(
        transport=transport, base_url="http://test", headers={"Authorization": f"Bearer {token}"}
    ) as client:
        # 1. Initial list is empty
        list_res = await client.get("/api/profile/emergency-contacts")
        assert list_res.status_code == 200
        assert list_res.json()["count"] == 0

        # 2. Add first contact — must automatically become primary
        c1_payload = {
            "name": "Dr. Sourav Mukherjee",
            "relationship": "Father",
            "phone": "+91 98300 11223",
            "priority": 1,
            "is_primary": False,
            "notify_on_sos": True,
        }
        c1_res = await client.post("/api/profile/emergency-contacts", json=c1_payload)
        assert c1_res.status_code == 201
        c1 = c1_res.json()["data"]
        assert c1["name"] == "Dr. Sourav Mukherjee"
        assert c1["is_primary"] is True  # Automatically promoted since it's the only contact
        c1_id = c1["id"]

        # 3. Add second contact as non-primary
        c2_payload = {
            "name": "Priya Das",
            "relationship": "Sister",
            "phone": "+91 98311 44556",
            "priority": 2,
            "is_primary": False,
            "notify_on_sos": True,
        }
        c2_res = await client.post("/api/profile/emergency-contacts", json=c2_payload)
        assert c2_res.status_code == 201
        c2 = c2_res.json()["data"]
        assert c2["is_primary"] is False
        c2_id = c2["id"]

        # 4. Set contact 2 as primary — contact 1 must become non-primary
        patch_res = await client.patch(
            f"/api/profile/emergency-contacts/{c2_id}",
            json={"is_primary": True},
        )
        assert patch_res.status_code == 200
        assert patch_res.json()["data"]["is_primary"] is True

        # Verify contact 1 is no longer primary
        list_res2 = await client.get("/api/profile/emergency-contacts")
        contacts = list_res2.json()["data"]
        assert len(contacts) == 2
        c2_refetched = next(c for c in contacts if c["id"] == c2_id)
        c1_refetched = next(c for c in contacts if c["id"] == c1_id)
        assert c2_refetched["is_primary"] is True
        assert c1_refetched["is_primary"] is False

        # 5. Delete primary contact (c2) — contact 1 should be promoted to primary
        del_res = await client.delete(f"/api/profile/emergency-contacts/{c2_id}")
        assert del_res.status_code == 200

        list_res3 = await client.get("/api/profile/emergency-contacts")
        remaining = list_res3.json()["data"]
        assert len(remaining) == 1
        assert remaining[0]["id"] == c1_id
        assert remaining[0]["is_primary"] is True


@pytest.mark.asyncio
async def test_emergency_contact_limit(test_db):
    """Enforces maximum of 5 emergency contacts."""
    token = create_access_token(user_id="cit-limit-user", role=UserRole.CITIZEN, name="Limit User")
    transport = ASGITransport(app=app)
    async with AsyncClient(
        transport=transport, base_url="http://test", headers={"Authorization": f"Bearer {token}"}
    ) as client:
        # Create 5 contacts
        for i in range(5):
            res = await client.post(
                "/api/profile/emergency-contacts",
                json={
                    "name": f"Contact {i + 1}",
                    "relationship": "Friend",
                    "phone": f"+91 98300 0000{i}",
                },
            )
            assert res.status_code == 201

        # 6th contact must be rejected
        res6 = await client.post(
            "/api/profile/emergency-contacts",
            json={
                "name": "Contact 6",
                "relationship": "Friend",
                "phone": "+91 98300 00006",
            },
        )
        assert res6.status_code == 400
        body = res6.json()
        error_obj = body.get("detail", {}).get("error") or body.get("error", {})
        assert error_obj.get("code") == "CONTACT_LIMIT_REACHED"


@pytest.mark.asyncio
async def test_emergency_contact_security_isolation(test_db):
    """Citizen A cannot read, edit, or delete Citizen B's emergency contacts."""
    token_a = create_access_token(user_id="user-alice", role=UserRole.CITIZEN, name="Alice")
    token_b = create_access_token(user_id="user-bob", role=UserRole.CITIZEN, name="Bob")

    transport = ASGITransport(app=app)

    # Alice creates a contact
    async with AsyncClient(
        transport=transport, base_url="http://test", headers={"Authorization": f"Bearer {token_a}"}
    ) as client_a:
        res = await client_a.post(
            "/api/profile/emergency-contacts",
            json={"name": "Alice Father", "relationship": "Father", "phone": "123456789"},
        )
        alice_contact_id = res.json()["data"]["id"]

    # Bob attempts to access, patch, or delete Alice's contact
    async with AsyncClient(
        transport=transport, base_url="http://test", headers={"Authorization": f"Bearer {token_b}"}
    ) as client_b:
        # Bob cannot patch
        patch_res = await client_b.patch(
            f"/api/profile/emergency-contacts/{alice_contact_id}",
            json={"name": "Hacked Name"},
        )
        assert patch_res.status_code == 404

        # Bob cannot delete
        del_res = await client_b.delete(f"/api/profile/emergency-contacts/{alice_contact_id}")
        assert del_res.status_code == 404

        # Bob's contact list does not contain Alice's contact
        list_res = await client_b.get("/api/profile/emergency-contacts")
        assert list_res.status_code == 200
        assert len(list_res.json()["data"]) == 0


@pytest.mark.asyncio
async def test_medical_information_api(test_db):
    """Medical information persistence and validation."""
    token = create_access_token(user_id="cit-med-user", role=UserRole.CITIZEN, name="Medical User")
    transport = ASGITransport(app=app)
    async with AsyncClient(
        transport=transport, base_url="http://test", headers={"Authorization": f"Bearer {token}"}
    ) as client:
        # Initial fetch
        get_res = await client.get("/api/profile/medical")
        assert get_res.status_code == 200
        assert get_res.json()["data"]["blood_group"] == "UNKNOWN"

        # Update medical details
        update_payload = {
            "blood_group": "AB+",
            "conditions": ["Type 1 Diabetes", "Asthma"],
            "allergies": ["Peanuts", "Penicillin"],
            "mobility_note": "Requires assistance on stairwells",
            "medications_note": "Carries Insulin pen in emergency kit",
        }
        patch_res = await client.patch("/api/profile/medical", json=update_payload)
        assert patch_res.status_code == 200
        data = patch_res.json()["data"]
        assert data["blood_group"] == "AB+"
        assert len(data["conditions"]) == 2
        assert "Type 1 Diabetes" in data["conditions"]
        assert "Peanuts" in data["allergies"]
        assert data["mobility_note"] == "Requires assistance on stairwells"
        assert data["medications_note"] == "Carries Insulin pen in emergency kit"

        # Verify persistence on subsequent fetch
        get_res2 = await client.get("/api/profile/medical")
        assert get_res2.status_code == 200
        assert get_res2.json()["data"]["blood_group"] == "AB+"
        assert len(get_res2.json()["data"]["allergies"]) == 2


@pytest.mark.asyncio
async def test_privacy_settings_api(test_db):
    """Privacy settings persistence and locked safety protection."""
    token = create_access_token(
        user_id="cit-privacy-user", role=UserRole.CITIZEN, name="Privacy User"
    )
    transport = ASGITransport(app=app)
    async with AsyncClient(
        transport=transport, base_url="http://test", headers={"Authorization": f"Bearer {token}"}
    ) as client:
        # Fetch default settings
        get_res = await client.get("/api/profile/settings")
        assert get_res.status_code == 200
        settings = get_res.json()["data"]
        assert len(settings) == 4
        loc_setting = next(s for s in settings if s["id"] == "emergency_location")
        assert loc_setting["locked"] is True
        assert loc_setting["value"] is True

        # Toggle offline_cache and attempt to unlock emergency_location
        update_payload = {
            "settings": [
                {"id": "offline_cache", "value": False},
                {"id": "emergency_location", "value": False},  # Locked by system
            ]
        }
        patch_res = await client.patch("/api/profile/settings", json=update_payload)
        assert patch_res.status_code == 200
        updated = patch_res.json()["data"]

        offline_cached = next(s for s in updated if s["id"] == "offline_cache")
        loc_updated = next(s for s in updated if s["id"] == "emergency_location")

        assert offline_cached["value"] is False  # User toggle succeeded
        assert loc_updated["value"] is True  # System safety lock preserved True
