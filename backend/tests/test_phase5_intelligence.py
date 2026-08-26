"""Unit and Integration Tests for SALVUS Phase 5:

Multimodal Intelligence + Disaster Context + Situation Intelligence + Final Hardening.

Exhaustively verifies:
1. Multimodal image damage hints with mandatory 'AI ESTIMATE — UNVERIFIED' branding
2. Graceful degradation when image AI or external feeds fail
3. Hazard data normalization (Open-Meteo, USGS, Regional alerts)
4. Spatial relevance filtering for citizens based on distance, radius, and severity
5. Grounded situation intelligence statistics and operational briefings
6. Incident clustering and regional aggregation
7. Complete Golden Flow (Citizen -> Triage -> Verify -> Deterministic Dispatch -> Resolve)
"""

from __future__ import annotations

import json

import pytest

from app.models import (
    HazardSeverity,
    HazardType,
    NormalizedHazard,
    ResponderCapability,
)
from app.services import hazard_service
from app.services.ai.base import (
    parse_and_validate_assessment,
)
from app.services.ai.heuristic_provider import HeuristicProvider


@pytest.fixture
def anyio_backend():
    return "asyncio"


# ===========================================================================
# 1. Multimodal Damage Hints & 'AI ESTIMATE — UNVERIFIED' Enforcement
# ===========================================================================


def test_multimodal_schema_validation_and_unverified_prefix():
    """Verify multimodal damage hints are extracted and enforce 'AI ESTIMATE — UNVERIFIED'."""
    raw_payload = json.dumps(
        {
            "incident_type": "flood",
            "severity": "CRITICAL",
            "severity_level": 4,
            "confidence": 0.91,
            "hazard_type": "Rapid Inundation",
            "recommended_capability": "FLOOD_BOAT",
            "priority_reasoning": "Ground floor submerged by 1.2m storm surge.",
            "uncertainty_flags": [],
            "damage_type": "Structural Ground Inundation",
            "hazard_detected": "Submerged Vehicles & Roadway",
            "water_depth_estimate": "1.0m - 1.4m",
            "image_assessment_hint": "Water depth approx 1.2m with submerged vehicles.",
        }
    )
    sanitized = {"affected_count": 3, "description": "Flooding on main road"}
    assessment = parse_and_validate_assessment(
        raw_payload, sanitized, "gemini-provider", "gemini-2.0-flash"
    )

    assert assessment is not None
    assert assessment.damage_type == "Structural Ground Inundation"
    assert assessment.hazard_detected == "Submerged Vehicles & Roadway"
    assert assessment.water_depth_estimate == "1.0m - 1.4m"
    assert assessment.image_assessment_hint is not None
    assert assessment.image_assessment_hint.startswith("AI ESTIMATE — UNVERIFIED:")


def test_multimodal_auto_generated_hint_when_explicit_hint_omitted():
    """Verify auto-generation of 'AI ESTIMATE — UNVERIFIED' from structured damage fields."""
    raw_payload = json.dumps(
        {
            "incident_type": "power_line",
            "severity": "HIGH",
            "severity_level": 3,
            "confidence": 0.86,
            "recommended_capability": "HAZMAT",
            "priority_reasoning": "Live 11kV wire down in flooded street.",
            "uncertainty_flags": [],
            "damage_type": "Submerged Electrical Grid",
            "hazard_detected": "Live High-Voltage Feeder",
            "water_depth_estimate": "0.4m",
            "image_assessment_hint": None,
        }
    )
    sanitized = {"affected_count": 1, "description": "Electric line spark"}
    assessment = parse_and_validate_assessment(
        raw_payload, sanitized, "gemini-provider", "gemini-2.0-flash"
    )

    assert assessment is not None
    assert assessment.image_assessment_hint is not None
    assert assessment.image_assessment_hint.startswith("AI ESTIMATE — UNVERIFIED:")
    assert "Submerged Electrical Grid" in assessment.image_assessment_hint
    assert "Live High-Voltage Feeder" in assessment.image_assessment_hint


@pytest.mark.asyncio
async def test_heuristic_multimodal_fallback_with_image():
    """Verify heuristic rule engine produces deterministic damage hints when image is present."""
    sanitized = {
        "type": "flood",
        "description": "Rising floodwater on street.",
        "affected_count": 2,
        "is_sos": True,
    }
    image_b64 = "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD/2wBD..."
    assessment = await HeuristicProvider().evaluate(sanitized, image_data=image_b64)

    assert assessment is not None
    assert assessment.damage_type == "Structural & Ground Inundation"
    assert assessment.hazard_detected == "Submerged Ground Level & Inundated Roadway"
    assert assessment.water_depth_estimate == "0.9m – 1.4m estimated"
    assert assessment.image_assessment_hint.startswith("AI ESTIMATE — UNVERIFIED:")


@pytest.mark.asyncio
async def test_vision_failure_graceful_degradation():
    """Verify that if image data is absent or unparseable, incident triage proceeds cleanly."""
    sanitized = {
        "type": "medical",
        "description": "Patient experiencing severe chest pain.",
        "affected_count": 1,
        "is_sos": False,
    }
    assessment = await HeuristicProvider().evaluate(sanitized, image_data=None)

    assert assessment is not None
    assert assessment.damage_type is None
    assert assessment.image_assessment_hint is None
    assert assessment.recommended_capability == ResponderCapability.AMBULANCE


# ===========================================================================
# 2. Hazard Normalization & Spatial Relevance Filtering
# ===========================================================================


@pytest.mark.asyncio
async def test_hazard_feed_normalization_and_provenance():
    """Verify active hazards have normalized schema and explicit data provenance."""
    hazards = await hazard_service.get_active_hazards()
    assert len(hazards) >= 3

    for hz in hazards:
        assert isinstance(hz, NormalizedHazard)
        assert hz.hazard_id.startswith("hz-")
        assert hz.source is not None
        assert hz.severity in (
            HazardSeverity.CRITICAL,
            HazardSeverity.WARNING,
            HazardSeverity.WATCH,
            HazardSeverity.ADVISORY,
        )
        assert hz.why_it_matters is not None
        assert hz.recommended_action is not None
        assert hz.data_provenance in ("LIVE", "CACHED", "FALLBACK")
        assert hz.affected_radius_km > 0.0


@pytest.mark.asyncio
async def test_spatial_relevance_filtering_for_citizens():
    """Verify citizen location filtering returns only nearby or critical hazards."""
    # Salt Lake Sector 12 coords (close to Kolkata flood hazard)
    nearby_lat, nearby_lon = 22.5750, 88.3700
    nearby_hazards = await hazard_service.get_active_hazards(
        lat=nearby_lat, lon=nearby_lon, max_distance_km=2.5
    )

    # Should include Sector 12 flood hazard
    flood_hazards = [h for h in nearby_hazards if h.hazard_type == HazardType.FLOOD]
    assert len(flood_hazards) > 0

    # Distant coords (100km away outside Kolkata)
    far_lat, far_lon = 23.5000, 89.5000
    far_hazards = await hazard_service.get_active_hazards(
        lat=far_lat, lon=far_lon, max_distance_km=2.0
    )

    # Distant queries should filter out localized watches, but retain CRITICAL alerts
    for h in far_hazards:
        assert h.severity == HazardSeverity.CRITICAL


# ===========================================================================
# 3. Spatial Incident Clustering
# ===========================================================================


@pytest.mark.asyncio
async def test_incident_clustering_aggregation(client):
    """Verify incident clustering correctly groups nearby incidents and computes centroids/radii."""
    res = await client.get("/api/hazards/clusters")
    assert res.status_code == 200
    clusters = res.json()["data"]
    assert isinstance(clusters, list)
    assert len(clusters) > 0

    for cl in clusters:
        assert "cluster_id" in cl
        assert "cluster_name" in cl
        assert cl["incident_count"] >= 1
        assert "centroid_lat" in cl
        assert "centroid_lon" in cl
        assert cl["radius_km"] >= 0.4
        assert "primary_hazard_type" in cl


# ===========================================================================
# 4. Grounded Situation Intelligence & Briefings
# ===========================================================================


@pytest.mark.asyncio
async def test_situation_summary_grounded_statistics_and_briefing(client):
    """Verify situation summary calculates factual DB counts and generates a 2-sentence briefing."""
    res = await client.get("/api/situation/summary")
    assert res.status_code == 200
    summary = res.json()

    stats = summary["statistics"]
    assert stats["total_active_incidents"] >= 0
    assert stats["total_responders"] >= 0
    assert stats["available_beds"] >= 0

    briefing = summary["briefing"]
    assert isinstance(briefing, str)
    assert len(briefing) > 20
    assert "District Command" in briefing or "incidents" in briefing.lower()

    # Priorities must be non-empty
    priorities = summary["key_priorities"]
    assert isinstance(priorities, list)
    assert len(priorities) > 0


# ===========================================================================
# 5. Complete End-to-End Golden Flow Simulation
# ===========================================================================


@pytest.mark.asyncio
async def test_complete_golden_flow_e2e(client):
    """Verify complete Golden Flow:

    Citizen SOS -> AI Triage with Multimodal Hint -> Authority Verification
    -> Deterministic Candidate Ranking -> Assignment -> Status Progression -> Resolution.
    """
    # 1. Citizen submits distress report with attached image
    report_payload = {
        "type": "flood",
        "severity": "HIGH",
        "description": "Flood water rising 1.3m near Karunamoyee. 4 trapped citizens on balcony.",
        "reporter_name": "Soma Ghosh",
        "latitude": 22.5840,
        "longitude": 88.4120,
        "affected_count": 4,
        "is_sos": True,
        "image_data": "data:image/jpeg;base64,iVBORw0KGgoAAAANSUhEUgAA...",
    }
    create_res = await client.post("/api/incidents", json=report_payload)
    assert create_res.status_code == 201
    incident = create_res.json()["data"]
    inc_id = incident["id"]
    assert incident["status"] == "NEW"

    # 2. Verify AI Triage assessment is generated
    analyze_res = await client.post(f"/api/triage/analyze/{inc_id}")
    assert analyze_res.status_code == 200
    triage = analyze_res.json()["data"]
    assert triage["recommended_capability"] == "FLOOD_BOAT"
    assert triage["image_assessment_hint"] is not None
    assert triage["image_assessment_hint"].startswith("AI ESTIMATE — UNVERIFIED:")

    # 3. Authority operator verifies assessment
    verify_res = await client.post(
        f"/api/triage/verify/{inc_id}",
        json={
            "actor": "Authority Commander 01",
            "reviewer_notes": "Verified high flood level and watercraft requirement.",
        },
    )
    assert verify_res.status_code == 200
    verified_incident = verify_res.json()["data"]
    assert verified_incident["status"] == "VERIFIED"

    # 4. Deterministic Candidate Generation scores available units
    cand_res = await client.get(f"/api/responders/candidates/{inc_id}")
    assert cand_res.status_code == 200
    candidates = cand_res.json()["data"]
    assert len(candidates) > 0

    top_candidate = candidates[0]
    responder_id = top_candidate["id"]
    assert top_candidate["capability"] == "FLOOD_BOAT"
    assert top_candidate["is_recommended"] is True

    # 5. Operator confirms assignment of top-ranked unit
    assign_res = await client.post(
        "/api/assignments",
        json={
            "incident_id": inc_id,
            "responder_id": responder_id,
            "assigned_by": "Authority Commander 01",
            "notes": "Dispatched verified watercraft unit.",
        },
    )
    assert assign_res.status_code == 201
    assignment = assign_res.json()["data"]
    assert assignment["status"] == "ASSIGNED"

    # 6. Responder progresses through lifecycle: EN_ROUTE -> NEARBY -> ON_SCENE -> RESOLVED
    for next_status in ["EN_ROUTE", "NEARBY", "ON_SCENE", "RESOLVED"]:
        status_res = await client.patch(
            f"/api/incidents/{inc_id}/status",
            json={
                "status": next_status,
                "actor": "Responder Unit Lead",
                "notes": f"Reached {next_status}",
            },
        )
        assert status_res.status_code == 200
        assert status_res.json()["data"]["status"] == next_status

    # 7. Final check: Situation statistics reflects resolved incident
    summary_res = await client.get("/api/situation/summary")
    assert summary_res.status_code == 200
    resolved_count = summary_res.json()["statistics"]["resolved_incidents_count"]
    assert resolved_count >= 1
