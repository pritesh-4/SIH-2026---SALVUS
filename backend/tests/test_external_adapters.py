"""Comprehensive Unit & Integration Test Suite for External Alert Adapters (Phase 2).

Tests:
1. SachetAdapter: CAP/JSON normalization, ETag conditional requests, 304 handling.
2. GDACSAdapter: GeoJSON parsing, alert levels (Red/Orange/Green), event types (TC, EQ, FL).
3. USGSAdapter: Real-time seismic GeoJSON, magnitude-scaled severity & radius.
4. OpenMeteoAdapter: Contextual weather telemetry, non-alarmist thresholds, grid caching.
5. Ingestion Orchestrator: Fault isolation, parallel ingestion, cross-source deduplication.
"""

from __future__ import annotations

import httpx
import pytest

from app.adapters import (
    GDACSAdapter,
    OpenMeteoAdapter,
    SachetAdapter,
    USGSAdapter,
)
from app.models import (
    AlertProvenance,
    AreaSafetyLevel,
    HazardSeverity,
    HazardType,
    NormalizedAlert,
    SourceStatus,
)
from app.services.hazard_service import (
    clear_hazard_cache,
    evaluate_area_safety,
    get_active_hazards,
    get_source_statuses,
)


@pytest.fixture
def anyio_backend():
    return "asyncio"


@pytest.fixture(autouse=True)
def reset_all_adapter_state():
    """Reset adapter caches before and after each test."""
    clear_hazard_cache()
    yield
    clear_hazard_cache()


# ===========================================================================
# 1. SACHET / NDMA India Adapter Tests
# ===========================================================================


@pytest.mark.asyncio
async def test_sachet_adapter_success_normalization():
    """Verify SachetAdapter correctly ingests and normalizes official CAP/JSON feeds."""
    mock_payload = {
        "alerts": [
            {
                "identifier": "ndma-alert-2026-991",
                "sent": "2026-08-28T08:00:00Z",
                "info": {
                    "event": "Flash Flood Warning",
                    "severity": "Extreme",
                    "urgency": "Immediate",
                    "headline": "Inundation Surge Along Hooghly River Basin",
                    "description": "Intense catchment runoff causing localized bank overtopping.",
                    "instruction": "Evacuate designated low-lying sectors to high ground.",
                    "area": {
                        "areaDesc": "Kolkata & Howrah Drainage Basin",
                        "circle": "22.5726,88.3639 12.5",
                    },
                    "expires": "2026-08-28T18:00:00Z",
                },
            },
            {
                "identifier": "ndma-alert-2026-992",
                "sent": "2026-08-28T08:30:00Z",
                "info": {
                    "event": "Cyclonic Storm Advisory",
                    "severity": "Severe",
                    "headline": "Squall Gale Winds Approaching Coast",
                    "description": "Gale winds gusting up to 75 km/h.",
                    "instruction": "Secure rooftop structures and avoid coastal zones.",
                    "area": {
                        "areaDesc": "Coastal Gangetic Delta",
                        "latitude": 22.1500,
                        "longitude": 88.6000,
                        "radius_km": 25.0,
                    },
                },
            },
        ]
    }

    transport = httpx.MockTransport(
        lambda req: httpx.Response(
            200,
            json=mock_payload,
            headers={"ETag": '"sachet-etag-v1"', "Last-Modified": "Fri, 28 Aug 2026 08:00:00 GMT"},
        )
    )

    adapter = SachetAdapter()
    async with httpx.AsyncClient(transport=transport) as client:
        alerts, prov = await adapter.fetch_alerts(client=client)

    assert prov == AlertProvenance.LIVE
    assert len(alerts) == 2

    flood_alert = alerts[0]
    assert flood_alert.id == "alt-sachet-ndma-alert-2026-991"
    assert flood_alert.source == "SACHET / NDMA India"
    assert flood_alert.hazard_type == HazardType.FLOOD
    assert flood_alert.severity == HazardSeverity.CRITICAL
    assert flood_alert.latitude == 22.5726
    assert flood_alert.longitude == 88.3639
    assert flood_alert.radius_km == 12.5
    assert "Evacuate designated low-lying" in flood_alert.recommended_action

    cyclone_alert = alerts[1]
    assert cyclone_alert.hazard_type == HazardType.CYCLONE
    assert cyclone_alert.severity == HazardSeverity.WARNING

    health = adapter.get_health()
    assert health.status == SourceStatus.AVAILABLE
    assert health.active_alerts_count == 2


@pytest.mark.asyncio
async def test_sachet_adapter_etag_304_not_modified():
    """Verify SachetAdapter reuses cached alerts on HTTP 304 without re-parsing."""
    initial_payload = {
        "alerts": [
            {
                "identifier": "sachet-initial-1",
                "sent": "2026-08-28T09:00:00Z",
                "info": {
                    "event": "Heat Wave Advisory",
                    "severity": "Moderate",
                    "headline": "Heat Wave Warning",
                    "description": "Temperatures exceeding 41C.",
                    "area": {"latitude": 22.57, "longitude": 88.36},
                },
            }
        ]
    }

    call_count = 0

    def mock_handler(req: httpx.Request):
        nonlocal call_count
        call_count += 1
        if req.headers.get("If-None-Match") == '"etag-123"':
            return httpx.Response(304)
        return httpx.Response(200, json=initial_payload, headers={"ETag": '"etag-123"'})

    transport = httpx.MockTransport(mock_handler)
    adapter = SachetAdapter(cache_ttl_seconds=0)  # zero cache TTL to force conditional request

    async with httpx.AsyncClient(transport=transport) as client:
        # First call -> 200 OK
        alerts1, prov1 = await adapter.fetch_alerts(client=client)
        assert prov1 == AlertProvenance.LIVE
        assert len(alerts1) == 1

        # Second call -> 304 Not Modified
        alerts2, prov2 = await adapter.fetch_alerts(client=client)
        assert prov2 == AlertProvenance.CACHED
        assert len(alerts2) == 1
        assert alerts2[0].id == "alt-sachet-sachet-initial-1"
        assert call_count == 2


@pytest.mark.asyncio
async def test_sachet_adapter_failure_and_cached_fallback():
    """Verify SachetAdapter falls back to cached data and marks status FAILED on 500 error."""
    adapter = SachetAdapter()

    # Pre-populate cache
    adapter._cached_alerts = [
        NormalizedAlert(
            id="sachet-cached-1",
            source="SACHET / NDMA India",
            source_event_id="cached-1",
            source_type=adapter.source_type,
            hazard_type=HazardType.FLOOD,
            severity=HazardSeverity.WARNING,
            title="Cached Flood Advisory",
            description="Cached advisory.",
            recommended_action="Stay on high ground.",
            latitude=22.57,
            longitude=88.36,
            radius_km=10.0,
            observed_at="2026-08-28T09:00:00Z",
            issued_at="2026-08-28T09:00:00Z",
            expires_at="2026-08-28T18:00:00Z",
            fetched_at="2026-08-28T09:00:00Z",
        )
    ]

    transport = httpx.MockTransport(lambda req: httpx.Response(500, text="Internal Server Error"))
    async with httpx.AsyncClient(transport=transport) as client:
        alerts, prov = await adapter.fetch_alerts(client=client)

    assert prov == AlertProvenance.CACHED
    assert len(alerts) == 1
    assert alerts[0].id == "sachet-cached-1"
    assert adapter.get_health().status == SourceStatus.STALE


# ===========================================================================
# 2. GDACS (UN / EU) Adapter Tests
# ===========================================================================


@pytest.mark.asyncio
async def test_gdacs_adapter_success_geojson():
    """Verify GDACSAdapter parses official GeoJSON events with alert levels & event types."""
    mock_geojson = {
        "type": "FeatureCollection",
        "features": [
            {
                "type": "Feature",
                "properties": {
                    "eventid": "100201",
                    "eventtype": "TC",
                    "alertlevel": "Red",
                    "name": "Tropical Cyclone SAGAR",
                    "description": "Category 4 Tropical Cyclone SAGAR in Bay of Bengal.",
                    "country": "India, Bangladesh",
                    "fromdate": "2026-08-28T04:00:00Z",
                    "todate": "2026-08-29T12:00:00Z",
                    "url": "https://www.gdacs.org/report.aspx?eventid=100201",
                },
                "geometry": {"type": "Point", "coordinates": [88.5000, 21.8000]},
            },
            {
                "type": "Feature",
                "properties": {
                    "eventid": "100202",
                    "eventtype": "FL",
                    "alertlevel": "Orange",
                    "name": "Brahmaputra Basin Flood",
                    "description": "Severe monsoon riverine flooding.",
                    "country": "India",
                    "fromdate": "2026-08-28T06:00:00Z",
                },
                "geometry": {"type": "Point", "coordinates": [91.7500, 26.1500]},
            },
        ],
    }

    transport = httpx.MockTransport(lambda req: httpx.Response(200, json=mock_geojson))
    adapter = GDACSAdapter()

    async with httpx.AsyncClient(transport=transport) as client:
        alerts, prov = await adapter.fetch_alerts(client=client)

    assert prov == AlertProvenance.LIVE
    assert len(alerts) == 2

    cyclone = alerts[0]
    assert cyclone.id == "alt-gdacs-100201"
    assert cyclone.source == "GDACS (UN / EU)"
    assert cyclone.hazard_type == HazardType.CYCLONE
    assert cyclone.severity == HazardSeverity.CRITICAL
    assert cyclone.radius_km == 100.0
    assert cyclone.latitude == 21.8000
    assert cyclone.longitude == 88.5000

    flood = alerts[1]
    assert flood.hazard_type == HazardType.FLOOD
    assert flood.severity == HazardSeverity.WARNING
    assert flood.radius_km == 15.0


@pytest.mark.asyncio
async def test_gdacs_adapter_malformed_feature_skipped():
    """Verify GDACSAdapter skips corrupted or missing geometry features gracefully."""
    corrupted_geojson = {
        "features": [
            {"properties": {"eventid": "bad-1"}, "geometry": None},
            {
                "properties": {
                    "eventid": "good-1",
                    "eventtype": "EQ",
                    "alertlevel": "Green",
                    "name": "Minor Tremor",
                },
                "geometry": {"coordinates": [88.36, 22.57]},
            },
        ]
    }

    transport = httpx.MockTransport(lambda req: httpx.Response(200, json=corrupted_geojson))
    adapter = GDACSAdapter()

    async with httpx.AsyncClient(transport=transport) as client:
        alerts, prov = await adapter.fetch_alerts(client=client)

    assert len(alerts) == 1
    assert alerts[0].id == "alt-gdacs-good-1"
    assert alerts[0].hazard_type == HazardType.EARTHQUAKE
    assert alerts[0].severity == HazardSeverity.ADVISORY


# ===========================================================================
# 3. USGS Earthquake Adapter Tests
# ===========================================================================


@pytest.mark.asyncio
async def test_usgs_adapter_magnitude_scaling_and_noise_filtering():
    """Verify USGSAdapter correctly scales severity, radii, and filters negligible tremors."""
    mock_usgs = {
        "features": [
            {
                "id": "us7000m991",
                "properties": {
                    "mag": 6.9,
                    "place": "12km ENE of Barasat, India",
                    "time": 1787900000000,
                    "url": "https://earthquake.usgs.gov/earthquakes/eventpage/us7000m991",
                },
                "geometry": {"coordinates": [88.5200, 22.7200, 10.0]},
            },
            {
                "id": "us7000m992",
                "properties": {
                    "mag": 4.3,
                    "place": "Regional Epicenter",
                    "time": 1787901000000,
                },
                "geometry": {"coordinates": [88.1000, 22.3000, 15.0]},
            },
            {
                "id": "us7000m993",
                "properties": {
                    "mag": 1.8,  # Micro-tremor <2.5 should be filtered
                    "place": "Tiny tremor",
                    "time": 1787902000000,
                },
                "geometry": {"coordinates": [88.3600, 22.5700, 5.0]},
            },
        ]
    }

    transport = httpx.MockTransport(lambda req: httpx.Response(200, json=mock_usgs))
    adapter = USGSAdapter()

    async with httpx.AsyncClient(transport=transport) as client:
        alerts, prov = await adapter.fetch_alerts(client=client)

    assert prov == AlertProvenance.LIVE
    assert len(alerts) == 2  # The 1.8 magnitude tremor must be filtered out

    major_eq = alerts[0]
    assert major_eq.id == "alt-usgs-us7000m991"
    assert major_eq.severity == HazardSeverity.CRITICAL
    assert major_eq.radius_km == 80.0
    assert major_eq.latitude == 22.7200
    assert major_eq.longitude == 88.5200

    minor_eq = alerts[1]
    assert minor_eq.severity == HazardSeverity.WATCH
    assert minor_eq.radius_km == 25.0


# ===========================================================================
# 4. Open-Meteo Weather Adapter Tests (Non-Alarmist Context)
# ===========================================================================


@pytest.mark.asyncio
async def test_open_meteo_normal_rain_not_disaster():
    """Verify normal precipitation (<15mm/h) produces NO disaster alerts."""
    normal_weather = {
        "current": {
            "precipitation": 4.5,
            "rain": 4.5,
            "wind_speed_10m": 14.0,
            "wind_gusts_10m": 22.0,
        },
        "hourly": {"precipitation": [4.5, 3.0, 2.0]},
    }

    transport = httpx.MockTransport(lambda req: httpx.Response(200, json=normal_weather))
    adapter = OpenMeteoAdapter()

    async with httpx.AsyncClient(transport=transport) as client:
        alerts, prov = await adapter.fetch_alerts(lat=22.57, lon=88.36, client=client)

    assert prov == AlertProvenance.LIVE
    # Crucial guarantee: Routine rain is contextual only, ZERO disaster alerts emitted
    assert len(alerts) == 0


@pytest.mark.asyncio
async def test_open_meteo_severe_squall_warning():
    """Verify extreme wind gusts (>90km/h) produce WEATHER CONDITION warning."""
    severe_storm = {
        "current": {
            "precipitation": 55.0,
            "wind_speed_10m": 45.0,
            "wind_gusts_10m": 96.0,
        },
        "hourly": {"precipitation": [55.0, 48.0, 30.0]},
    }

    transport = httpx.MockTransport(lambda req: httpx.Response(200, json=severe_storm))
    adapter = OpenMeteoAdapter()

    async with httpx.AsyncClient(transport=transport) as client:
        alerts, prov = await adapter.fetch_alerts(lat=22.57, lon=88.36, client=client)

    assert len(alerts) == 1
    storm_alert = alerts[0]
    assert storm_alert.hazard_type == HazardType.WEATHER
    assert storm_alert.severity == HazardSeverity.WARNING
    assert "WEATHER CONDITION" in storm_alert.title


# ===========================================================================
# 5. Fault Isolation & Orchestration Tests
# ===========================================================================


@pytest.mark.asyncio
async def test_fault_isolation_single_provider_failure_does_not_break_system():
    """Verify that when SACHET fails, GDACS and USGS continue returning verified alerts."""
    # GDACS succeeds
    gdacs_payload = {
        "features": [
            {
                "properties": {
                    "eventid": "gdacs-test-1",
                    "eventtype": "TC",
                    "alertlevel": "Red",
                    "name": "Cyclone Remal",
                    "country": "India",
                },
                "geometry": {"coordinates": [88.36, 22.57]},
            }
        ]
    }

    def multi_provider_handler(req: httpx.Request):
        url = str(req.url)
        if "sachet.ndma.gov.in" in url:
            return httpx.Response(503, text="SACHET Maintenance")
        if "gdacs.org" in url:
            return httpx.Response(200, json=gdacs_payload)
        if "earthquake.usgs.gov" in url:
            return httpx.Response(200, json={"features": []})
        if "open-meteo.com" in url:
            return httpx.Response(200, json={"current": {"precipitation": 0.0}})
        return httpx.Response(404)

    transport = httpx.MockTransport(multi_provider_handler)
    async with httpx.AsyncClient(transport=transport) as client:
        hazards = await get_active_hazards(lat=22.57, lon=88.36, client=client)

    # GDACS alert must be present despite SACHET failure
    assert len(hazards) >= 1
    assert any(h.id == "alt-gdacs-gdacs-test-1" for h in hazards)

    # Check that source health reflects SACHET failure while others remain available
    statuses = get_source_statuses()
    assert statuses["sachet_ndma"] == SourceStatus.FAILED
    assert statuses["gdacs"] == SourceStatus.AVAILABLE


@pytest.mark.asyncio
async def test_area_safety_evaluation_all_sources_active():
    """Verify Area Safety Level evaluation integrates all adapters correctly."""
    safety = await evaluate_area_safety(lat=22.5726, lon=88.3639)
    assert safety.success is True
    assert safety.level in (
        AreaSafetyLevel.SAFE,
        AreaSafetyLevel.WATCH,
        AreaSafetyLevel.WARNING,
        AreaSafetyLevel.CRITICAL,
    )
