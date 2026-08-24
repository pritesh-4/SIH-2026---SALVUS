"""Integration tests for shelters API."""

import pytest


@pytest.mark.asyncio
async def test_list_shelters(client):
    """Test listing all shelters with live capacities."""
    resp = await client.get("/api/shelters")
    assert resp.status_code == 200
    body = resp.json()
    assert body["success"] is True
    assert isinstance(body["data"], list)
    assert body["count"] == 3

    first = body["data"][0]
    assert "name" in first
    assert "total_beds" in first
    assert "available_beds" in first
    assert "status" in first


@pytest.mark.asyncio
async def test_get_single_shelter(client):
    """Test fetching single shelter hub."""
    resp = await client.get("/api/shelters/shl-01")
    assert resp.status_code == 200
    body = resp.json()
    assert body["success"] is True
    assert body["data"]["id"] == "shl-01"
    assert body["data"]["name"] == "Salt Lake Stadium Assembly Hub"
    assert body["data"]["total_beds"] == 600
    assert body["data"]["available_beds"] == 420


@pytest.mark.asyncio
async def test_get_nonexistent_shelter(client):
    """Test 404 for nonexistent shelter."""
    resp = await client.get("/api/shelters/nonexistent-id")
    assert resp.status_code == 404
    body = resp.json()
    error_obj = body.get("detail", {}).get("error", {}) or body.get("error", {})
    assert error_obj.get("code") == "SHELTER_NOT_FOUND"


@pytest.mark.asyncio
async def test_update_shelter_occupancy(client):
    """Test updating available beds and dynamic occupancy percentage calculation."""
    patch_resp = await client.patch(
        "/api/shelters/shl-01",
        json={"available_beds": 100, "supplies_status": "CRITICAL", "actor": "authority"},
    )
    assert patch_resp.status_code == 200
    data = patch_resp.json()["data"]
    assert data["available_beds"] == 100
    assert data["occupancy_rate"] == "83%"
    assert data["supplies_status"] == "CRITICAL"


@pytest.mark.asyncio
async def test_get_shelter_recommendations(client):
    """Test retrieving ranked candidate evacuation shelters for a location."""
    resp = await client.get("/api/shelters/recommendations?lat=22.5726&lon=88.3639")
    assert resp.status_code == 200
    body = resp.json()
    assert body["success"] is True
    assert len(body["data"]) > 0

    top_shelter = body["data"][0]
    assert "distance_km" in top_shelter
    assert "estimated_walk_min" in top_shelter
    assert "suitability_score" in top_shelter
    assert "recommendation_reason" in top_shelter
    assert top_shelter["available_beds"] > 0


@pytest.mark.asyncio
async def test_shelter_mutation_forbidden_for_citizen(client):
    """Test that citizens cannot mutate shelter bed logistics."""
    patch_resp = await client.patch(
        "/api/shelters/shl-01",
        json={"available_beds": 0, "actor": "citizen"},
    )
    assert patch_resp.status_code == 403

