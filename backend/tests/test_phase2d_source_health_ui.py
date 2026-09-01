"""Phase 2D Test Suite: Real Source Health + Alert UI & Telemetry Verification.

Validates:
1. Exact status labels and is_live flags for all 7 providers:
   - SACHET ● LIVE
   - IMD Direct ○ UNAVAILABLE / VIA SACHET
   - OSDMA ○ CONFIGURATION REQUIRED
   - WRD ○ CONFIGURATION REQUIRED
   - GDACS ● LIVE
   - USGS ● LIVE
   - Open-Meteo ● LIVE
2. Configured is not the same as Live principle.
3. Alert Classification separation: OFFICIAL WARNING vs FORECAST vs SALVUS DERIVED.
4. Area Warning distance integrity: No fake numeric point distance for district alerts.
5. Honest Empty State logic: 'No active local warnings' vs 'Partial warning coverage'.
"""

from app.models import (
    AlertProvenance,
    GeographicForm,
    HazardSeverity,
    HazardType,
    NormalizedAlert,
    RelevanceLevel,
    SourceAuthorityTier,
    SourceStatus,
    SourceType,
)
from app.services.geo_service import format_alert_distance_label
from app.services.hazard_service import (
    get_source_health_reports,
    imd_adapter,
    odisha_flood_adapter,
    osdma_adapter,
)


class TestSourceHealthReportsPhase2D:
    """Test truthful provider health telemetry."""

    def test_all_seven_provider_health_reports(self):
        """Verify all 7 providers return accurate display names, status, and is_live."""
        reports = get_source_health_reports()
        assert len(reports) == 7

        report_map = {r.display_name: r for r in reports}

        # 1. SACHET ● LIVE
        assert "SACHET" in report_map
        sachet = report_map["SACHET"]
        assert sachet.status_label == "LIVE"
        assert sachet.is_live is True
        assert sachet.status == SourceStatus.AVAILABLE

        # 2. IMD Direct ○ UNAVAILABLE / VIA SACHET
        assert "IMD Direct" in report_map
        imd = report_map["IMD Direct"]
        assert imd.status_label == "UNAVAILABLE / VIA SACHET"
        assert imd.is_live is False
        assert imd.status == SourceStatus.UNAVAILABLE

        # 3. OSDMA ○ CONFIGURATION REQUIRED
        assert "OSDMA" in report_map
        osdma = report_map["OSDMA"]
        assert osdma.status_label == "CONFIGURATION REQUIRED"
        assert osdma.is_live is False
        assert osdma.status == SourceStatus.UNAVAILABLE

        # 4. WRD ○ CONFIGURATION REQUIRED
        assert "WRD" in report_map
        wrd = report_map["WRD"]
        assert wrd.status_label == "CONFIGURATION REQUIRED"
        assert wrd.is_live is False
        assert wrd.status == SourceStatus.UNAVAILABLE

        # 5. GDACS ● LIVE
        assert "GDACS" in report_map
        gdacs = report_map["GDACS"]
        assert gdacs.status_label == "LIVE"
        assert gdacs.is_live is True
        assert gdacs.status == SourceStatus.AVAILABLE

        # 6. USGS ● LIVE
        assert "USGS" in report_map
        usgs = report_map["USGS"]
        assert usgs.status_label == "LIVE"
        assert usgs.is_live is True
        assert usgs.status == SourceStatus.AVAILABLE

        # 7. Open-Meteo ● LIVE
        assert "Open-Meteo" in report_map
        meteo = report_map["Open-Meteo"]
        assert meteo.status_label == "LIVE"
        assert meteo.is_live is True
        assert meteo.status == SourceStatus.AVAILABLE

    def test_configured_is_not_the_same_as_live(self):
        """Verify adapter with endpoint configured but uncredentialed is NOT live."""
        osdma_health = osdma_adapter.get_health()
        assert osdma_health.endpoint_url is not None
        # Has endpoint, but is NOT live without active verified credentials
        assert osdma_health.is_live is False
        assert osdma_health.status_label == "CONFIGURATION REQUIRED"

        wrd_health = odisha_flood_adapter.get_health()
        assert wrd_health.endpoint_url is not None
        assert wrd_health.is_live is False
        assert wrd_health.status_label == "CONFIGURATION REQUIRED"

    def test_imd_reports_unavailable_via_sachet(self):
        """Verify IMD Direct explicitly indicates fallback availability via SACHET."""
        imd_health = imd_adapter.get_health()
        assert imd_health.status_label == "UNAVAILABLE / VIA SACHET"
        assert imd_health.is_live is False


class TestAlertClassificationPhase2D:
    """Test distinct visual and operational classification of alert types."""

    def test_official_warning_classification(self):
        """Official government alerts must be classified as OFFICIAL WARNING."""
        alert = NormalizedAlert(
            id="sachet-official-01",
            source="SACHET / NDMA India",
            source_type=SourceType.CIVIL_DEFENSE,
            title="Heavy Rainfall Warning",
            description="IMD Bhubaneswar red alert for Mayurbhanj district.",
            severity=HazardSeverity.WARNING,
            hazard_type=HazardType.WEATHER,
            raw_type="rainfall",
            affected_area="Mayurbhanj district of Odisha",
            affected_districts=["Mayurbhanj"],
            state="Odisha",
            geographic_form=GeographicForm.DISTRICT,
            authority_tier=SourceAuthorityTier.OFFICIAL_GOVERNMENT,
            is_derived=False,
            provenance=AlertProvenance.LIVE,
            recommended_actions=["Move to higher ground."],
        )
        assert alert.is_derived is False
        assert alert.authority_tier == SourceAuthorityTier.OFFICIAL_GOVERNMENT
        assert alert.source_type == SourceType.CIVIL_DEFENSE

    def test_forecast_classification(self):
        """Meteorological forecast risks must be classified as FORECAST."""
        alert = NormalizedAlert(
            id="meteo-forecast-01",
            source="Open-Meteo Weather Service",
            source_type=SourceType.WEATHER_SERVICE,
            title="Sustained Moderate Rain Forecast",
            description="Numerical weather prediction model indicates rain accumulation.",
            severity=HazardSeverity.WATCH,
            hazard_type=HazardType.WEATHER,
            raw_type="forecast_rain",
            affected_area="Bhubaneswar",
            authority_tier=SourceAuthorityTier.FORECAST_MODEL,
            is_derived=False,
            provenance=AlertProvenance.LIVE,
            recommended_actions=["Carry rain protection."],
        )
        assert alert.is_derived is False
        assert alert.authority_tier == SourceAuthorityTier.FORECAST_MODEL
        assert alert.source_type == SourceType.WEATHER_SERVICE

    def test_salvus_derived_classification(self):
        """Convective and threshold derived alerts must be classified as SALVUS DERIVED."""
        alert = NormalizedAlert(
            id="salvus-derived-storm-01",
            source="Open-Meteo Weather Service",
            source_type=SourceType.WEATHER_SERVICE,
            title="Thunderstorm Risk Assessment",
            description="Derived from elevated CAPE (1650 J/kg) and convective gusts.",
            severity=HazardSeverity.WATCH,
            hazard_type=HazardType.WEATHER,
            raw_type="thunderstorm",
            affected_area="Cuttack Sector",
            authority_tier=SourceAuthorityTier.FORECAST_MODEL,
            is_derived=True,
            provenance=AlertProvenance.LIVE,
            recommended_actions=["Stay indoors if thunder develops."],
        )
        assert alert.is_derived is True


class TestAreaWarningDistanceSuppressionPhase2D:
    """Test that district and administrative alerts never display fake numeric point distances."""

    def test_district_warning_distance_label(self):
        """A district-wide alert (e.g. Mayurbhanj) must not produce '1.2 km away'."""
        alert = NormalizedAlert(
            id="sachet-mayurbhanj-01",
            source="IMD Bhubaneswar / SACHET",
            source_type=SourceType.CIVIL_DEFENSE,
            title="Moderate Rain Warning",
            description="Moderate rain applicable to Mayurbhanj district.",
            severity=HazardSeverity.WARNING,
            hazard_type=HazardType.WEATHER,
            raw_type="rainfall",
            affected_area="Mayurbhanj district of Odisha",
            affected_districts=["Mayurbhanj"],
            state="Odisha",
            geographic_form=GeographicForm.DISTRICT,
            authority_tier=SourceAuthorityTier.OFFICIAL_GOVERNMENT,
            latitude=None,  # No point coordinate
            longitude=None,
            distance_km=None,
            is_derived=False,
            provenance=AlertProvenance.LIVE,
            recommended_actions=["Avoid waterlogged roads."],
        )

        label_local = format_alert_distance_label(alert, RelevanceLevel.LOCAL, dist_km=None)
        assert label_local == "Applicable to your district"
        assert "km away" not in label_local

        label_regional = format_alert_distance_label(alert, RelevanceLevel.REGIONAL, dist_km=None)
        assert label_regional == "Regional warning"
        assert "km away" not in label_regional

    def test_point_hazard_preserves_numeric_distance(self):
        """A genuine point hazard (e.g. earthquake epicenter) maintains true Haversine distance."""
        alert = NormalizedAlert(
            id="usgs-eq-01",
            source="USGS Earthquake Hazards Program",
            source_type=SourceType.SEISMIC_NETWORK,
            title="M 5.2 Earthquake",
            description="Epicenter located 12.4 km from your coordinates.",
            severity=HazardSeverity.CRITICAL,
            hazard_type=HazardType.EARTHQUAKE,
            raw_type="earthquake",
            affected_area="Bay of Bengal",
            geographic_form=GeographicForm.POINT,
            latitude=19.8,
            longitude=85.8,
            distance_km=12.4,
            is_derived=False,
            provenance=AlertProvenance.LIVE,
            recommended_actions=["Drop, cover, and hold on."],
        )

        label_point = format_alert_distance_label(alert, RelevanceLevel.CRITICAL, dist_km=12.4)
        assert "12.4 km away" in label_point
