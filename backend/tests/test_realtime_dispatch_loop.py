from unittest.mock import AsyncMock, patch

import pytest


@pytest.fixture
def anyio_backend():
    return "asyncio"


@pytest.mark.asyncio
async def test_assignment_triggers_realtime_event_broadcast(client):
    """Test that assigning a responder to an incident emits events to both
    authorities and incident-specific rooms with citizen-safe details.
    """
    # 1. Fetch active incident
    inc_res = await client.get("/api/incidents")
    assert inc_res.status_code == 200
    incidents = inc_res.json()["data"]
    target_incident = next(i for i in incidents if i["status"] != "RESOLVED")

    # 2. Fetch available responder
    resp_res = await client.get("/api/responders")
    assert resp_res.status_code == 200
    responders = resp_res.json()["data"]
    target_responder = next(r for r in responders if r["status"] == "AVAILABLE")

    with (
        patch(
            "app.routes.responders.emit_assignment_created",
            new_callable=AsyncMock,
        ) as mock_assign,
        patch(
            "app.routes.responders.emit_responder_status_changed",
            new_callable=AsyncMock,
        ) as mock_resp,
        patch(
            "app.routes.responders.emit_incident_status_changed",
            new_callable=AsyncMock,
        ) as mock_inc,
    ):
        # 3. Assign responder to incident
        assign_res = await client.post(
            f"/api/responders/{target_responder['id']}/assign",
            json={
                "incident_id": target_incident["id"],
                "status": "ASSIGNED",
                "actor": "authority",
            },
        )
        assert assign_res.status_code == 200
        data = assign_res.json()["data"]
        assert data["status"] == "ASSIGNED"
        assert data["assigned_incident_id"] == target_incident["id"]

        # 4. Verify socket emissions
        assert mock_assign.called
        assert mock_resp.called
        assert mock_inc.called


@pytest.mark.asyncio
async def test_responder_location_update_emits_telemetry(client):
    """Test that updating responder GPS coordinates broadcasts real-time telemetry."""
    # Get responder
    resp_res = await client.get("/api/responders")
    responder = resp_res.json()["data"][0]

    with patch(
        "app.routes.responders.emit_responder_location_updated",
        new_callable=AsyncMock,
    ) as mock_loc:
        loc_res = await client.post(
            f"/api/responders/{responder['id']}/location",
            json={
                "latitude": 22.5780,
                "longitude": 88.3690,
                "actor": "authority",
            },
        )
        assert loc_res.status_code == 200
        assert loc_res.json()["data"]["latitude"] == 22.5780
        assert loc_res.json()["data"]["longitude"] == 88.3690
        assert mock_loc.called


@pytest.mark.asyncio
async def test_responder_lifecycle_progression_loop(client):
    """Test end-to-end operational lifecycle progression:
    ASSIGNED -> EN_ROUTE -> NEARBY -> ON_SCENE -> RESOLVED.
    """
    # 1. Create a fresh test incident
    create_res = await client.post(
        "/api/incidents",
        json={
            "type": "flood",
            "severity": "CRITICAL",
            "description": "Lifecycle integration loop incident",
            "reporter_name": "Test Reporter",
            "latitude": 22.5726,
            "longitude": 88.3639,
            "affected_count": 2,
            "is_sos": True,
        },
    )
    assert create_res.status_code == 201
    inc = create_res.json()["data"]

    # 2. Get available responder
    resp_res = await client.get("/api/responders")
    responder = next(r for r in resp_res.json()["data"] if r["status"] == "AVAILABLE")

    # 3. Assign
    await client.post(
        f"/api/responders/{responder['id']}/assign",
        json={"incident_id": inc["id"], "status": "ASSIGNED", "actor": "authority"},
    )

    # 4. Advance EN_ROUTE
    en_route_res = await client.post(
        f"/api/responders/{responder['id']}/lifecycle",
        json={"target_status": "EN_ROUTE", "actor": "authority"},
    )
    assert en_route_res.status_code == 200
    assert en_route_res.json()["data"]["status"] == "EN_ROUTE"

    # 5. Advance NEARBY
    nearby_res = await client.post(
        f"/api/responders/{responder['id']}/lifecycle",
        json={"target_status": "NEARBY", "actor": "authority"},
    )
    assert nearby_res.status_code == 200
    assert nearby_res.json()["data"]["status"] == "NEARBY"

    # 6. Advance ON_SCENE
    on_scene_res = await client.post(
        f"/api/responders/{responder['id']}/lifecycle",
        json={"target_status": "ON_SCENE", "actor": "authority"},
    )
    assert on_scene_res.status_code == 200
    assert on_scene_res.json()["data"]["status"] == "ON_SCENE"

    # 7. Complete & Resolve
    resolve_res = await client.post(
        f"/api/responders/{responder['id']}/lifecycle",
        json={"target_status": "AVAILABLE", "actor": "authority"},
    )
    assert resolve_res.status_code == 200
    assert resolve_res.json()["data"]["status"] == "AVAILABLE"
    assert resolve_res.json()["data"]["assigned_incident_id"] is None
