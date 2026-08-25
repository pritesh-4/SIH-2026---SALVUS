"""Integration tests for Task 07: Realtime Assignment Synchronization.

Verifies:
1. Authoritative assignment state on backend (incident, responder, assignment).
2. Strict canonical Socket.IO event naming without aliases:
   - assignment.created
   - assignment.status_changed
   - responder.location_updated
   - incident.response_state_changed
3. Dual-room emission (authorities + incident-specific room).
4. State flow lifecycle: ASSIGNED -> EN_ROUTE -> NEARBY -> ON_SCENE -> COMPLETED.
"""

from unittest.mock import AsyncMock, patch

import pytest
from httpx import ASGITransport, AsyncClient

from app.main import app
from app.realtime.socket_manager import sio


@pytest.fixture
def anyio_backend():
    return "asyncio"


@pytest.mark.asyncio
async def test_authoritative_assignment_creation_and_canonical_events():
    """Verify backend creates authoritative assignment, syncs incident & responder to ASSIGNED,
    and emits canonical 'assignment.created' and 'incident.response_state_changed' without aliases.
    """
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # 1. Create a fresh test incident
        inc_res = await client.post(
            "/api/incidents",
            json={
                "type": "flood",
                "severity": "CRITICAL",
                "description": "Stranded on balcony due to water surge",
                "reporter_name": "Citizen Aditi Roy",
                "latitude": 22.5726,
                "longitude": 88.3639,
                "affected_count": 3,
                "is_sos": True,
            },
        )
        assert inc_res.status_code == 201
        incident = inc_res.json()["data"]
        incident_id = incident["id"]

        # 2. Pick an available responder
        resp_res = await client.get("/api/responders")
        assert resp_res.status_code == 200
        available_resp = next(r for r in resp_res.json()["data"] if r["status"] == "AVAILABLE")
        responder_id = available_resp["id"]

        # Spy on Socket.IO sio.emit to verify exact event names and rooms
        with patch.object(sio, "emit", new_callable=AsyncMock) as mock_sio_emit:
            assign_res = await client.post(
                "/api/assignments",
                json={
                    "incident_id": incident_id,
                    "responder_id": responder_id,
                    "status": "ASSIGNED",
                    "assigned_by": "authority_dispatcher_1",
                    "assignment_reason": "NDRF Unit 04 primary match for flood watercraft",
                },
            )
            assert assign_res.status_code == 201
            assignment = assign_res.json()["data"]

            # Assert Assignment state is ASSIGNED
            assert assignment["status"] == "ASSIGNED"
            assert assignment["incident_id"] == incident_id
            assert assignment["responder_id"] == responder_id

            # Assert Responder state is ASSIGNED
            resp_check = (await client.get(f"/api/responders/{responder_id}")).json()["data"]
            assert resp_check["status"] == "ASSIGNED"
            assert resp_check["assigned_incident_id"] == incident_id

            # Assert Incident state is ASSIGNED
            inc_check = (await client.get(f"/api/incidents/{incident_id}")).json()["data"]
            assert inc_check["status"] == "ASSIGNED"

            # Inspect all socket emissions
            emitted_events = [call.args[0] for call in mock_sio_emit.call_args_list]

            # Canonical events MUST be present
            assert "assignment.created" in emitted_events
            assert "incident.response_state_changed" in emitted_events
            assert "responder.status_changed" in emitted_events

            # NO aliases allowed
            assert "assignment:created" not in emitted_events
            assert "incident:status_changed" not in emitted_events
            assert "incident:response_state_changed" not in emitted_events
            assert "responder:status_changed" not in emitted_events

            # Check room targeting for assignment.created
            assign_created_calls = [
                call
                for call in mock_sio_emit.call_args_list
                if call.args[0] == "assignment.created"
            ]
            rooms_targeted = [call.kwargs.get("room") for call in assign_created_calls]
            assert "authorities" in rooms_targeted
            assert f"incident:{incident_id}" in rooms_targeted

            # Verify payload contains citizen-needed data (status: ASSIGNED, responder details)
            authorities_call = next(
                c for c in assign_created_calls if c.kwargs.get("room") == "authorities"
            )
            payload = authorities_call.args[1]
            assert payload["status"] == "ASSIGNED"
            assert payload["incident_id"] == incident_id
            assert payload["responder_id"] == responder_id
            assert "responder" in payload
            assert payload["responder"]["unit_name"] == available_resp["unit_name"]


@pytest.mark.asyncio
async def test_full_state_flow_progression():
    """Verify ASSIGNED -> EN_ROUTE -> NEARBY -> ON_SCENE -> COMPLETED state flow."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # 1. Create test incident
        inc_res = await client.post(
            "/api/incidents",
            json={
                "type": "flood",
                "severity": "CRITICAL",
                "description": "State flow progression test incident",
                "latitude": 22.5726,
                "longitude": 88.3639,
                "is_sos": True,
            },
        )
        incident_id = inc_res.json()["data"]["id"]

        # 2. Get available responder
        responders = (await client.get("/api/responders")).json()["data"]
        responder = next(r for r in responders if r["status"] == "AVAILABLE")
        responder_id = responder["id"]

        # 3. Create assignment: ASSIGNED
        create_res = await client.post(
            "/api/assignments",
            json={"incident_id": incident_id, "responder_id": responder_id, "status": "ASSIGNED"},
        )
        assignment_id = create_res.json()["data"]["id"]

        # Verify initial ASSIGNED state
        assign_data = (await client.get(f"/api/assignments/{assignment_id}")).json()["data"]
        assert assign_data["status"] == "ASSIGNED"
        resp_data = (await client.get(f"/api/responders/{responder_id}")).json()["data"]
        assert resp_data["status"] == "ASSIGNED"
        inc_data = (await client.get(f"/api/incidents/{incident_id}")).json()["data"]
        assert inc_data["status"] == "ASSIGNED"

        # 4. Advance -> EN_ROUTE
        with patch.object(sio, "emit", new_callable=AsyncMock) as mock_emit:
            res = await client.patch(
                f"/api/assignments/{assignment_id}/status",
                json={"status": "EN_ROUTE", "actor": "authority"},
            )
            assert res.status_code == 200
            assert res.json()["data"]["status"] == "EN_ROUTE"
            resp_data = (await client.get(f"/api/responders/{responder_id}")).json()["data"]
            assert resp_data["status"] == "EN_ROUTE"
            inc_data = (await client.get(f"/api/incidents/{incident_id}")).json()["data"]
            assert inc_data["status"] == "EN_ROUTE"

            events = [call.args[0] for call in mock_emit.call_args_list]
            assert "assignment.status_changed" in events
            assert "incident.response_state_changed" in events
            assert "assignment:status_changed" not in events

        # 5. Advance -> NEARBY
        with patch.object(sio, "emit", new_callable=AsyncMock) as mock_emit:
            res = await client.patch(
                f"/api/assignments/{assignment_id}/status",
                json={"status": "NEARBY", "actor": "authority"},
            )
            assert res.status_code == 200
            assert res.json()["data"]["status"] == "NEARBY"
            resp_data = (await client.get(f"/api/responders/{responder_id}")).json()["data"]
            assert resp_data["status"] == "NEARBY"
            inc_data = (await client.get(f"/api/incidents/{incident_id}")).json()["data"]
            assert inc_data["status"] == "NEARBY"

        # 6. Advance -> ON_SCENE
        with patch.object(sio, "emit", new_callable=AsyncMock) as mock_emit:
            res = await client.patch(
                f"/api/assignments/{assignment_id}/status",
                json={"status": "ON_SCENE", "actor": "authority"},
            )
            assert res.status_code == 200
            assert res.json()["data"]["status"] == "ON_SCENE"
            resp_data = (await client.get(f"/api/responders/{responder_id}")).json()["data"]
            assert resp_data["status"] == "ON_SCENE"
            inc_data = (await client.get(f"/api/incidents/{incident_id}")).json()["data"]
            assert inc_data["status"] == "ON_SCENE"

        # 7. Advance -> COMPLETED
        with patch.object(sio, "emit", new_callable=AsyncMock) as mock_emit:
            res = await client.patch(
                f"/api/assignments/{assignment_id}/status",
                json={"status": "COMPLETED", "actor": "authority", "notes": "Safe resolution"},
            )
            assert res.status_code == 200
            assert res.json()["data"]["status"] == "COMPLETED"
            # Responder freed back to AVAILABLE
            resp_data = (await client.get(f"/api/responders/{responder_id}")).json()["data"]
            assert resp_data["status"] == "AVAILABLE"
            assert resp_data["assigned_incident_id"] is None
            # Incident marked RESOLVED
            inc_data = (await client.get(f"/api/incidents/{incident_id}")).json()["data"]
            assert inc_data["status"] == "RESOLVED"

            events = [call.args[0] for call in mock_emit.call_args_list]
            assert "assignment.status_changed" in events
            assert "incident.response_state_changed" in events


@pytest.mark.asyncio
async def test_responder_location_updated_canonical_event():
    """Verify responder GPS coordinate update emits canonical 'responder.location_updated'."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        responders = (await client.get("/api/responders")).json()["data"]
        responder = responders[0]

        with patch.object(sio, "emit", new_callable=AsyncMock) as mock_emit:
            loc_res = await client.post(
                f"/api/responders/{responder['id']}/location",
                json={"latitude": 22.5740, "longitude": 88.3660, "actor": "responder"},
            )
            assert loc_res.status_code == 200
            events = [call.args[0] for call in mock_emit.call_args_list]
            assert "responder.location_updated" in events
            assert "responder:location_updated" not in events


@pytest.mark.asyncio
async def test_citizen_tracking_reconnection_and_persistence():
    """Verify citizen reconnect: querying incident assignments yields active details."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # 1. Create incident
        inc_res = await client.post(
            "/api/incidents",
            json={
                "type": "flood",
                "severity": "CRITICAL",
                "description": "Citizen reconnect query test",
                "latitude": 22.5726,
                "longitude": 88.3639,
                "is_sos": True,
            },
        )
        inc_id = inc_res.json()["data"]["id"]

        # 2. Pick responder and assign
        responders = (await client.get("/api/responders")).json()["data"]
        resp = next(r for r in responders if r["status"] == "AVAILABLE")
        resp_id = resp["id"]

        await client.post(
            "/api/assignments",
            json={"incident_id": inc_id, "responder_id": resp_id, "status": "ASSIGNED"},
        )

        # 3. Simulate Citizen reconnect / page refresh: fetch incident and incident assignments
        inc_fresh = (await client.get(f"/api/incidents/{inc_id}")).json()["data"]
        assert inc_fresh["status"] == "ASSIGNED"

        assign_fresh = (await client.get(f"/api/incidents/{inc_id}/assignments")).json()["data"]
        assert len(assign_fresh) > 0
        active_assign = assign_fresh[0]
        assert active_assign["status"] == "ASSIGNED"
        assert active_assign["responder_id"] == resp_id
        assert active_assign["assigned_at"] is not None
