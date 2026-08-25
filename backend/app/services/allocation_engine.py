"""Salvus Explainable Deterministic Allocation Engine.

Computes mathematically transparent, auditable recommendation scores and
human-readable deterministic explanations for dispatching emergency response units.

NO LLM is used in allocation decisions — zero hallucinations, zero stochasticity,
100% auditable formulas for life-safety operations.
"""

from __future__ import annotations

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

CAPABILITY_MAX_SCORE = 35  # Capability match for specific hazard profile
SEVERITY_ALIGNMENT_MAX_SCORE = 20  # Equipment grade & capacity suitability for severity tier
AVAILABILITY_MAX_SCORE = 20  # Operational readiness state
PROXIMITY_MAX_SCORE = 15  # Distance & transit time decay
WORKLOAD_PENALTY_MAX = 10  # Penalty deduction for current crew load
MAX_OPERATIONAL_RADIUS_KM = 50.0  # Units farther than 50km are penalized to 0 proximity


def compute_capability_score(incident_type: str, capability: str) -> tuple[int, str, int]:
    """Return (score [0-35], descriptive reason, match percentage [0-100])."""
    inc_type = (incident_type or "").lower().strip()
    cap = (capability or "").upper().strip()

    if inc_type == "flood":
        if cap == "FLOOD_BOAT":
            return (35, "Specialized Inflatable Flood Rescue Watercraft", 100)
        elif cap == "AMBULANCE":
            return (24, "High-Water Medical Evacuation Support", 68)
        elif cap == "STRETCHER_TEAM":
            return (20, "Shallow Water Stretcher Extraction", 57)
        elif cap in ("DEBRIS_CLEAR", "HAZMAT"):
            return (14, "Waterway Obstruction Clearance", 40)

    elif inc_type == "medical":
        if cap == "AMBULANCE":
            return (35, "Primary Advanced Life Support Ambulance", 100)
        elif cap == "STRETCHER_TEAM":
            return (28, "Field Triage & Stretcher Transfer", 80)
        elif cap == "FLOOD_BOAT":
            return (18, "Amphibious Medical Transport", 51)
        elif cap in ("HAZMAT", "DEBRIS_CLEAR"):
            return (12, "Perimeter Medical Access Clearance", 34)

    elif inc_type in ("power_line", "hazard", "fire"):
        if cap in ("HAZMAT", "DEBRIS_CLEAR"):
            return (35, "Hazard Mitigation & Infrastructure Isolation", 100)
        elif cap == "STRETCHER_TEAM":
            return (25, "Perimeter Evacuation & Crowd Safety", 71)
        elif cap == "AMBULANCE":
            return (22, "Burn & Trauma Medical Standby", 63)
        elif cap == "FLOOD_BOAT":
            return (12, "Auxiliary Perimeter Transit", 34)

    elif inc_type == "structural":
        if cap == "DEBRIS_CLEAR":
            return (35, "Heavy Debris Removal & Breaching", 100)
        elif cap == "STRETCHER_TEAM":
            return (28, "Confined Space Search & Stretcher Extraction", 80)
        elif cap == "AMBULANCE":
            return (24, "Structural Collapse Trauma Support", 68)
        elif cap == "HAZMAT":
            return (20, "Gas Leak & Structural Hazard Control", 57)

    # General baseline capability
    return (15, "General Auxiliary Rescue Support", 42)


def compute_severity_alignment_score(
    incident_severity: str, responder: ResponderResponse
) -> tuple[int, str]:
    """Evaluate equipment grade compatibility with incident urgency tier."""
    sev = (incident_severity or "").upper().strip()
    cap = responder.max_capacity

    if sev == "CRITICAL":
        if cap >= 6:
            return (20, "High crew capacity (≥6) suited for Critical Life Threat")
        return (15, "Standard crew capacity for Critical Life Threat")
    elif sev == "HIGH":
        return (18, "Optimized for High Priority Emergency Aid")
    elif sev == "MEDIUM":
        return (15, "Adequate for Medium Severity Incident")
    elif sev == "LOW":
        return (12, "Standard support for Low Urgency Advisory")

    return (14, "Standard severity tier alignment")


def compute_availability_score(status: str) -> tuple[int, str]:
    """Compute availability contribution based on operational state."""
    st = (status or "").upper().strip()
    if st == "AVAILABLE":
        return (20, "Available immediately (No active assignment)")
    elif st == "NEARBY":
        return (15, "Operating in adjacent sector (Quick reassignment)")
    elif st == "EN_ROUTE":
        return (8, "En route on secondary task (Divertable)")
    elif st in ("ASSIGNED", "ON_SCENE"):
        return (0, "Currently committed to active mission")
    elif st == "OFFLINE":
        return (-100, "Unit offline / Out of service")

    return (10, f"Status: {st}")


def compute_proximity_score(distance_km: float) -> tuple[int, str]:
    """Calculate non-linear spatial proximity score."""
    if distance_km < 1.0:
        return (15, f"Immediate vicinity ({distance_km} km < 1 km)")
    elif distance_km < 2.5:
        return (12, f"Close operational range ({distance_km} km)")
    elif distance_km < 5.0:
        return (8, f"Moderate transit distance ({distance_km} km)")
    elif distance_km < 10.0:
        return (5, f"Extended transit distance ({distance_km} km)")
    elif distance_km <= MAX_OPERATIONAL_RADIUS_KM:
        return (2, f"Long-range deployment ({distance_km} km)")
    return (0, f"Beyond primary operational radius ({distance_km} km)")


def compute_workload_penalty(current_load: int, max_capacity: int) -> tuple[int, str]:
    """Compute workload penalty deduction [0 to 10]."""
    max_cap = max(1, max_capacity)
    ratio = min(1.0, current_load / max_cap)
    penalty = int(round(ratio * WORKLOAD_PENALTY_MAX))
    if penalty == 0:
        return (0, f"Low workload ({current_load}/{max_cap} crew load)")
    return (penalty, f"Active crew load ({current_load}/{max_cap} capacity)")


def rank_and_explain_candidates(
    incident: IncidentResponse,
    responders: list[ResponderResponse],
) -> list[CandidateResponderResponse]:
    """Score, rank, and generate explainable justifications for all candidate responders."""
    if not responders:
        return []

    candidates: list[CandidateResponderResponse] = []

    for resp in responders:
        # Filter out offline units or invalid coordinates
        if resp.status == "OFFLINE":
            continue
        if resp.latitude is None or resp.longitude is None:
            continue

        dist_km = haversine_distance_km(
            incident.latitude, incident.longitude, resp.latitude, resp.longitude
        )

        # 1. Compute Individual Component Scores
        cap_score, cap_reason, cap_pct = compute_capability_score(incident.type, resp.capability)
        sev_score, sev_reason = compute_severity_alignment_score(incident.severity, resp)
        avail_score, avail_reason = compute_availability_score(resp.status)
        prox_score, prox_reason = compute_proximity_score(dist_km)
        workload_pen, work_reason = compute_workload_penalty(resp.current_load, resp.max_capacity)

        # 2. Total Normalized Score Calculation
        raw_score = cap_score + sev_score + avail_score + prox_score - workload_pen
        total_score = max(0, min(100, raw_score))

        # Approximate transit ETA based on distance and vehicle type
        speed_kmh = 30.0 if resp.capability == "FLOOD_BOAT" else 38.0
        eta_minutes = round(max(1.0, (dist_km / max(1.0, speed_kmh)) * 60.0), 1)
        eta_formatted = f"{int(round(eta_minutes))} min"

        # 3. Construct Explainable Justification Bullets
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
            positive_factors.append(f"✓ Rapid response transit (~{eta_formatted} / {dist_km} km)")
        elif dist_km < 7.0:
            positive_factors.append(f"✓ Moderate transit corridor ({dist_km} km)")
        else:
            negative_factors.append(f"⚠ Extended transit distance ({dist_km} km)")

        if workload_pen == 0:
            load_txt = f"{resp.current_load}/{resp.max_capacity}"
            positive_factors.append(f"✓ Zero load backlog ({load_txt} capacity in use)")
        else:
            load_txt = f"{resp.current_load}/{resp.max_capacity}"
            negative_factors.append(f"⚠ Active workload load ({load_txt} capacity)")

        if incident.severity in ("CRITICAL", "HIGH"):
            positive_factors.append(f"✓ {sev_reason}")

        breakdown = ScoreBreakdown(
            capability_score=cap_score,
            severity_alignment=sev_score,
            availability_score=avail_score,
            proximity_score=prox_score,
            workload_penalty=workload_pen,
            total_score=total_score,
        )

        headline = (
            "Recommended Primary Rescue Unit" if total_score >= 75 else "Secondary Standby Unit"
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
                match_score=total_score,
                match_reason=cap_reason,
                is_recommended=False,
                explanation=explanation,
                route_geometry=[],
                route_status="ESTIMATED",
            )
        )

    # Sort descending by match_score, then ascending by distance_km
    candidates.sort(key=lambda c: (-c.match_score, c.distance_km))

    # Mark top eligible candidate as recommended
    for cand in candidates:
        if cand.status in ("AVAILABLE", "NEARBY", "EN_ROUTE"):
            cand.is_recommended = True
            if cand.explanation:
                cand.explanation.headline = f"★ PRIMARY RECOMMENDATION — {cand.unit_name}"
            break

    return candidates
