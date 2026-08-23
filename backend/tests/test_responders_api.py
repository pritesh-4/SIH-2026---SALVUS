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
