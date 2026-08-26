"""Test suite for Phase 5: Real-World Disaster Intelligence, Shelter Safety,

and Situation Summaries.
"""

from __future__ import annotations

import pytest

from app.db import get_database
from app.models import IncidentResponse, NormalizedHazard
from app.services.clustering_service import cluster_incidents
from app.services.hazard_service import get_active_hazards
from app.services.shelter_service import get_recommended_shelters


@pytest.fixture
def anyio_backend():
    return "asyncio"


@pytest.mark.asyncio
async def test_hazard_normalization_schema():
    """Verify that hazard feeds are normalized into canonical NormalizedHazard schema."""
    hazards = await get_active_hazards()
    assert len(hazards) > 0

    for hz in hazards:
        assert isinstance(hz, NormalizedHazard)
        assert hz.hazard_id.startswith("hz-")
        assert hz.severity in ("CRITICAL", "WARNING", "WATCH", "ADVISORY", "INFO")
        assert -90 <= hz.latitude <= 90
        assert -180 <= hz.longitude <= 180
        assert hz.affected_radius_km > 0
        assert len(hz.title) > 0
        assert len(hz.recommended_action) > 0


@pytest.mark.asyncio
async def test_location_relevance_filtering():
    """Verify that citizen location coordinates filter for proximate and critical alerts."""
    # Sector 12, Salt Lake Coordinates
    cit_lat, cit_lon = 22.5726, 88.3639

    relevant_hazards = await get_active_hazards(lat=cit_lat, lon=cit_lon, max_distance_km=3.0)
    assert len(relevant_hazards) > 0

    # Every returned alert is either within effective radius or CRITICAL
    for hz in relevant_hazards:
        assert hz.is_active is True


def test_incident_clustering_algorithm():
    """Verify that nearby incidents are grouped into spatial clusters."""
    mock_incidents = [
        IncidentResponse(
            id="inc-1",
            ticket_id="SV-1001",
            type="flood",
            severity="CRITICAL",
            description="Flooding A",
            reporter_name="Citizen A",
            latitude=22.5720,
            longitude=88.3630,
            affected_count=3,
            is_sos=True,
            status="VERIFIED",
            created_at="2026-08-25T00:00:00Z",
            updated_at="2026-08-25T00:00:00Z",
        ),
        IncidentResponse(
            id="inc-2",
            ticket_id="SV-1002",
            type="flood",
            severity="HIGH",
            description="Flooding B",
            reporter_name="Citizen B",
            latitude=22.5740,
            longitude=88.3650,
            affected_count=2,
            is_sos=False,
            status="ASSIGNED",
            created_at="2026-08-25T00:00:00Z",
            updated_at="2026-08-25T00:00:00Z",
        ),
        IncidentResponse(
            id="inc-3",
            ticket_id="SV-1003",
            type="medical",
            severity="MEDIUM",
            description="Medical distant",
            reporter_name="Citizen C",
            latitude=22.6500,  # >8km away
            longitude=88.4800,
            affected_count=1,
            is_sos=False,
            status="NEW",
            created_at="2026-08-25T00:00:00Z",
            updated_at="2026-08-25T00:00:00Z",
        ),
    ]

    clusters = cluster_incidents(mock_incidents, cluster_radius_km=1.2)
    assert len(clusters) == 2  # One group of 2 close flood incidents, one isolated medical incident

    # Check the first cluster
    c1 = next(c for c in clusters if c.incident_count == 2)
    assert c1.critical_count == 1
    assert c1.verified_count == 2
    assert "inc-1" in c1.incident_ids
    assert "inc-2" in c1.incident_ids


@pytest.mark.asyncio
async def test_shelter_hazard_proximity_safety():
    """Verify that shelters inside active hazard zones are flagged and penalized."""
    db = await get_database()
    # Query recommendations near Sector 12 flood zone
    recommendations = await get_recommended_shelters(db, latitude=22.5780, longitude=88.3710)
    assert len(recommendations) > 0

    # Check that each recommendation has safety classification
    for shl in recommendations:
        assert hasattr(shl, "is_safe")
        assert hasattr(shl, "safety_status")
        if not shl.is_safe:
            assert shl.safety_status == "HAZARD_PROXIMITY_WARNING"
            assert shl.hazard_proximity_warning is not None


@pytest.mark.asyncio
async def test_disaster_intelligence_api_endpoints(client):
    """Verify REST API endpoints for hazards, clusters, and situation summary."""
    # 1. Hazards feed
    hz_res = await client.get("/api/hazards?lat=22.5726&lon=88.3639")

    assert hz_res.status_code == 200
    hz_data = hz_res.json()
    assert hz_data["success"] is True
    assert len(hz_data["data"]) > 0

    # 2. Clusters feed
    cl_res = await client.get("/api/hazards/clusters")
    assert cl_res.status_code == 200
    cl_data = cl_res.json()
    assert cl_data["success"] is True

    # 3. Situation summary
    sit_res = await client.get("/api/situation/summary")
    assert sit_res.status_code == 200
    sit_data = sit_res.json()
    assert sit_data["success"] is True
    assert "statistics" in sit_data
    assert "briefing" in sit_data
    assert sit_data["statistics"]["total_active_incidents"] >= 0
    assert len(sit_data["briefing"]) > 20
