"""Comprehensive integration tests for first-class responder assignments domain model,

validation rules, lifecycle transitions, authorization, transactional consistency,
and audit timeline event generation.
"""

import pytest
from httpx import ASGITransport, AsyncClient

from app.main import app


@pytest.fixture
def anyio_backend():
    return "asyncio"


@pytest.mark.asyncio
async def test_create_assignment_success_and_events():
    """Verify successful assignment creation, score breakdown storage, and status sync."""
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        # 1. Create a fresh test incident
        inc_res = await client.post(
            "/api/incidents",
            json={
                "type": "flood",
                "severity": "CRITICAL",
                "description": "Residents stranded near sub-station",
                "reporter_name": "S. Ghosh",
                "latitude": 22.5780,
                "longitude": 88.3680,
                "is_sos": True,
            },
        )
        assert inc_res.status_code == 201
        incident = inc_res.json()["data"]
        incident_id = incident["id"]

        # 2. Get an available responder
        resp_list_res = await client.get("/api/responders")
        assert resp_list_res.status_code == 200
        available_resp = next(r for r in resp_list_res.json()["data"] if r["status"] == "AVAILABLE")
        responder_id = available_resp["id"]

        # 3. Create assignment with structured score breakdown
        assign_payload = {
            "incident_id": incident_id,
            "responder_id": responder_id,
            "status": "ASSIGNED",
            "assigned_by": "dispatcher_alok",
            "score": 92.5,
            "score_breakdown": {
                "capability": 30.0,
                "distance": 25.0,
                "eta": 20.0,
                "workload": 10.0,
                "severity_fit": 7.5,
            },
            "assignment_reason": "High flood capability match with shortest ETA",
        }

        create_res = await client.post("/api/assignments", json=assign_payload)
        assert create_res.status_code == 201
        assignment = create_res.json()["data"]

        assert assignment["incident_id"] == incident_id
        assert assignment["responder_id"] == responder_id
        assert assignment["status"] == "ASSIGNED"
        assert assignment["assigned_by"] == "dispatcher_alok"
        assert assignment["score"] == 92.5
        assert assignment["score_breakdown"]["capability"] == 30.0
        assert assignment["accepted_at"] is not None
        assert assignment["completed_at"] is None

        # 4. Verify responder record synchronized
        resp_check = await client.get(f"/api/responders/{responder_id}")
        assert resp_check.status_code == 200
        assert resp_check.json()["data"]["status"] == "ASSIGNED"
        assert resp_check.json()["data"]["assigned_incident_id"] == incident_id

        # 5. Verify incident status synchronized
        inc_check = await client.get(f"/api/incidents/{incident_id}")
        assert inc_check.status_code == 200
        assert inc_check.json()["data"]["status"] == "ASSIGNED"

        # 6. Verify audit event in incident timeline
        events = inc_check.json()["data"]["events"]
        assign_event = next(e for e in events if e["event_type"] == "assignment.created")
        assert assign_event is not None
        assert assign_event["actor"] == "dispatcher_alok"
        assert "assignment_id" in assign_event["metadata"]


@pytest.mark.asyncio
async def test_duplicate_active_assignment_rejection():
    """Verify that a responder cannot be assigned to multiple active incidents."""
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        # Create incident 1 & 2
        inc1 = (
            await client.post(
                "/api/incidents",
                json={
                    "type": "fire",
                    "severity": "HIGH",
                    "description": "Building electrical fire A",
                    "latitude": 22.56,
                    "longitude": 88.36,
                },
            )
        ).json()["data"]

        inc2 = (
            await client.post(
                "/api/incidents",
                json={
                    "type": "medical",
                    "severity": "CRITICAL",
                    "description": "Medical triage B",
                    "latitude": 22.57,
                    "longitude": 88.37,
                },
            )
        ).json()["data"]

        # Fetch available responder
        responders = (await client.get("/api/responders")).json()["data"]
        available_resp = next(r for r in responders if r["status"] == "AVAILABLE")
        responder_id = available_resp["id"]

        # 1st assignment succeeds
        res1 = await client.post(
            "/api/assignments",
            json={"incident_id": inc1["id"], "responder_id": responder_id},
        )
        assert res1.status_code == 201

        # 2nd assignment for same responder must be rejected
        res2 = await client.post(
            "/api/assignments",
            json={"incident_id": inc2["id"], "responder_id": responder_id},
        )
        assert res2.status_code == 400
        error_detail = res2.json()["detail"]["error"]
        assert error_detail["code"] == "RESPONDER_ALREADY_ASSIGNED"


@pytest.mark.asyncio
async def test_offline_responder_rejection():
    """Verify that OFFLINE responders cannot be assigned."""
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        inc = (
            await client.post(
                "/api/incidents",
                json={
                    "type": "flood",
                    "severity": "LOW",
                    "description": "Water logging test",
                    "latitude": 22.55,
                    "longitude": 88.35,
                },
            )
        ).json()["data"]

        responders = (await client.get("/api/responders")).json()["data"]
        target_resp = responders[-1]

        # Put responder OFFLINE
        patch_res = await client.patch(
            f"/api/responders/{target_resp['id']}/status",
            json={"status": "OFFLINE", "actor": "authority"},
        )
        assert patch_res.status_code == 200

        # Attempt assignment
        assign_res = await client.post(
            "/api/assignments",
            json={"incident_id": inc["id"], "responder_id": target_resp["id"]},
        )
        assert assign_res.status_code == 400
        assert assign_res.json()["detail"]["error"]["code"] == "RESPONDER_OFFLINE"


@pytest.mark.asyncio
async def test_nonexistent_incident_and_responder_rejection():
    """Verify 404 responses for nonexistent entity references."""
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        # Nonexistent incident
        res1 = await client.post(
            "/api/assignments",
            json={"incident_id": "nonexistent-inc-9999", "responder_id": "resp-101"},
        )
        assert res1.status_code == 404

        # Nonexistent responder
        inc = (
            await client.post(
                "/api/incidents",
                json={
                    "type": "flood",
                    "description": "Valid incident",
                    "latitude": 22.55,
                    "longitude": 88.35,
                },
            )
        ).json()["data"]

        res2 = await client.post(
            "/api/assignments",
            json={"incident_id": inc["id"], "responder_id": "nonexistent-resp-9999"},
        )
        assert res2.status_code == 404


@pytest.mark.asyncio
async def test_terminal_incident_assignment_rejection():
    """Verify that resolved or cancelled incidents cannot receive assignments."""
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        inc = (
            await client.post(
                "/api/incidents",
                json={
                    "type": "other",
                    "description": "False alarm report",
                    "latitude": 22.55,
                    "longitude": 88.35,
                },
            )
        ).json()["data"]

        # Cancel incident
        cancel_res = await client.patch(
            f"/api/incidents/{inc['id']}/status",
            json={"status": "CANCELLED", "actor": "authority"},
        )
        assert cancel_res.status_code == 200

        # Fetch available responder
        responders = (await client.get("/api/responders")).json()["data"]
        available_resp = next(r for r in responders if r["status"] == "AVAILABLE")

        # Attempt assignment on cancelled incident
        assign_res = await client.post(
            "/api/assignments",
            json={"incident_id": inc["id"], "responder_id": available_resp["id"]},
        )
        assert assign_res.status_code == 400
        assert assign_res.json()["detail"]["error"]["code"] == "TERMINAL_INCIDENT"


@pytest.mark.asyncio
async def test_full_assignment_lifecycle_progression():
    """Verify PROPOSED -> ASSIGNED -> EN_ROUTE -> NEARBY -> ON_SCENE -> COMPLETED progression."""
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        # Create incident
        inc = (
            await client.post(
                "/api/incidents",
                json={
                    "type": "flood",
                    "severity": "HIGH",
                    "description": "Evacuation required",
                    "latitude": 22.58,
                    "longitude": 88.38,
                },
            )
        ).json()["data"]

        responders = (await client.get("/api/responders")).json()["data"]
        available_resp = next(r for r in responders if r["status"] == "AVAILABLE")
        responder_id = available_resp["id"]

        # 1. Create PROPOSED assignment
        create_res = await client.post(
            "/api/assignments",
            json={
                "incident_id": inc["id"],
                "responder_id": responder_id,
                "status": "PROPOSED",
                "assignment_reason": "Proposed by automated triage",
            },
        )
        assert create_res.status_code == 201
        assignment_id = create_res.json()["data"]["id"]
        assert create_res.json()["data"]["status"] == "PROPOSED"

        # 2. Invalid transition test: PROPOSED -> COMPLETED should fail
        invalid_res = await client.patch(
            f"/api/assignments/{assignment_id}/status",
            json={"status": "COMPLETED", "actor": "authority"},
        )
        assert invalid_res.status_code == 400
        assert invalid_res.json()["detail"]["error"]["code"] == "INVALID_TRANSITION"

        # 3. Transition PROPOSED -> ASSIGNED
        res_assigned = await client.patch(
            f"/api/assignments/{assignment_id}/status",
            json={"status": "ASSIGNED", "actor": "authority"},
        )
        assert res_assigned.status_code == 200
        assert res_assigned.json()["data"]["status"] == "ASSIGNED"
        assert res_assigned.json()["data"]["accepted_at"] is not None

        # 4. Transition ASSIGNED -> EN_ROUTE
        res_enroute = await client.patch(
            f"/api/assignments/{assignment_id}/status",
            json={"status": "EN_ROUTE", "actor": "authority"},
        )
        assert res_enroute.status_code == 200
        assert res_enroute.json()["data"]["status"] == "EN_ROUTE"
        assert res_enroute.json()["data"]["started_at"] is not None

        # Verify incident and responder are EN_ROUTE
        resp_check = (await client.get(f"/api/responders/{responder_id}")).json()["data"]
        assert resp_check["status"] == "EN_ROUTE"
        inc_check = (await client.get(f"/api/incidents/{inc['id']}")).json()["data"]
        assert inc_check["status"] == "EN_ROUTE"

        # 5. Transition EN_ROUTE -> NEARBY
        res_nearby = await client.patch(
            f"/api/assignments/{assignment_id}/status",
            json={"status": "NEARBY", "actor": "authority"},
        )
        assert res_nearby.status_code == 200
        assert res_nearby.json()["data"]["status"] == "NEARBY"

        # 6. Transition NEARBY -> ON_SCENE
        res_onscene = await client.patch(
            f"/api/assignments/{assignment_id}/status",
            json={"status": "ON_SCENE", "actor": "authority"},
        )
        assert res_onscene.status_code == 200
        assert res_onscene.json()["data"]["status"] == "ON_SCENE"
        assert res_onscene.json()["data"]["arrived_at"] is not None

        # 7. Transition ON_SCENE -> COMPLETED
        res_completed = await client.patch(
            f"/api/assignments/{assignment_id}/status",
            json={"status": "COMPLETED", "actor": "authority", "notes": "All victims rescued"},
        )
        assert res_completed.status_code == 200
        assert res_completed.json()["data"]["status"] == "COMPLETED"
        assert res_completed.json()["data"]["completed_at"] is not None

        # 8. Verify responder is now AVAILABLE and incident is RESOLVED
        resp_final = (await client.get(f"/api/responders/{responder_id}")).json()["data"]
        assert resp_final["status"] == "AVAILABLE"
        assert resp_final["assigned_incident_id"] is None

        inc_final = (await client.get(f"/api/incidents/{inc['id']}")).json()["data"]
        assert inc_final["status"] == "RESOLVED"

        # 9. Verify COMPLETED is terminal
        res_terminal = await client.patch(
            f"/api/assignments/{assignment_id}/status",
            json={"status": "EN_ROUTE", "actor": "authority"},
        )
        assert res_terminal.status_code == 400


@pytest.mark.asyncio
async def test_assignment_cancellation_lifecycle():
    """Verify assignment cancellation frees the responder."""
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        inc = (
            await client.post(
                "/api/incidents",
                json={
                    "type": "fire",
                    "severity": "MEDIUM",
                    "description": "Small trash fire",
                    "latitude": 22.56,
                    "longitude": 88.36,
                },
            )
        ).json()["data"]

        responders = (await client.get("/api/responders")).json()["data"]
        available_resp = next(r for r in responders if r["status"] == "AVAILABLE")
        responder_id = available_resp["id"]

        # Create ASSIGNED assignment
        create_res = await client.post(
            "/api/assignments",
            json={"incident_id": inc["id"], "responder_id": responder_id, "status": "ASSIGNED"},
        )
        assignment_id = create_res.json()["data"]["id"]

        # Cancel assignment
        cancel_res = await client.patch(
            f"/api/assignments/{assignment_id}/status",
            json={"status": "CANCELLED", "actor": "dispatcher_01", "notes": "Re-routing units"},
        )
        assert cancel_res.status_code == 200
        assert cancel_res.json()["data"]["status"] == "CANCELLED"
        assert cancel_res.json()["data"]["cancelled_at"] is not None

        # Verify responder is freed
        resp_check = (await client.get(f"/api/responders/{responder_id}")).json()["data"]
        assert resp_check["status"] == "AVAILABLE"
        assert resp_check["assigned_incident_id"] is None


@pytest.mark.asyncio
async def test_authorization_checks():
    """Verify citizens are forbidden from creating or advancing assignments."""
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        # Citizen cannot create assignment
        create_res = await client.post(
            "/api/assignments",
            json={
                "incident_id": "inc-test",
                "responder_id": "resp-test",
                "assigned_by": "citizen",
            },
        )
        assert create_res.status_code == 403

        # Citizen cannot mutate status
        patch_res = await client.patch(
            "/api/assignments/some-assignment-id/status",
            json={"status": "EN_ROUTE", "actor": "citizen"},
        )
        assert patch_res.status_code == 403


@pytest.mark.asyncio
async def test_assignment_listing_and_incident_query():
    """Verify GET /api/assignments and GET /api/incidents/{id}/assignments."""
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        inc = (
            await client.post(
                "/api/incidents",
                json={
                    "type": "medical",
                    "description": "Ambulance needed",
                    "latitude": 22.57,
                    "longitude": 88.37,
                },
            )
        ).json()["data"]

        responders = (await client.get("/api/responders")).json()["data"]
        available_resp = next(r for r in responders if r["status"] == "AVAILABLE")

        # Create assignment
        create_res = await client.post(
            "/api/assignments",
            json={"incident_id": inc["id"], "responder_id": available_resp["id"]},
        )
        assignment_id = create_res.json()["data"]["id"]

        # Fetch single assignment
        single_res = await client.get(f"/api/assignments/{assignment_id}")
        assert single_res.status_code == 200
        assert single_res.json()["data"]["id"] == assignment_id

        # Fetch list with filter
        list_res = await client.get(f"/api/assignments?incident_id={inc['id']}")
        assert list_res.status_code == 200
        assert list_res.json()["count"] >= 1

        # Fetch incident assignments route
        inc_assign_res = await client.get(f"/api/incidents/{inc['id']}/assignments")
        assert inc_assign_res.status_code == 200
        assert inc_assign_res.json()["count"] >= 1
        assert inc_assign_res.json()["data"][0]["id"] == assignment_id
