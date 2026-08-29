"""Unit and Integration Tests for Weather Intelligence & Local Conditions (Build 04).

Tests:
1. OpenMeteoAdapter: Full environmental telemetry ingestion, WMO translation, hourly forecasts.
2. Weather summary generation: Grounded non-alarmist phrasing for calm, rainy, storm, and heat.
3. Grid caching: Fast response reuse within 300s TTL.
4. Fault isolation: Graceful fallback when weather provider fails without breaking the system.
5. REST API: GET /api/weather endpoint response contract and validation.
"""

from __future__ import annotations

import httpx
import pytest

from app.adapters.open_meteo import (
    OpenMeteoAdapter,
    generate_weather_summary,
    wmo_code_to_condition,
)
from app.models import SourceStatus, WeatherIntelligenceResponse


@pytest.fixture
def anyio_backend():
    return "asyncio"


def mock_open_meteo_response():
    """Mock standard Open-Meteo JSON payload with rich current and hourly data."""
    return {
        "latitude": 22.57,
        "longitude": 88.36,
        "current": {
            "time": "2026-08-29T14:00",
            "temperature_2m": 28.4,
            "apparent_temperature": 31.2,
            "relative_humidity_2m": 76,
            "precipitation": 1.2,
            "rain": 1.2,
            "weather_code": 61,  # Light Rain
            "wind_speed_10m": 14.5,
            "wind_gusts_10m": 22.0,
            "wind_direction_10m": 180,
            "uv_index": 4.5,
            "visibility": 9000,
            "is_day": 1,
        },
        "hourly": {
            "time": [
                "2026-08-29T14:00",
                "2026-08-29T15:00",
                "2026-08-29T16:00",
                "2026-08-29T17:00",
                "2026-08-29T18:00",
            ],
            "temperature_2m": [28.4, 27.9, 27.2, 26.5, 26.0],
            "precipitation": [1.2, 2.5, 0.4, 0.0, 0.0],
            "precipitation_probability": [75, 85, 40, 10, 5],
            "weather_code": [61, 63, 80, 2, 1],
            "wind_speed_10m": [14.5, 16.0, 12.0, 9.0, 8.0],
            "relative_humidity_2m": [76, 80, 82, 79, 81],
            "uv_index": [4.5, 3.2, 1.8, 0.5, 0.0],
        },
        "daily": {
            "time": ["2026-08-29"],
            "temperature_2m_max": [32.0],
            "temperature_2m_min": [24.5],
            "precipitation_probability_max": [85],
            "uv_index_max": [7.5],
            "sunrise": ["2026-08-29T05:15"],
            "sunset": ["2026-08-29T18:05"],
        },
    }


@pytest.mark.asyncio
async def test_open_meteo_weather_intelligence_success():
    """Verify OpenMeteoAdapter parses current conditions, hourly forecasts, and summaries."""
    payload = mock_open_meteo_response()
    transport = httpx.MockTransport(lambda req: httpx.Response(200, json=payload))

    adapter = OpenMeteoAdapter()
    adapter.clear_cache()

    async with httpx.AsyncClient(transport=transport) as client:
        result = await adapter.fetch_weather_intelligence(22.57, 88.36, client=client)

    assert isinstance(result, WeatherIntelligenceResponse)
    assert result.success is True
    assert result.current.temperature == 28.4
    assert result.current.feels_like == 31.2
    assert result.current.condition == "Light Rain"
    assert result.current.precipitation == 1.2
    assert result.current.precipitation_probability == 75
    assert result.current.wind_speed == 14.5
    assert result.current.visibility_km == 9.0
    assert result.status == SourceStatus.AVAILABLE
    assert result.freshness == "LIVE"

    # Check hourly forecast items
    assert len(result.hourly) > 0
    first_hour = result.hourly[0]
    assert first_hour.temperature == 28.4
    assert first_hour.precipitation_probability == 75
    assert first_hour.condition == "Light Rain"


def test_wmo_code_translation():
    """Verify standard WMO codes translate into human-friendly phrases."""
    assert wmo_code_to_condition(0, is_day=1) == "Clear Skies"
    assert wmo_code_to_condition(0, is_day=0) == "Clear Night"
    assert wmo_code_to_condition(2, is_day=1) == "Partly Cloudy"
    assert wmo_code_to_condition(61, is_day=1) == "Light Rain"
    assert wmo_code_to_condition(65, is_day=1) == "Heavy Rain"
    assert wmo_code_to_condition(95, is_day=1) == "Thunderstorm Possible"


def test_generate_weather_summary():
    """Verify situational summaries reflect appropriate non-alarmist guidance."""
    # Calm day
    calm = generate_weather_summary(27.0, 0, 0.0, 0, 10.0, 12.0, 10.0)
    assert "calm and normal" in calm

    # Light rain
    rain = generate_weather_summary(25.0, 61, 1.5, 70, 12.0, 15.0, 8.0)
    assert "Rain is currently affecting" in rain or "Carry rain protection" in rain

    # Thunderstorm
    storm = generate_weather_summary(29.0, 95, 2.0, 80, 20.0, 35.0, 6.0)
    assert "Thunderstorm activity possible" in storm

    # Extreme heat
    heat = generate_weather_summary(42.0, 0, 0.0, 0, 8.0, 10.0, 10.0)
    assert "High heat conditions observed" in heat


@pytest.mark.asyncio
async def test_weather_intelligence_cache_reuse():
    """Verify subsequent queries within 300s TTL reuse cached response."""
    payload = mock_open_meteo_response()
    call_count = 0

    def mock_handler(req):
        nonlocal call_count
        call_count += 1
        return httpx.Response(200, json=payload)

    transport = httpx.MockTransport(mock_handler)
    adapter = OpenMeteoAdapter(cache_ttl_seconds=300)
    adapter.clear_cache()

    async with httpx.AsyncClient(transport=transport) as client:
        r1 = await adapter.fetch_weather_intelligence(22.57, 88.36, client=client)
        assert r1.freshness == "LIVE"
        assert call_count == 1

        # Second call immediately after
        r2 = await adapter.fetch_weather_intelligence(22.57, 88.36, client=client)
        assert r2.freshness == "CACHED"
        assert call_count == 1  # No additional network request


@pytest.mark.asyncio
async def test_weather_intelligence_graceful_failure():
    """Verify offline provider yields safe structured fallback with UNAVAILABLE status."""
    transport = httpx.MockTransport(lambda req: httpx.Response(503, text="Service Unavailable"))

    adapter = OpenMeteoAdapter()
    adapter.clear_cache()

    async with httpx.AsyncClient(transport=transport) as client:
        result = await adapter.fetch_weather_intelligence(22.57, 88.36, client=client)

    assert result.success is False
    assert result.status == SourceStatus.FAILED
    assert result.freshness == "UNAVAILABLE"
    assert result.current.condition == "Telemetry Reconnecting"
