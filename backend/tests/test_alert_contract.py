"""Comprehensive Test Suite for Alert Domain Contract, Provenance, Source Health,
Deduplication, TTL Expiry, and Simulation Isolation (Phase 1).
"""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

import httpx
import pytest
from pydantic import ValidationError

from app.models import (
    AlertProvenance,
    HazardSeverity,
    HazardType,
    NormalizedAlert,
    SourceStatus,
    SourceType,
)
from app.services.hazard_service import (
    _fetch_open_meteo_alerts,
    clear_hazard_cache,
    deduplicate_alerts,
    evaluate_area_safety,
    get_active_hazards,
    get_source_statuses,
)


@pytest.fixture
def anyio_backend():
    return "asyncio"


@pytest.fixture(autouse=True)
def reset_hazard_state():
    """Reset in-memory hazard state before and after each test."""
    clear_hazard_cache()
    yield
    clear_hazard_cache()


def test_normalized_alert_schema_contract():
    """Verify that NormalizedAlert strictly complies with the Phase 1 canonical contract."""
    now_iso = datetime.now(UTC).isoformat()
    exp_iso = (datetime.now(UTC) + timedelta(hours=6)).isoformat()

    alert = NormalizedAlert(
        id="alt-meteo-22.57-88.36",
        source="Open-Meteo Weather Service",
        source_event_id="meteo-evt-1001",
        source_type=SourceType.WEATHER_SERVICE,
        hazard_type=HazardType.FLOOD,
        severity=HazardSeverity.CRITICAL,
        title="Severe Flood Surge Warning",
        description="Water accumulation exceeding 1.2m.",
        why_it_matters="Road corridor impassable.",
        recommended_action="Evacuate to elevated shelters immediately.",
        latitude=22.5726,
        longitude=88.3639,
        affected_area="Salt Lake Sector 12",
        radius_km=3.5,
        observed_at=now_iso,
        issued_at=now_iso,
        expires_at=exp_iso,
        fetched_at=now_iso,
        source_url="https://open-meteo.com",
        provenance=AlertProvenance.LIVE,
        confidence=0.95,
        is_active=True,
    )

    assert alert.id == "alt-meteo-22.57-88.36"
    assert alert.hazard_id == "alt-meteo-22.57-88.36"  # Backward-compatible alias
    assert alert.source == "Open-Meteo Weather Service"
    assert alert.source_event_id == "meteo-evt-1001"
    assert alert.source_type == SourceType.WEATHER_SERVICE
    assert alert.hazard_type == HazardType.FLOOD
    assert alert.severity == HazardSeverity.CRITICAL
    assert alert.radius_km == 3.5
    assert alert.affected_radius_km == 3.5  # Backward-compatible alias
    assert alert.provenance == AlertProvenance.LIVE
    assert alert.data_provenance == "LIVE"  # Backward-compatible alias
    assert alert.confidence == 0.95
    assert alert.is_active is True


def test_coordinate_validation():
    """Verify that invalid latitude or longitude coordinates raise ValidationError."""
    now_iso = datetime.now(UTC).isoformat()
    exp_iso = (datetime.now(UTC) + timedelta(hours=6)).isoformat()

    # Invalid latitude > 90
    with pytest.raises(ValidationError):
        NormalizedAlert(
            id="alt-invalid-lat",
            source="Test Source",
            source_event_id="evt-1",
            source_type=SourceType.WEATHER_SERVICE,
            hazard_type=HazardType.WEATHER,
            severity=HazardSeverity.WATCH,
            title="Invalid Coordinate Alert",
            description="Test",
            recommended_action="Test",
            latitude=95.0,  # Invalid
            longitude=88.0,
            radius_km=2.0,
            observed_at=now_iso,
            issued_at=now_iso,
            expires_at=exp_iso,
            fetched_at=now_iso,
        )

    # Invalid longitude < -180
    with pytest.raises(ValidationError):
        NormalizedAlert(
            id="alt-invalid-lon",
            source="Test Source",
            source_event_id="evt-2",
            source_type=SourceType.WEATHER_SERVICE,
            hazard_type=HazardType.WEATHER,
            severity=HazardSeverity.WATCH,
            title="Invalid Coordinate Alert",
            description="Test",
            recommended_action="Test",
            latitude=22.0,
            longitude=-185.0,  # Invalid
            radius_km=2.0,
            observed_at=now_iso,
            issued_at=now_iso,
            expires_at=exp_iso,
            fetched_at=now_iso,
        )


def test_duplicate_source_event_deduplication():
    """Verify that duplicate alerts with the same (source, source_event_id) are deduplicated."""
    now = datetime.now(UTC)
    now_iso = now.isoformat()
    earlier_iso = (now - timedelta(minutes=10)).isoformat()
    exp_iso = (now + timedelta(hours=6)).isoformat()

    alert1 = NormalizedAlert(
        id="alt-1",
        source="Open-Meteo Weather Service",
        source_event_id="evt-same-123",
        source_type=SourceType.WEATHER_SERVICE,
        hazard_type=HazardType.FLOOD,
        severity=HazardSeverity.WATCH,
        title="Flood Watch",
        description="Initial advisory",
        recommended_action="Monitor",
        latitude=22.57,
        longitude=88.36,
        radius_km=3.0,
        observed_at=earlier_iso,
        issued_at=earlier_iso,
        expires_at=exp_iso,
        fetched_at=earlier_iso,
        confidence=0.80,
    )

    alert2 = NormalizedAlert(
        id="alt-2",
        source="Open-Meteo Weather Service",
        source_event_id="evt-same-123",  # Same source event ID
        source_type=SourceType.WEATHER_SERVICE,
        hazard_type=HazardType.FLOOD,
        severity=HazardSeverity.WARNING,
        title="Flood Warning Updated",
        description="Elevated rain",
        recommended_action="Take shelter",
        latitude=22.57,
        longitude=88.36,
        radius_km=3.0,
        observed_at=now_iso,
        issued_at=now_iso,
        expires_at=exp_iso,
        fetched_at=now_iso,
        confidence=0.95,  # Higher confidence
    )

    deduped = deduplicate_alerts([alert1, alert2])
    assert len(deduped) == 1
    assert deduped[0].confidence == 0.95
    assert deduped[0].severity == HazardSeverity.WARNING


def test_cross_source_spatial_temporal_deduplication():
    """Verify multi-source feeds reporting the same spatial-temporal event merge appropriately."""
    now = datetime.now(UTC)
    now_iso = now.isoformat()
    exp_iso = (now + timedelta(hours=6)).isoformat()

    # Source A reports earthquake
    alert_usgs = NormalizedAlert(
        id="alt-usgs-1",
        source="USGS Earthquake Hazards Program",
        source_event_id="usgs-eq-1",
        source_type=SourceType.SEISMIC_NETWORK,
        hazard_type=HazardType.EARTHQUAKE,
        severity=HazardSeverity.WARNING,
        title="M6.2 Seismic Disturbance",
        description="Regional epicenter tremor.",
        recommended_action="Inspect structures",
        latitude=22.5700,
        longitude=88.3600,
        radius_km=25.0,
        observed_at=now_iso,
        issued_at=now_iso,
        expires_at=exp_iso,
        fetched_at=now_iso,
        confidence=0.95,
    )

    # Source B reports the same earthquake 1.2km away within 15 minutes
    alert_regional = NormalizedAlert(
        id="alt-regional-1",
        source="Regional Seismic Net",
        source_event_id="reg-eq-99",
        source_type=SourceType.SEISMIC_NETWORK,
        hazard_type=HazardType.EARTHQUAKE,
        severity=HazardSeverity.WATCH,
        title="M6.1 Regional Tremor",
        description="Localized tremor.",
        recommended_action="Stay alert",
        latitude=22.5780,  # ~1.2 km away
        longitude=88.3650,
        radius_km=20.0,
        observed_at=(now + timedelta(minutes=5)).isoformat(),
        issued_at=(now + timedelta(minutes=5)).isoformat(),
        expires_at=exp_iso,
        fetched_at=now_iso,
        confidence=0.85,
    )

    # Source C reports an unrelated flood 2km away (different hazard_type)
    alert_flood = NormalizedAlert(
        id="alt-meteo-flood",
        source="Open-Meteo Weather Service",
        source_event_id="meteo-flood-1",
        source_type=SourceType.WEATHER_SERVICE,
        hazard_type=HazardType.FLOOD,
        severity=HazardSeverity.CRITICAL,
        title="Flash Flood Warning",
        description="Canal overflow.",
        recommended_action="Evacuate ground floors",
        latitude=22.5750,
        longitude=88.3620,
        radius_km=3.0,
        observed_at=now_iso,
        issued_at=now_iso,
        expires_at=exp_iso,
        fetched_at=now_iso,
        confidence=0.92,
    )

    deduped = deduplicate_alerts([alert_usgs, alert_regional, alert_flood])
    # The two overlapping earthquake reports should merge into one, while flood is kept distinct
    assert len(deduped) == 2
    eq_alert = next(a for a in deduped if a.hazard_type == HazardType.EARTHQUAKE)
    assert eq_alert.severity == HazardSeverity.WARNING
    assert eq_alert.source == "USGS Earthquake Hazards Program"


@pytest.mark.asyncio
async def test_expired_alerts_excluded_from_active_query():
    """Verify that expired alerts (expires_at in the past) are strictly omitted."""
    now = datetime.now(UTC)
    past_iso = (now - timedelta(hours=2)).isoformat()
    now_iso = now.isoformat()
    future_iso = (now + timedelta(hours=4)).isoformat()

    expired_alert = NormalizedAlert(
        id="alt-expired-1",
        source="Test Weather",
        source_event_id="evt-exp-1",
        source_type=SourceType.WEATHER_SERVICE,
        hazard_type=HazardType.WEATHER,
        severity=HazardSeverity.WATCH,
        title="Expired Squall Advisory",
        description="Passed storm.",
        recommended_action="None",
        latitude=22.57,
        longitude=88.36,
        radius_km=2.0,
        observed_at=(now - timedelta(hours=8)).isoformat(),
        issued_at=(now - timedelta(hours=8)).isoformat(),
        expires_at=past_iso,  # Expired 2 hours ago
        fetched_at=now_iso,
        is_active=True,
    )

    active_alert = NormalizedAlert(
        id="alt-active-1",
        source="Test Weather",
        source_event_id="evt-act-1",
        source_type=SourceType.WEATHER_SERVICE,
        hazard_type=HazardType.FLOOD,
        severity=HazardSeverity.WARNING,
        title="Active Flood Advisory",
        description="Ongoing rain.",
        recommended_action="Avoid low-lying areas",
        latitude=22.57,
        longitude=88.36,
        radius_km=2.0,
        observed_at=now_iso,
        issued_at=now_iso,
        expires_at=future_iso,  # Active
        fetched_at=now_iso,
        is_active=True,
    )

    # Ingest directly into grid cache
    grid_key = (22.57, 88.36)
    from app.services.hazard_service import _hazard_grid_cache

    _hazard_grid_cache[grid_key] = ([expired_alert, active_alert], now + timedelta(minutes=5))

    transport = httpx.MockTransport(
        lambda req: httpx.Response(200, json={"features": [], "alerts": []})
    )
    async with httpx.AsyncClient(transport=transport) as client:
        active_results = await get_active_hazards(lat=22.57, lon=88.36, client=client)
    assert len(active_results) == 1
    assert active_results[0].id == "alt-active-1"


@pytest.mark.asyncio
async def test_no_fictional_baseline_alerts_in_production():
    """Verify no fabricated baseline alerts (GDACS/IMD/CESC) are returned in production."""
    hazards = await get_active_hazards(lat=22.5726, lon=88.3639, include_simulation=False)

    for hz in hazards:
        # None of the old hardcoded fake IDs must exist
        assert hz.id not in ("hz-kol-flood-01", "hz-kol-power-02", "hz-kol-cyclone-03")
        # Every alert must originate from an authentic integration
        assert hz.source in (
            "Open-Meteo Weather Service",
            "USGS Earthquake Hazards Program",
            "SACHET / NDMA India",
            "GDACS (UN / EU)",
        )
        assert hz.provenance in (AlertProvenance.LIVE, AlertProvenance.CACHED)


@pytest.mark.asyncio
async def test_simulation_mode_isolation():
    """Verify that simulation mode alerts are strictly isolated and marked SIMULATED."""
    # 1. Standard production query -> No simulation alerts
    prod_hazards = await get_active_hazards(lat=22.5726, lon=88.3639, include_simulation=False)
    for hz in prod_hazards:
        assert hz.provenance != AlertProvenance.SIMULATED

    # 2. Simulation mode query -> Explicitly contains SIMULATED alerts
    sim_hazards = await get_active_hazards(lat=22.5726, lon=88.3639, include_simulation=True)
    sim_found = [h for h in sim_hazards if h.provenance == AlertProvenance.SIMULATED]
    assert len(sim_found) > 0
    for sh in sim_found:
        assert sh.source_type == SourceType.SIMULATION_ENGINE
        assert sh.provenance == AlertProvenance.SIMULATED
        assert "[SIMULATION]" in sh.title


@pytest.mark.asyncio
async def test_source_failure_health_telemetry():
    """Verify that feed failures update source status to FAILED gracefully."""
    # Simulate a failing client transport
    transport = httpx.MockTransport(lambda req: httpx.Response(503, text="Service Unavailable"))
    async with httpx.AsyncClient(transport=transport) as failing_client:
        alert, prov = await _fetch_open_meteo_alerts(22.57, 88.36, client=failing_client)
        assert alert is None
        assert prov == AlertProvenance.FALLBACK

        statuses = get_source_statuses()
        assert statuses["open_meteo"] == SourceStatus.FAILED


@pytest.mark.asyncio
async def test_area_safety_evaluation_with_authentic_sources():
    """Verify that Area Safety evaluation produces trustworthy outputs without fake data."""
    # When coordinates are None
    status_no_loc = await evaluate_area_safety(lat=None, lon=None)
    assert status_no_loc.level == "LOCATION_REQUIRED"
    assert status_no_loc.data_provenance == "FALLBACK"

    # When location is provided and conditions are clear
    status_clear = await evaluate_area_safety(lat=22.5726, lon=88.3639)
    assert status_clear.level in ("SAFE", "WATCH", "WARNING", "CRITICAL")
    assert "Open-Meteo" in status_clear.recommended_action or status_clear.level != "SAFE"
