"""SACHET / NDMA Real Data Parser Regression & Validation Tests (Phase 2A).

Tests all 10 required regression scenarios, specific Mayurbhanj record validation,
and live endpoint ingestion.
"""

from __future__ import annotations

from datetime import UTC, datetime

import pytest

from app.adapters.sachet import SachetAdapter
from app.models import (
    AlertProvenance,
    HazardSeverity,
    HazardType,
)


@pytest.fixture
def adapter() -> SachetAdapter:
    a = SachetAdapter()
    a.clear_cache()
    return a


# ===========================================================================
# 1. Normal SACHET Record
# ===========================================================================
SAMPLE_SACHET_RECORD = {
    "identifier": "1788205361926012",
    "effective_start_time": "Tue Sep 01 10:00:00 IST 2026",
    "effective_end_time": "Tue Sep 01 13:00:00 IST 2026",
    "disaster_type": "Thunderstorm with Lightning",
    "area_description": "Mayurbhanj district of Odisha",
    "severity": "ALERT",
    "severity_level": "Very Likely",
    "actual_lang": "en",
    "warning_message": (
        "Thunderstorm with lightning and light to moderate rain very likely to occur."
    ),
    "disseminated": "false",
    "severity_color": "orange",
    "alert_id_sdma_autoinc": 143415,
    "centroid": "86.40603026352044,21.89375566796115",
    "alert_source": "IMD Bhubaneswar",
    "area_covered": "1376.55",
    "sender_org_id": "12",
}


def test_1_normal_sachet_record(adapter: SachetAdapter):
    """Verify normal flat SACHET record parses correctly."""
    rec = SAMPLE_SACHET_RECORD
    now = datetime.now(UTC)
    alerts = adapter._parse_sachet_payload([rec], now)

    assert len(alerts) == 1
    alert = alerts[0]
    assert alert.id == "alt-sachet-1788205361926012"
    assert alert.source_event_id == "1788205361926012"
    assert alert.source == "IMD Bhubaneswar"
    assert alert.hazard_type == HazardType.WEATHER
    assert alert.raw_type == "Thunderstorm with Lightning"
    assert alert.severity == HazardSeverity.WARNING
    assert alert.latitude == pytest.approx(21.89375566796115, rel=1e-5)
    assert alert.longitude == pytest.approx(86.40603026352044, rel=1e-5)
    assert alert.affected_area == "Mayurbhanj district of Odisha"
    assert "Thunderstorm with lightning" in alert.description
    assert alert.starts_at is not None and "2026-09-01" in alert.starts_at
    assert alert.expires_at is not None and "2026-09-01" in alert.expires_at


# ===========================================================================
# 2. Centroid Parsing
# ===========================================================================
def test_2_centroid_parsing(adapter: SachetAdapter):
    """Verify centroid coordinate string is parsed accurately into floats."""
    rec = {
        "identifier": "1002",
        "centroid": "87.00296284325913,21.71180510164082",
        "area_description": "Baleshwar",
        "disaster_type": "Flood",
        "severity_color": "yellow",
    }
    alert = adapter._normalize_single_record(rec, datetime.now(UTC), datetime.now(UTC).isoformat())
    assert alert is not None
    assert alert.latitude == pytest.approx(21.71180510164082, rel=1e-6)
    assert alert.longitude == pytest.approx(87.00296284325913, rel=1e-6)


# ===========================================================================
# 3. Longitude / Latitude Order (CRITICAL: LON,LAT -> LAT,LON)
# ===========================================================================
def test_3_longitude_latitude_order(adapter: SachetAdapter):
    """Verify that SACHET centroid LON,LAT is never reversed into LAT,LON."""
    # Indian longitudes ~68-97E, latitudes ~8-37N
    rec = {
        "identifier": "1003",
        "centroid": "85.8245,20.2961",  # 85.8245=LON (Bhubaneswar), 20.2961=LAT
        "disaster_type": "Heavy Rain",
    }
    alert = adapter._normalize_single_record(rec, datetime.now(UTC), datetime.now(UTC).isoformat())
    assert alert is not None
    # Latitude must be 20.2961, NOT 85.8245
    assert alert.latitude == pytest.approx(20.2961, rel=1e-4)
    # Longitude must be 85.8245, NOT 20.2961
    assert alert.longitude == pytest.approx(85.8245, rel=1e-4)
    assert alert.latitude < 40.0
    assert alert.longitude > 60.0


# ===========================================================================
# 4. District Warning
# ===========================================================================
def test_4_district_warning(adapter: SachetAdapter):
    """Verify single-district warning descriptions are retained."""
    rec = {
        "identifier": "1004",
        "area_description": "Cuttack district of Odisha",
        "disaster_type": "Moderate Rain",
        "centroid": "85.8828,20.4625",
    }
    alert = adapter._normalize_single_record(rec, datetime.now(UTC), datetime.now(UTC).isoformat())
    assert alert is not None
    assert alert.affected_area == "Cuttack district of Odisha"


# ===========================================================================
# 5. Multiple-District Area
# ===========================================================================
def test_5_multiple_district_area(adapter: SachetAdapter):
    """Verify multi-district warnings are preserved without truncation."""
    rec = {
        "identifier": "1005",
        "area_description": "Mayurbhanj,Baleshwar,Bhadrak,Jajpur",
        "disaster_type": "Squall Gale Winds",
        "centroid": "86.5000,21.2000",
    }
    alert = adapter._normalize_single_record(rec, datetime.now(UTC), datetime.now(UTC).isoformat())
    assert alert is not None
    assert alert.affected_area == "Mayurbhanj,Baleshwar,Bhadrak,Jajpur"


# ===========================================================================
# 6. Hindi Warning Message (Unicode Preservation)
# ===========================================================================
def test_6_hindi_warning(adapter: SachetAdapter):
    """Verify Hindi Unicode text is preserved without character corruption."""
    hindi_msg = "मयूरभंज और बालेश्वर जिलों में मध्यम वर्षा और मेघगर्जन की संभावना है।"
    rec = {
        "identifier": "1006",
        "disaster_type": "मेघगर्जन",
        "area_description": "मयूरभंज",
        "actual_lang": "hi",
        "warning_message": hindi_msg,
        "centroid": "86.4060,21.8937",
    }
    alert = adapter._normalize_single_record(rec, datetime.now(UTC), datetime.now(UTC).isoformat())
    assert alert is not None
    assert alert.description == hindi_msg
    # Ensure evidence preserves actual_lang
    assert alert.evidence_sources[0]["actual_lang"] == "hi"


# ===========================================================================
# 7. Severity Color Mapping & Not Escalating ALERT to CRITICAL
# ===========================================================================
def test_7_severity_color(adapter: SachetAdapter):
    """Verify color codes map to Salvus severity and ALERT maps to WARNING, not CRITICAL."""
    # Orange / ALERT -> WARNING
    rec_orange = {
        "identifier": "sev-1",
        "disaster_type": "Thunderstorm",
        "severity_color": "orange",
        "severity": "ALERT",
    }
    alt_o = adapter._normalize_single_record(
        rec_orange, datetime.now(UTC), datetime.now(UTC).isoformat()
    )
    assert alt_o.severity == HazardSeverity.WARNING

    # Red / WARNING -> CRITICAL
    rec_red = {
        "identifier": "sev-2",
        "disaster_type": "Cyclone",
        "severity_color": "red",
        "severity": "WARNING",
    }
    alt_r = adapter._normalize_single_record(
        rec_red, datetime.now(UTC), datetime.now(UTC).isoformat()
    )
    assert alt_r.severity == HazardSeverity.CRITICAL

    # Yellow / WATCH -> WATCH
    rec_yellow = {
        "identifier": "sev-3",
        "disaster_type": "Rain",
        "severity_color": "yellow",
        "severity": "WATCH",
    }
    alt_y = adapter._normalize_single_record(
        rec_yellow, datetime.now(UTC), datetime.now(UTC).isoformat()
    )
    assert alt_y.severity == HazardSeverity.WATCH

    # Plain "ALERT" text without color must NOT be CRITICAL
    rec_alert_only = {
        "identifier": "sev-4",
        "disaster_type": "Rain",
        "severity": "ALERT",
    }
    alt_a = adapter._normalize_single_record(
        rec_alert_only, datetime.now(UTC), datetime.now(UTC).isoformat()
    )
    assert alt_a.severity == HazardSeverity.WARNING


# ===========================================================================
# 8. Missing Centroid (Area Support - Do Not Discard Record)
# ===========================================================================
def test_8_missing_centroid(adapter: SachetAdapter):
    """Verify record with missing centroid is NOT discarded; area is preserved."""
    rec = {
        "identifier": "1008",
        "area_description": "Sundargarh district of Odisha",
        "disaster_type": "Heatwave",
        "severity_color": "yellow",
        # Centroid intentionally omitted
    }
    alert = adapter._normalize_single_record(rec, datetime.now(UTC), datetime.now(UTC).isoformat())
    assert alert is not None
    assert alert.latitude is None
    assert alert.longitude is None
    assert alert.affected_area == "Sundargarh district of Odisha"


# ===========================================================================
# 9. Missing Severity (No Fabricated Severity)
# ===========================================================================
def test_9_missing_severity(adapter: SachetAdapter):
    """Verify missing severity fields do not crash and are not fabricated into CRITICAL."""
    rec = {
        "identifier": "1009",
        "disaster_type": "Unknown Event",
        "area_description": "Odisha Zone",
        # severity, severity_color, severity_level all omitted
    }
    alert = adapter._normalize_single_record(rec, datetime.now(UTC), datetime.now(UTC).isoformat())
    assert alert is not None
    assert alert.severity is None


# ===========================================================================
# 10. Missing Message
# ===========================================================================
def test_10_missing_message(adapter: SachetAdapter):
    """Verify missing warning message does not crash parser."""
    rec = {
        "identifier": "1010",
        "disaster_type": "High Wind",
        "area_description": "Puri Coastal",
        # warning_message omitted
    }
    alert = adapter._normalize_single_record(rec, datetime.now(UTC), datetime.now(UTC).isoformat())
    assert alert is not None
    assert alert.description is not None
    assert "High Wind" in alert.description


# ===========================================================================
# 11. Specific Validation: Known Mayurbhanj Record
# ===========================================================================
def test_11_specific_validation_known_mayurbhanj_record(adapter: SachetAdapter):
    """Verify the known real Mayurbhanj record matches exact specified criteria."""
    rec = {
        "identifier": "1788205361926012",
        "area_description": "Mayurbhanj district of Odisha",
        "alert_source": "IMD Bhubaneswar",
        "severity_color": "orange",
        "severity": "ALERT",
        "centroid": "86.40603026352044,21.89375566796115",
        "disaster_type": "Thunderstorm with Lightning",
        "warning_message": "Thunderstorm with lightning very likely over Mayurbhanj.",
    }
    alert = adapter._normalize_single_record(rec, datetime.now(UTC), datetime.now(UTC).isoformat())
    assert alert is not None

    # Expected Normalized Output:
    assert alert.latitude == pytest.approx(21.89375566796115, rel=1e-5)
    assert alert.longitude == pytest.approx(86.40603026352044, rel=1e-5)
    assert alert.source == "IMD Bhubaneswar"
    assert alert.affected_area == "Mayurbhanj district of Odisha"
    assert alert.severity == HazardSeverity.WARNING


# ===========================================================================
# 12. Real Data Test: Live Endpoint
# ===========================================================================
@pytest.mark.asyncio
async def test_12_live_sachet_endpoint():
    """Verify live SACHET endpoint fetches and normalizes ~66-88 alerts (never 0)."""
    adapter = SachetAdapter()
    alerts, prov = await adapter.fetch_alerts(timeout=12.0)

    assert prov == AlertProvenance.LIVE
    assert len(alerts) > 0, "Current Salvus parser returned 0 alerts! Must not be 0."
    print(f"\nLive SACHET Ingestion: parsed {len(alerts)} alerts successfully.")

    # Verify at least some alerts have coordinates and affected areas
    with_coords = [a for a in alerts if a.latitude is not None and a.longitude is not None]
    assert len(with_coords) > 0
    assert len(with_coords) == len(alerts)  # Centroid present across live records
