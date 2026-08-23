"""Integration tests for incident API endpoints."""

import pytest

VALID_INCIDENT = {
    "type": "flood",
    "severity": "CRITICAL",
    "description": "Water entering ground floor, family trapped.",
    "reporter_name": "Test User",
    "reporter_phone": "+91 98301 00000",
    "latitude": 22.5726,
    "longitude": 88.3639,
    "affected_count": 3,
    "is_sos": True,
}


# -----------------------------------------------------------------------
# POST /api/incidents — Create incident
# -----------------------------------------------------------------------


class TestCreateIncident:
    """Test incident creation endpoint."""

    @pytest.mark.asyncio
    async def test_create_incident_success(self, client):
        resp = await client.post("/api/incidents", json=VALID_INCIDENT)
        assert resp.status_code == 201

        body = resp.json()
        assert body["success"] is True

        data = body["data"]
        assert data["type"] == "flood"
        assert data["severity"] == "CRITICAL"
        assert data["is_sos"] is True
        assert data["status"] == "NEW"
        assert data["ticket_id"].startswith("SV-")
        assert len(data["events"]) >= 1

    @pytest.mark.asyncio
    async def test_create_incident_missing_coords(self, client):
        payload = {**VALID_INCIDENT}
        del payload["latitude"]
        resp = await client.post("/api/incidents", json=payload)
        assert resp.status_code == 422

    @pytest.mark.asyncio
    async def test_create_incident_invalid_type(self, client):
        payload = {**VALID_INCIDENT, "type": "earthquake"}
        resp = await client.post("/api/incidents", json=payload)
        assert resp.status_code == 422

    @pytest.mark.asyncio
    async def test_create_incident_invalid_latitude(self, client):
        payload = {**VALID_INCIDENT, "latitude": 999}
        resp = await client.post("/api/incidents", json=payload)
        assert resp.status_code == 422


# -----------------------------------------------------------------------
# GET /api/incidents — List incidents
# -----------------------------------------------------------------------


class TestListIncidents:
    """Test incident listing endpoint."""

    @pytest.mark.asyncio
    async def test_list_incidents(self, client):
        resp = await client.get("/api/incidents")
        assert resp.status_code == 200

        body = resp.json()
        assert body["success"] is True
        assert isinstance(body["data"], list)
        assert body["count"] >= 1


# -----------------------------------------------------------------------
# GET /api/incidents/{id} — Get single incident
# -----------------------------------------------------------------------


class TestGetIncident:
    """Test single-incident endpoint."""

    @pytest.mark.asyncio
    async def test_get_existing_incident(self, client):
        # First, create one
        create_resp = await client.post("/api/incidents", json=VALID_INCIDENT)
        inc_id = create_resp.json()["data"]["id"]

        resp = await client.get(f"/api/incidents/{inc_id}")
        assert resp.status_code == 200
        assert resp.json()["data"]["id"] == inc_id

    @pytest.mark.asyncio
    async def test_get_nonexistent_incident(self, client):
        resp = await client.get("/api/incidents/nonexistent-uuid")
        assert resp.status_code == 404


# -----------------------------------------------------------------------
# PATCH /api/incidents/{id}/status — Status transition
# -----------------------------------------------------------------------


class TestStatusTransition:
    """Test status transition endpoint."""

    @pytest.mark.asyncio
    async def test_valid_transition(self, client):
        # Create a NEW incident
        create_resp = await client.post("/api/incidents", json=VALID_INCIDENT)
        inc_id = create_resp.json()["data"]["id"]

        # Transition NEW → TRIAGE_PENDING
        resp = await client.patch(
            f"/api/incidents/{inc_id}/status",
            json={"status": "TRIAGE_PENDING", "actor": "dispatcher"},
        )
        assert resp.status_code == 200
        assert resp.json()["data"]["status"] == "TRIAGE_PENDING"

    @pytest.mark.asyncio
    async def test_full_lifecycle(self, client):
        # Create → TRIAGE_PENDING → VERIFIED → RESOLVED
        create_resp = await client.post("/api/incidents", json=VALID_INCIDENT)
        inc_id = create_resp.json()["data"]["id"]

        transitions = [
            ("TRIAGE_PENDING", "ai_engine"),
            ("VERIFIED", "dispatcher_mukherjee"),
            ("RESOLVED", "system"),
        ]
        for status, actor in transitions:
            resp = await client.patch(
                f"/api/incidents/{inc_id}/status",
                json={"status": status, "actor": actor},
            )
            assert resp.status_code == 200
            assert resp.json()["data"]["status"] == status

        # Verify full event timeline
        detail = await client.get(f"/api/incidents/{inc_id}")
        events = detail.json()["data"]["events"]
        # CREATED + 3 STATUS_CHANGE = 4 events
        assert len(events) == 4

    @pytest.mark.asyncio
    async def test_invalid_transition_rejected(self, client):
        create_resp = await client.post("/api/incidents", json=VALID_INCIDENT)
        inc_id = create_resp.json()["data"]["id"]

        # Try to skip triage: NEW → VERIFIED (not allowed)
        resp = await client.patch(
            f"/api/incidents/{inc_id}/status",
            json={"status": "VERIFIED", "actor": "test"},
        )
        assert resp.status_code == 400

    @pytest.mark.asyncio
    async def test_transition_nonexistent_incident(self, client):
        resp = await client.patch(
            "/api/incidents/nonexistent-id/status",
            json={"status": "TRIAGE_PENDING", "actor": "test"},
        )
        assert resp.status_code == 404

    @pytest.mark.asyncio
    async def test_cancellation(self, client):
        create_resp = await client.post("/api/incidents", json=VALID_INCIDENT)
        inc_id = create_resp.json()["data"]["id"]

        resp = await client.patch(
            f"/api/incidents/{inc_id}/status",
            json={"status": "CANCELLED", "actor": "citizen"},
        )
        assert resp.status_code == 200
        assert resp.json()["data"]["status"] == "CANCELLED"

    @pytest.mark.asyncio
    async def test_cannot_transition_from_terminal(self, client):
        # Create and resolve an incident
        create_resp = await client.post("/api/incidents", json=VALID_INCIDENT)
        inc_id = create_resp.json()["data"]["id"]

        for status in ["TRIAGE_PENDING", "VERIFIED", "RESOLVED"]:
            await client.patch(
                f"/api/incidents/{inc_id}/status",
                json={"status": status, "actor": "test"},
            )

        # Try to transition from RESOLVED
        resp = await client.patch(
            f"/api/incidents/{inc_id}/status",
            json={"status": "NEW", "actor": "test"},
        )
        assert resp.status_code == 400

    @pytest.mark.asyncio
    async def test_unauthorized_citizen_transition_rejected(self, client):
        create_resp = await client.post("/api/incidents", json=VALID_INCIDENT)
        inc_id = create_resp.json()["data"]["id"]

        # Citizen attempts to triage / verify without authority role
        resp = await client.patch(
            f"/api/incidents/{inc_id}/status",
            json={"status": "TRIAGE_PENDING", "actor": "citizen"},
        )
        assert resp.status_code == 403
        body = resp.json()
        error_obj = body.get("detail", {}).get("error", {}) or body.get("error", {})
        assert error_obj.get("code") == "FORBIDDEN"
