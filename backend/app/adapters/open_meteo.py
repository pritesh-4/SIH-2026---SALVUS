"""Open-Meteo Environmental & Meteorological Context Adapter (Build 04).

Provides contextual weather telemetry, hourly near-term forecasts, and localized environmental
intelligence without turning normal precipitation into false disaster emergencies.
Enforces strict, non-alarmist thresholds for hazard alerts.
"""

from __future__ import annotations

import logging
import time
from datetime import UTC, datetime, timedelta
from typing import Any

import httpx

from app.adapters.base import BaseAlertAdapter
from app.models import (
    AlertProvenance,
    DailyForecastSummary,
    HazardSeverity,
    HazardType,
    HourlyForecastItem,
    NormalizedAlert,
    SourceStatus,
    SourceType,
    WeatherCondition,
    WeatherIntelligenceResponse,
)

logger = logging.getLogger("salvus.adapters.open_meteo")

OPEN_METEO_API_URL = "https://api.open-meteo.com/v1/forecast"
DEFAULT_TIMEOUT_SECONDS = 4.0


def wmo_code_to_condition(code: int, is_day: int = 1) -> str:
    """Translate standard WMO weather codes into clear, non-alarmist human phrasing."""
    wmo_map = {
        0: "Clear Skies" if is_day else "Clear Night",
        1: "Mainly Clear",
        2: "Partly Cloudy",
        3: "Overcast",
        45: "Foggy",
        48: "Depositing Rime Fog",
        51: "Light Drizzle",
        53: "Moderate Drizzle",
        55: "Dense Drizzle",
        56: "Light Freezing Drizzle",
        57: "Dense Freezing Drizzle",
        61: "Light Rain",
        63: "Moderate Rain",
        65: "Heavy Rain",
        66: "Light Freezing Rain",
        67: "Heavy Freezing Rain",
        71: "Slight Snow Fall",
        73: "Moderate Snow Fall",
        75: "Heavy Snow Fall",
        77: "Snow Grains",
        80: "Slight Rain Showers",
        81: "Moderate Rain Showers",
        82: "Violent Rain Showers",
        85: "Slight Snow Showers",
        86: "Heavy Snow Showers",
        95: "Thunderstorm Possible",
        96: "Thunderstorm with Slight Hail",
        99: "Thunderstorm with Heavy Hail",
    }
    return wmo_map.get(code, "Clear Skies" if is_day else "Clear")


def generate_weather_summary(
    temp: float,
    code: int,
    precip: float,
    precip_prob: int,
    wind_speed: float,
    wind_gusts: float,
    visibility_km: float,
) -> str:
    """Generate a non-alarmist, grounded situational summary for the citizen."""
    if code in (95, 96, 99):
        return "Thunderstorm activity possible in your sector. Stay indoors if lightning develops."
    if code == 65 or precip >= 15.0:
        return (
            "Heavy rainfall active near your location. "
            "Reduced road visibility and localized waterlogging possible."
        )
    if code in (51, 53, 55, 61, 63, 80, 81) or precip > 0.2 or precip_prob >= 60:
        return "Rain is currently affecting or expected near your location. Carry rain protection."
    if temp >= 40.0:
        return "High heat conditions observed. Stay hydrated and minimize direct sun exposure."
    if wind_gusts >= 60.0 or wind_speed >= 40.0:
        return "Strong gusty winds in your area. Secure loose outdoor objects."
    if code in (45, 48) or visibility_km < 2.0:
        return "Low visibility and foggy conditions. Drive with caution."
    return "Conditions look calm and normal around you."


class OpenMeteoAdapter(BaseAlertAdapter):
    """Adapter for Open-Meteo weather and environmental context telemetry."""

    def __init__(self, api_url: str = OPEN_METEO_API_URL, cache_ttl_seconds: int = 300):
        super().__init__(
            source_id="open_meteo",
            source_name="Open-Meteo Weather Service",
            source_type=SourceType.WEATHER_SERVICE,
            cache_ttl_seconds=cache_ttl_seconds,
        )
        self.api_url = api_url
        # Grid cache for alerts: {(round(lat, 2), round(lon, 2)): (alerts, expire_datetime)}
        self._grid_cache: dict[tuple[float, float], tuple[list[NormalizedAlert], datetime]] = {}
        # Grid cache for weather intelligence:
        # {(round(lat, 2), round(lon, 2)): (WeatherIntelligenceResponse, expire_datetime)}
        self._weather_cache: dict[
            tuple[float, float], tuple[WeatherIntelligenceResponse, datetime]
        ] = {}

    def clear_cache(self) -> None:
        """Reset cached weather telemetry for testing."""
        super().clear_cache()
        self._grid_cache.clear()
        self._weather_cache.clear()

    async def _fetch_raw_telemetry(
        self,
        target_lat: float,
        target_lon: float,
        client: httpx.AsyncClient | None = None,
    ) -> tuple[dict[str, Any] | None, float, str | None]:
        """Query Open-Meteo API for complete environmental, hourly, and daily metrics."""
        start_time = time.perf_counter()
        params = {
            "latitude": target_lat,
            "longitude": target_lon,
            "current": (
                "temperature_2m,relative_humidity_2m,apparent_temperature,precipitation,"
                "rain,showers,snowfall,weather_code,wind_speed_10m,wind_gusts_10m,"
                "wind_direction_10m,uv_index,visibility,is_day"
            ),
            "hourly": (
                "temperature_2m,precipitation_probability,precipitation,weather_code,"
                "wind_speed_10m,relative_humidity_2m,uv_index"
            ),
            "daily": (
                "sunrise,sunset,temperature_2m_max,temperature_2m_min,"
                "precipitation_probability_max,uv_index_max"
            ),
            "forecast_days": 2,
            "timezone": "auto",
        }

        try:
            if client is not None:
                response = await client.get(
                    self.api_url, params=params, timeout=DEFAULT_TIMEOUT_SECONDS
                )
            else:
                async with httpx.AsyncClient(timeout=DEFAULT_TIMEOUT_SECONDS) as http:
                    response = await http.get(self.api_url, params=params)

            latency_ms = (time.perf_counter() - start_time) * 1000.0

            if response.status_code == 200:
                return response.json(), latency_ms, None

            logger.warning(f"Open-Meteo API returned HTTP {response.status_code}")
            return None, latency_ms, f"HTTP {response.status_code}"

        except Exception as e:
            latency_ms = (time.perf_counter() - start_time) * 1000.0
            logger.warning(f"Failed to fetch Open-Meteo telemetry: {e}")
            return None, latency_ms, str(e)

    async def fetch_weather_intelligence(
        self,
        lat: float,
        lon: float,
        client: httpx.AsyncClient | None = None,
    ) -> WeatherIntelligenceResponse:
        """Fetch comprehensive normalized weather conditions and hourly forecasts."""
        now = datetime.now(UTC)
        now_iso = now.isoformat()
        target_lat = round(lat, 2)
        target_lon = round(lon, 2)
        grid_key = (target_lat, target_lon)

        # Check grid cache
        cached_entry = self._weather_cache.get(grid_key)
        if cached_entry and now < cached_entry[1]:
            cached_resp = cached_entry[0].model_copy()
            cached_resp.freshness = "CACHED"
            return cached_resp

        raw_data, latency_ms, error = await self._fetch_raw_telemetry(
            target_lat, target_lon, client=client
        )

        if not raw_data or error:
            if cached_entry:
                stale_resp = cached_entry[0].model_copy()
                stale_resp.freshness = "STALE"
                stale_resp.status = SourceStatus.DEGRADED
                self.update_health(status=SourceStatus.DEGRADED, latency_ms=latency_ms, error=error)
                return stale_resp

            self.update_health(status=SourceStatus.FAILED, latency_ms=latency_ms, error=error)
            # Return safe fallback with explicit UNAVAILABLE status
            fallback_condition = WeatherCondition(
                temperature=25.0,
                feels_like=25.0,
                condition="Telemetry Reconnecting",
                weather_code=0,
                precipitation=0.0,
                precipitation_probability=0,
                humidity=50,
                wind_speed=5.0,
                wind_direction=0.0,
                wind_gusts=5.0,
                visibility_km=10.0,
                uv_index=0.0,
                is_day=1,
                observed_at=now_iso,
                source="Open-Meteo Weather Service",
                provenance=AlertProvenance.FALLBACK,
                summary="Weather feeds are temporarily reconnecting. Standby for live updates.",
            )
            return WeatherIntelligenceResponse(
                success=False,
                current=fallback_condition,
                hourly=[],
                daily=None,
                status=SourceStatus.FAILED,
                freshness="UNAVAILABLE",
                data_provenance=AlertProvenance.FALLBACK.value,
                latitude=lat,
                longitude=lon,
                observed_at=now_iso,
                evaluated_at=now_iso,
                error=error or "Telemetry service unavailable",
            )

        # Parse normalized weather observation
        current = raw_data.get("current", {})
        hourly = raw_data.get("hourly", {})
        daily = raw_data.get("daily", {})

        temp = float(
            current.get("temperature_2m") if current.get("temperature_2m") is not None else 25.0
        )
        feels_like = float(
            current.get("apparent_temperature")
            if current.get("apparent_temperature") is not None
            else temp
        )
        weather_code = int(current.get("weather_code") or 0)
        is_day = int(current.get("is_day") if current.get("is_day") is not None else 1)
        precip = float(current.get("precipitation") or current.get("rain") or 0.0)
        humidity = int(round(float(current.get("relative_humidity_2m") or 50.0)))
        wind_speed = float(current.get("wind_speed_10m") or 0.0)
        wind_gusts = float(current.get("wind_gusts_10m") or wind_speed)
        wind_dir = float(current.get("wind_direction_10m") or 0.0)
        uv_index = float(current.get("uv_index") or 0.0)
        vis_meters = float(current.get("visibility") or 10000.0)
        vis_km = round(vis_meters / 1000.0, 1)

        condition_text = wmo_code_to_condition(weather_code, is_day)

        # Parse hourly forecasts (next 6-12 hours)
        hourly_times = hourly.get("time", [])
        hourly_temps = hourly.get("temperature_2m", [])
        hourly_codes = hourly.get("weather_code", [])
        hourly_precips = hourly.get("precipitation", [])
        hourly_probs = hourly.get("precipitation_probability", [])
        hourly_winds = hourly.get("wind_speed_10m", [])

        hourly_items: list[HourlyForecastItem] = []
        now_hour_iso = now.strftime("%Y-%m-%dT%H:00")

        # Find starting index in hourly array
        start_idx = 0
        for i, t_str in enumerate(hourly_times):
            if t_str >= now_hour_iso:
                start_idx = i
                break

        # Collect next 8 hours
        current_precip_prob = 0
        if start_idx < len(hourly_probs) and hourly_probs[start_idx] is not None:
            current_precip_prob = int(hourly_probs[start_idx])

        for idx in range(start_idx, min(start_idx + 8, len(hourly_times))):
            t_iso = hourly_times[idx]
            try:
                # Format time as HH:MM e.g. "14:00"
                t_dt = datetime.fromisoformat(t_iso)
                t_label = t_dt.strftime("%H:%M")
            except Exception:
                t_label = t_iso[-5:]

            h_code = int(
                hourly_codes[idx]
                if idx < len(hourly_codes) and hourly_codes[idx] is not None
                else 0
            )
            h_temp = float(
                hourly_temps[idx]
                if idx < len(hourly_temps) and hourly_temps[idx] is not None
                else temp
            )
            h_precip = float(
                hourly_precips[idx]
                if idx < len(hourly_precips) and hourly_precips[idx] is not None
                else 0.0
            )
            h_prob = int(
                hourly_probs[idx]
                if idx < len(hourly_probs) and hourly_probs[idx] is not None
                else 0
            )
            h_wind = float(
                hourly_winds[idx]
                if idx < len(hourly_winds) and hourly_winds[idx] is not None
                else 0.0
            )

            hourly_items.append(
                HourlyForecastItem(
                    time=t_label,
                    time_iso=t_iso,
                    temperature=round(h_temp, 1),
                    condition=wmo_code_to_condition(h_code, is_day=1),
                    weather_code=h_code,
                    precipitation=round(h_precip, 1),
                    precipitation_probability=h_prob,
                    wind_speed=round(h_wind, 1),
                )
            )

        # Parse daily summary
        daily_summary = None
        if daily and daily.get("temperature_2m_max"):
            sunrises = daily.get("sunrise", [])
            sunsets = daily.get("sunset", [])
            daily_summary = DailyForecastSummary(
                max_temp=float(daily.get("temperature_2m_max", [temp])[0]),
                min_temp=float(daily.get("temperature_2m_min", [temp])[0]),
                max_precipitation_probability=int(
                    daily.get("precipitation_probability_max", [0])[0] or 0
                ),
                max_uv_index=float(daily.get("uv_index_max", [uv_index])[0] or uv_index),
                sunrise=sunrises[0] if sunrises else None,
                sunset=sunsets[0] if sunsets else None,
            )

        summary_text = generate_weather_summary(
            temp=temp,
            code=weather_code,
            precip=precip,
            precip_prob=current_precip_prob,
            wind_speed=wind_speed,
            wind_gusts=wind_gusts,
            visibility_km=vis_km,
        )

        weather_condition = WeatherCondition(
            temperature=round(temp, 1),
            feels_like=round(feels_like, 1),
            condition=condition_text,
            weather_code=weather_code,
            precipitation=round(precip, 1),
            precipitation_probability=current_precip_prob,
            humidity=humidity,
            wind_speed=round(wind_speed, 1),
            wind_direction=round(wind_dir, 1),
            wind_gusts=round(wind_gusts, 1),
            visibility_km=vis_km,
            uv_index=round(uv_index, 1),
            is_day=is_day,
            sunrise=daily_summary.sunrise if daily_summary else None,
            sunset=daily_summary.sunset if daily_summary else None,
            observed_at=now_iso,
            source="Open-Meteo Weather Service",
            provenance=AlertProvenance.LIVE,
            summary=summary_text,
        )

        resp = WeatherIntelligenceResponse(
            success=True,
            current=weather_condition,
            hourly=hourly_items,
            daily=daily_summary,
            status=SourceStatus.AVAILABLE,
            freshness="LIVE",
            data_provenance=AlertProvenance.LIVE.value,
            latitude=lat,
            longitude=lon,
            observed_at=now_iso,
            evaluated_at=now_iso,
        )

        # Store in cache
        expires_at = now + timedelta(seconds=self.cache_ttl_seconds)
        self._weather_cache[grid_key] = (resp, expires_at)
        self.update_health(
            status=SourceStatus.AVAILABLE, latency_ms=latency_ms, active_alerts_count=1
        )

        return resp

    async def fetch_alerts(
        self,
        lat: float | None = None,
        lon: float | None = None,
        client: httpx.AsyncClient | None = None,
        **kwargs,
    ) -> tuple[list[NormalizedAlert], AlertProvenance]:
        """Fetch real-time environmental context for coordinates with non-alarmist thresholds."""
        now = datetime.now(UTC)

        if lat is None or lon is None:
            return [], AlertProvenance.LIVE

        target_lat = round(lat, 2)
        target_lon = round(lon, 2)
        grid_key = (target_lat, target_lon)

        # Check grid cache
        cached_entry = self._grid_cache.get(grid_key)
        if cached_entry and now < cached_entry[1]:
            return cached_entry[0], AlertProvenance.CACHED

        raw_data, latency_ms, error = await self._fetch_raw_telemetry(
            target_lat, target_lon, client=client
        )

        if not raw_data or error:
            cached_alerts = cached_entry[0] if cached_entry else []
            status = SourceStatus.FAILED if not cached_alerts else SourceStatus.STALE
            self.update_health(status=status, latency_ms=latency_ms, error=error)
            prov = AlertProvenance.CACHED if cached_alerts else AlertProvenance.FALLBACK
            return cached_alerts, prov

        alerts = self._evaluate_environmental_context(raw_data, target_lat, target_lon, now)

        # Store in grid cache
        expires_at_dt = now + timedelta(seconds=self.cache_ttl_seconds)
        self._grid_cache[grid_key] = (alerts, expires_at_dt)

        self.update_health(
            status=SourceStatus.AVAILABLE,
            latency_ms=latency_ms,
            active_alerts_count=len(alerts),
        )
        return alerts, AlertProvenance.LIVE

    def _evaluate_environmental_context(
        self, data: dict[str, Any], lat: float, lon: float, now: datetime
    ) -> list[NormalizedAlert]:
        """Apply strict non-alarmist thresholds to environmental measurements.

        Rule: Rain is NOT a disaster. Normal precipitation (<15mm/h) produces NO alert.
        """
        current = data.get("current", {})
        hourly = data.get("hourly", {})

        precip = float(current.get("precipitation") or current.get("rain") or 0.0)
        wind_speed = float(current.get("wind_speed_10m") or 0.0)
        wind_gusts = float(current.get("wind_gusts_10m") or wind_speed)

        # 3-hour precipitation accumulation
        hourly_precip = hourly.get("precipitation", [])
        accum_3h = sum(float(p) for p in hourly_precip[:3] if p is not None)

        now_iso = now.isoformat()
        alerts: list[NormalizedAlert] = []

        # 1. EXTREME SQUALL / CLOUDBURST (Warning Level)
        # Threshold: Extreme rainfall > 50mm/h or wind gusts > 90 km/h
        if precip >= 50.0 or accum_3h >= 100.0 or wind_gusts >= 90.0:
            exp_iso = (now + timedelta(hours=3)).isoformat()
            alerts.append(
                NormalizedAlert(
                    id=f"alt-meteo-severe-{lat:.2f}-{lon:.2f}",
                    source="Open-Meteo Weather Service",
                    source_event_id=f"meteo-severe-{int(now.timestamp())}",
                    source_type=SourceType.WEATHER_SERVICE,
                    hazard_type=HazardType.WEATHER,
                    severity=HazardSeverity.WARNING,
                    title="WEATHER CONDITION: Severe Rain Squall / High Wind Advisory",
                    description=(
                        f"Extreme weather metrics recorded: {precip:.1f} mm/h precipitation, "
                        f"{wind_gusts:.1f} km/h wind gusts."
                    ),
                    why_it_matters=(
                        "Potential for localized water accumulation and flying "
                        "debris in exposed areas."
                    ),
                    recommended_action=(
                        "Seek solid shelter indoors; avoid traveling during peak storm activity."
                    ),
                    latitude=lat,
                    longitude=lon,
                    affected_area="Regional Weather Grid Sector",
                    radius_km=15.0,
                    observed_at=now_iso,
                    issued_at=now_iso,
                    expires_at=exp_iso,
                    fetched_at=now_iso,
                    source_url="https://open-meteo.com",
                    provenance=AlertProvenance.LIVE,
                    confidence=0.92,
                    is_active=True,
                )
            )

        # 2. MODERATE SQUALL / HEAVY RAIN (Watch Level)
        # Threshold: Moderate rain 15-50mm/h or wind gusts 60-90 km/h
        elif precip >= 15.0 or accum_3h >= 40.0 or wind_gusts >= 60.0:
            exp_iso = (now + timedelta(hours=3)).isoformat()
            alerts.append(
                NormalizedAlert(
                    id=f"alt-meteo-watch-{lat:.2f}-{lon:.2f}",
                    source="Open-Meteo Weather Service",
                    source_event_id=f"meteo-watch-{int(now.timestamp())}",
                    source_type=SourceType.WEATHER_SERVICE,
                    hazard_type=HazardType.WEATHER,
                    severity=HazardSeverity.WATCH,
                    title="WEATHER CONDITION: Active Heavy Rain / Gusty Winds",
                    description=(
                        f"Active rainfall recorded at {precip:.1f} mm/h with "
                        f"gusts of {wind_gusts:.1f} km/h."
                    ),
                    why_it_matters=(
                        "Surface water runoff and localized traffic slowdowns possible."
                    ),
                    recommended_action=(
                        "Exercise caution on roadways and monitor official municipal channels."
                    ),
                    latitude=lat,
                    longitude=lon,
                    affected_area="Regional Weather Grid Sector",
                    radius_km=10.0,
                    observed_at=now_iso,
                    issued_at=now_iso,
                    expires_at=exp_iso,
                    fetched_at=now_iso,
                    source_url="https://open-meteo.com",
                    provenance=AlertProvenance.LIVE,
                    confidence=0.88,
                    is_active=True,
                )
            )

        return alerts
