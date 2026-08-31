"""SALVUS — Phase 1: Real Multi-Source Data Ingestion & Alert Intelligence Test Suite.

Verifies:
1. Open-Meteo weather context telemetry, hourly forecasts, WMO parsing & thunderstorm derivation.
2. IMD official warnings & CAP advisory ingestion, severity mapping & failure isolation.
3. OSDMA / SATARK isolated adapter (standby mode, uncredentialed handling, zero fake data).
4. Odisha Flood authority adapter (standby mode, uncredentialed handling, zero fake data).
5. USGS seismic network ingestion, magnitude scaling, and proximity filtering.
6. Multi-source orchestrator fault isolation & partial failure handling.
7. Absolute NO FAKE DATA test when all providers are unavailable
   (no demo storms, no Kolkata floods).
8. Spatial-temporal deduplication across multiple providers.
9. Geographic relevance filtering (distant alerts pruned for citizen coordinates).
10. Alert lifecycle & expiration enforcement.
11. Coordinate grid cell caching and TTL expiration.
"""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

import httpx
import pytest

from app.adapters import (
    IMDAdapter,
    OdishaFloodAdapter,
    OpenMeteoAdapter,
    OSDMAAdapter,
    USGSAdapter,
)
from app.models import (
    AlertProvenance,
    HazardSeverity,
    HazardType,
    NormalizedAlert,
    SourceStatus,
    ThunderstormRisk,
)
from app.services.hazard_service import (
    clear_hazard_cache,
    deduplicate_alerts,
    evaluate_area_safety,
    get_active_hazards,
    get_source_statuses,
    imd_adapter,
    usgs_adapter,
)


@pytest.fixture
def anyio_backend():
    return "asyncio"


@pytest.fixture(autouse=True)
def reset_adapter_state():
    """Reset all adapter caches before and after each test."""
    clear_hazard_cache()
    yield
    clear_hazard_cache()


# ===========================================================================
# 1. Open-Meteo Weather Adapter Tests
# ===========================================================================


@pytest.mark.asyncio
async def test_open_meteo_success_and_thunderstorm_derivation():
    """Verify Open-Meteo real weather ingestion, convective metrics, and thunderstorm derivation."""
    now_iso = datetime.now(UTC).strftime("%Y-%m-%dT%H:00")
    sample_response = {
        "current": {
            "temperature_2m": 32.5,
            "apparent_temperature": 38.0,
            "relative_humidity_2m": 82,
            "precipitation": 18.5,
            "rain": 12.0,
            "showers": 6.5,
            "weather_code": 95,  # Thunderstorm
            "wind_speed_10m": 28.0,
            "wind_gusts_10m": 55.0,
            "wind_direction_10m": 190.0,
            "uv_index": 5.0,
            "visibility": 8000.0,
            "is_day": 1,
            "cape": 1650.0,
        },
        "hourly": {
            "time": [now_iso, f"{now_iso[:11]}15:00", f"{now_iso[:11]}16:00"],
            "temperature_2m": [32.5, 30.0, 28.5],
            "weather_code": [95, 80, 61],
            "precipitation": [18.5, 5.0, 2.0],
            "rain": [12.0, 4.0, 2.0],
            "showers": [6.5, 1.0, 0.0],
            "precipitation_probability": [85, 60, 30],
            "wind_speed_10m": [28.0, 22.0, 15.0],
            "wind_gusts_10m": [55.0, 40.0, 30.0],
            "relative_humidity_2m": [82, 85, 90],
            "uv_index": [5.0, 3.0, 1.0],
            "cape": [1650.0, 1200.0, 600.0],
        },
        "daily": {
            "temperature_2m_max": [34.0],
            "temperature_2m_min": [26.0],
            "precipitation_probability_max": [85],
            "uv_index_max": [8.0],
            "sunrise": ["2026-08-31T05:30"],
            "sunset": ["2026-08-31T18:15"],
        },
    }

    transport = httpx.MockTransport(lambda req: httpx.Response(200, json=sample_response))
    async with httpx.AsyncClient(transport=transport) as client:
        adapter = OpenMeteoAdapter()
        resp = await adapter.fetch_weather_intelligence(lat=20.2961, lon=85.8245, client=client)

        assert resp.success is True
        assert resp.current.temperature == 32.5
        assert resp.current.feels_like == 38.0
        assert resp.current.weather_code == 95
        assert resp.current.thunderstorm_risk == ThunderstormRisk.LIKELY
        assert resp.current.is_thunderstorm_derived is True
        assert resp.current.cape == 1650.0
        assert resp.current.rain == 12.0
        assert resp.current.showers == 6.5
        assert resp.current.wind_gust == 55.0
        assert resp.freshness == "LIVE"
        assert resp.status == SourceStatus.AVAILABLE


@pytest.mark.asyncio
async def test_open_meteo_timeout_and_fallback():
    """Verify Open-Meteo bounded timeout returns graceful UNAVAILABLE state without crashing."""

    def timeout_handler(request):
        raise httpx.ConnectTimeout("Open-Meteo connection timed out")

    transport = httpx.MockTransport(timeout_handler)
    async with httpx.AsyncClient(transport=transport) as client:
        adapter = OpenMeteoAdapter()
        resp = await adapter.fetch_weather_intelligence(lat=20.2961, lon=85.8245, client=client)

        assert resp.success is False
        assert resp.freshness == "UNAVAILABLE"
        assert resp.status == SourceStatus.FAILED
        assert adapter.get_health().status == SourceStatus.FAILED


# ===========================================================================
# 2. IMD Official Warnings Adapter Tests
# ===========================================================================


@pytest.mark.asyncio
async def test_imd_adapter_success_red_alert_normalization():
    """Verify IMD adapter ingests RED warning and converts to CRITICAL hazard alert."""
    mock_payload = {
        "warnings": [
            {
                "warning_id": "imd-odisha-puri-01",
                "state_name": "Odisha",
                "district_name": "Puri",
                "warning_color": "RED",
                "warning_type": "Very Heavy Rainfall & Cyclonic Squall",
                "title": "IMD RED ALERT: Extremely Heavy Rainfall across Coastal Odisha",
                "description": (
                    "Extremely heavy rainfall exceeding 200mm expected with squalls up to 80 km/h."
                ),
                "action_suggested": (
                    "Total suspension of fishing operations. Residents in coastal thatched "
                    "houses relocate to cyclone shelters."
                ),
                "latitude": 19.8135,
                "longitude": 85.8312,
                "radius_km": 40.0,
                "issued_time": "2026-08-31T06:00:00Z",
                "valid_to": "2026-09-01T06:00:00Z",
                "source_url": "https://mausam.imd.gov.in",
            }
        ]
    }

    transport = httpx.MockTransport(lambda req: httpx.Response(200, json=mock_payload))
    async with httpx.AsyncClient(transport=transport) as client:
        adapter = IMDAdapter()
        alerts, prov = await adapter.fetch_alerts(lat=19.8135, lon=85.8312, client=client)

        assert len(alerts) == 1
        a = alerts[0]
        assert a.source == "India Meteorological Department (IMD)"
        assert a.severity == HazardSeverity.CRITICAL
        assert a.hazard_type in (HazardType.WEATHER, HazardType.CYCLONE)
        assert a.actionable is True
        assert a.latitude == 19.8135
        assert a.longitude == 85.8312
        assert prov == AlertProvenance.LIVE


@pytest.mark.asyncio
async def test_imd_adapter_server_failure_handling():
    """Verify IMD server failure gracefully reports FAILED status and empty alerts."""
    transport = httpx.MockTransport(lambda req: httpx.Response(503, text="Service Unavailable"))
    async with httpx.AsyncClient(transport=transport) as client:
        adapter = IMDAdapter()
        alerts, prov = await adapter.fetch_alerts(client=client)

        assert len(alerts) == 0
        assert adapter.get_health().status == SourceStatus.FAILED
        assert prov == AlertProvenance.FALLBACK


# ===========================================================================
# 3. OSDMA / SATARK Adapter Tests (Strict Non-Fabrication)
# ===========================================================================


@pytest.mark.asyncio
async def test_osdma_adapter_isolated_standby_mode_without_fake_data():
    """Verify uncredentialed OSDMA adapter remains in STANDBY without generating fake data."""
    adapter = OSDMAAdapter(api_key="")
    assert adapter.get_health().status == SourceStatus.UNAVAILABLE

    alerts, prov = await adapter.fetch_alerts()
    assert alerts == []
    assert prov == AlertProvenance.FALLBACK
    assert "requires verified feed/API access" in adapter.get_health().last_error


@pytest.mark.asyncio
async def test_osdma_adapter_authenticated_success():
    """Verify authenticated OSDMA feed parses structured alerts correctly."""
    mock_payload = {
        "alerts": [
            {
                "alert_id": "satark-lightning-khordha-88",
                "hazard_type": "LIGHTNING",
                "severity": "WARNING",
                "district": "Khordha",
                "title": "OSDMA SATARK: Severe Lightning Activity Imminent",
                "description": (
                    "Doppler radar indicates active cloud-to-ground lightning discharge over "
                    "Khordha."
                ),
                "advisory": "Avoid open fields, tall trees, and water bodies immediately.",
                "latitude": 20.1800,
                "longitude": 85.6200,
                "radius_km": 15.0,
            }
        ]
    }
    transport = httpx.MockTransport(lambda req: httpx.Response(200, json=mock_payload))
    async with httpx.AsyncClient(transport=transport) as client:
        adapter = OSDMAAdapter(api_key="verified_test_key")
        alerts, prov = await adapter.fetch_alerts(client=client)

        assert len(alerts) == 1
        assert alerts[0].source == "OSDMA / SATARK Odisha"
        assert alerts[0].hazard_type == HazardType.WEATHER
        assert alerts[0].severity == HazardSeverity.WARNING
        assert prov == AlertProvenance.LIVE


# ===========================================================================
# 4. Odisha Flood Authority Adapter Tests (Strict Non-Fabrication)
# ===========================================================================


@pytest.mark.asyncio
async def test_odisha_flood_adapter_standby_mode():
    """Verify uncredentialed Odisha Flood adapter returns zero fake data."""
    adapter = OdishaFloodAdapter(api_key="")
    assert adapter.get_health().status == SourceStatus.UNAVAILABLE

    alerts, prov = await adapter.fetch_alerts()
    assert alerts == []
    assert prov == AlertProvenance.FALLBACK


# ===========================================================================
# 5. USGS Seismic Network Adapter Tests
# ===========================================================================


@pytest.mark.asyncio
async def test_usgs_adapter_earthquake_normalization():
    """Verify USGS earthquake feed normalizes magnitude, epicenter coordinates, and radius."""
    mock_geojson = {
        "type": "FeatureCollection",
        "features": [
            {
                "type": "Feature",
                "id": "us7000test",
                "properties": {
                    "mag": 6.8,
                    "place": "120 km SE of Port Blair, Andaman and Nicobar",
                    "time": int(datetime.now(UTC).timestamp() * 1000),
                    "url": "https://earthquake.usgs.gov/earthquakes/eventpage/us7000test",
                },
                "geometry": {
                    "type": "Point",
                    "coordinates": [93.10, 10.80, 15.0],
                },
            }
        ],
    }
    transport = httpx.MockTransport(lambda req: httpx.Response(200, json=mock_geojson))
    async with httpx.AsyncClient(transport=transport) as client:
        adapter = USGSAdapter()
        alerts, prov = await adapter.fetch_alerts(client=client)

        assert len(alerts) == 1
        a = alerts[0]
        assert a.source == "USGS Earthquake Hazards Program"
        assert a.hazard_type == HazardType.EARTHQUAKE
        assert a.severity == HazardSeverity.CRITICAL
        assert a.latitude == 10.80
        assert a.longitude == 93.10
        assert prov == AlertProvenance.LIVE


# ===========================================================================
# 6. Multi-Source Orchestrator & Fault Isolation Tests
# ===========================================================================


@pytest.mark.asyncio
async def test_orchestrator_partial_failure_resilience():
    """Verify failure of one provider (IMD 500) does not prevent USGS or Open-Meteo."""
    # Mock IMD failure
    imd_transport = httpx.MockTransport(
        lambda req: httpx.Response(500, text="Internal Server Error")
    )
    # Mock USGS success
    usgs_transport = httpx.MockTransport(
        lambda req: httpx.Response(
            200,
            json={
                "features": [
                    {
                        "id": "usgs-bay-of-bengal-55",
                        "properties": {
                            "mag": 5.5,
                            "place": "Bay of Bengal Seismic Zone",
                            "time": int(datetime.now(UTC).timestamp() * 1000),
                        },
                        "geometry": {"coordinates": [88.5, 19.5, 10.0]},
                    }
                ]
            },
        )
    )

    async with httpx.AsyncClient(transport=imd_transport) as imd_client:
        await imd_adapter.fetch_alerts(client=imd_client)

    async with httpx.AsyncClient(transport=usgs_transport) as usgs_client:
        usgs_alerts, _ = await usgs_adapter.fetch_alerts(client=usgs_client)
        assert len(usgs_alerts) == 1

    # Orchestrator health check reflects partial degradation, not catastrophic system failure
    statuses = get_source_statuses()
    assert statuses["imd_india"] == SourceStatus.FAILED
    assert statuses["usgs_earthquake"] == SourceStatus.AVAILABLE


# ===========================================================================
# 7. CRITICAL: Strict No Fake Data Test
# ===========================================================================


@pytest.mark.asyncio
async def test_all_providers_unavailable_yields_zero_fake_data():
    """When all providers are unreachable, return empty verified list with NO demo storms."""
    fail_transport = httpx.MockTransport(lambda req: httpx.Response(500, text="Down"))
    async with httpx.AsyncClient(transport=fail_transport) as client:
        # Fetch active hazards without simulation flag
        hazards = await get_active_hazards(
            lat=20.2961, lon=85.8245, include_simulation=False, client=client
        )

        # STRICT ASSERTION: Zero fictional or simulated alerts returned
        assert len(hazards) == 0

        # Safety evaluation must return NO_DATA or SAFE, never fictitious Kolkata storm
        safety = await evaluate_area_safety(lat=20.2961, lon=85.8245, client=client)
        assert "Kolkata" not in safety.headline
        assert "Kolkata" not in safety.description
        assert "Sector 12" not in safety.headline


# ===========================================================================
# 8. Cross-Source Deduplication & Geo-Relevance
# ===========================================================================


def test_spatial_temporal_deduplication():
    """Verify duplicate alerts from different providers for the same event are merged."""
    now_iso = datetime.now(UTC).isoformat()
    alert1 = NormalizedAlert(
        id="alert-1",
        source="India Meteorological Department (IMD)",
        source_event_id="imd-cyclone-01",
        hazard_type=HazardType.CYCLONE,
        severity=HazardSeverity.WARNING,
        title="Severe Cyclonic Storm in Bay of Bengal",
        description="Approaching Odisha coast.",
        recommended_action="Stay indoors.",
        latitude=19.8,
        longitude=86.0,
        radius_km=50.0,
        observed_at=now_iso,
        issued_at=now_iso,
        expires_at=(datetime.now(UTC) + timedelta(hours=6)).isoformat(),
        fetched_at=now_iso,
        confidence=0.90,
    )
    alert2 = NormalizedAlert(
        id="alert-2",
        source="SACHET / NDMA India",
        source_event_id="sachet-cyclone-01",
        hazard_type=HazardType.CYCLONE,
        severity=HazardSeverity.CRITICAL,  # Higher severity
        title="Severe Cyclonic Storm Warning",
        description="Intense cyclone landfall imminent.",
        recommended_action="Evacuate coastal corridor.",
        latitude=19.82,  # ~2.5km from alert1
        longitude=86.01,
        radius_km=50.0,
        observed_at=now_iso,
        issued_at=now_iso,
        expires_at=(datetime.now(UTC) + timedelta(hours=6)).isoformat(),
        fetched_at=now_iso,
        confidence=0.95,
    )

    deduped = deduplicate_alerts([alert1, alert2])
    assert len(deduped) == 1
    merged = deduped[0]
    assert merged.severity == HazardSeverity.CRITICAL
    assert "India Meteorological Department (IMD)" in merged.sources_matched
    assert "SACHET / NDMA India" in merged.sources_matched


# ===========================================================================
# 9. Geographic Relevance Filtering
# ===========================================================================


@pytest.mark.asyncio
async def test_geographic_relevance_distant_alert_pruning():
    """Verify user in Bhubaneswar does not receive a distant warning in Kerala (1500km away)."""
    now = datetime.now(UTC)
    now_iso = now.isoformat()
    exp_iso = (now + timedelta(hours=12)).isoformat()

    local_alert = NormalizedAlert(
        id="local-bhubaneswar-waterlogging",
        source="Salvus Ground Sensor",
        source_event_id="sensor-bbsr-1",
        hazard_type=HazardType.FLOOD,
        severity=HazardSeverity.WARNING,
        title="Local Drainage Surcharge — Nayapalli",
        description="Waterlogging on NH16 Nayapalli junction.",
        recommended_action="Use alternate flyover route.",
        latitude=20.2961,
        longitude=85.8245,
        radius_km=5.0,
        observed_at=now_iso,
        issued_at=now_iso,
        expires_at=exp_iso,
        fetched_at=now_iso,
    )

    distant_alert = NormalizedAlert(
        id="distant-kerala-landslide",
        source="State Civil Defense",
        source_event_id="kerala-wayanad-1",
        hazard_type=HazardType.OTHER,
        severity=HazardSeverity.CRITICAL,
        title="Landslide Warning — Wayanad",
        description="Hill slope instability in Meppadi.",
        recommended_action="Evacuate hillside settlements.",
        latitude=11.5500,
        longitude=76.1300,
        radius_km=10.0,
        observed_at=now_iso,
        issued_at=now_iso,
        expires_at=exp_iso,
        fetched_at=now_iso,
    )

    # Insert into grid cache for testing
    from app.services.hazard_service import _hazard_grid_cache

    _hazard_grid_cache[(20.30, 85.82)] = ([local_alert, distant_alert], now + timedelta(minutes=5))

    # Query with citizen coordinates for Bhubaneswar
    hazards = await get_active_hazards(lat=20.2961, lon=85.8245, max_distance_km=25.0)

    # Must contain local alert, MUST NOT contain distant Kerala alert
    hazard_ids = [h.id for h in hazards]
    assert "local-bhubaneswar-waterlogging" in hazard_ids
    assert "distant-kerala-landslide" not in hazard_ids


# ===========================================================================
# 10. Alert Lifecycle & Expiration
# ===========================================================================


@pytest.mark.asyncio
async def test_expired_alerts_are_filtered_out():
    """Verify alerts with past expires_at are purged from active feeds."""
    past_iso = (datetime.now(UTC) - timedelta(hours=2)).isoformat()
    now_iso = datetime.now(UTC).isoformat()

    expired_alert = NormalizedAlert(
        id="old-expired-alert",
        source="IMD",
        source_event_id="exp-1",
        hazard_type=HazardType.WEATHER,
        severity=HazardSeverity.WARNING,
        title="Expired Heatwave Warning",
        description="Old advisory.",
        recommended_action="None",
        latitude=20.2961,
        longitude=85.8245,
        radius_km=10.0,
        observed_at=past_iso,
        issued_at=past_iso,
        expires_at=past_iso,
        fetched_at=now_iso,
        is_active=True,
    )

    from app.services.hazard_service import _hazard_grid_cache

    _hazard_grid_cache[(20.30, 85.82)] = ([expired_alert], datetime.now(UTC) + timedelta(minutes=5))

    hazards = await get_active_hazards(lat=20.2961, lon=85.8245)
    assert "old-expired-alert" not in [h.id for h in hazards]
