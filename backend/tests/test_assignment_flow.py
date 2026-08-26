"""Integration tests for responder assignment, routing API, and simulation journey."""

import pytest


@pytest.fixture
def anyio_backend():
    return "asyncio"


@pytest.mark.asyncio
async def test_get_candidates_with_explanations(client):
    """Verify GET /api/responders/candidates/{id} returns ranked units with math explanations."""
    # 1. Fetch seed incident
    inc_res = await client.get("/api/incidents")
    assert inc_res.status_code == 200
    incidents = inc_res.json()["data"]
    flood_inc = next(i for i in incidents if i["type"] == "flood")

    # 2. Get candidates
    cand_res = await client.get(f"/api/responders/candidates/{flood_inc['id']}")
    assert cand_res.status_code == 200
    data = cand_res.json()["data"]
    assert len(data) >= 1

    top_cand = data[0]
    assert top_cand["is_recommended"] is True
    assert top_cand["match_score"] > 0
    assert top_cand["explanation"] is not None
    assert "breakdown" in top_cand["explanation"]
    assert len(top_cand["explanation"]["positive_factors"]) > 0


@pytest.mark.asyncio
async def test_atomic_assignment_and_lifecycle_advancement(client):
    """Verify atomic assignment and unified lifecycle transitions."""
    # 1. Create a test incident
    create_res = await client.post(
        "/api/incidents",
        json={
            "type": "flood",
            "severity": "CRITICAL",
            "description": "Family trapped on roof",
            "reporter_name": "Test Citizen",
            "latitude": 22.5726,
            "longitude": 88.3639,
            "is_sos": True,
        },
    )
    assert create_res.status_code == 201
    incident_id = create_res.json()["data"]["id"]

    # 2. Get available responders
    resp_list_res = await client.get("/api/responders")
    assert resp_list_res.status_code == 200
    responder = resp_list_res.json()["data"][0]
    responder_id = responder["id"]

    # 3. Assign responder
    assign_res = await client.post(
        f"/api/responders/{responder_id}/assign",
        json={"incident_id": incident_id, "actor": "dispatcher_01"},
    )
    assert assign_res.status_code == 200
    assigned_resp = assign_res.json()["data"]
    assert assigned_resp["status"] == "ASSIGNED"
    assert assigned_resp["assigned_incident_id"] == incident_id

    # Verify incident is now ASSIGNED
    inc_check = await client.get(f"/api/incidents/{incident_id}")
    assert inc_check.json()["data"]["status"] == "ASSIGNED"

    # 4. Advance lifecycle to EN_ROUTE
    en_route_res = await client.post(
        f"/api/responders/{responder_id}/lifecycle",
        json={"target_status": "EN_ROUTE", "actor": "authority"},
    )
    assert en_route_res.status_code == 200
    assert en_route_res.json()["data"]["status"] == "EN_ROUTE"

    # Verify incident is now EN_ROUTE
    inc_check2 = await client.get(f"/api/incidents/{incident_id}")
    assert inc_check2.json()["data"]["status"] == "EN_ROUTE"

    # 5. Advance lifecycle to NEARBY
    nearby_res = await client.post(
        f"/api/responders/{responder_id}/lifecycle",
        json={"target_status": "NEARBY", "actor": "authority"},
    )
    assert nearby_res.status_code == 200
    assert nearby_res.json()["data"]["status"] == "NEARBY"

    # 6. Advance lifecycle to ON_SCENE
    on_scene_res = await client.post(
        f"/api/responders/{responder_id}/lifecycle",
        json={"target_status": "ON_SCENE", "actor": "authority"},
    )
    assert on_scene_res.status_code == 200
    assert on_scene_res.json()["data"]["status"] == "ON_SCENE"

    # 7. Advance to AVAILABLE (Resolution)
    resolved_res = await client.post(
        f"/api/responders/{responder_id}/lifecycle",
        json={"target_status": "AVAILABLE", "actor": "authority"},
    )
    assert resolved_res.status_code == 200
    assert resolved_res.json()["data"]["status"] == "AVAILABLE"

    # Verify incident is now RESOLVED
    inc_final = await client.get(f"/api/incidents/{incident_id}")
    assert inc_final.json()["data"]["status"] == "RESOLVED"


@pytest.mark.asyncio
async def test_routing_api_endpoints(client):
    """Verify GET and POST /api/routing/route endpoints."""
    res = await client.get(
        "/api/routing/route?origin_lat=22.5726&origin_lng=88.3639&dest_lat=22.5800&dest_lng=88.4350&profile=boat"
    )
    assert res.status_code == 200
    data = res.json()["data"]
    assert data["distance_km"] > 0
    assert len(data["coordinates"]) > 0
    assert "min" in data["eta_formatted"]


@pytest.mark.asyncio
async def test_simulation_step_endpoint(client):
    """Verify POST /api/simulation/step streams GPS coordinates and updates status."""
    # Fetch responder
    resp_list = (await client.get("/api/responders")).json()["data"]
    responder_id = resp_list[0]["id"]

    sim_res = await client.post(
        "/api/simulation/step",
        json={
            "responder_id": responder_id,
            "incident_id": "inc-2048",
            "step_index": 5,
            "total_steps": 20,
            "latitude": 22.5730,
            "longitude": 88.3650,
            "target_status": "EN_ROUTE",
        },
    )
    assert sim_res.status_code == 200
    data = sim_res.json()["data"]
    assert data["latitude"] == 22.5730
    assert data["longitude"] == 88.3650
