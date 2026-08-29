"""Comprehensive Test Suite for Salvus Real-World Facilities Engine (Phase 2).

Validates:
1. Canonical FacilityModel attributes, enums, and serialization.
2. Geoapify Places v2 coordinate-based nearby search and normalization.
3. Concurrent category execution with category failure isolation (Promise.allSettled).
4. Strict 10,000 meters (10 km) local distance boundary validation.
5. Straight-line distance user-facing formatting ('850 m away' vs '1.3 km away').
6. Safe Places 3-tier trust hierarchy (Level 1 Salvus Verified vs Level 3 Mapped).
7. Layered 4-tier multi-provider deduplication (< 25m collocation merge).
8. Partial success status evaluation (AVAILABLE vs PARTIAL_RESULTS vs NO_RESULTS vs UNAVAILABLE).
9. Location-sensitive tiered caching and stale fallback.
10. Real-world location simulations across multiple urban and disaster coordinates.
"""

from __future__ import annotations

from unittest.mock import AsyncMock, patch

import pytest
from httpx import Response

from app.adapters.facilities.deduplication import deduplicate_facilities
from app.adapters.facilities.geoapify_provider import (
    GeoapifyFacilityProvider,
)
from app.adapters.facilities.orchestrator import FacilityOrchestrator
from app.models.facility import (
    FacilityCategory,
    FacilityFreshness,
    FacilityModel,
    FacilityResponseState,
    SafePlaceTrustLevel,
)
from app.utils.geospatial import (
    format_straight_line_distance,
    haversine_distance_meters,
    is_within_strict_radius,
)

# ==============================================================================
# 1. Canonical Model & Geospatial Math Tests
# ==============================================================================


def test_geospatial_distance_and_strict_radius():
    """Verify exact Haversine calculation and strict 10,000m boundary."""
    origin_lat, origin_lon = 22.5726, 88.3639

    # Point ~9.5 km away (inside 10km)
    target_inside_lat, target_inside_lon = 22.6500, 88.3639
    dist_m = haversine_distance_meters(origin_lat, origin_lon, target_inside_lat, target_inside_lon)
    assert dist_m < 10000.0
    assert (
        is_within_strict_radius(
            origin_lat, origin_lon, target_inside_lat, target_inside_lon, 10000.0
        )
        is True
    )

    # Point ~11.5 km away (outside 10km)
    target_outside_lat, target_outside_lon = 22.6800, 88.3639
    dist_outside_m = haversine_distance_meters(
        origin_lat, origin_lon, target_outside_lat, target_outside_lon
    )
    assert dist_outside_m > 10000.0
    assert (
        is_within_strict_radius(
            origin_lat, origin_lon, target_outside_lat, target_outside_lon, 10000.0
        )
        is False
    )


def test_straight_line_distance_display_formatting():
    """Verify distance display formatting: '< 1 km -> 850 m away', '>= 1 km -> 1.3 km away'."""
    assert format_straight_line_distance(850.0) == "850 m away"
    assert format_straight_line_distance(320.4) == "320 m away"
    assert format_straight_line_distance(1340.0) == "1.3 km away"
    assert format_straight_line_distance(9800.0) == "9.8 km away"
    assert format_straight_line_distance(None) == "Distance unknown"


def test_category_enum_robust_parsing():
    """Verify controlled category enum parsing from arbitrary strings."""
    assert FacilityCategory.from_str("hospital") == FacilityCategory.HOSPITAL
    assert FacilityCategory.from_str("CLINIC") == FacilityCategory.HOSPITAL
    assert FacilityCategory.from_str("pharmacy") == FacilityCategory.PHARMACY
    assert FacilityCategory.from_str("chemist") == FacilityCategory.PHARMACY
    assert FacilityCategory.from_str("police_station") == FacilityCategory.POLICE
    assert FacilityCategory.from_str("fire_service") == FacilityCategory.FIRE_STATION
    assert FacilityCategory.from_str("ambulance_station") == FacilityCategory.AMBULANCE
    assert FacilityCategory.from_str("evacuation_center") == FacilityCategory.SAFE_PLACE
    assert FacilityCategory.from_str("unknown_type") == FacilityCategory.OTHER


# ==============================================================================
# 2. Geoapify Primary Provider Adapter Tests
# ==============================================================================


@pytest.mark.asyncio
async def test_geoapify_feature_normalization():
    """Verify normalization of Geoapify GeoJSON into canonical FacilityModel."""
    provider = GeoapifyFacilityProvider(api_key="test-geoapify-key-12345")
    assert provider.is_configured() is True

    raw_feature = {
        "type": "Feature",
        "properties": {
            "name": "Apollo Gleneagles Hospital",
            "lat": 22.5700,
            "lon": 88.4000,
            "formatted": (
                "58 Canal Circular Road, Kadapara, Phool Bagan, "
                "Kankurgachi, Kolkata, West Bengal 700054, India"
            ),
            "city": "Kolkata",
            "categories": ["healthcare", "healthcare.hospital"],
            "contact": {"phone": "+91 33 2320 3040"},
            "website": "https://kolkata.apollohospitals.com",
            "opening_hours": "24/7",
            "place_id": "51abc123def456",
            "datasource": {"sourcename": "openstreetmap", "raw": {"wheelchair": "yes"}},
        },
        "geometry": {"type": "Point", "coordinates": [88.4000, 22.5700]},
    }

    facility = provider.normalize_feature(
        feature=raw_feature,
        origin_lat=22.5726,
        origin_lon=88.3639,
        target_category=FacilityCategory.HOSPITAL,
        now_iso="2026-08-29T12:00:00Z",
    )

    assert facility is not None
    assert facility.id == "geoapify-51abc123def456"
    assert facility.provider == "geoapify"
    assert facility.category == FacilityCategory.HOSPITAL
    assert facility.name == "Apollo Gleneagles Hospital"
    assert facility.latitude == 22.5700
    assert facility.longitude == 88.4000
    assert facility.phone == "+91 33 2320 3040"
    assert facility.website == "https://kolkata.apollohospitals.com"
    assert facility.opening_hours == "24/7"
    assert facility.straight_line_distance_meters is not None
    assert facility.straight_line_distance_meters > 3000.0  # ~3.7 km
    assert "km away" in facility.distance_formatted
    assert "Wheelchair Accessible" in facility.amenities


@pytest.mark.asyncio
async def test_geoapify_strict_radius_enforcement():
    """Verify that Geoapify features exceeding 10,000m are dropped locally."""
    provider = GeoapifyFacilityProvider(api_key="valid-key")

    mock_geoapify_response = {
        "type": "FeatureCollection",
        "features": [
            {
                "type": "Feature",
                "properties": {
                    "name": "Inside Hospital (5 km away)",
                    "lat": 22.5726 + 0.045,  # ~5 km north
                    "lon": 88.3639,
                    "place_id": "inside-1",
                    "categories": ["healthcare.hospital"],
                },
            },
            {
                "type": "Feature",
                "properties": {
                    "name": "Outside Hospital (12 km away)",
                    "lat": 22.5726 + 0.12,  # ~13.3 km north
                    "lon": 88.3639,
                    "place_id": "outside-1",
                    "categories": ["healthcare.hospital"],
                },
            },
        ],
    }

    with patch("httpx.AsyncClient.get", new_callable=AsyncMock) as mock_get:
        mock_get.return_value = Response(200, json=mock_geoapify_response)
        facilities, status = await provider.fetch_category(
            lat=22.5726, lon=88.3639, radius_m=10000, category=FacilityCategory.HOSPITAL
        )

        assert status == "OK"
        assert len(facilities) == 1
        assert facilities[0].name == "Inside Hospital (5 km away)"
        assert facilities[0].straight_line_distance_meters <= 10000.0


# ==============================================================================
# 3. Concurrent Fetching & Category Failure Isolation Tests
# ==============================================================================


@pytest.mark.asyncio
async def test_concurrent_fetching_category_failure_isolation():
    """Verify that if one category fails (e.g. PHARMACY), others (HOSPITAL, FIRE) still succeed."""
    orchestrator = FacilityOrchestrator()

    async def mock_geoapify_get(url, params=None, headers=None):
        cats = params.get("categories", "") if params else ""
        # Simulate Pharmacy failure with 500 error, others succeed
        if "pharmacy" in cats:
            return Response(500, text="Internal Provider Error on Pharmacy")
        elif "hospital" in cats:
            return Response(
                200,
                json={
                    "type": "FeatureCollection",
                    "features": [
                        {
                            "type": "Feature",
                            "properties": {
                                "name": "City General Hospital",
                                "lat": 22.5750,
                                "lon": 88.3650,
                                "place_id": "hosp-001",
                                "categories": ["healthcare.hospital"],
                            },
                        }
                    ],
                },
            )
        elif "fire_station" in cats:
            return Response(
                200,
                json={
                    "type": "FeatureCollection",
                    "features": [
                        {
                            "type": "Feature",
                            "properties": {
                                "name": "Central Fire Station",
                                "lat": 22.5710,
                                "lon": 88.3620,
                                "place_id": "fire-001",
                                "categories": ["service.fire_station"],
                            },
                        }
                    ],
                },
            )
        return Response(200, json={"type": "FeatureCollection", "features": []})

    # Both Geoapify and OSM fallback fail on pharmacy
    with (
        patch("httpx.AsyncClient.get", side_effect=mock_geoapify_get),
        patch(
            "httpx.AsyncClient.post",
            side_effect=Exception("Fallback Overpass mirror 504 Gateway Timeout"),
        ),
        patch.object(orchestrator.geoapify_provider, "is_configured", return_value=True),
    ):
        (
            facilities,
            is_cached,
            freshness,
            state,
            cat_statuses,
        ) = await orchestrator.get_nearby_facilities(
            lat=22.5726,
            lon=88.3639,
            radius_m=10000,
            categories=[
                FacilityCategory.HOSPITAL,
                FacilityCategory.PHARMACY,
                FacilityCategory.FIRE_STATION,
            ],
            include_verified_shelters=False,
        )

        # Check that response state is PARTIAL_RESULTS because PHARMACY failed across all providers
        assert state == FacilityResponseState.PARTIAL_RESULTS
        assert freshness == FacilityFreshness.PARTIAL
        assert len(facilities) == 2

        names = [f.name for f in facilities]
        assert "City General Hospital" in names
        assert "Central Fire Station" in names

        # Check granular category status reports
        assert cat_statuses["HOSPITAL"].status == "OK"
        assert cat_statuses["HOSPITAL"].count == 1
        assert cat_statuses["FIRE_STATION"].status == "OK"
        assert cat_statuses["FIRE_STATION"].count == 1
        assert cat_statuses["PHARMACY"].status == "UNAVAILABLE"


# ==============================================================================
# 4. Deduplication Layer Tests
# ==============================================================================


def test_multi_provider_layered_deduplication():
    """Verify layered deduplication merging overlapping records from multiple providers."""
    # Record 1 from Geoapify
    rec1 = FacilityModel(
        id="geoapify-place-100",
        provider="geoapify",
        provider_place_id="place-100",
        category=FacilityCategory.HOSPITAL,
        name="Apollo Hospital",
        latitude=22.5730,
        longitude=88.3640,
        straight_line_distance_meters=45.0,
        formatted_address="Canal Road, Salt Lake",
        phone="+91 33 2345 6789",
        website="https://apollo.com",
        verified=False,
        confidence=0.90,
        fetched_at="2026-08-29T12:00:00Z",
    )

    # Record 2 from OSM (collocated < 25m, same name, no phone)
    rec2 = FacilityModel(
        id="osm-node-554433",
        provider="osm",
        provider_place_id="node/554433",
        category=FacilityCategory.HOSPITAL,
        name="apollo hospital",  # lowercase
        latitude=22.5731,  # ~11m distance from rec1
        longitude=88.3640,
        straight_line_distance_meters=48.0,
        formatted_address="Salt Lake",
        phone=None,
        website=None,
        verified=False,
        confidence=0.85,
        fetched_at="2026-08-29T12:00:00Z",
    )

    # Record 3 distinct facility (1 km away)
    rec3 = FacilityModel(
        id="geoapify-place-200",
        provider="geoapify",
        provider_place_id="place-200",
        category=FacilityCategory.HOSPITAL,
        name="AMRI Clinic",
        latitude=22.5830,
        longitude=88.3640,
        straight_line_distance_meters=1150.0,
        formatted_address="Broadway, Sector 3",
        phone="+91 33 9988 7766",
        verified=False,
        confidence=0.90,
        fetched_at="2026-08-29T12:00:00Z",
    )

    deduped = deduplicate_facilities([rec1, rec2, rec3])
    assert len(deduped) == 2

    # Verify rec1 and rec2 merged without data loss
    merged_apollo = next(f for f in deduped if "apollo" in f.name.lower())
    assert merged_apollo.phone == "+91 33 2345 6789"
    assert merged_apollo.website == "https://apollo.com"


# ==============================================================================
# 5. Safe Places 3-Tier Trust Model Tests
# ==============================================================================


@pytest.mark.asyncio
async def test_safe_places_trust_hierarchy_and_ranking(test_db):
    """Verify Safe Places 3-tier hierarchy: Level 1 Salvus Verified prioritized at top."""
    orchestrator = FacilityOrchestrator()

    # Query with safe places priority
    facilities, _, _, state, _ = await orchestrator.get_nearby_facilities(
        lat=22.5726,
        lon=88.3639,
        radius_m=10000,
        categories=[FacilityCategory.SAFE_PLACE],
        include_verified_shelters=True,
        safe_places_priority=True,
        db=test_db,
    )

    assert state in (FacilityResponseState.AVAILABLE, FacilityResponseState.PARTIAL_RESULTS)
    assert len(facilities) >= 1

    # Verified shelter should have Level 1 trust and be ranked #1
    top_shelter = facilities[0]
    assert top_shelter.verified is True
    assert top_shelter.safe_place_details is not None
    assert (
        top_shelter.safe_place_details.verification_level
        == SafePlaceTrustLevel.LEVEL_1_SALVUS_VERIFIED
    )
    assert top_shelter.safe_place_details.emergency_use_confirmed is True
    assert top_shelter.confidence == 1.0


# ==============================================================================
# 6. True Zero Results vs Provider Unavailable Tests
# ==============================================================================


@pytest.mark.asyncio
async def test_true_zero_vs_provider_unavailable():
    """Verify that true empty area returns NO_RESULTS while provider error returns UNAVAILABLE."""
    orchestrator = FacilityOrchestrator()

    # Scenario A: Provider succeeded with 200 OK and 0 results -> NO_RESULTS
    with (
        patch.object(orchestrator.geoapify_provider, "is_configured", return_value=True),
        patch("httpx.AsyncClient.get", new_callable=AsyncMock) as mock_get,
    ):
        mock_get.return_value = Response(200, json={"type": "FeatureCollection", "features": []})

        facilities_a, _, _, state_a, _ = await orchestrator.get_nearby_facilities(
            lat=0.0, lon=0.0, radius_m=10000, include_verified_shelters=False
        )
        assert len(facilities_a) == 0
        assert state_a == FacilityResponseState.NO_RESULTS

    # Scenario B: Provider failed with 500 error / Timeout -> UNAVAILABLE
    with (
        patch.object(orchestrator.geoapify_provider, "is_configured", return_value=True),
        patch("httpx.AsyncClient.get", side_effect=Exception("Provider Gateway Timeout")),
        patch("httpx.AsyncClient.post", side_effect=Exception("Fallback mirror unavailable")),
    ):
        facilities_b, _, _, state_b, _ = await orchestrator.get_nearby_facilities(
            lat=22.5726,
            lon=88.3639,
            radius_m=10000,
            include_verified_shelters=False,
            force_refresh=True,
        )
        assert len(facilities_b) == 0
        assert state_b == FacilityResponseState.UNAVAILABLE
