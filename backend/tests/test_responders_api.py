"""Integration tests for responders fleet API."""

import pytest


@pytest.mark.asyncio
async def test_list_responders(client):
    """Test listing all active response units."""
    resp = await client.get("/api/responders")
    assert resp.status_code == 200
    body = resp.json()
    assert body["success"] is True
    assert isinstance(body["data"], list)
    assert body["count"] == 4

    first = body["data"][0]
    assert "unit_name" in first
    assert "capability" in first
    assert "status" in first


@pytest.mark.asyncio
async def test_get_single_responder(client):
    """Test fetching single responder unit."""
    resp = await client.get("/api/responders/resp-101")
    assert resp.status_code == 200
    body = resp.json()
    assert body["success"] is True
    assert body["data"]["id"] == "resp-101"
    assert body["data"]["unit_name"] == "NDRF Rescue Unit 4"
    assert body["data"]["status"] == "AVAILABLE"


@pytest.mark.asyncio
async def test_get_nonexistent_responder(client):
    """Test 404 for nonexistent responder."""
    resp = await client.get("/api/responders/nonexistent-id")
    assert resp.status_code == 404
    body = resp.json()
    error_obj = body.get("detail", {}).get("error", {}) or body.get("error", {})
    assert error_obj.get("code") == "RESPONDER_NOT_FOUND"


@pytest.mark.asyncio
async def test_update_responder_status(client):
    """Test updating responder status and assignment."""
    patch_resp = await client.patch(
        "/api/responders/resp-101/status",
        json={"status": "ASSIGNED", "assigned_incident_id": "inc-2048"},
    )
    assert patch_resp.status_code == 200
    data = patch_resp.json()["data"]
    assert data["status"] == "ASSIGNED"
    assert data["assigned_incident_id"] == "inc-2048"


@pytest.mark.asyncio
async def test_update_responder_location(client):
    """Test updating GPS telemetry of a response unit."""
    loc_resp = await client.post(
        "/api/responders/resp-101/location",
        json={"latitude": 22.5765, "longitude": 88.3790},
    )
    assert loc_resp.status_code == 200
    data = loc_resp.json()["data"]
    assert data["latitude"] == 22.5765
    assert data["longitude"] == 88.3790


@pytest.mark.asyncio
async def test_get_candidate_responders_for_incident(client):
    """Test fetching ranked candidate responders for an active flood incident."""
    resp = await client.get("/api/responders/candidates/inc-2048")
    assert resp.status_code == 200
    body = resp.json()
    assert body["success"] is True
    assert body["incident_id"] == "inc-2048"
    assert len(body["data"]) > 0

    # Best candidate for flood incident should be flood boat craft
    top_candidate = body["data"][0]
    assert top_candidate["is_recommended"] is True
    assert top_candidate["capability"] == "FLOOD_BOAT"
    assert top_candidate["distance_km"] > 0
    assert "Flood" in top_candidate["match_reason"]


@pytest.mark.asyncio
async def test_assign_responder_to_incident(client):
    """Test assigning a responder unit to an incident."""
    assign_resp = await client.post(
        "/api/responders/resp-101/assign",
        json={"incident_id": "inc-2048", "status": "ASSIGNED", "actor": "authority"},
    )
    assert assign_resp.status_code == 200
    body = assign_resp.json()
    assert body["success"] is True
    assert body["data"]["assigned_incident_id"] == "inc-2048"
    assert body["data"]["status"] == "ASSIGNED"

    # Verify incident state transitioned to ASSIGNED with audit event
    inc_resp = await client.get("/api/incidents/inc-2048")
    assert inc_resp.status_code == 200
    inc_data = inc_resp.json()["data"]
    assert inc_data["status"] == "ASSIGNED"
    assert any(
        e["event_type"] in ("assignment.created", "RESPONDER_ASSIGNED") for e in inc_data["events"]
    )


@pytest.mark.asyncio
async def test_responder_mutation_forbidden_for_citizen(client, citizen_headers):
    """Test that citizens cannot mutate responder status or assign units."""
    status_resp = await client.patch(
        "/api/responders/resp-101/status",
        json={"status": "AVAILABLE", "actor": "citizen"},
        headers=citizen_headers,
    )
    assert status_resp.status_code == 403

    assign_resp = await client.post(
        "/api/responders/resp-101/assign",
        json={"incident_id": "inc-2048", "actor": "citizen"},
        headers=citizen_headers,
    )
    assert assign_resp.status_code == 403
