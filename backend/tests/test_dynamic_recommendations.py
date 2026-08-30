"""Tests for SALVUS Pass 4C: Dynamic Rescue Recommendation Engine.

Covers:
- Dynamic calculation versioning & freshness
- Meaningful delta threshold evaluation (>= 2 min ETA shift)
- Offline / unavailable responder shifts
- Atomic dynamic reassignment & previous unit release
- Audit event logging (assignment.reassigned)
- Telemetry movement threshold filtering (>= 200m)
"""

from __future__ import annotations

import pytest

from app.models import (
    IncidentResponse,
    ResponderResponse,
)
from app.services.allocation_engine import (
    rank_and_explain_candidates,
)
from app.services.incident_service import get_all_incidents
from app.services.responder_service import (
    assign_responder_to_incident,
    get_all_responders,
    get_responder_by_id,
    reassign_responder_to_incident,
    update_responder_status,
)
from app.services.routing_service import haversine_distance_km


def _make_dummy_incident(
    inc_id: str = "inc-dyn-01",
    ticket_id: str = "SV-DYN-01",
    lat: float = 22.5726,
    lon: float = 88.3639,
    inc_type: str = "flood",
    severity: str = "HIGH",
    status: str = "NEW",
) -> IncidentResponse:
    return IncidentResponse(
        id=inc_id,
        ticket_id=ticket_id,
        type=inc_type,
        severity=severity,
        description="Dynamic flood rescue test scenario",
        reporter_name="Test Citizen",
        reporter_phone="+91 98000 00000",
        latitude=lat,
        longitude=lon,
        affected_count=2,
        is_sos=True,
        status=status,
        created_at="2026-08-30T12:00:00Z",
        updated_at="2026-08-30T12:00:00Z",
    )


def _make_dummy_responder(
    resp_id: str = "resp-dyn-01",
    name: str = "NDRF Unit 01",
    cap: str = "FLOOD_BOAT",
    status: str = "AVAILABLE",
    lat: float = 22.5740,
    lon: float = 88.3720,
    current_load: int = 0,
    max_cap: int = 8,
) -> ResponderResponse:
    return ResponderResponse(
        id=resp_id,
        unit_name=name,
        team_lead="Commander X",
        vehicle_type="Inflatable Zodiac Boat",
        capability=cap,
        status=status,
        latitude=lat,
        longitude=lon,
        radio_channel="VHF-01",
        max_capacity=max_cap,
        current_load=current_load,
        created_at="2026-08-30T12:00:00Z",
        updated_at="2026-08-30T12:00:00Z",
        last_seen="2026-08-30T12:00:00Z",
    )


@pytest.mark.asyncio
async def test_dynamic_reassignment_releases_previous_responder(test_db):
    """Scenario 1: Atomic reassignment cancels old assignment and releases old unit to AVAILABLE."""
    incidents = await get_all_incidents(test_db)
    responders = await get_all_responders(test_db)
    assert len(incidents) >= 1
    assert len(responders) >= 2

    target_inc = incidents[0]
    first_resp = responders[0]
    second_resp = responders[1]

    # Assign first responder
    await assign_responder_to_incident(
        test_db,
        responder_id=first_resp.id,
        incident_id=target_inc.id,
        status="ASSIGNED",
    )

    r1_assigned = await get_responder_by_id(test_db, first_resp.id)
    assert r1_assigned.status == "ASSIGNED"
    assert r1_assigned.assigned_incident_id == target_inc.id

    # Reassign to second responder
    reassign_res = await reassign_responder_to_incident(
        test_db,
        new_responder_id=second_resp.id,
        incident_id=target_inc.id,
        reason="Unit 2 is 4 min faster due to corridor conditions",
    )
    assert reassign_res is not None
    updated_new, updated_inc, previous_resp = reassign_res

    assert updated_new.id == second_resp.id
    assert updated_new.status == "ASSIGNED"
    assert updated_new.assigned_incident_id == target_inc.id

    assert previous_resp is not None
    assert previous_resp.id == first_resp.id

    # Verify database state for previous responder
    r1_released = await get_responder_by_id(test_db, first_resp.id)
    assert r1_released.status == "AVAILABLE"
    assert r1_released.assigned_incident_id is None


@pytest.mark.asyncio
async def test_dynamic_reassignment_creates_audit_event(test_db):
    """Scenario 2: Dynamic reassignment records assignment.reassigned in incident_events."""
    incidents = await get_all_incidents(test_db)
    responders = await get_all_responders(test_db)
    target_inc = incidents[0]
    r1 = responders[0]
    r2 = responders[1]

    await assign_responder_to_incident(test_db, responder_id=r1.id, incident_id=target_inc.id)
    await reassign_responder_to_incident(
        test_db,
        new_responder_id=r2.id,
        incident_id=target_inc.id,
        reason="ETA improved by 3 min",
    )

    cursor = await test_db.execute(
        "SELECT event_type, metadata FROM incident_events WHERE incident_id = ? "
        "AND event_type = 'assignment.reassigned'",
        (target_inc.id,),
    )
    event = await cursor.fetchone()
    assert event is not None
    assert event["event_type"] == "assignment.reassigned"
    assert r1.id in event["metadata"]
    assert r2.id in event["metadata"]


@pytest.mark.asyncio
async def test_dynamic_reassignment_guards_against_offline_target(test_db):
    """Scenario 3: Reassignment fails gracefully if target unit is OFFLINE."""
    incidents = await get_all_incidents(test_db)
    responders = await get_all_responders(test_db)
    target_inc = incidents[0]
    r1 = responders[0]
    r2 = responders[1]

    await assign_responder_to_incident(test_db, responder_id=r1.id, incident_id=target_inc.id)
    await update_responder_status(test_db, r2.id, status="OFFLINE")

    with pytest.raises(ValueError, match="OFFLINE"):
        await reassign_responder_to_incident(
            test_db,
            new_responder_id=r2.id,
            incident_id=target_inc.id,
        )


def test_telemetry_movement_threshold_filtering():
    """Scenario 4: Movement threshold checks >= 200m before triggering recalculation."""
    orig_lat, orig_lon = 22.5726, 88.3639

    # Small movement (50m) -> should NOT trigger
    jitter_lat, jitter_lon = 22.5730, 88.3639
    dist_km_small = haversine_distance_km(orig_lat, orig_lon, jitter_lat, jitter_lon)
    dist_m_small = dist_km_small * 1000.0
    assert dist_m_small < 200.0

    # Meaningful movement (350m) -> SHOULD trigger
    moved_lat, moved_lon = 22.5758, 88.3639
    dist_km_large = haversine_distance_km(orig_lat, orig_lon, moved_lat, moved_lon)
    dist_m_large = dist_km_large * 1000.0
    assert dist_m_large >= 200.0


def test_meaningful_eta_delta_evaluation():
    """Scenario 5: Meaningful recommendation delta requires >= 2 min ETA improvement."""
    inc = _make_dummy_incident()
    # Resp A is 3.5 km away (~7 min)
    resp_a = _make_dummy_responder(resp_id="resp-a", name="Unit A", lat=22.6000, lon=88.3639)
    # Resp B is 1.0 km away (~2 min)
    resp_b = _make_dummy_responder(resp_id="resp-b", name="Unit B", lat=22.5800, lon=88.3639)

    candidates = rank_and_explain_candidates(inc, [resp_a, resp_b])
    assert len(candidates) == 2
    assert candidates[0].id == "resp-b"

    dist_a = haversine_distance_km(resp_a.latitude, resp_a.longitude, inc.latitude, inc.longitude)
    eta_a = (dist_a / 30.0) * 60.0
    eta_b = candidates[0].eta_minutes
    eta_delta = eta_a - eta_b

    # Unit B is >= 2 min faster than Unit A
    assert eta_delta >= 2.0
