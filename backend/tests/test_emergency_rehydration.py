"""Integration tests for authoritative emergency rehydration and active incident lookup."""

import pytest

VALID_SOS = {
    "type": "flood",
    "severity": "CRITICAL",
    "description": "Flash flood trapping residents on upper floor.",
    "reporter_name": "Ananya Sen",
    "reporter_phone": "+91 98300 55443",
    "latitude": 22.5726,
    "longitude": 88.3639,
    "affected_count": 2,
    "is_sos": True,
}


class TestActiveIncidentLookup:
    """Test suite for GET /api/incidents/active authoritative rehydration."""

    @pytest.mark.asyncio
    async def test_no_active_incident_returns_none(self, client):
        """When citizen has no incidents, endpoint returns data=None without error."""
        from app.auth.jwt_handler import UserRole, create_access_token

        fresh_token = create_access_token(
            user_id="fresh-citizen-no-incidents",
            role=UserRole.CITIZEN,
            name="New Citizen",
        )
        headers = {"Authorization": f"Bearer {fresh_token}"}
        resp = await client.get("/api/incidents/active", headers=headers)
        assert resp.status_code == 200
        body = resp.json()
        assert body["success"] is True
        assert body["data"] is None
        assert body["responder"] is None
        assert body["is_terminal"] is False

    @pytest.mark.asyncio
    async def test_active_incident_rehydration_by_citizen(self, client, citizen_headers):
        """When citizen creates an SOS, active lookup returns the authoritative incident."""
        # 1. Create incident as citizen
        create_res = await client.post("/api/incidents", json=VALID_SOS, headers=citizen_headers)
        assert create_res.status_code == 201
        created_inc = create_res.json()["data"]
        inc_id = created_inc["id"]

        # Use scoped token returned from incident creation
        token = created_inc.get("access_token")
        headers = {"Authorization": f"Bearer {token}"} if token else citizen_headers

        # 2. Query active incident
        active_res = await client.get("/api/incidents/active", headers=headers)
        assert active_res.status_code == 200
        body = active_res.json()
        assert body["success"] is True
        assert body["data"] is not None
        assert body["data"]["id"] == inc_id
        assert body["is_terminal"] is False

    @pytest.mark.asyncio
    async def test_active_incident_rehydration_with_explicit_hint(self, client, citizen_headers):
        """Active incident lookup succeeds with explicit query parameter hint."""
        create_res = await client.post("/api/incidents", json=VALID_SOS, headers=citizen_headers)
        inc_id = create_res.json()["data"]["id"]

        active_res = await client.get(f"/api/incidents/active?incident_id={inc_id}")
        assert active_res.status_code == 200
        body = active_res.json()
        assert body["data"]["id"] == inc_id
        assert body["is_terminal"] is False

    @pytest.mark.asyncio
    async def test_active_incident_includes_assigned_responder(
        self, client, citizen_headers, authority_headers
    ):
        """Active incident includes assigned responder details once assigned by authority."""
        # 1. Citizen creates SOS
        create_res = await client.post("/api/incidents", json=VALID_SOS, headers=citizen_headers)
        inc_id = create_res.json()["data"]["id"]

        # 2. Authority assigns an available responder
        resp_list = await client.get("/api/responders", headers=authority_headers)
        available = [r for r in resp_list.json()["data"] if r["status"] == "AVAILABLE"]
        assert len(available) >= 1
        responder = available[0]

        assign_res = await client.post(
            "/api/assignments",
            json={"incident_id": inc_id, "responder_id": responder["id"], "status": "ASSIGNED"},
            headers=authority_headers,
        )
        assert assign_res.status_code == 201

        # 3. Citizen queries active incident -> responder must be populated
        active_res = await client.get(f"/api/incidents/active?incident_id={inc_id}")
        assert active_res.status_code == 200
        body = active_res.json()
        assert body["data"]["id"] == inc_id
        assert body["responder"] is not None
        assert body["responder"]["id"] == responder["id"]
        assert body["responder"]["unit_name"] == responder["unit_name"]

    @pytest.mark.asyncio
    async def test_resolved_incident_returns_is_terminal(
        self, client, citizen_headers, authority_headers
    ):
        """When incident is resolved, lookup flags is_terminal=True so client cleans cache."""
        # 1. Create incident
        create_res = await client.post("/api/incidents", json=VALID_SOS, headers=citizen_headers)
        inc_id = create_res.json()["data"]["id"]

        # 2. Advance incident through valid state lifecycle to RESOLVED
        for step in [
            "TRIAGE_PENDING",
            "VERIFIED",
            "ASSIGNED",
            "EN_ROUTE",
            "NEARBY",
            "ON_SCENE",
            "RESOLVED",
        ]:
            res = await client.patch(
                f"/api/incidents/{inc_id}/status",
                json={"status": step, "actor": "Commander"},
                headers=authority_headers,
            )
            assert res.status_code == 200

        # 3. Query active incident with hint
        active_res = await client.get(f"/api/incidents/active?incident_id={inc_id}")
        assert active_res.status_code == 200
        body = active_res.json()
        assert body["data"]["id"] == inc_id
        assert body["data"]["status"] == "RESOLVED"
        assert body["is_terminal"] is True

    @pytest.mark.asyncio
    async def test_cancelled_incident_returns_is_terminal(self, client, citizen_headers):
        """When citizen cancels incident, lookup flags is_terminal=True."""
        create_res = await client.post("/api/incidents", json=VALID_SOS, headers=citizen_headers)
        created = create_res.json()["data"]
        inc_id = created["id"]
        token = created.get("access_token")
        headers = {"Authorization": f"Bearer {token}"} if token else citizen_headers

        # Cancel incident
        cancel_res = await client.patch(
            f"/api/incidents/{inc_id}/status",
            json={"status": "CANCELLED", "actor": "citizen"},
            headers=headers,
        )
        assert cancel_res.status_code == 200

        # Query active incident
        active_res = await client.get(
            f"/api/incidents/active?incident_id={inc_id}", headers=headers
        )
        assert active_res.status_code == 200
        body = active_res.json()
        assert body["data"]["id"] == inc_id
        assert body["data"]["status"] == "CANCELLED"
        assert body["is_terminal"] is True

    @pytest.mark.asyncio
    async def test_nonexistent_incident_id_returns_none(self, client):
        """Querying with a non-existent incident ID safely returns data=None."""
        resp = await client.get("/api/incidents/active?incident_id=non-existent-uuid-9999")
        assert resp.status_code == 200
        body = resp.json()
        assert body["success"] is True
        assert body["data"] is None
        assert body["is_terminal"] is False
