"""Unit and integration tests for Task 05: Explainable Deterministic Responder Allocation Engine."""

import pytest

from app.models import IncidentResponse, ResponderResponse
from app.services.allocation_engine import (
    DEFAULT_SCORING_WEIGHTS,
    WEIGHT_AVAILABILITY,
    WEIGHT_CAPABILITY,
    WEIGHT_DISTANCE,
    WEIGHT_ETA,
    WEIGHT_SEVERITY_FIT,
    WEIGHT_WORKLOAD,
    normalize_distance,
    normalize_eta,
    normalize_workload,
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
    assert DEFAULT_SCORING_WEIGHTS.total == 100
    total_weights = (
        WEIGHT_CAPABILITY
        + WEIGHT_AVAILABILITY
        + WEIGHT_DISTANCE
        + WEIGHT_ETA
        + WEIGHT_WORKLOAD
        + WEIGHT_SEVERITY_FIT
    )
    assert total_weights == 100


def test_normalization_functions():
    """Verify continuous mathematical normalization formulas."""
    # Distance Normalization [0 to 25 km]
    assert normalize_distance(0.0) == 1.0
    assert normalize_distance(12.5) == 0.5
    assert normalize_distance(25.0) == 0.0
    assert normalize_distance(30.0) == 0.0

    # ETA Normalization [0 to 35 min]
    assert normalize_eta(0.0) == 1.0
    assert normalize_eta(17.5) == 0.5
    assert normalize_eta(35.0) == 0.0
    assert normalize_eta(40.0) == 0.0

    # Workload Normalization [0 to max_cap]
    assert normalize_workload(0, 8) == 1.0
    assert normalize_workload(4, 8) == 0.5
    assert normalize_workload(8, 8) == 0.0


def test_capability_superiority():
    """Verify specialized capability outranks secondary auxiliary capability."""
    inc = _make_dummy_incident(inc_type="flood")
    resp_primary = _make_dummy_responder(
        resp_id="resp-boat",
        name="Specialized Boat",
        cap="FLOOD_BOAT",
        lat=22.5800,
        lon=88.3800,
    )
    resp_secondary = _make_dummy_responder(
        resp_id="resp-amb",
        name="Secondary Ambulance",
        cap="AMBULANCE",
        lat=22.5800,
        lon=88.3800,
    )

    candidates = rank_and_explain_candidates(inc, [resp_secondary, resp_primary])
    assert len(candidates) == 2
    assert candidates[0].id == "resp-boat"
    assert candidates[0].rank == 1
    assert candidates[0].is_recommended is True
    assert (
        candidates[0].explanation.breakdown.capability_score
        > candidates[1].explanation.breakdown.capability_score
    )


def test_distance_and_eta_superiority():
    """Verify closer responder with faster transit ETA outranks farther responder."""
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
        lat=22.6500,
        lon=88.4800,  # ~15 km
    )

    candidates = rank_and_explain_candidates(inc, [resp_far, resp_close])
    assert len(candidates) == 2
    assert candidates[0].id == "resp-close"
    assert candidates[0].rank == 1
    assert candidates[0].match_score > candidates[1].match_score


def test_workload_superiority():
    """Verify zero workload backlog outranks heavily loaded unit."""
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
    assert candidates[0].rank == 1
    assert (
        candidates[0].explanation.breakdown.workload_score
        > candidates[1].explanation.breakdown.workload_score
    )


def test_deterministic_ties_handling():
    """Verify identical scores tie-break deterministically (distance -> ETA -> load -> ID)."""
    inc = _make_dummy_incident(lat=22.5726, lon=88.3639)
    resp_b = _make_dummy_responder(
        resp_id="resp-b",
        name="Unit B",
        cap="FLOOD_BOAT",
        lat=22.5740,
        lon=88.3720,
        load=0,
        max_cap=8,
    )
    resp_a = _make_dummy_responder(
        resp_id="resp-a",
        name="Unit A",
        cap="FLOOD_BOAT",
        lat=22.5740,
        lon=88.3720,
        load=0,
        max_cap=8,
    )

    cands = rank_and_explain_candidates(inc, [resp_b, resp_a])
    assert len(cands) == 2
    assert cands[0].match_score == cands[1].match_score
    # Tie broken alphabetically by ID ASC
    assert cands[0].id == "resp-a"
    assert cands[0].rank == 1
    assert cands[1].id == "resp-b"
    assert cands[1].rank == 2


def test_top_3_candidates_limit():
    """Verify allocation engine returns at most the top 3 candidates by default."""
    inc = _make_dummy_incident(inc_type="flood")
    fleet = [
        _make_dummy_responder(resp_id=f"r-{i}", name=f"Unit {i}", lat=22.574 + i * 0.005)
        for i in range(10)
    ]

    cands = rank_and_explain_candidates(inc, fleet, limit=3)
    assert len(cands) == 3
    assert [c.rank for c in cands] == [1, 2, 3]
    assert cands[0].is_recommended is True
    assert cands[1].is_recommended is False
    assert cands[2].is_recommended is False


def test_no_candidates_returns_empty():
    """Verify empty result when no responders are eligible."""
    inc = _make_dummy_incident()
    resp_off = _make_dummy_responder(status="OFFLINE")
    resp_busy = _make_dummy_responder(status="ASSIGNED", assigned_incident_id="inc-other")

    candidates = rank_and_explain_candidates(inc, [resp_off, resp_busy])
    assert len(candidates) == 0


def test_1_exact_capability_match():
    """Scenario 1: Exact capability match scores highest on capability factor."""
    inc = _make_dummy_incident(inc_type="flood")
    resp_exact = _make_dummy_responder(resp_id="r-boat", cap="FLOOD_BOAT", name="Boat Unit")
    resp_partial = _make_dummy_responder(resp_id="r-amb", cap="AMBULANCE", name="Ambulance Unit")

    cands = rank_and_explain_candidates(inc, [resp_partial, resp_exact])
    assert len(cands) == 2
    assert cands[0].id == "r-boat"
    assert cands[0].explanation.breakdown.capability_score == 30
    assert cands[1].explanation.breakdown.capability_score == 21  # 70% of 30


def test_2_capability_mismatch():
    """Scenario 2: Responders with incompatible capability are hard-excluded."""
    inc = _make_dummy_incident(inc_type="medical")
    resp_incompatible = _make_dummy_responder(resp_id="r-haz", cap="HAZMAT", name="Hazmat Team")

    # In medical incidents, HAZMAT is not in medical matrix
    cands = rank_and_explain_candidates(inc, [resp_incompatible])
    assert len(cands) == 0


def test_3_closest_responder():
    """Scenario 3: Closest responder receives maximum proximity points."""
    inc = _make_dummy_incident(lat=22.5726, lon=88.3639)
    resp_near = _make_dummy_responder(resp_id="r-near", lat=22.5730, lon=88.3640)  # ~50m
    resp_far = _make_dummy_responder(resp_id="r-far", lat=22.6500, lon=88.4500)  # ~12km

    cands = rank_and_explain_candidates(inc, [resp_far, resp_near])
    assert len(cands) == 2
    assert cands[0].id == "r-near"
    assert (
        cands[0].explanation.breakdown.distance_score
        > cands[1].explanation.breakdown.distance_score
    )


def test_4_fastest_eta_responder():
    """Scenario 4: Faster transit ETA yields superior ETA score."""
    inc = _make_dummy_incident(lat=22.5726, lon=88.3639)
    resp_fast = _make_dummy_responder(resp_id="r-fast", lat=22.5750, lon=88.3650)
    resp_slow = _make_dummy_responder(resp_id="r-slow", lat=22.6200, lon=88.4200)

    cands = rank_and_explain_candidates(inc, [resp_slow, resp_fast])
    assert len(cands) == 2
    assert cands[0].id == "r-fast"
    assert cands[0].explanation.breakdown.eta_score > cands[1].explanation.breakdown.eta_score


def test_5_overloaded_responder():
    """Scenario 5: High workload load reduces score relative to idle unit."""
    inc = _make_dummy_incident()
    resp_idle = _make_dummy_responder(resp_id="r-idle", load=0, max_cap=8)
    resp_loaded = _make_dummy_responder(resp_id="r-loaded", load=7, max_cap=8)

    cands = rank_and_explain_candidates(inc, [resp_loaded, resp_idle])
    assert len(cands) == 2
    assert cands[0].id == "r-idle"
    assert cands[0].explanation.breakdown.workload_score == 10
    assert cands[1].explanation.breakdown.workload_score < 5


def test_6_unavailable_responder():
    """Scenario 6: OFFLINE and active busy units are hard-excluded."""
    inc = _make_dummy_incident()
    resp_off = _make_dummy_responder(resp_id="r-off", status="OFFLINE")
    resp_enroute_other = _make_dummy_responder(
        resp_id="r-enroute", status="EN_ROUTE", assigned_incident_id="inc-diff"
    )

    cands = rank_and_explain_candidates(inc, [resp_off, resp_enroute_other])
    assert len(cands) == 0


def test_7_missing_responder_coordinates():
    """Scenario 7: Responders with missing or NaN coordinates are excluded."""
    inc = _make_dummy_incident()
    resp_nan = _make_dummy_responder(resp_id="r-nan", lat=float("nan"), lon=88.36)

    cands = rank_and_explain_candidates(inc, [resp_nan])
    assert len(cands) == 0


@pytest.mark.asyncio
async def test_8_stale_candidate_assignment_guard(test_db):
    """Scenario 8: If responder becomes OFFLINE before assignment, assignment fails gracefully."""
    from app.services.incident_service import get_all_incidents
    from app.services.responder_service import (
        assign_responder_to_incident,
        get_all_responders,
        update_responder_status,
    )

    incidents = await get_all_incidents(test_db)
    assert len(incidents) > 0
    target_inc = incidents[0]

    responders = await get_all_responders(test_db)
    assert len(responders) > 0
    target_resp = responders[0]

    # Change responder to OFFLINE
    await update_responder_status(test_db, target_resp.id, status="OFFLINE")

    with pytest.raises(ValueError, match="OFFLINE"):
        await assign_responder_to_incident(
            test_db,
            responder_id=target_resp.id,
            incident_id=target_inc.id,
        )


def test_9_equal_scores_deterministic_tie_breaking():
    """Scenario 9: Identical score candidates tie-break deterministically.

    Order: (distance -> ETA -> load -> ID).
    """
    inc = _make_dummy_incident()
    resp_z = _make_dummy_responder(resp_id="resp-z", name="Unit Z")
    resp_a = _make_dummy_responder(resp_id="resp-a", name="Unit A")

    # Run multiple times to verify strict deterministic stability
    for _ in range(5):
        cands = rank_and_explain_candidates(inc, [resp_z, resp_a])
        assert len(cands) == 2
        assert cands[0].id == "resp-a"
        assert cands[1].id == "resp-z"


def test_10_critical_incident_severity_fit():
    """Scenario 10: Critical incidents award maximum severity fit points to high-capacity units."""
    inc_crit = _make_dummy_incident(severity="CRITICAL")
    resp_large = _make_dummy_responder(resp_id="r-lg", max_cap=8, load=0)
    resp_small = _make_dummy_responder(resp_id="r-sm", max_cap=2, load=0)

    cands = rank_and_explain_candidates(inc_crit, [resp_small, resp_large])
    assert len(cands) == 2
    assert cands[0].id == "r-lg"
    assert (
        cands[0].explanation.breakdown.severity_fit_score
        > cands[1].explanation.breakdown.severity_fit_score
    )


def test_11_alternative_ranking_and_comparative_reasons():
    """Scenario 11: Alternative candidates include structured comparative explanations."""
    inc = _make_dummy_incident(inc_type="flood")
    resp_primary = _make_dummy_responder(
        resp_id="r-1", name="Alpha Boat", cap="FLOOD_BOAT", lat=22.5730, lon=88.3640
    )
    resp_secondary = _make_dummy_responder(
        resp_id="r-2", name="Bravo Ambulance", cap="AMBULANCE", lat=22.5900, lon=88.3800
    )

    cands = rank_and_explain_candidates(inc, [resp_secondary, resp_primary], limit=3)
    assert len(cands) == 2
    assert cands[0].id == "r-1"
    assert cands[0].rank == 1
    assert cands[0].is_recommended is True
    assert cands[0].comparative_reason is None
    assert "Recommended because" in cands[0].match_reason
    assert cands[0].calculated_at is not None

    assert cands[1].id == "r-2"
    assert cands[1].rank == 2
    assert cands[1].is_recommended is False
    assert cands[1].comparative_reason is not None
    assert "alternative" in cands[1].comparative_reason.lower()
    assert (
        "secondary capability" in cands[1].comparative_reason.lower()
        or "slower" in cands[1].comparative_reason.lower()
        or "farther" in cands[1].comparative_reason.lower()
    )


def test_score_explanation_and_breakdown_auditability():
    """Verify score breakdown and auditable factor explanation."""
    inc = _make_dummy_incident(inc_type="flood", severity="CRITICAL")
    resp = _make_dummy_responder(
        resp_id="resp-audit-1",
        name="Audit Unit",
        cap="FLOOD_BOAT",
        status="AVAILABLE",
        lat=22.5750,
        lon=88.3660,
        load=0,
        max_cap=8,
    )

    cands = rank_and_explain_candidates(inc, [resp])
    assert len(cands) == 1
    cand = cands[0]

    # Verify score breakdown math
    bd = cand.explanation.breakdown
    assert bd.final_score == cand.match_score
    component_sum = (
        bd.capability_score
        + bd.availability_score
        + bd.distance_score
        + bd.eta_score
        + bd.workload_score
        + bd.severity_fit_score
    )
    assert bd.final_score == component_sum
    assert 0 <= bd.final_score <= 100

    # Verify human-in-the-loop: RECOMMENDED not DISPATCHED
    assert cand.is_recommended is True
    assert cand.status == "AVAILABLE"
    assert "PRIMARY RECOMMENDATION" in cand.explanation.headline
    assert len(cand.explanation.positive_factors) > 0


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
        assert "rank" in top
        assert top["rank"] == 1
        assert "match_score" in top
        assert "explanation" in top
        assert "breakdown" in top["explanation"]
        assert top["explanation"]["breakdown"]["final_score"] == top["match_score"]

    # 2. Test POST /api/responders/candidates/evaluate standalone
    dummy_inc = _make_dummy_incident()
    dummy_resp = _make_dummy_responder()

    eval_payload = {
        "incident": dummy_inc.model_dump(mode="json"),
        "responders": [dummy_resp.model_dump(mode="json")],
    }

    resp2 = await client.post("/api/responders/candidates/evaluate", json=eval_payload)
    assert resp2.status_code == 200

    data2 = resp2.json()
    assert data2["success"] is True
    assert data2["allocation_status"] == "RECOMMENDED"
    assert len(data2["data"]) == 1
    assert data2["data"][0]["is_recommended"] is True
    assert data2["data"][0]["rank"] == 1
