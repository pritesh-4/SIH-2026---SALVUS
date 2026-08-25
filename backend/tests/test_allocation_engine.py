"""Unit tests for the explainable deterministic allocation engine."""

from app.models import IncidentResponse, ResponderResponse
from app.services.allocation_engine import (
    compute_availability_score,
    compute_capability_score,
    compute_proximity_score,
    compute_workload_penalty,
    rank_and_explain_candidates,
)


def _make_dummy_incident(
    inc_type="flood", severity="CRITICAL", lat=22.5726, lon=88.3639
) -> IncidentResponse:
    return IncidentResponse(
        id="inc-test-01",
        ticket_id="SV-TEST",
        type=inc_type,
        severity=severity,
        description="Test emergency beacon",
        reporter_name="Test User",
        latitude=lat,
        longitude=lon,
        affected_count=3,
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
) -> ResponderResponse:
    return ResponderResponse(
        id=resp_id,
        unit_name=name,
        team_lead="Lead",
        vehicle_type="Rescue Craft",
        capability=cap,
        status=status,
        latitude=lat,
        longitude=lon,
        radio_channel="VHF Ch 4",
        max_capacity=max_cap,
        current_load=load,
        assigned_incident_id=None,
        last_seen="2026-08-25T12:00:00Z",
        created_at="2026-08-25T12:00:00Z",
        updated_at="2026-08-25T12:00:00Z",
    )


def test_capability_scoring():
    """Verify exact capability match gives maximum points."""
    # Flood incident: FLOOD_BOAT should get 35 pts (100%), AMBULANCE gets 24 pts
    score_boat, _, pct_boat = compute_capability_score("flood", "FLOOD_BOAT")
    score_amb, _, pct_amb = compute_capability_score("flood", "AMBULANCE")
    assert score_boat == 35
    assert pct_boat == 100
    assert score_amb < score_boat

    # Medical incident: AMBULANCE should get 35 pts (100%)
    score_med_amb, _, _ = compute_capability_score("medical", "AMBULANCE")
    assert score_med_amb == 35


def test_availability_scoring():
    """Verify available units get highest bonus while offline are heavily penalized."""
    avail_score, _ = compute_availability_score("AVAILABLE")
    nearby_score, _ = compute_availability_score("NEARBY")
    assigned_score, _ = compute_availability_score("ASSIGNED")
    offline_score, _ = compute_availability_score("OFFLINE")

    assert avail_score == 20
    assert nearby_score < avail_score
    assert assigned_score == 0
    assert offline_score < 0


def test_proximity_scoring():
    """Verify distance decay."""
    assert compute_proximity_score(0.5)[0] == 15
    assert compute_proximity_score(2.0)[0] == 12
    assert compute_proximity_score(4.0)[0] == 8
    assert compute_proximity_score(8.0)[0] == 5


def test_workload_penalty():
    """Verify zero load has zero penalty while full capacity deducts points."""
    assert compute_workload_penalty(0, 8)[0] == 0
    assert compute_workload_penalty(8, 8)[0] == 10
    assert compute_workload_penalty(4, 8)[0] == 5


def test_deterministic_candidate_ranking_and_explanations():
    """Verify full candidate ranking, top recommendation, and explanation generation."""
    inc = _make_dummy_incident(inc_type="flood", severity="CRITICAL")

    resp_ideal = _make_dummy_responder(
        resp_id="resp-boat",
        name="NDRF Rescue Unit 4",
        cap="FLOOD_BOAT",
        status="AVAILABLE",
        lat=22.5740,
        lon=88.3720,  # ~1.0 km
        load=0,
    )
    resp_far_amb = _make_dummy_responder(
        resp_id="resp-amb",
        name="Ambulance 09",
        cap="AMBULANCE",
        status="AVAILABLE",
        lat=22.5880,
        lon=88.4200,  # ~5.5 km
        load=2,
    )
    resp_offline = _make_dummy_responder(
        resp_id="resp-off",
        name="Offline Craft",
        cap="FLOOD_BOAT",
        status="OFFLINE",
    )

    candidates = rank_and_explain_candidates(inc, [resp_ideal, resp_far_amb, resp_offline])

    # Offline unit should be excluded
    candidate_ids = [c.id for c in candidates]
    assert "resp-off" not in candidate_ids

    # Ideal unit should be ranked #1 and marked is_recommended
    assert len(candidates) == 2
    assert candidates[0].id == "resp-boat"
    assert candidates[0].is_recommended is True
    assert candidates[0].match_score > candidates[1].match_score

    # Check explanation structure
    exp = candidates[0].explanation
    assert exp is not None
    assert len(exp.positive_factors) >= 3
    assert any("Flood Rescue" in f or "profile match" in f for f in exp.positive_factors)
    assert exp.breakdown.total_score == candidates[0].match_score
