"""Salvus Explainable Deterministic Allocation Engine.

Computes mathematically transparent, auditable recommendation scores and
human-readable deterministic explanations for dispatching emergency response units.

NO LLM is used in allocation decisions — zero hallucinations, zero stochasticity,
100% auditable formulas for life-safety operations.
"""

from __future__ import annotations

import math
from typing import Final

from app.models import (
    CandidateExplanation,
    CandidateResponderResponse,
    IncidentResponse,
    ResponderResponse,
    ScoreBreakdown,
)
from app.services.routing_service import haversine_distance_km

# ---------------------------------------------------------------------------
# Centralized Auditable Scoring Weights (Total Max = 100)
# ---------------------------------------------------------------------------

WEIGHT_CAPABILITY: Final[int] = 30  # Specialized equipment & skill match for hazard profile
WEIGHT_AVAILABILITY: Final[int] = 20  # Operational readiness state
WEIGHT_DISTANCE: Final[int] = 15  # Spatial proximity decay
WEIGHT_ETA: Final[int] = 15  # Real-world or corridor transit time
WEIGHT_WORKLOAD: Final[int] = 10  # Available crew load / remaining capacity
WEIGHT_SEVERITY_FIT: Final[int] = 10  # Equipment tier & crew capacity alignment with urgency

MAX_OPERATIONAL_RADIUS_KM: Final[float] = 25.0  # Range limit beyond which proximity is 0


def compute_capability_score(incident_type: str, capability: str) -> tuple[int, str, int]:
    """Calculate specialized capability match score [0 to WEIGHT_CAPABILITY].

    Returns (score, descriptive_reason, match_percentage).
    """
    inc_type = (incident_type or "").lower().strip()
    cap = (capability or "").upper().strip()

    if inc_type == "flood":
        if cap == "FLOOD_BOAT":
            return (WEIGHT_CAPABILITY, "Specialized Inflatable Flood Rescue Watercraft", 100)
        elif cap == "AMBULANCE":
            return (
                int(round(WEIGHT_CAPABILITY * 0.70)),
                "High-Water Medical Evacuation Support",
                70,
            )
        elif cap == "STRETCHER_TEAM":
            return (int(round(WEIGHT_CAPABILITY * 0.60)), "Shallow Water Stretcher Extraction", 60)
        elif cap in ("DEBRIS_CLEAR", "HAZMAT"):
            return (int(round(WEIGHT_CAPABILITY * 0.40)), "Waterway Obstruction Clearance", 40)

    elif inc_type == "medical":
        if cap == "AMBULANCE":
            return (WEIGHT_CAPABILITY, "Primary Advanced Life Support Ambulance", 100)
        elif cap == "STRETCHER_TEAM":
            return (int(round(WEIGHT_CAPABILITY * 0.80)), "Field Triage & Stretcher Transfer", 80)
        elif cap == "FLOOD_BOAT":
            return (int(round(WEIGHT_CAPABILITY * 0.50)), "Amphibious Medical Transport", 50)
        elif cap in ("HAZMAT", "DEBRIS_CLEAR"):
            return (int(round(WEIGHT_CAPABILITY * 0.30)), "Perimeter Medical Access Clearance", 30)

    elif inc_type in ("power_line", "hazard", "fire"):
        if cap in ("HAZMAT", "DEBRIS_CLEAR"):
            return (WEIGHT_CAPABILITY, "Hazard Mitigation & Infrastructure Isolation", 100)
        elif cap == "STRETCHER_TEAM":
            return (int(round(WEIGHT_CAPABILITY * 0.70)), "Perimeter Evacuation & Crowd Safety", 70)
        elif cap == "AMBULANCE":
            return (int(round(WEIGHT_CAPABILITY * 0.60)), "Burn & Trauma Medical Standby", 60)
        elif cap == "FLOOD_BOAT":
            return (int(round(WEIGHT_CAPABILITY * 0.30)), "Auxiliary Perimeter Transit", 30)

    elif inc_type == "structural":
        if cap == "DEBRIS_CLEAR":
            return (WEIGHT_CAPABILITY, "Heavy Debris Removal & Breaching", 100)
        elif cap == "STRETCHER_TEAM":
            return (int(round(WEIGHT_CAPABILITY * 0.80)), "Confined Space Search & Extraction", 80)
        elif cap == "AMBULANCE":
            return (int(round(WEIGHT_CAPABILITY * 0.70)), "Structural Collapse Trauma Support", 70)
        elif cap == "HAZMAT":
            return (
                int(round(WEIGHT_CAPABILITY * 0.60)),
                "Gas Leak & Structural Hazard Control",
                60,
            )

    # General baseline capability
    return (int(round(WEIGHT_CAPABILITY * 0.40)), "General Auxiliary Rescue Support", 40)


def compute_availability_score(status: str) -> tuple[int, str]:
    """Compute availability contribution based on operational state [0 to WEIGHT_AVAILABILITY]."""
    st = (status or "").upper().strip()
    if st == "AVAILABLE":
        return (WEIGHT_AVAILABILITY, "Available immediately (No active commitments)")
    elif st == "NEARBY":
        return (
            int(round(WEIGHT_AVAILABILITY * 0.75)),
            "Operating in adjacent sector (Quick reassignment)",
        )
    elif st == "EN_ROUTE":
        return (int(round(WEIGHT_AVAILABILITY * 0.40)), "En route on secondary task (Divertable)")
    elif st in ("ASSIGNED", "ON_SCENE"):
        return (0, "Currently committed to active mission")
    elif st == "OFFLINE":
        return (0, "Unit offline / Out of service")

    return (int(round(WEIGHT_AVAILABILITY * 0.50)), f"Status: {st}")


def compute_distance_score(distance_km: float) -> tuple[int, str]:
    """Calculate non-linear spatial proximity score [0 to WEIGHT_DISTANCE]."""
    if distance_km < 1.0:
        return (WEIGHT_DISTANCE, f"Immediate vicinity ({distance_km:.1f} km < 1 km)")
    elif distance_km < 2.5:
        return (
            int(round(WEIGHT_DISTANCE * 0.80)),
            f"Close operational range ({distance_km:.1f} km)",
        )
    elif distance_km < 5.0:
        return (
            int(round(WEIGHT_DISTANCE * 0.60)),
            f"Moderate transit distance ({distance_km:.1f} km)",
        )
    elif distance_km < 10.0:
        return (
            int(round(WEIGHT_DISTANCE * 0.40)),
            f"Extended transit distance ({distance_km:.1f} km)",
        )
    elif distance_km <= MAX_OPERATIONAL_RADIUS_KM:
        return (int(round(WEIGHT_DISTANCE * 0.20)), f"Long-range deployment ({distance_km:.1f} km)")
    return (0, f"Beyond primary operational radius ({distance_km:.1f} km)")


def compute_eta_score(eta_minutes: float) -> tuple[int, str]:
    """Calculate transit ETA score [0 to WEIGHT_ETA]."""
    if eta_minutes <= 3.0:
        return (WEIGHT_ETA, f"Rapid arrival (~{int(round(eta_minutes))} min <= 3 min)")
    elif eta_minutes <= 6.0:
        return (int(round(WEIGHT_ETA * 0.80)), f"Fast arrival (~{int(round(eta_minutes))} min)")
    elif eta_minutes <= 12.0:
        return (int(round(WEIGHT_ETA * 0.60)), f"Moderate arrival (~{int(round(eta_minutes))} min)")
    elif eta_minutes <= 20.0:
        return (int(round(WEIGHT_ETA * 0.35)), f"Extended arrival (~{int(round(eta_minutes))} min)")
    elif eta_minutes <= 35.0:
        return (int(round(WEIGHT_ETA * 0.15)), f"Delayed arrival (~{int(round(eta_minutes))} min)")
    return (0, f"High transit delay (~{int(round(eta_minutes))} min)")


def compute_workload_score(current_load: int, max_capacity: int) -> tuple[int, str]:
    """Compute workload capacity score [0 to WEIGHT_WORKLOAD]."""
    max_cap = max(1, max_capacity)
    load = max(0, min(current_load, max_cap))
    free_ratio = (max_cap - load) / max_cap
    score = int(round(free_ratio * WEIGHT_WORKLOAD))

    if load == 0:
        return (WEIGHT_WORKLOAD, f"Zero load backlog (0/{max_cap} crew capacity used)")
    elif free_ratio >= 0.5:
        return (score, f"Low workload ({load}/{max_cap} crew capacity in use)")
    return (score, f"Heavy workload load ({load}/{max_cap} crew capacity in use)")


def compute_severity_fit_score(
    incident_severity: str, responder: ResponderResponse
) -> tuple[int, str]:
    """Evaluate equipment grade and capacity alignment with urgency tier [0 to 10]."""
    sev = (incident_severity or "").upper().strip()
    cap = responder.max_capacity

    if sev == "CRITICAL":
        if cap >= 6:
            return (
                WEIGHT_SEVERITY_FIT,
                "High crew capacity (≥6) optimized for Critical Life Threat",
            )
        return (
            int(round(WEIGHT_SEVERITY_FIT * 0.70)),
            "Standard crew capacity for Critical Life Threat",
        )
    elif sev == "HIGH":
        return (int(round(WEIGHT_SEVERITY_FIT * 0.90)), "Optimized for High Priority Emergency Aid")
    elif sev == "MEDIUM":
        return (int(round(WEIGHT_SEVERITY_FIT * 0.80)), "Adequate for Medium Severity Incident")
    elif sev == "LOW":
        return (int(round(WEIGHT_SEVERITY_FIT * 0.70)), "Standard support for Low Urgency Advisory")

    return (int(round(WEIGHT_SEVERITY_FIT * 0.70)), "Standard severity tier alignment")


def is_eligible_candidate(responder: ResponderResponse) -> bool:
    """Filter out responders that cannot legally or physically respond."""
    # 1. Reject offline units
    if responder.status == "OFFLINE":
        return False

    # 2. Reject missing or invalid coordinates
    if responder.latitude is None or responder.longitude is None:
        return False
    if math.isnan(responder.latitude) or math.isnan(responder.longitude):
        return False
    if not (-90.0 <= responder.latitude <= 90.0 and -180.0 <= responder.longitude <= 180.0):
        return False

    # 3. Reject responders actively committed to another incident
    if responder.assigned_incident_id is not None and responder.status in ("ASSIGNED", "ON_SCENE"):
        return False

    return True


def rank_and_explain_candidates(
    incident: IncidentResponse,
    responders: list[ResponderResponse],
) -> list[CandidateResponderResponse]:
    """Score, rank, and generate explainable justifications for candidate responders."""
    if not responders or not incident:
        return []

    # 1. Candidate Filtering
    eligible_responders = [r for r in responders if is_eligible_candidate(r)]
    if not eligible_responders:
        return []

    candidates: list[CandidateResponderResponse] = []

    for resp in eligible_responders:
        dist_km = haversine_distance_km(
            incident.latitude, incident.longitude, resp.latitude, resp.longitude
        )

        # Estimate transit time based on vehicle type and speed
        speed_kmh = 30.0 if resp.capability == "FLOOD_BOAT" else 38.0
        eta_minutes = round(max(1.0, (dist_km / max(1.0, speed_kmh)) * 60.0), 1)
        eta_formatted = f"{int(round(eta_minutes))} min"

        # 2. Compute Individual Component Scores (Weights sum to exactly 100)
        cap_score, cap_reason, cap_pct = compute_capability_score(incident.type, resp.capability)
        avail_score, avail_reason = compute_availability_score(resp.status)
        dist_score, dist_reason = compute_distance_score(dist_km)
        eta_score, eta_reason = compute_eta_score(eta_minutes)
        work_score, work_reason = compute_workload_score(resp.current_load, resp.max_capacity)
        sev_score, sev_reason = compute_severity_fit_score(incident.severity, resp)

        # 3. Total Normalized Score Calculation [0-100]
        final_score = cap_score + avail_score + dist_score + eta_score + work_score + sev_score
        final_score = max(0, min(100, final_score))

        # 4. Construct Explainable Justification Bullets
        positive_factors: list[str] = []
        negative_factors: list[str] = []

        if cap_pct >= 80:
            positive_factors.append(f"✓ {cap_reason} ({cap_pct}% profile match)")
        elif cap_pct >= 50:
            positive_factors.append(f"✓ Compatible secondary capability ({cap_pct}% match)")
        else:
            inc_label = incident.type.replace("_", " ")
            negative_factors.append(f"⚠ Sub-optimal vehicle capability for {inc_label}")

        if resp.status == "AVAILABLE":
            positive_factors.append("✓ Available immediately with zero active commitments")
        elif resp.status in ("NEARBY", "EN_ROUTE"):
            positive_factors.append(f"✓ Active in adjacent sector ({resp.status})")
        else:
            negative_factors.append(f"⚠ Unit currently in '{resp.status}' status")

        if dist_km < 3.0:
            positive_factors.append(
                f"✓ Rapid response transit (~{eta_formatted} / {dist_km:.1f} km)"
            )
        elif dist_km < 7.0:
            positive_factors.append(f"✓ Moderate transit corridor ({dist_km:.1f} km)")
        else:
            negative_factors.append(f"⚠ Extended transit distance ({dist_km:.1f} km)")

        if resp.current_load == 0:
            positive_factors.append(f"✓ Full crew availability (0/{resp.max_capacity} load)")
        else:
            negative_factors.append(
                f"⚠ Active workload backlog ({resp.current_load}/{resp.max_capacity} load)"
            )

        if incident.severity in ("CRITICAL", "HIGH"):
            positive_factors.append(f"✓ {sev_reason}")

        breakdown = ScoreBreakdown(
            final_score=final_score,
            capability_score=cap_score,
            distance_score=dist_score,
            eta_score=eta_score,
            workload_score=work_score,
            availability_score=avail_score,
            severity_fit_score=sev_score,
            # Legacy compatibility mappings
            severity_alignment=sev_score,
            proximity_score=dist_score,
            workload_penalty=WEIGHT_WORKLOAD - work_score,
            total_score=final_score,
        )

        headline = (
            "Recommended Primary Rescue Unit" if final_score >= 75 else "Secondary Standby Unit"
        )

        explanation = CandidateExplanation(
            headline=headline,
            positive_factors=positive_factors,
            negative_factors=negative_factors,
            breakdown=breakdown,
        )

        candidates.append(
            CandidateResponderResponse(
                id=resp.id,
                unit_name=resp.unit_name,
                team_lead=resp.team_lead,
                vehicle_type=resp.vehicle_type,
                capability=resp.capability,
                status=resp.status,
                latitude=resp.latitude,
                longitude=resp.longitude,
                radio_channel=resp.radio_channel,
                max_capacity=resp.max_capacity,
                current_load=resp.current_load,
                assigned_incident_id=resp.assigned_incident_id,
                distance_km=dist_km,
                eta_minutes=eta_minutes,
                eta_formatted=eta_formatted,
                match_score=final_score,
                match_reason=cap_reason,
                is_recommended=False,
                explanation=explanation,
                route_geometry=[],
                route_status="ESTIMATED",
            )
        )

    # 5. Deterministic Sort & Tie-Breaking:
    # 1st by match_score DESC, 2nd by distance_km ASC, 3rd by eta_minutes ASC, 4th by ID ASC
    candidates.sort(key=lambda c: (-c.match_score, c.distance_km, c.eta_minutes, c.id))

    # 6. Explicit Recommendation (Human Override principle: Recommends, does not auto-dispatch)
    for cand in candidates:
        if cand.status in ("AVAILABLE", "NEARBY", "EN_ROUTE"):
            cand.is_recommended = True
            if cand.explanation:
                cand.explanation.headline = f"★ PRIMARY RECOMMENDATION — {cand.unit_name}"
            break

    return candidates
