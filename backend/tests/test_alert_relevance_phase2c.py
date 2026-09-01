"""SALVUS ALERT SYSTEM — PHASE 2C TEST MATRIX
(Point + Circle + Polygon + District/Administrative Area Alert Relevance).

Tests:
1. POINT: Haversine distance, numeric distance display.
2. CIRCLE: Center + radius spatial containment & buffer.
3. POLYGON: Point-in-polygon Ray-Casting & boundary distance.
4. DISTRICT: Single district (Sachet Mayurbhanj Test):
   - User inside Mayurbhanj -> LOCAL ('Applicable to your district', dist=None)
   - User outside Mayurbhanj in Odisha -> REGIONAL ('Regional warning', dist=None)
   - User outside Odisha -> IRRELEVANT
   - Normalization removes harmless differences ('Mayurbhanj' vs 'Mayurbhanj district of Odisha')
5. MULTIPLE DISTRICTS: Multi-district warning (Ranchi, Gumla, etc.) matched independently.
6. STATE: State-wide warning (user in state -> REGIONAL, user outside -> IRRELEVANT).
7. UNKNOWN: Missing geometry / unresolvable administrative area returns UNKNOWN,
   NOT IRRELEVANT, and no fake coordinates.
8. OUTSIDE: Citizen far outside point, circle, polygon, or district receives IRRELEVANT.
9. EXPIRED: Expired alert past expires_at is excluded.
10. DUPLICATE: Duplicate alerts by ID and cross-source district/time overlap deduplicated cleanly.
"""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

import httpx
import pytest

from app.models import (
    GeographicForm,
    HazardSeverity,
    HazardType,
    NormalizedAlert,
    RelevanceLevel,
    SourceType,
)
from app.services.geo_service import (
    determine_geographic_form,
    evaluate_alert_relevance,
    format_alert_distance_label,
    is_point_in_polygon,
    normalize_district_name,
    parse_administrative_area,
    resolve_district_from_coords,
)
from app.services.hazard_service import (
    clear_hazard_cache,
    deduplicate_alerts,
    get_active_hazards,
)


@pytest.fixture(autouse=True)
def reset_caches():
    """Ensure clean caches before each test."""
    clear_hazard_cache()
    yield
    clear_hazard_cache()


# ===========================================================================
# 1. POINT Relevance
# ===========================================================================
def test_1_point_relevance():
    """Verify POINT alerts use existing Haversine distance and display calculated distance."""
    now_iso = datetime.now(UTC).isoformat()
    future_iso = (datetime.now(UTC) + timedelta(hours=4)).isoformat()

    # Point hazard: Downed High-Voltage Power Line at fixed GPS coordinates
    # radius_km = 0.0 indicates a single point coordinate
    point_alert = NormalizedAlert(
        id="alt-pt-wire-01",
        source="Municipal Power Telemetry",
        source_event_id="pw-991",
        source_type=SourceType.MUNICIPAL_TELEMETRY,
        hazard_type=HazardType.INFRASTRUCTURE,
        severity=HazardSeverity.CRITICAL,
        title="Downed Live Electrical Cable",
        description="Hazardous electrical wire down at coordinates.",
        latitude=22.5726,
        longitude=88.3639,
        radius_km=0.0,
        observed_at=now_iso,
        issued_at=now_iso,
        expires_at=future_iso,
    )

    assert determine_geographic_form(point_alert) == GeographicForm.POINT

    # A. Citizen 1.2 km away: within immediate danger perimeter
    cit_lat, cit_lon = 22.5830, 88.3639
    rel_close, dist_close, is_in_close = evaluate_alert_relevance(point_alert, cit_lat, cit_lon)
    assert rel_close == RelevanceLevel.IMMEDIATE
    assert dist_close is not None and 1.0 <= dist_close <= 1.5
    label_close = format_alert_distance_label(point_alert, rel_close, dist_close)
    assert label_close is not None and "km away" in label_close

    # B. Citizen 8.0 km away: local sector awareness
    cit_lat_mid, cit_lon_mid = 22.6450, 88.3639
    rel_mid, dist_mid, _ = evaluate_alert_relevance(point_alert, cit_lat_mid, cit_lon_mid)
    assert rel_mid == RelevanceLevel.LOCAL
    assert dist_mid is not None and 7.0 <= dist_mid <= 9.0

    # C. Citizen 120 km away: far outside
    cit_lat_far, cit_lon_far = 23.5000, 88.3639
    rel_far, dist_far, _ = evaluate_alert_relevance(point_alert, cit_lat_far, cit_lon_far)
    assert rel_far == RelevanceLevel.IRRELEVANT
    assert dist_far is not None and dist_far > 100.0


# ===========================================================================
# 2. CIRCLE Relevance
# ===========================================================================
def test_2_circle_relevance():
    """Verify CIRCLE alerts use center + radius containment and calculated distance."""
    now_iso = datetime.now(UTC).isoformat()
    future_iso = (datetime.now(UTC) + timedelta(hours=4)).isoformat()

    circle_alert = NormalizedAlert(
        id="alt-circ-flood-01",
        source="Water Resources Dept",
        source_event_id="wrd-101",
        source_type=SourceType.CIVIL_DEFENSE,
        hazard_type=HazardType.FLOOD,
        severity=HazardSeverity.CRITICAL,
        title="Canal Surge Red Alert",
        description="Drainage basin overflow.",
        latitude=22.5700,
        longitude=88.3600,
        radius_km=10.0,
        observed_at=now_iso,
        issued_at=now_iso,
        expires_at=future_iso,
    )

    assert determine_geographic_form(circle_alert) == GeographicForm.CIRCLE

    # Inside circle: 3 km from center (radius = 10 km)
    rel_in, dist_in, is_in = evaluate_alert_relevance(circle_alert, 22.5900, 88.3600)
    assert is_in is True
    assert dist_in is not None and dist_in <= 10.0
    assert rel_in == RelevanceLevel.IMMEDIATE
    label_in = format_alert_distance_label(circle_alert, rel_in, dist_in)
    assert label_in is not None and "km away" in label_in

    # Buffer zone: 13 km from center (within 1.5 * radius = 15 km)
    rel_buf, dist_buf, is_in_buf = evaluate_alert_relevance(circle_alert, 22.6850, 88.3600)
    assert is_in_buf is False
    assert dist_buf is not None and 10.0 < dist_buf <= 15.0
    assert rel_buf == RelevanceLevel.LOCAL

    # Far outside: 80 km from center
    rel_out, dist_out, is_in_out = evaluate_alert_relevance(circle_alert, 23.3000, 88.3600)
    assert is_in_out is False
    assert rel_out == RelevanceLevel.IRRELEVANT


# ===========================================================================
# 3. POLYGON Relevance
# ===========================================================================
def test_3_polygon_relevance():
    """Verify POLYGON alerts use Ray-Casting point-in-polygon and boundary distance."""
    now_iso = datetime.now(UTC).isoformat()
    future_iso = (datetime.now(UTC) + timedelta(hours=4)).isoformat()

    polygon_coords = [
        [22.5600, 88.4200],
        [22.5900, 88.4200],
        [22.5900, 88.4500],
        [22.5600, 88.4500],
    ]

    poly_alert = NormalizedAlert(
        id="alt-poly-hooghly",
        source="Disaster Management Authority",
        source_event_id="poly-hg-01",
        source_type=SourceType.CIVIL_DEFENSE,
        hazard_type=HazardType.FLOOD,
        severity=HazardSeverity.CRITICAL,
        title="Hooghly Tidal Inundation",
        description="High tide surge polygon.",
        geometry=polygon_coords,
        observed_at=now_iso,
        issued_at=now_iso,
        expires_at=future_iso,
    )

    assert determine_geographic_form(poly_alert) == GeographicForm.POLYGON

    # A. User inside polygon
    cit_inside_lat, cit_inside_lon = 22.5750, 88.4350
    assert is_point_in_polygon(cit_inside_lat, cit_inside_lon, polygon_coords) is True
    rel_poly_in, dist_poly_in, is_in = evaluate_alert_relevance(
        poly_alert, cit_inside_lat, cit_inside_lon
    )
    assert is_in is True
    assert dist_poly_in == 0.0
    assert rel_poly_in == RelevanceLevel.IMMEDIATE
    label_poly_in = format_alert_distance_label(poly_alert, rel_poly_in, dist_poly_in)
    assert label_poly_in == "Within affected area"

    # B. User outside polygon near boundary (~2.5 km west)
    cit_near_lat, cit_near_lon = 22.5750, 88.3950
    assert is_point_in_polygon(cit_near_lat, cit_near_lon, polygon_coords) is False
    rel_near, dist_near, is_near_in = evaluate_alert_relevance(
        poly_alert, cit_near_lat, cit_near_lon
    )
    assert is_near_in is False
    assert dist_near is not None and 1.5 <= dist_near <= 4.0
    assert rel_near == RelevanceLevel.LOCAL

    # C. User far away (~120 km)
    rel_far, dist_far, _ = evaluate_alert_relevance(poly_alert, 23.5000, 87.5000)
    assert rel_far == RelevanceLevel.IRRELEVANT


# ===========================================================================
# 4. DISTRICT Relevance (SACHET Mayurbhanj Test)
# ===========================================================================
def test_4_district_relevance_sachet_mayurbhanj():
    """Verify live SACHET Mayurbhanj alert relevance:
    - User inside Mayurbhanj -> relevant (LOCAL)
    - User outside Mayurbhanj in Odisha -> not local (REGIONAL)
    - User outside Odisha -> IRRELEVANT
    - Normalization removes naming differences ('Mayurbhanj' vs 'Mayurbhanj district')
    - No fake numeric distance; shows 'Applicable to your district' or 'Regional warning'
    - Proves no fake coordinates are introduced.
    """
    now_iso = datetime.now(UTC).isoformat()
    future_iso = (datetime.now(UTC) + timedelta(hours=3)).isoformat()

    # Alert accurately reflects real SACHET administrative warning:
    # Latitude and longitude are None: NO fake coordinates or static Odisha centroids!
    sachet_alert = NormalizedAlert(
        id="alt-sachet-mayurbhanj",
        source="IMD Bhubaneswar",
        source_event_id="1788205361926012",
        source_type=SourceType.CIVIL_DEFENSE,
        hazard_type=HazardType.WEATHER,
        severity=HazardSeverity.WARNING,
        title="Thunderstorm with Lightning",
        description="Thunderstorm with lightning very likely over Mayurbhanj district.",
        affected_area="Mayurbhanj district of Odisha",
        affected_districts=["Mayurbhanj"],
        state="Odisha",
        latitude=None,  # No fake coordinate!
        longitude=None,  # No fake coordinate!
        observed_at=now_iso,
        issued_at=now_iso,
        expires_at=future_iso,
    )

    # 1. Geographic Form must be DISTRICT
    assert determine_geographic_form(sachet_alert) == GeographicForm.DISTRICT
    assert sachet_alert.latitude is None
    assert sachet_alert.longitude is None

    # 2. Normalization verification
    assert normalize_district_name("Mayurbhanj") == "mayurbhanj"
    assert normalize_district_name("Mayurbhanj district of Odisha") == "mayurbhanj"
    parsed_dists, parsed_st = parse_administrative_area("Mayurbhanj district of Odisha")
    assert parsed_dists == ["Mayurbhanj"]
    assert parsed_st == "Odisha"

    # 3. User inside Mayurbhanj (GPS at Baripada, Mayurbhanj, Odisha)
    # Real GPS ~ (21.93, 86.73)
    user_mb_lat, user_mb_lon = 21.9320, 86.7380
    resolved_dist, resolved_st = resolve_district_from_coords(user_mb_lat, user_mb_lon)
    assert resolved_dist == "Mayurbhanj"
    assert resolved_st == "Odisha"

    rel_mb, dist_mb, is_in_mb = evaluate_alert_relevance(
        sachet_alert, user_mb_lat, user_mb_lon, user_district=resolved_dist, user_state=resolved_st
    )
    assert is_in_mb is True
    assert rel_mb == RelevanceLevel.LOCAL
    assert dist_mb is None  # CRITICAL: No fake numeric distance!
    label_mb = format_alert_distance_label(sachet_alert, rel_mb, dist_mb)
    assert label_mb == "Applicable to your district"

    # 4. User outside Mayurbhanj, but in Odisha (GPS at Bhubaneswar, Khordha, Odisha)
    # Real GPS ~ (20.2961, 85.8245)
    user_bbsr_lat, user_bbsr_lon = 20.2961, 85.8245
    bbsr_dist, bbsr_st = resolve_district_from_coords(user_bbsr_lat, user_bbsr_lon)
    assert bbsr_dist == "Khordha"
    assert bbsr_st == "Odisha"

    rel_bbsr, dist_bbsr, is_in_bbsr = evaluate_alert_relevance(
        sachet_alert, user_bbsr_lat, user_bbsr_lon, user_district=bbsr_dist, user_state=bbsr_st
    )
    assert is_in_bbsr is False
    assert rel_bbsr == RelevanceLevel.REGIONAL  # Not local!
    assert dist_bbsr is None  # CRITICAL: No fake numeric distance!
    label_bbsr = format_alert_distance_label(sachet_alert, rel_bbsr, dist_bbsr)
    assert label_bbsr == "Regional warning"

    # 5. User outside Odisha (GPS at New Delhi: 28.6139, 77.2090)
    delhi_dist, delhi_st = resolve_district_from_coords(28.6139, 77.2090)
    assert delhi_st == "Delhi"

    rel_delhi, dist_delhi, is_in_delhi = evaluate_alert_relevance(
        sachet_alert, 28.6139, 77.2090, user_district=delhi_dist, user_state=delhi_st
    )
    assert is_in_delhi is False
    assert rel_delhi == RelevanceLevel.IRRELEVANT
    assert dist_delhi is None


# ===========================================================================
# 5. MULTIPLE DISTRICTS Warning
# ===========================================================================
def test_5_multiple_districts_warning():
    """Verify multi-district warning matching:
    Example: Ranchi, Gumla, Khunti, Lohardaga, Ramgarh, West Singhbhum
    Represented as affected_districts and matched independently.
    """
    now_iso = datetime.now(UTC).isoformat()
    future_iso = (datetime.now(UTC) + timedelta(hours=5)).isoformat()

    multi_alert = NormalizedAlert(
        id="alt-jharkhand-multi",
        source="Jharkhand State Disaster Management Authority",
        source_event_id="jsdma-fl-44",
        source_type=SourceType.CIVIL_DEFENSE,
        hazard_type=HazardType.WEATHER,
        severity=HazardSeverity.WARNING,
        title="Heavy Rain & Squall Warning",
        description="Squall over multiple districts.",
        affected_area="Ranchi, Gumla, Khunti, Lohardaga, Ramgarh, West Singhbhum",
        affected_districts=[
            "Ranchi",
            "Gumla",
            "Khunti",
            "Lohardaga",
            "Ramgarh",
            "West Singhbhum",
        ],
        state="Jharkhand",
        latitude=None,  # No fake coordinate!
        longitude=None,
        observed_at=now_iso,
        issued_at=now_iso,
        expires_at=future_iso,
    )

    assert len(multi_alert.affected_districts) == 6

    # A. User in Khunti (district in list) -> LOCAL
    khunti_lat, khunti_lon = 23.0700, 85.2800
    k_dist, k_st = resolve_district_from_coords(khunti_lat, khunti_lon)
    assert k_dist == "Khunti"
    rel_k, dist_k, in_k = evaluate_alert_relevance(
        multi_alert, khunti_lat, khunti_lon, user_district=k_dist, user_state=k_st
    )
    assert in_k is True
    assert rel_k == RelevanceLevel.LOCAL
    assert dist_k is None
    assert format_alert_distance_label(multi_alert, rel_k, dist_k) == "Applicable to your district"

    # B. User in Lohardaga (district in list) -> LOCAL
    lohar_lat, lohar_lon = 23.4300, 84.6800
    l_dist, l_st = resolve_district_from_coords(lohar_lat, lohar_lon)
    assert l_dist == "Lohardaga"
    rel_l, dist_l, in_l = evaluate_alert_relevance(
        multi_alert, lohar_lat, lohar_lon, user_district=l_dist, user_state=l_st
    )
    assert in_l is True
    assert rel_l == RelevanceLevel.LOCAL
    assert dist_l is None

    # C. User in Bokaro (in same state Jharkhand, but NOT in affected_districts list) -> REGIONAL
    bokaro_lat, bokaro_lon = 23.6600, 86.1500
    b_dist, b_st = resolve_district_from_coords(bokaro_lat, bokaro_lon)
    assert b_dist == "Bokaro"
    assert b_st == "Jharkhand"
    rel_b, dist_b, in_b = evaluate_alert_relevance(
        multi_alert, bokaro_lat, bokaro_lon, user_district=b_dist, user_state=b_st
    )
    assert in_b is False
    assert rel_b == RelevanceLevel.REGIONAL
    assert dist_b is None
    assert format_alert_distance_label(multi_alert, rel_b, dist_b) == "Regional warning"

    # D. User in Cuttack (in different state Odisha) -> IRRELEVANT
    cuttack_lat, cuttack_lon = 20.4600, 85.8800
    c_dist, c_st = resolve_district_from_coords(cuttack_lat, cuttack_lon)
    assert c_st == "Odisha"
    rel_c, dist_c, in_c = evaluate_alert_relevance(
        multi_alert, cuttack_lat, cuttack_lon, user_district=c_dist, user_state=c_st
    )
    assert in_c is False
    assert rel_c == RelevanceLevel.IRRELEVANT
    assert dist_c is None


# ===========================================================================
# 6. STATE Level Warning
# ===========================================================================
def test_6_state_level_warning():
    """Verify state-wide disaster warnings without specific district lists."""
    now_iso = datetime.now(UTC).isoformat()
    state_alert = NormalizedAlert(
        id="alt-state-odisha",
        source="OSDMA / SATARK",
        source_event_id="osdma-st-01",
        source_type=SourceType.CIVIL_DEFENSE,
        hazard_type=HazardType.CYCLONE,
        severity=HazardSeverity.WARNING,
        title="State-Wide Coastal Cyclone Watch",
        description="Coastal districts across Odisha under watch.",
        affected_area="Odisha",
        state="Odisha",
        latitude=None,
        longitude=None,
        observed_at=now_iso,
        issued_at=now_iso,
        expires_at=(datetime.now(UTC) + timedelta(hours=6)).isoformat(),
    )

    # Citizen in Sundargarh, Odisha
    rel_sun, dist_sun, in_sun = evaluate_alert_relevance(
        state_alert, 22.1200, 84.0300, user_district="Sundargarh", user_state="Odisha"
    )
    assert rel_sun == RelevanceLevel.REGIONAL
    assert dist_sun is None
    assert format_alert_distance_label(state_alert, rel_sun, dist_sun) == "Regional warning"

    # Citizen in Mumbai, Maharashtra -> IRRELEVANT
    rel_mum, dist_mum, in_mum = evaluate_alert_relevance(
        state_alert, 19.0760, 72.8777, user_district="Mumbai", user_state="Maharashtra"
    )
    assert rel_mum == RelevanceLevel.IRRELEVANT


# ===========================================================================
# 7. UNKNOWN Relevance & No Geometry
# ===========================================================================
def test_7_unknown_relevance_no_geometry():
    """Verify alerts without geometry and unresolvable administrative boundaries:
    - Return UNKNOWN
    - Do NOT return IRRELEVANT
    - Do NOT introduce fake coordinates.
    """
    now_iso = datetime.now(UTC).isoformat()
    unresolved_alert = NormalizedAlert(
        id="alt-unknown-zone",
        source="Civil Defense Advisory",
        source_event_id="cd-unk-01",
        source_type=SourceType.CIVIL_DEFENSE,
        hazard_type=HazardType.OTHER,
        severity=HazardSeverity.WATCH,
        title="Industrial Perimeter Alert",
        description="Advisory issued for Sector Bravo without explicit GPS coordinates.",
        affected_area="Sector Bravo",  # No district, no state
        latitude=None,  # No fake coordinates!
        longitude=None,  # No fake coordinates!
        observed_at=now_iso,
        issued_at=now_iso,
        expires_at=(datetime.now(UTC) + timedelta(hours=2)).isoformat(),
    )

    assert unresolved_alert.latitude is None
    assert unresolved_alert.longitude is None

    # Citizen at known coordinates (20.29, 85.82), but alert location cannot be established
    rel_unk, dist_unk, in_unk = evaluate_alert_relevance(
        unresolved_alert, 20.2961, 85.8245, user_district="Khordha", user_state="Odisha"
    )
    assert in_unk is False
    assert dist_unk is None
    assert rel_unk == RelevanceLevel.UNKNOWN
    assert rel_unk != RelevanceLevel.IRRELEVANT
    assert unresolved_alert.latitude is None


# ===========================================================================
# 8. OUTSIDE Citizen Handling
# ===========================================================================
def test_8_outside_citizen_handling():
    """Verify citizen far outside point, circle, polygon, or district receives IRRELEVANT."""
    now_iso = datetime.now(UTC).isoformat()
    future_iso = (datetime.now(UTC) + timedelta(hours=4)).isoformat()

    # Point in Tokyo, citizen in Kolkata
    point_far = NormalizedAlert(
        id="alt-pt-tokyo",
        source="USGS Seismic Network",
        hazard_type=HazardType.EARTHQUAKE,
        severity=HazardSeverity.CRITICAL,
        latitude=35.6762,
        longitude=139.6503,
        radius_km=0.0,
        observed_at=now_iso,
        issued_at=now_iso,
        expires_at=future_iso,
    )
    rel_pt, _, _ = evaluate_alert_relevance(point_far, 22.5726, 88.3639)
    assert rel_pt == RelevanceLevel.IRRELEVANT

    # District in Punjab, citizen in Odisha
    punjab_alert = NormalizedAlert(
        id="alt-dist-amritsar",
        source="Punjab Disaster Management",
        hazard_type=HazardType.WEATHER,
        severity=HazardSeverity.WARNING,
        affected_area="Amritsar district of Punjab",
        affected_districts=["Amritsar"],
        state="Punjab",
        latitude=None,
        longitude=None,
        observed_at=now_iso,
        issued_at=now_iso,
        expires_at=future_iso,
    )
    rel_dist, _, _ = evaluate_alert_relevance(
        punjab_alert, 20.2961, 85.8245, user_district="Khordha", user_state="Odisha"
    )
    assert rel_dist == RelevanceLevel.IRRELEVANT


# ===========================================================================
# 9. EXPIRED Alerts Pruning
# ===========================================================================
@pytest.mark.asyncio
async def test_9_expired_alerts_pruning():
    """Verify alerts with past expires_at are excluded from active hazards."""
    now = datetime.now(UTC)
    now_iso = now.isoformat()
    past_iso = (now - timedelta(hours=2)).isoformat()
    future_iso = (now + timedelta(hours=2)).isoformat()

    expired_alert = NormalizedAlert(
        id="alt-past-expired",
        source="SACHET / NDMA India",
        source_event_id="sachet-exp-01",
        source_type=SourceType.CIVIL_DEFENSE,
        hazard_type=HazardType.WEATHER,
        severity=HazardSeverity.WARNING,
        title="Expired Thunderstorm Warning",
        affected_area="Mayurbhanj district of Odisha",
        affected_districts=["Mayurbhanj"],
        state="Odisha",
        latitude=None,
        longitude=None,
        observed_at=(now - timedelta(hours=4)).isoformat(),
        issued_at=(now - timedelta(hours=4)).isoformat(),
        expires_at=past_iso,  # In the past
    )

    active_alert = NormalizedAlert(
        id="alt-current-active",
        source="SACHET / NDMA India",
        source_event_id="sachet-act-02",
        source_type=SourceType.CIVIL_DEFENSE,
        hazard_type=HazardType.WEATHER,
        severity=HazardSeverity.WARNING,
        title="Current Thunderstorm Warning",
        affected_area="Mayurbhanj district of Odisha",
        affected_districts=["Mayurbhanj"],
        state="Odisha",
        latitude=None,
        longitude=None,
        observed_at=now_iso,
        issued_at=now_iso,
        expires_at=future_iso,  # Active
    )

    from app.services.hazard_service import _hazard_grid_cache

    _hazard_grid_cache[(21.93, 86.74)] = ([expired_alert, active_alert], now + timedelta(minutes=5))

    transport = httpx.MockTransport(
        lambda req: httpx.Response(200, json={"features": [], "alerts": []})
    )
    async with httpx.AsyncClient(transport=transport) as client:
        hazards = await get_active_hazards(lat=21.9320, lon=86.7380, client=client)

    hazard_ids = [h.id for h in hazards]
    assert "alt-past-expired" not in hazard_ids
    assert "alt-current-active" in hazard_ids


# ===========================================================================
# 10. DUPLICATE Alerts Deduplication
# ===========================================================================
def test_10_duplicate_alerts_deduplication():
    """Verify duplicate alerts by identical ID or overlapping event & district are deduplicated."""
    now_iso = datetime.now(UTC).isoformat()
    future_iso = (datetime.now(UTC) + timedelta(hours=3)).isoformat()

    # 1. Exact ID duplicates from same provider
    alert_a1 = NormalizedAlert(
        id="alt-sachet-dup-1",
        source="SACHET / NDMA India",
        source_event_id="dup-101",
        source_type=SourceType.CIVIL_DEFENSE,
        hazard_type=HazardType.WEATHER,
        severity=HazardSeverity.WATCH,
        confidence=0.7,
        title="Thunderstorm Alert (Initial)",
        affected_area="Mayurbhanj district of Odisha",
        affected_districts=["Mayurbhanj"],
        observed_at=now_iso,
        issued_at=now_iso,
        expires_at=future_iso,
    )

    alert_a2 = NormalizedAlert(
        id="alt-sachet-dup-1",
        source="SACHET / NDMA India",
        source_event_id="dup-101",
        source_type=SourceType.CIVIL_DEFENSE,
        hazard_type=HazardType.WEATHER,
        severity=HazardSeverity.WARNING,
        confidence=0.95,
        title="Thunderstorm Alert (Updated)",
        affected_area="Mayurbhanj district of Odisha",
        affected_districts=["Mayurbhanj"],
        observed_at=now_iso,
        issued_at=now_iso,
        expires_at=future_iso,
    )

    deduped_id = deduplicate_alerts([alert_a1, alert_a2])
    assert len(deduped_id) == 1
    assert deduped_id[0].id == "alt-sachet-dup-1"
    assert deduped_id[0].confidence == 0.95

    # 2. Cross-source duplicate for same district and time
    alert_imd = NormalizedAlert(
        id="alt-imd-mb",
        source="India Meteorological Department (IMD)",
        source_event_id="imd-mb-1",
        source_type=SourceType.CIVIL_DEFENSE,
        hazard_type=HazardType.WEATHER,
        severity=HazardSeverity.WARNING,
        confidence=0.9,
        title="IMD: Thunderstorm Warning",
        affected_area="Mayurbhanj district of Odisha",
        affected_districts=["Mayurbhanj"],
        observed_at=now_iso,
        issued_at=now_iso,
        expires_at=future_iso,
    )

    alert_sachet = NormalizedAlert(
        id="alt-sachet-mb",
        source="SACHET / NDMA India",
        source_event_id="sachet-mb-1",
        source_type=SourceType.CIVIL_DEFENSE,
        hazard_type=HazardType.WEATHER,
        severity=HazardSeverity.WARNING,
        confidence=0.95,
        title="SACHET: Thunderstorm Warning",
        affected_area="Mayurbhanj district of Odisha",
        affected_districts=["Mayurbhanj"],
        observed_at=now_iso,
        issued_at=now_iso,
        expires_at=future_iso,
    )

    deduped_cross = deduplicate_alerts([alert_imd, alert_sachet])
    assert len(deduped_cross) == 1
    matched_sources = deduped_cross[0].sources_matched
    assert "India Meteorological Department (IMD)" in matched_sources
    assert "SACHET / NDMA India" in matched_sources
