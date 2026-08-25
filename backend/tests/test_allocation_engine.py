"""Unit and integration tests for the Salvus explainable deterministic allocation engine."""

import pytest

from app.models import (
    IncidentResponse,
    ResponderResponse,
)
from app.services.allocation_engine import (
    WEIGHT_AVAILABILITY,
    WEIGHT_CAPABILITY,
    WEIGHT_DISTANCE,
    WEIGHT_ETA,
    WEIGHT_SEVERITY_FIT,
    WEIGHT_WORKLOAD,
    compute_availability_score,
    compute_capability_score,
    compute_distance_score,
    compute_eta_score,
    compute_severity_fit_score,
    compute_workload_score,
    is_eligible_candidate,
    rank_and_explain_candidates,
)


def _make_dummy_incident(
    inc_id="inc-test-01",
    inc_type="flood",
    severity="CRITICAL",
    lat=22.5726,
    lon=88.3639,
) -> IncidentResponse:
    return IncidentResponse(
        id=inc_id,
        ticket_id="SV-TEST-01",
        type=inc_type,
        severity=severity,
        description="Test flood rescue beacon with multiple trapped citizens",
        reporter_name="Citizen Tester",
        latitude=lat,
        longitude=lon,
        affected_count=4,
        is_sos=True,
        status="NEW",
        created_at="2026-08-25T12:00:00Z",
        updated_at="2026-08-25T12:00:00Z",
        events=[],
    )


def _make_dummy_responder(
    resp_id="resp-01",
    name="Unit 1",
    cap="FLOOD_BOAT",
    status="AVAILABLE",
    lat=22.5740,
    lon=88.3720,
    load=0,
    max_cap=8,
    assigned_incident_id=None,
) -> ResponderResponse:
    return ResponderResponse(
        id=resp_id,
        unit_name=name,
        team_lead="Team Commander",
        vehicle_type="Rescue Boat",
        capability=cap,
        status=status,
        latitude=lat,
        longitude=lon,
        radio_channel="VHF Ch 4",
        max_capacity=max_cap,
        current_load=load,
        assigned_incident_id=assigned_incident_id,
        last_seen="2026-08-25T12:00:00Z",
        created_at="2026-08-25T12:00:00Z",
        updated_at="2026-08-25T12:00:00Z",
    )


def test_weights_sum_to_100():
    """Verify centralized weights sum exactly to 100 points."""
    total_weights = (
        WEIGHT_CAPABILITY
        + WEIGHT_AVAILABILITY
        + WEIGHT_DISTANCE
        + WEIGHT_ETA
        + WEIGHT_WORKLOAD
        + WEIGHT_SEVERITY_FIT
    )
    assert total_weights == 100


def test_capability_scoring():
    """Verify exact capability match gives maximum 30 points and scales appropriately."""
    # Flood incident: FLOOD_BOAT gets full 30 pts, AMBULANCE gets 21 pts (70%)
    score_boat, reason_boat, pct_boat = compute_capability_score("flood", "FLOOD_BOAT")
    score_amb, reason_amb, pct_amb = compute_capability_score("flood", "AMBULANCE")
    assert score_boat == WEIGHT_CAPABILITY  # 30
    assert pct_boat == 100
    assert "Flood Rescue" in reason_boat
    assert score_amb == 21
    assert pct_amb == 70

    # Medical incident: AMBULANCE gets 30 pts
    score_med, _, pct_med = compute_capability_score("medical", "AMBULANCE")
    assert score_med == WEIGHT_CAPABILITY
    assert pct_med == 100

    # Hazard incident: HAZMAT gets 30 pts
    score_hz, _, pct_hz = compute_capability_score("hazard", "HAZMAT")
    assert score_hz == WEIGHT_CAPABILITY
    assert pct_hz == 100


def test_availability_scoring():
    """Verify operational readiness points across statuses."""
    assert compute_availability_score("AVAILABLE")[0] == WEIGHT_AVAILABILITY  # 20
    assert compute_availability_score("NEARBY")[0] == 15
    assert compute_availability_score("EN_ROUTE")[0] == 8
    assert compute_availability_score("ASSIGNED")[0] == 0
    assert compute_availability_score("ON_SCENE")[0] == 0
    assert compute_availability_score("OFFLINE")[0] == 0


def test_distance_and_eta_scoring():
    """Verify distance and transit ETA decay curves."""
    assert compute_distance_score(0.5)[0] == WEIGHT_DISTANCE  # 15
    assert compute_distance_score(2.0)[0] == 12
    assert compute_distance_score(4.0)[0] == 9
    assert compute_distance_score(8.0)[0] == 6
    assert compute_distance_score(15.0)[0] == 3
    assert compute_distance_score(30.0)[0] == 0

    assert compute_eta_score(2.0)[0] == WEIGHT_ETA  # 15
    assert compute_eta_score(5.0)[0] == 12
    assert compute_eta_score(10.0)[0] == 9
    assert compute_eta_score(18.0)[0] == 5
    assert compute_eta_score(30.0)[0] == 2
    assert compute_eta_score(45.0)[0] == 0


def test_workload_and_severity_fit_scoring():
    """Verify remaining capacity and severity alignment."""
    # Zero load gets full 10 points
    assert compute_workload_score(0, 8)[0] == WEIGHT_WORKLOAD  # 10
    # Half load gets 5 points
    assert compute_workload_score(4, 8)[0] == 5
    # Full load gets 0 points
    assert compute_workload_score(8, 8)[0] == 0

    # Severity Fit: Critical with high capacity (8 >= 6) gets 10 pts
    resp_large = _make_dummy_responder(max_cap=8)
    resp_small = _make_dummy_responder(max_cap=4)
    assert compute_severity_fit_score("CRITICAL", resp_large)[0] == WEIGHT_SEVERITY_FIT  # 10
    assert compute_severity_fit_score("CRITICAL", resp_small)[0] == 7


def test_candidate_filtering_rules():
    """Verify filtering removes offline, invalid coords, and actively committed responders."""
    # 1. Available -> eligible
    resp_ok = _make_dummy_responder(status="AVAILABLE")
    assert is_eligible_candidate(resp_ok) is True

    # 2. Offline -> filtered out
    resp_off = _make_dummy_responder(status="OFFLINE")
    assert is_eligible_candidate(resp_off) is False

    # 3. Out-of-bounds coords -> filtered out
    resp_out_bounds = _make_dummy_responder(lat=95.0, lon=190.0)
    assert is_eligible_candidate(resp_out_bounds) is False

    # 4. NaN coords -> filtered out
    resp_nan = _make_dummy_responder(lat=float("nan"), lon=88.3639)
    assert is_eligible_candidate(resp_nan) is False

    # 5. Actively assigned to another incident -> filtered out
    resp_assigned = _make_dummy_responder(status="ASSIGNED", assigned_incident_id="inc-other-99")
    assert is_eligible_candidate(resp_assigned) is False


def test_closer_vs_farther_responder_ranking():
    """Verify closer responder with identical capability scores higher than farther one."""
    inc = _make_dummy_incident(lat=22.5726, lon=88.3639)
    resp_close = _make_dummy_responder(
        resp_id="resp-close",
        name="Close Boat",
        cap="FLOOD_BOAT",
        lat=22.5740,
        lon=88.3650,  # ~200m
    )
    resp_far = _make_dummy_responder(
        resp_id="resp-far",
        name="Far Boat",
        cap="FLOOD_BOAT",
        lat=22.6200,
        lon=88.4500,  # ~10 km
    )

    candidates = rank_and_explain_candidates(inc, [resp_far, resp_close])
    assert len(candidates) == 2
    assert candidates[0].id == "resp-close"
    assert candidates[0].match_score > candidates[1].match_score
    assert candidates[0].is_recommended is True


def test_low_vs_high_workload_ranking():
    """Verify responder with 0 load ranks higher than responder with full load at same distance."""
    inc = _make_dummy_incident(lat=22.5726, lon=88.3639)
    resp_free = _make_dummy_responder(
        resp_id="resp-free",
        name="Free Unit",
        lat=22.5740,
        lon=88.3720,
        load=0,
        max_cap=8,
    )
    resp_busy = _make_dummy_responder(
        resp_id="resp-busy",
        name="Busy Unit",
        lat=22.5740,
        lon=88.3720,
        load=8,
        max_cap=8,
    )

    candidates = rank_and_explain_candidates(inc, [resp_busy, resp_free])
    assert len(candidates) == 2
    assert candidates[0].id == "resp-free"
    assert candidates[0].match_score > candidates[1].match_score


def test_no_available_responder_state():
    """Verify empty result when no responders are eligible."""
    inc = _make_dummy_incident()
    resp_off = _make_dummy_responder(status="OFFLINE")
    resp_busy = _make_dummy_responder(status="ASSIGNED", assigned_incident_id="inc-other")

    candidates = rank_and_explain_candidates(inc, [resp_off, resp_busy])
    assert len(candidates) == 0


def test_deterministic_reproducibility_and_breakdown():
    """Verify same inputs produce exact same scores and breakdown components sum to total."""
    inc = _make_dummy_incident(inc_type="flood", severity="CRITICAL")
    resp = _make_dummy_responder(
        resp_id="resp-boat-1",
        name="Rescue Unit 1",
        cap="FLOOD_BOAT",
        status="AVAILABLE",
        lat=22.5750,
        lon=88.3660,
        load=0,
        max_cap=8,
    )

    cands1 = rank_and_explain_candidates(inc, [resp])
    cands2 = rank_and_explain_candidates(inc, [resp])

    assert len(cands1) == 1
    assert cands1[0].match_score == cands2[0].match_score

    # Check breakdown math: sum of components must match final score exactly
    bd = cands1[0].explanation.breakdown
    expected_sum = (
        bd.capability_score
        + bd.availability_score
        + bd.distance_score
        + bd.eta_score
        + bd.workload_score
        + bd.severity_fit_score
    )
    assert bd.final_score == expected_sum
    assert cands1[0].match_score == expected_sum
    assert 0 <= cands1[0].match_score <= 100

    # Verify Human Override principle: Recommended, NOT dispatched
    assert cands1[0].is_recommended is True
    assert cands1[0].status == "AVAILABLE"  # Status not mutated


@pytest.mark.asyncio
async def test_api_candidates_and_evaluate_endpoints(client):
    """Verify candidate REST API endpoints."""
    # 1. Test GET /api/responders/candidates/{incident_id}
    resp1 = await client.get("/api/responders/candidates/inc-001")
    assert resp1.status_code == 200
    data1 = resp1.json()
    assert data1["success"] is True
    assert data1["allocation_status"] in ("RECOMMENDED", "NO_AVAILABLE_RESPONDER")
    assert isinstance(data1["data"], list)

    if data1["data"]:
        top = data1["data"][0]
        assert "match_score" in top
        assert "explanation" in top
        assert "breakdown" in top["explanation"]
        assert top["explanation"]["breakdown"]["final_score"] == top["match_score"]

    # 2. Test POST /api/responders/candidates/evaluate standalone
    dummy_inc = _make_dummy_incident()
    dummy_resp = _make_dummy_responder()

    eval_payload = {
        "incident": dummy_inc.model_dump(),
        "responders": [dummy_resp.model_dump()],
    }

    resp2 = await client.post("/api/responders/candidates/evaluate", json=eval_payload)
    assert resp2.status_code == 200
    data2 = resp2.json()
    assert data2["success"] is True
    assert data2["allocation_status"] == "RECOMMENDED"
    assert len(data2["data"]) == 1
    assert data2["data"][0]["is_recommended"] is True
