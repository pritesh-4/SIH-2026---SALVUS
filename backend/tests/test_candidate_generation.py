"""Unit and integration tests for Task 04: Responder Candidate Generation."""

import pytest

from app.models import IncidentResponse, ResponderResponse
from app.services.candidate_generation import (
    evaluate_responder_eligibility,
    generate_candidate_pool,
)


def _make_incident(
    inc_id: str = "inc-01",
    inc_type: str = "flood",
    severity: str = "CRITICAL",
    lat: float = 22.5726,
    lon: float = 88.3639,
    affected_count: int = 4,
) -> IncidentResponse:
    return IncidentResponse(
        id=inc_id,
        ticket_id="SV-2026-0001",
        type=inc_type,
        severity=severity,
        status="NEW",
        latitude=lat,
        longitude=lon,
        description="Severe waterlogging and stranded family",
        location_name="Salt Lake Sector 5",
        affected_count=affected_count,
        reporter_name="Debasish Ghosh",
        reporter_phone="+91-98301-22334",
        is_sos=True,
        created_at="2026-08-25T12:00:00Z",
        updated_at="2026-08-25T12:00:00Z",
    )


def _make_responder(
    resp_id: str = "resp-01",
    unit_name: str = "NDRF Alpha",
    capability: str = "FLOOD_BOAT",
    status: str = "AVAILABLE",
    lat: float = 22.5740,
    lon: float = 88.3720,
    assigned_incident_id: str | None = None,
    current_load: int = 0,
    max_capacity: int = 8,
) -> ResponderResponse:
    return ResponderResponse(
        id=resp_id,
        unit_name=unit_name,
        team_lead="Commander Roy",
        vehicle_type="Inflatable Zodiac Boat",
        capability=capability,
        status=status,
        latitude=lat,
        longitude=lon,
        radio_channel="VHF-14",
        max_capacity=max_capacity,
        current_load=current_load,
        assigned_incident_id=assigned_incident_id,
        last_seen="2026-08-25T12:00:00Z",
        created_at="2026-08-25T12:00:00Z",
        updated_at="2026-08-25T12:00:00Z",
    )


def test_available_matching_unit_is_eligible():
    """Verify an available unit with matching capability and valid coordinates is eligible."""
    inc = _make_incident(inc_type="flood")
    resp = _make_responder(capability="FLOOD_BOAT", status="AVAILABLE")

    item = evaluate_responder_eligibility(inc, resp)
    assert item.is_eligible is True
    assert item.exclusion_reason is None
    assert "Flood Rescue Watercraft" in (item.match_reason or "")


def test_offline_unit_is_excluded():
    """Verify an OFFLINE responder is rejected with explicit exclusion reason."""
    inc = _make_incident(inc_type="flood")
    resp = _make_responder(capability="FLOOD_BOAT", status="OFFLINE")

    item = evaluate_responder_eligibility(inc, resp)
    assert item.is_eligible is False
    assert "OFFLINE" in (item.exclusion_reason or "")


def test_busy_unit_assigned_to_another_mission_is_excluded():
    """Verify a responder actively assigned to another mission is excluded."""
    inc = _make_incident(inc_id="inc-target", inc_type="flood")
    resp = _make_responder(
        capability="FLOOD_BOAT",
        status="ASSIGNED",
        assigned_incident_id="inc-other-123",
    )

    item = evaluate_responder_eligibility(inc, resp)
    assert item.is_eligible is False
    assert "Already actively assigned" in (item.exclusion_reason or "")


def test_busy_unit_on_scene_is_excluded():
    """Verify a responder ON_SCENE at another mission is excluded."""
    inc = _make_incident(inc_id="inc-target", inc_type="medical")
    resp = _make_responder(
        capability="AMBULANCE",
        status="ON_SCENE",
        assigned_incident_id="inc-other-456",
    )

    item = evaluate_responder_eligibility(inc, resp)
    assert item.is_eligible is False
    assert "Already actively assigned" in (item.exclusion_reason or "")


def test_matching_capability_rules():
    """Verify deterministic capability matching across incident types."""
    # Medical incident + Ambulance -> Eligible
    inc_med = _make_incident(inc_type="medical")
    resp_amb = _make_responder(capability="AMBULANCE", status="AVAILABLE")
    item_med = evaluate_responder_eligibility(inc_med, resp_amb)
    assert item_med.is_eligible is True

    # Structural incident + Debris Clear -> Eligible
    inc_struct = _make_incident(inc_type="structural")
    resp_debris = _make_responder(capability="DEBRIS_CLEAR", status="AVAILABLE")
    item_struct = evaluate_responder_eligibility(inc_struct, resp_debris)
    assert item_struct.is_eligible is True


def test_non_matching_capability_is_excluded():
    """Verify non-matching capability is excluded with deterministic capability mismatch reason."""
    # Medical incident + Debris Clear (cannot perform ALS medical triage)
    inc_med = _make_incident(inc_type="medical")
    resp_debris = _make_responder(capability="DEBRIS_CLEAR", status="AVAILABLE")

    item = evaluate_responder_eligibility(inc_med, resp_debris)
    assert item.is_eligible is False
    assert "Capability mismatch" in (item.exclusion_reason or "")


def test_missing_or_nan_location_is_excluded():
    """Verify missing, NaN, or out-of-bounds GPS coordinates are excluded."""
    inc = _make_incident(inc_type="flood")

    # NaN coordinates
    resp_nan = _make_responder(lat=float("nan"), lon=88.3639)
    item_nan = evaluate_responder_eligibility(inc, resp_nan)
    assert item_nan.is_eligible is False
    assert "nan" in (item_nan.exclusion_reason or "").lower()

    # Out of bounds latitude
    resp_bounds = _make_responder(lat=120.0, lon=88.3639)
    item_bounds = evaluate_responder_eligibility(inc, resp_bounds)
    assert item_bounds.is_eligible is False
    assert "out of bounds" in (item_bounds.exclusion_reason or "").lower()


def test_required_capability_override_filter():
    """Verify explicit required_capability filter excludes responders without exact match."""
    inc = _make_incident(inc_type="flood")
    resp_boat = _make_responder(resp_id="r1", capability="FLOOD_BOAT")
    resp_amb = _make_responder(resp_id="r2", capability="AMBULANCE")

    # When required_capability is FLOOD_BOAT, ambulance is excluded
    res = generate_candidate_pool(inc, [resp_boat, resp_amb], required_capability="FLOOD_BOAT")
    assert res.total_eligible == 1
    assert res.eligible_responders[0].responder_id == "r1"
    assert res.total_excluded == 1
    assert res.excluded_responders[0].responder_id == "r2"
    assert "Required capability" in (res.excluded_responders[0].exclusion_reason or "")


def test_candidate_generation_partitioning():
    """Verify full fleet candidate generation cleanly partitions eligible and excluded units."""
    inc = _make_incident(inc_type="flood")
    fleet = [
        _make_responder(
            resp_id="u1", unit_name="Unit 01", capability="FLOOD_BOAT", status="AVAILABLE"
        ),
        _make_responder(resp_id="u2", unit_name="Unit 02", capability="HAZMAT", status="AVAILABLE"),
        _make_responder(
            resp_id="u3", unit_name="Unit 03", capability="FLOOD_BOAT", status="OFFLINE"
        ),
        _make_responder(
            resp_id="u4",
            unit_name="Unit 04",
            capability="FLOOD_BOAT",
            status="ASSIGNED",
            assigned_incident_id="other-inc",
        ),
    ]

    result = generate_candidate_pool(inc, fleet)

    assert result.total_evaluated == 4
    assert result.total_eligible == 1
    assert result.total_excluded == 3

    assert result.eligible_responders[0].responder_id == "u1"
    assert result.eligible_responders[0].is_eligible is True

    excluded_ids = [item.responder_id for item in result.excluded_responders]
    assert "u2" in excluded_ids
    assert "u3" in excluded_ids
    assert "u4" in excluded_ids


def test_no_candidates_scenario():
    """Verify empty fleet or all-excluded fleet handles 0 eligible candidates gracefully."""
    inc = _make_incident(inc_type="flood")
    result_empty = generate_candidate_pool(inc, [])
    assert result_empty.total_evaluated == 0
    assert result_empty.total_eligible == 0
    assert result_empty.total_excluded == 0

    all_offline = [
        _make_responder(resp_id="o1", status="OFFLINE"),
        _make_responder(resp_id="o2", status="OFFLINE"),
    ]
    result_offline = generate_candidate_pool(inc, all_offline)
    assert result_offline.total_evaluated == 2
    assert result_offline.total_eligible == 0
    assert result_offline.total_excluded == 2


@pytest.mark.asyncio
async def test_candidate_pool_api_endpoints(client):
    """Verify candidate pool REST API endpoints."""
    # Create an incident
    inc_res = await client.post(
        "/api/incidents",
        json={
            "type": "flood",
            "severity": "HIGH",
            "description": "Rising floodwaters in Sector 5",
            "latitude": 22.5726,
            "longitude": 88.3639,
        },
    )
    assert inc_res.status_code == 201
    inc_id = inc_res.json()["data"]["id"]

    # 1. Test GET /api/responders/candidate-pool/{incident_id}
    pool_res = await client.get(f"/api/responders/candidate-pool/{inc_id}")
    assert pool_res.status_code == 200
    pool_data = pool_res.json()["data"]
    assert pool_data["incident_id"] == inc_id
    assert "eligible_responders" in pool_data
    assert "excluded_responders" in pool_data
    assert pool_data["total_evaluated"] >= 1

    # 2. Test GET /api/incidents/{incident_id}/candidate-pool
    inc_pool_res = await client.get(f"/api/incidents/{inc_id}/candidate-pool")
    assert inc_pool_res.status_code == 200
    assert inc_pool_res.json()["data"]["incident_id"] == inc_id

    # 3. Test POST /api/responders/candidate-pool/evaluate (offline evaluate payload)
    eval_res = await client.post(
        "/api/responders/candidate-pool/evaluate",
        json={
            "incident": inc_res.json()["data"],
            "responders": [
                {
                    "id": "mock-r1",
                    "unit_name": "Mock Boat 1",
                    "team_lead": "Lead",
                    "vehicle_type": "Boat",
                    "capability": "FLOOD_BOAT",
                    "status": "AVAILABLE",
                    "latitude": 22.574,
                    "longitude": 88.372,
                    "radio_channel": "VHF-1",
                    "max_capacity": 8,
                    "current_load": 0,
                    "last_seen": "2026-08-25T12:00:00Z",
                    "created_at": "2026-08-25T12:00:00Z",
                    "updated_at": "2026-08-25T12:00:00Z",
                },
                {
                    "id": "mock-r2",
                    "unit_name": "Mock Hazmat 2",
                    "team_lead": "Lead",
                    "vehicle_type": "Truck",
                    "capability": "HAZMAT",
                    "status": "AVAILABLE",
                    "latitude": 22.574,
                    "longitude": 88.372,
                    "radio_channel": "VHF-2",
                    "max_capacity": 4,
                    "current_load": 0,
                    "last_seen": "2026-08-25T12:00:00Z",
                    "created_at": "2026-08-25T12:00:00Z",
                    "updated_at": "2026-08-25T12:00:00Z",
                },
            ],
        },
    )
    assert eval_res.status_code == 200
    eval_data = eval_res.json()["data"]
    assert eval_data["total_evaluated"] == 2
    assert eval_data["total_eligible"] == 1
    assert eval_data["total_excluded"] == 1
    assert eval_data["eligible_responders"][0]["responder_id"] == "mock-r1"
    assert eval_data["excluded_responders"][0]["responder_id"] == "mock-r2"
