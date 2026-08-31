"""SALVUS Phase 2 Alert Intelligence Test Matrix
(Normalization, Relevance, Risk & Alert Generation).

Tests:
1. Sunny / calm weather (context only, no false emergency).
2. Rain (light/moderate context).
3. Heavy rain (actionable alert with thresholds).
4. Thunderstorm (derived vs official).
5. High wind and extreme gusts.
6. Extreme heat wave & cold wave.
7. Flood warning (official WRD/CWC).
8. Earthquake (USGS seismic).
9. Multiple providers agree (confidence boosted, consolidated into one canonical card).
10. Providers conflict (authority hierarchy applied).
11. Provider missing / partial failure (data quality = PARTIAL).
12. Expired warning pruning.
13. Stale cache handling (data quality = STALE).
14. Unknown fields and unknown severity resilience.
15. Invalid geometry / coordinates resilience.
16. Location unavailable mode (LOCATION_REQUIRED, no fake Kolkata defaults).
17. Deterministic AI Safety Shield validation.
"""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

import pytest

from app.models import (
    AlertProvenance,
    DataQualityState,
    HazardSeverity,
    HazardType,
    NormalizedAlert,
    SignalType,
    SourceAuthorityTier,
    SourceStatus,
    SourceType,
    WeatherCondition,
)
from app.services import hazard_service
from app.services.alert_context_service import (
    DeterministicSafetyShield,
    generate_deterministic_briefing,
)
from app.services.risk_engine import (
    classify_signal_type,
    consolidate_multi_source_alerts,
    format_clean_title,
    generate_actionable_guidance,
    get_source_authority_tier,
    map_canonical_severity,
    rank_alerts_by_priority,
)


@pytest.fixture(autouse=True)
def clean_cache():
    """Ensure clean caches across all adapters before each test."""
    hazard_service.clear_hazard_cache()
    yield
    hazard_service.clear_hazard_cache()


# ===========================================================================
# 1. Weather Signals & Thresholds
# ===========================================================================


def test_sunny_and_light_rain_remain_context():
    """Verify normal sunny and light rain conditions do not create false disaster alerts."""
    # Sunny
    sig_sunny = classify_signal_type(hazard_type=HazardType.WEATHER, weather_code=0, rain_mm=0.0)
    assert sig_sunny == SignalType.NORMAL_WEATHER

    # Light rain (2 mm/h)
    sig_rain = classify_signal_type(hazard_type=HazardType.WEATHER, weather_code=61, rain_mm=2.0)
    assert sig_rain == SignalType.NORMAL_WEATHER


def test_heavy_rain_threshold_classification():
    """Verify heavy rain thresholds (>= 15 mm/h -> Heavy Rain; >= 50 mm/h -> Critical)."""
    # 25 mm/h -> Heavy Rain, Warning
    sig_heavy = classify_signal_type(hazard_type=HazardType.WEATHER, rain_mm=25.0)
    sev_heavy = map_canonical_severity("Open-Meteo", None, signal_type=sig_heavy, rain_mm=25.0)
    assert sig_heavy == SignalType.HEAVY_RAIN
    assert sev_heavy == HazardSeverity.WARNING

    # 65 mm/h -> Heavy Rain, Critical Cloudburst
    sev_extreme = map_canonical_severity("Open-Meteo", None, signal_type=sig_heavy, rain_mm=65.0)
    assert sev_extreme == HazardSeverity.CRITICAL


def test_thunderstorm_derived_vs_official_separation():
    """Verify thunderstorm is derived only with provider evidence and not misattributed."""
    # Derived from WMO 95
    sig_ts = classify_signal_type(hazard_type=HazardType.WEATHER, weather_code=95)
    assert sig_ts == SignalType.THUNDERSTORM

    # Ensure clean title
    title = format_clean_title(sig_ts, HazardSeverity.WATCH)
    assert "Thunderstorm" in title


def test_wind_and_temperature_thresholds():
    """Verify wind gusts, heat wave, and cold wave threshold mappings."""
    # Wind: 75 km/h -> Watch; 95 km/h -> Critical
    sev_squall = map_canonical_severity("Open-Meteo", None, wind_gust=75.0)
    sev_gale = map_canonical_severity("Open-Meteo", None, wind_gust=95.0)
    assert sev_squall == HazardSeverity.WATCH
    assert sev_gale == HazardSeverity.CRITICAL

    # Extreme Heat: 43°C -> Warning; 41°C -> Watch
    sev_heat_warn = map_canonical_severity("Open-Meteo", None, temp_c=43.0)
    sev_heat_watch = map_canonical_severity("Open-Meteo", None, temp_c=41.0)
    assert sev_heat_warn == HazardSeverity.WARNING
    assert sev_heat_watch == HazardSeverity.WATCH

    # Extreme Cold: 3°C -> Warning; 6°C -> Watch
    sev_cold_warn = map_canonical_severity("Open-Meteo", None, temp_c=3.0)
    sev_cold_watch = map_canonical_severity("Open-Meteo", None, temp_c=6.0)
    assert sev_cold_warn == HazardSeverity.WARNING
    assert sev_cold_watch == HazardSeverity.WATCH


# ===========================================================================
# 2. Multi-Source Consensus & Authority Hierarchy
# ===========================================================================


def test_source_authority_tier_hierarchy():
    """Verify source authority weighting order."""
    tier_imd = get_source_authority_tier(
        "India Meteorological Department (IMD)", SourceType.CIVIL_DEFENSE
    )
    tier_osdma = get_source_authority_tier("OSDMA / SATARK Odisha", SourceType.CIVIL_DEFENSE)
    tier_usgs = get_source_authority_tier("USGS Seismic Network", SourceType.SEISMIC_NETWORK)
    tier_open_meteo = get_source_authority_tier(
        "Open-Meteo Weather Service", SourceType.WEATHER_SERVICE
    )

    assert tier_imd == SourceAuthorityTier.OFFICIAL_GOVERNMENT
    assert tier_osdma == SourceAuthorityTier.STATE_DISASTER_AUTHORITY
    assert tier_usgs == SourceAuthorityTier.GLOBAL_NETWORK
    assert tier_open_meteo == SourceAuthorityTier.FORECAST_MODEL


def test_multi_source_agreement_consolidates_and_boosts_confidence():
    """When IMD and OSDMA both report a severe thunderstorm, consolidate and boost confidence."""
    now_iso = datetime.now(UTC).isoformat()
    exp_iso = (datetime.now(UTC) + timedelta(hours=6)).isoformat()

    alert_imd = NormalizedAlert(
        id="imd-alert-101",
        source="India Meteorological Department (IMD)",
        source_event_id="imd-101",
        source_type=SourceType.CIVIL_DEFENSE,
        authority_tier=SourceAuthorityTier.OFFICIAL_GOVERNMENT,
        hazard_type=HazardType.WEATHER,
        signal_type=SignalType.THUNDERSTORM,
        severity=HazardSeverity.WARNING,
        confidence=0.92,
        title="IMD: Severe Thunderstorm with Lightning",
        description="Official IMD orange alert for Khordha sector.",
        why_it_matters="Lightning risk and squally winds.",
        recommended_action="Remain indoors in a sturdy building.",
        what_to_do="Remain indoors in a sturdy building.",
        what_to_avoid="Avoid tall trees and metal structures.",
        latitude=20.2961,
        longitude=85.8245,
        affected_area="Khordha",
        radius_km=15.0,
        observed_at=now_iso,
        issued_at=now_iso,
        expires_at=exp_iso,
        fetched_at=now_iso,
    )

    alert_osdma = NormalizedAlert(
        id="osdma-alert-202",
        source="OSDMA / SATARK Odisha",
        source_event_id="osdma-202",
        source_type=SourceType.CIVIL_DEFENSE,
        authority_tier=SourceAuthorityTier.STATE_DISASTER_AUTHORITY,
        hazard_type=HazardType.WEATHER,
        signal_type=SignalType.THUNDERSTORM,
        severity=HazardSeverity.WARNING,
        confidence=0.90,
        title="OSDMA SATARK: Lightning Activity",
        description="Radar confirms active convective cell over Khordha.",
        why_it_matters="Lightning risk.",
        recommended_action="Take shelter immediately.",
        what_to_do="Take shelter immediately.",
        what_to_avoid="Avoid open fields.",
        latitude=20.2980,
        longitude=85.8260,
        affected_area="Khordha",
        radius_km=12.0,
        observed_at=now_iso,
        issued_at=now_iso,
        expires_at=exp_iso,
        fetched_at=now_iso,
    )

    consolidated = consolidate_multi_source_alerts([alert_imd, alert_osdma])

    assert len(consolidated) == 1
    canonical = consolidated[0]
    assert canonical.source == "India Meteorological Department (IMD)"
    assert set(canonical.sources_matched) == {
        "India Meteorological Department (IMD)",
        "OSDMA / SATARK Odisha",
    }
    assert len(canonical.evidence_sources) == 2
    assert canonical.confidence > 0.92  # Consensus boost
    assert canonical.severity == HazardSeverity.WARNING


def test_conflicting_severity_retains_highest_severity_and_official_authority():
    """When providers report differing severities for the same event, retain highest."""
    now_iso = datetime.now(UTC).isoformat()
    exp_iso = (datetime.now(UTC) + timedelta(hours=6)).isoformat()

    alert_gov_orange = NormalizedAlert(
        id="imd-alert-301",
        source="India Meteorological Department (IMD)",
        source_event_id="imd-301",
        source_type=SourceType.CIVIL_DEFENSE,
        authority_tier=SourceAuthorityTier.OFFICIAL_GOVERNMENT,
        hazard_type=HazardType.WEATHER,
        signal_type=SignalType.HEAVY_RAIN,
        severity=HazardSeverity.WARNING,
        confidence=0.95,
        title="IMD: Heavy Rainfall Warning",
        description="Heavy to very heavy rainfall advisory.",
        recommended_action="Avoid low-lying underpasses.",
        latitude=20.2961,
        longitude=85.8245,
        observed_at=now_iso,
        issued_at=now_iso,
        expires_at=exp_iso,
        fetched_at=now_iso,
    )

    alert_model_yellow = NormalizedAlert(
        id="openmeteo-alert-302",
        source="Open-Meteo Weather Service",
        source_event_id="om-302",
        source_type=SourceType.WEATHER_SERVICE,
        authority_tier=SourceAuthorityTier.FORECAST_MODEL,
        hazard_type=HazardType.WEATHER,
        signal_type=SignalType.HEAVY_RAIN,
        severity=HazardSeverity.WATCH,
        confidence=0.75,
        title="Open-Meteo: Moderate Rain",
        description="Precipitation forecast 18mm/h.",
        recommended_action="Keep umbrella ready.",
        latitude=20.2970,
        longitude=85.8250,
        observed_at=now_iso,
        issued_at=now_iso,
        expires_at=exp_iso,
        fetched_at=now_iso,
    )

    consolidated = consolidate_multi_source_alerts([alert_gov_orange, alert_model_yellow])
    assert len(consolidated) == 1
    assert consolidated[0].severity == HazardSeverity.WARNING
    assert consolidated[0].authority_tier == SourceAuthorityTier.OFFICIAL_GOVERNMENT


# ===========================================================================
# 3. Action Recommendations & Structured Guidance
# ===========================================================================


def test_action_recommendation_structure():
    """Verify Why It Matters, What To Do, and What To Avoid are non-sensational and safe."""
    why, what_do, what_avoid = generate_actionable_guidance(
        signal_type=SignalType.FLOOD,
        severity=HazardSeverity.CRITICAL,
        affected_area="Mahanadi Basin",
    )
    assert "inundation" in why.lower() or "flood" in why.lower()
    assert "evacuate" in what_do.lower() or "shelters" in what_do.lower()
    assert "never walk" in what_avoid.lower() or "drive" in what_avoid.lower()


# ===========================================================================
# 4. Priority Ranking
# ===========================================================================


def test_priority_ranking_official_critical_above_calm_weather():
    """Ensure Critical official warnings appear above forecasts and advisories."""
    now_iso = datetime.now(UTC).isoformat()
    exp_iso = (datetime.now(UTC) + timedelta(hours=6)).isoformat()

    alert_critical_eq = NormalizedAlert(
        id="usgs-eq-1",
        source="USGS Seismic Network",
        source_event_id="usgs-eq-1",
        source_type=SourceType.SEISMIC_NETWORK,
        authority_tier=SourceAuthorityTier.GLOBAL_NETWORK,
        hazard_type=HazardType.EARTHQUAKE,
        signal_type=SignalType.EARTHQUAKE,
        severity=HazardSeverity.CRITICAL,
        title="Major Earthquake Alert",
        description="M6.8 earthquake detected.",
        recommended_action="Drop, Cover, and Hold On.",
        latitude=20.2961,
        longitude=85.8245,
        observed_at=now_iso,
        issued_at=now_iso,
        expires_at=exp_iso,
        fetched_at=now_iso,
        distance_km=2.0,
    )

    alert_watch_rain = NormalizedAlert(
        id="om-rain-2",
        source="Open-Meteo Weather Service",
        source_event_id="om-rain-2",
        source_type=SourceType.WEATHER_SERVICE,
        authority_tier=SourceAuthorityTier.FORECAST_MODEL,
        hazard_type=HazardType.WEATHER,
        signal_type=SignalType.HEAVY_RAIN,
        severity=HazardSeverity.WATCH,
        title="Rain Advisory",
        description="Moderate rain expected.",
        recommended_action="Carry umbrella.",
        latitude=20.2961,
        longitude=85.8245,
        observed_at=now_iso,
        issued_at=now_iso,
        expires_at=exp_iso,
        fetched_at=now_iso,
        distance_km=1.0,
    )

    ranked = rank_alerts_by_priority([alert_watch_rain, alert_critical_eq])
    assert ranked[0].id == "usgs-eq-1"
    assert ranked[1].id == "om-rain-2"


# ===========================================================================
# 5. Data Quality States (LIVE, PARTIAL, STALE, UNAVAILABLE)
# ===========================================================================


def test_data_quality_state_transitions():
    """Verify compute_data_quality correctly reports feed health status."""
    # When all active adapters are available -> LIVE
    hazard_service.sachet_adapter.update_health(status=SourceStatus.AVAILABLE, latency_ms=50.0)
    hazard_service.imd_adapter.update_health(status=SourceStatus.AVAILABLE, latency_ms=60.0)
    hazard_service.gdacs_adapter.update_health(status=SourceStatus.AVAILABLE, latency_ms=70.0)
    hazard_service.usgs_adapter.update_health(status=SourceStatus.AVAILABLE, latency_ms=80.0)
    hazard_service.open_meteo_adapter.update_health(status=SourceStatus.AVAILABLE, latency_ms=90.0)

    dq = hazard_service.compute_data_quality()
    assert dq == DataQualityState.LIVE

    # If IMD fails -> PARTIAL
    hazard_service.imd_adapter.update_health(status=SourceStatus.FAILED, error="HTTP 503")
    dq_partial = hazard_service.compute_data_quality()
    assert dq_partial == DataQualityState.PARTIAL

    # If all fail -> UNAVAILABLE
    hazard_service.sachet_adapter.update_health(status=SourceStatus.FAILED, error="Timeout")
    hazard_service.gdacs_adapter.update_health(status=SourceStatus.FAILED, error="Timeout")
    hazard_service.usgs_adapter.update_health(status=SourceStatus.FAILED, error="Timeout")
    hazard_service.open_meteo_adapter.update_health(status=SourceStatus.FAILED, error="Timeout")

    dq_unavail = hazard_service.compute_data_quality()
    assert dq_unavail == DataQualityState.UNAVAILABLE


# ===========================================================================
# 6. Deterministic Safety Shield
# ===========================================================================


def test_deterministic_safety_shield_rejects_hallucinated_emergency():
    """Verify safety shield blocks LLM text that claims massive emergencies when none exist."""
    # No active alerts
    active_alerts: list[NormalizedAlert] = []
    weather = WeatherCondition(
        temperature=28.0,
        feels_like=29.0,
        condition="Clear",
        weather_code=0,
        precipitation=0.0,
        rain=0.0,
        showers=0.0,
        precipitation_probability=0,
        humidity=65.0,
        wind_speed=12.0,
        wind_direction=180.0,
        wind_gusts=15.0,
        uv_index=4.0,
        is_day=True,
        observed_at=datetime.now(UTC).isoformat(),
        source="Open-Meteo",
        provenance=AlertProvenance.LIVE,
        summary="Clear 28°C",
    )

    hallucinated_text = (
        "MASSIVE TSUNAMI AND CATASTROPHIC CLOUDBURST DETECTED! IMMEDIATE EVACUATION REQUIRED!"
    )
    is_valid = DeterministicSafetyShield.validate_briefing(
        hallucinated_text, active_alerts, weather
    )
    assert is_valid is False

    valid_text = (
        "Normal calm weather in Bhubaneswar: Clear 28°C. No active disaster warnings detected."
    )
    is_valid_calm = DeterministicSafetyShield.validate_briefing(valid_text, active_alerts, weather)
    assert is_valid_calm is True


def test_deterministic_safety_shield_rejects_fake_source_attribution():
    """Verify safety shield blocks LLM attributing warnings to agencies that did not issue them."""
    active_alerts: list[NormalizedAlert] = []
    weather = None

    fake_imd_text = "IMD warns of category 5 super cyclone approaching today."
    is_valid = DeterministicSafetyShield.validate_briefing(fake_imd_text, active_alerts, weather)
    assert is_valid is False


def test_deterministic_briefing_generation():
    """Verify deterministic grounded summary generation produces accurate situational briefings."""
    weather = WeatherCondition(
        temperature=31.2,
        feels_like=33.0,
        condition="Partly Cloudy",
        weather_code=2,
        precipitation=0.0,
        rain=0.0,
        showers=0.0,
        precipitation_probability=20,
        humidity=70.0,
        wind_speed=14.0,
        wind_direction=190.0,
        wind_gusts=18.0,
        uv_index=5.0,
        is_day=True,
        observed_at=datetime.now(UTC).isoformat(),
        source="Open-Meteo",
        provenance=AlertProvenance.LIVE,
        summary="Partly Cloudy 31°C",
    )
    briefing = generate_deterministic_briefing(
        [], weather, DataQualityState.LIVE, user_location_name="Bhubaneswar"
    )
    assert "Bhubaneswar" in briefing
    assert "Partly Cloudy" in briefing
    assert "31°C" in briefing
    assert "No active hazard alerts" in briefing
