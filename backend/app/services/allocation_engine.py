"""Salvus Explainable Deterministic Allocation Engine.

Computes mathematically transparent, auditable recommendation scores and
human-readable deterministic explanations for ranking emergency response units.

NO LLM is used in allocation decisions — zero hallucinations, zero stochasticity,
100% auditable formulas for life-safety operations.

Normalization Rules:
--------------------
1. Distance Normalization [0.0 to 1.0]:
   norm_distance = max(0.0, 1.0 - (distance_km / MAX_OPERATIONAL_RADIUS_KM))
   score_distance = round(norm_distance * WEIGHT_DISTANCE)

2. ETA Normalization [0.0 to 1.0]:
   norm_eta = max(0.0, 1.0 - (eta_minutes / MAX_OPERATIONAL_ETA_MINUTES))
   score_eta = round(norm_eta * WEIGHT_ETA)

3. Workload Normalization [0.0 to 1.0]:
   norm_workload = max(0.0, min(1.0, (max_capacity - current_load) / max(1, max_capacity)))
   score_workload = round(norm_workload * WEIGHT_WORKLOAD)

4. Capability Match [0.0 to 1.0]:
   norm_capability = match_percentage / 100.0
   score_capability = round(norm_capability * WEIGHT_CAPABILITY)

5. Availability Multiplier [0.0 to 1.0]:
   AVAILABLE = 1.0, NEARBY = 0.75, EN_ROUTE = 0.40, others = 0.0
   score_availability = round(norm_availability * WEIGHT_AVAILABILITY)

6. Severity Alignment [0.0 to 1.0]:
   Crew capacity and equipment tier suitability multiplier [0.70 to 1.0]
   score_severity = round(norm_severity * WEIGHT_SEVERITY_FIT)
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Final

from app.models import (
    CandidateExplanation,
    CandidateResponderResponse,
    IncidentResponse,
    ResponderResponse,
    ScoreBreakdown,
)
from app.services.candidate_generation import evaluate_responder_eligibility
from app.services.routing_service import haversine_distance_km

# ---------------------------------------------------------------------------
# Centralized Auditable Scoring Configuration (Total Max = 100)
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class AllocationScoringWeights:
    """Centralized auditable weight configuration for deterministic allocation scoring."""

    capability: int = 30  # Specialized equipment & skill match for hazard profile
    availability: int = 20  # Operational readiness state
    distance: int = 15  # Spatial proximity decay
    eta: int = 15  # Real-world or corridor transit time
    workload: int = 10  # Available crew load / remaining capacity
    severity_fit: int = 10  # Equipment tier & crew capacity alignment with urgency

    @property
    def total(self) -> int:
        return (
            self.capability
            + self.availability
            + self.distance
            + self.eta
            + self.workload
            + self.severity_fit
        )

    def as_dict(self) -> dict[str, int]:
        return {
            "capability": self.capability,
            "availability": self.availability,
            "distance": self.distance,
            "eta": self.eta,
            "workload": self.workload,
            "severity_fit": self.severity_fit,
        }


DEFAULT_SCORING_WEIGHTS: Final[AllocationScoringWeights] = AllocationScoringWeights()

# Module-level weight constants for backwards compatibility
WEIGHT_CAPABILITY: Final[int] = DEFAULT_SCORING_WEIGHTS.capability
WEIGHT_AVAILABILITY: Final[int] = DEFAULT_SCORING_WEIGHTS.availability
WEIGHT_DISTANCE: Final[int] = DEFAULT_SCORING_WEIGHTS.distance
WEIGHT_ETA: Final[int] = DEFAULT_SCORING_WEIGHTS.eta
WEIGHT_WORKLOAD: Final[int] = DEFAULT_SCORING_WEIGHTS.workload
WEIGHT_SEVERITY_FIT: Final[int] = DEFAULT_SCORING_WEIGHTS.severity_fit

MAX_OPERATIONAL_RADIUS_KM: Final[float] = 25.0  # Proximity normalizes to 0 beyond 25 km
MAX_OPERATIONAL_ETA_MINUTES: Final[float] = 35.0  # Transit ETA normalizes to 0 beyond 35 min


# ---------------------------------------------------------------------------
# Deterministic Normalization & Scoring Functions
# ---------------------------------------------------------------------------


def normalize_distance(
    distance_km: float,
    max_radius_km: float = MAX_OPERATIONAL_RADIUS_KM,
) -> float:
    """Normalize distance to a continuous [0.0, 1.0] factor.

    Formula: max(0.0, 1.0 - (distance_km / max_radius_km))
    """
    if distance_km <= 0.0:
        return 1.0
    if distance_km >= max_radius_km:
        return 0.0
    return max(0.0, min(1.0, 1.0 - (distance_km / max_radius_km)))


def normalize_eta(
    eta_minutes: float,
    max_eta_minutes: float = MAX_OPERATIONAL_ETA_MINUTES,
) -> float:
    """Normalize estimated transit time to a continuous [0.0, 1.0] factor.

    Formula: max(0.0, 1.0 - (eta_minutes / max_eta_minutes))
    """
    if eta_minutes <= 0.0:
        return 1.0
    if eta_minutes >= max_eta_minutes:
        return 0.0
    return max(0.0, min(1.0, 1.0 - (eta_minutes / max_eta_minutes)))


def normalize_workload(current_load: int, max_capacity: int) -> float:
    """Normalize available crew load ratio to a continuous [0.0, 1.0] factor.

    Formula: (max_capacity - current_load) / max_capacity
    """
    max_cap = max(1, max_capacity)
    load = max(0, min(current_load, max_cap))
    return max(0.0, min(1.0, (max_cap - load) / max_cap))


def compute_capability_score(
    incident_type: str,
    capability: str,
    weights: AllocationScoringWeights = DEFAULT_SCORING_WEIGHTS,
) -> tuple[int, str, int]:
    """Calculate specialized capability match score [0 to weights.capability].

    Returns (score, descriptive_reason, match_percentage).
    """
    inc_type = (incident_type or "").lower().strip()
    cap = (capability or "").upper().strip()

    if inc_type == "flood":
        if cap == "FLOOD_BOAT":
            return (weights.capability, "Specialized Inflatable Flood Rescue Watercraft", 100)
        elif cap == "AMBULANCE":
            pct = 70
            return (
                int(round(weights.capability * (pct / 100.0))),
                "High-Water Medical Evacuation Support",
                pct,
            )
        elif cap == "STRETCHER_TEAM":
            pct = 60
            return (
                int(round(weights.capability * (pct / 100.0))),
                "Shallow Water Stretcher Extraction",
                pct,
            )
        elif cap in ("DEBRIS_CLEAR", "HAZMAT"):
            pct = 40
            return (
                int(round(weights.capability * (pct / 100.0))),
                "Waterway Obstruction Clearance",
                pct,
            )

    elif inc_type == "medical":
        if cap == "AMBULANCE":
            return (weights.capability, "Primary Advanced Life Support Ambulance", 100)
        elif cap == "STRETCHER_TEAM":
            pct = 80
            return (
                int(round(weights.capability * (pct / 100.0))),
                "Field Triage & Stretcher Transfer",
                pct,
            )
        elif cap == "FLOOD_BOAT":
            pct = 50
            return (
                int(round(weights.capability * (pct / 100.0))),
                "Amphibious Medical Transport",
                pct,
            )
        elif cap in ("HAZMAT", "DEBRIS_CLEAR"):
            pct = 30
            return (
                int(round(weights.capability * (pct / 100.0))),
                "Perimeter Medical Access Clearance",
                pct,
            )

    elif inc_type in ("power_line", "hazard", "fire"):
        if cap in ("HAZMAT", "DEBRIS_CLEAR"):
            return (weights.capability, "Hazard Mitigation & Infrastructure Isolation", 100)
        elif cap == "STRETCHER_TEAM":
            pct = 70
            return (
                int(round(weights.capability * (pct / 100.0))),
                "Perimeter Evacuation & Crowd Safety",
                pct,
            )
        elif cap == "AMBULANCE":
            pct = 60
            return (
                int(round(weights.capability * (pct / 100.0))),
                "Burn & Trauma Medical Standby",
                pct,
            )
        elif cap == "FLOOD_BOAT":
            pct = 30
            return (
                int(round(weights.capability * (pct / 100.0))),
                "Auxiliary Perimeter Transit",
                pct,
            )

    elif inc_type == "structural":
        if cap == "DEBRIS_CLEAR":
            return (weights.capability, "Heavy Debris Removal & Breaching", 100)
        elif cap == "STRETCHER_TEAM":
            pct = 80
            return (
                int(round(weights.capability * (pct / 100.0))),
                "Confined Space Search & Extraction",
                pct,
            )
        elif cap == "AMBULANCE":
            pct = 70
            return (
                int(round(weights.capability * (pct / 100.0))),
                "Structural Collapse Trauma Support",
                pct,
            )
        elif cap == "HAZMAT":
            pct = 60
            return (
                int(round(weights.capability * (pct / 100.0))),
                "Gas Leak & Structural Hazard Control",
                pct,
            )

    # General baseline capability
    pct = 40
    return (
        int(round(weights.capability * (pct / 100.0))),
        "General Auxiliary Rescue Support",
        pct,
    )


def compute_availability_score(
    status: str,
    weights: AllocationScoringWeights = DEFAULT_SCORING_WEIGHTS,
) -> tuple[int, str]:
    """Compute availability contribution based on operational state [0 to weights.availability]."""
    st = (status or "").upper().strip()
    if st == "AVAILABLE":
        return (weights.availability, "Available immediately (No active commitments)")
    elif st == "NEARBY":
        return (
            int(round(weights.availability * 0.75)),
            "Operating in adjacent sector (Quick reassignment)",
        )
    elif st == "EN_ROUTE":
        return (int(round(weights.availability * 0.40)), "En route on secondary task (Divertable)")
    elif st in ("ASSIGNED", "ON_SCENE"):
        return (0, "Currently committed to active mission")
    elif st == "OFFLINE":
        return (0, "Unit offline / Out of service")

    return (int(round(weights.availability * 0.50)), f"Status: {st}")


def compute_distance_score(
    distance_km: float,
    weights: AllocationScoringWeights = DEFAULT_SCORING_WEIGHTS,
) -> tuple[int, str]:
    """Calculate normalized spatial proximity score [0 to weights.distance]."""
    norm = normalize_distance(distance_km)
    score = int(round(norm * weights.distance))

    if distance_km < 1.0:
        return (score, f"Immediate vicinity ({distance_km:.1f} km < 1 km)")
    elif distance_km < 3.0:
        return (score, f"Close operational range ({distance_km:.1f} km)")
    elif distance_km < 8.0:
        return (score, f"Moderate transit distance ({distance_km:.1f} km)")
    elif distance_km <= MAX_OPERATIONAL_RADIUS_KM:
        return (score, f"Extended transit distance ({distance_km:.1f} km)")
    return (0, f"Beyond primary operational radius ({distance_km:.1f} km)")


def compute_eta_score(
    eta_minutes: float,
    weights: AllocationScoringWeights = DEFAULT_SCORING_WEIGHTS,
) -> tuple[int, str]:
    """Calculate normalized transit ETA score [0 to weights.eta]."""
    norm = normalize_eta(eta_minutes)
    score = int(round(norm * weights.eta))

    if eta_minutes <= 3.0:
        return (score, f"Rapid arrival (~{int(round(eta_minutes))} min <= 3 min)")
    elif eta_minutes <= 8.0:
        return (score, f"Fast arrival (~{int(round(eta_minutes))} min)")
    elif eta_minutes <= 15.0:
        return (score, f"Moderate arrival (~{int(round(eta_minutes))} min)")
    elif eta_minutes <= MAX_OPERATIONAL_ETA_MINUTES:
        return (score, f"Extended arrival (~{int(round(eta_minutes))} min)")
    return (0, f"High transit delay (~{int(round(eta_minutes))} min)")


def compute_workload_score(
    current_load: int,
    max_capacity: int,
    weights: AllocationScoringWeights = DEFAULT_SCORING_WEIGHTS,
) -> tuple[int, str]:
    """Compute normalized workload capacity score [0 to weights.workload]."""
    norm = normalize_workload(current_load, max_capacity)
    score = int(round(norm * weights.workload))
    max_cap = max(1, max_capacity)
    load = max(0, min(current_load, max_cap))

    if load == 0:
        return (score, f"Zero load backlog (0/{max_cap} crew capacity used)")
    elif norm >= 0.5:
        return (score, f"Low workload ({load}/{max_cap} crew capacity in use)")
    return (score, f"Heavy workload ({load}/{max_cap} crew capacity in use)")


def compute_severity_fit_score(
    incident_severity: str,
    responder: ResponderResponse,
    weights: AllocationScoringWeights = DEFAULT_SCORING_WEIGHTS,
) -> tuple[int, str]:
    """Evaluate equipment grade and capacity alignment with urgency tier [0 to severity_fit]."""
    sev = (incident_severity or "").upper().strip()
    cap = responder.max_capacity

    if sev == "CRITICAL":
        if cap >= 6:
            return (
                weights.severity_fit,
                "High crew capacity (≥6) optimized for Critical Life Threat",
            )
        return (
            int(round(weights.severity_fit * 0.70)),
            "Standard crew capacity for Critical Life Threat",
        )
    elif sev == "HIGH":
        return (
            int(round(weights.severity_fit * 0.90)),
            "Optimized for High Priority Emergency Aid",
        )
    elif sev == "MEDIUM":
        return (
            int(round(weights.severity_fit * 0.80)),
            "Adequate for Medium Severity Incident",
        )
    elif sev == "LOW":
        return (
            int(round(weights.severity_fit * 0.70)),
            "Standard support for Low Urgency Advisory",
        )

    return (int(round(weights.severity_fit * 0.70)), "Standard severity tier alignment")


def is_eligible_candidate(responder: ResponderResponse) -> bool:
    """Check basic responder eligibility for backwards compatibility."""
    dummy_inc = IncidentResponse(
        id="eligibility-check",
        ticket_id="SV-CHECK",
        type="general",
        severity="MEDIUM",
        status="NEW",
        latitude=responder.latitude if responder.latitude is not None else 0.0,
        longitude=responder.longitude if responder.longitude is not None else 0.0,
        description="Check",
        created_at="2026-08-25T12:00:00Z",
        updated_at="2026-08-25T12:00:00Z",
    )
    item = evaluate_responder_eligibility(dummy_inc, responder)
    return item.is_eligible


# ---------------------------------------------------------------------------
# Explainable Allocation & Ranking Pipeline
# ---------------------------------------------------------------------------


def _generate_primary_reason(
    cand: CandidateResponderResponse,
    incident: IncidentResponse,
    cap_reason: str,
    cap_pct: int,
) -> str:
    """Generate concise deterministic explanation of why unit is recommended."""
    avail_phrase = (
        "available immediately" if cand.status == "AVAILABLE" else f"active ({cand.status})"
    )
    load_phrase = (
        "zero load backlog"
        if cand.current_load == 0
        else f"capacity for {cand.max_capacity - cand.current_load} additional pax"
    )
    return (
        f"Recommended because {cand.unit_name} is {avail_phrase}, "
        f"has {cap_reason} ({cap_pct}% match), "
        f"and offers fastest transit corridor (~{cand.eta_formatted} / "
        f"{cand.distance_km:.1f} km) with {load_phrase}."
    )


def _generate_comparative_reason(
    alt: CandidateResponderResponse,
    primary: CandidateResponderResponse,
    alt_cap_pct: int,
    primary_cap_pct: int,
) -> str:
    """Generate concise deterministic comparative explanation for alternative candidates."""
    reasons: list[str] = []

    # 1. Capability difference
    if alt_cap_pct < primary_cap_pct:
        reasons.append(f"secondary capability ({alt_cap_pct}% match vs {primary_cap_pct}%)")

    # 2. Status difference
    if alt.status != "AVAILABLE" and primary.status == "AVAILABLE":
        reasons.append(f"status is {alt.status}")

    # 3. ETA delta
    eta_diff = round(alt.eta_minutes - primary.eta_minutes, 1)
    if eta_diff >= 1.0:
        reasons.append(f"ETA {int(round(eta_diff))} min slower")

    # 4. Distance delta
    dist_diff = round(alt.distance_km - primary.distance_km, 1)
    if dist_diff >= 0.5:
        reasons.append(f"{dist_diff} km farther")

    # 5. Workload delta
    if alt.current_load > primary.current_load:
        reasons.append(f"higher crew load ({alt.current_load}/{alt.max_capacity})")

    if not reasons:
        return "Viable standby alternative; subordinated due to deterministic tie-breaking."

    return f"Viable alternative, but {', '.join(reasons)}."


def rank_and_explain_candidates(
    incident: IncidentResponse,
    responders: list[ResponderResponse],
    weights: AllocationScoringWeights = DEFAULT_SCORING_WEIGHTS,
    limit: int = 3,
) -> list[CandidateResponderResponse]:
    """Score, rank, and generate explainable justifications for candidate responders.

    Parameters:
        incident: The distress incident context.
        responders: Full fleet snapshot.
        weights: Centralized scoring weights (sum to 100).
        limit: Max candidates to return (top 3 by default).

    Returns:
        Deterministic ranked candidate list with 1-based ranks and auditable factor breakdowns.
    """
    if not responders or not incident:
        return []

    # 1. First-stage Deterministic Hard Filtering (from Candidate Generation)
    evaluated_items = [evaluate_responder_eligibility(incident, r) for r in responders]
    eligible_responders = [
        item.responder for item in evaluated_items if item.is_eligible and item.responder
    ]

    if not eligible_responders:
        return []

    now_iso = datetime.now(UTC).isoformat()
    scored_candidates: list[tuple[CandidateResponderResponse, int]] = []

    for resp in eligible_responders:
        dist_km = haversine_distance_km(
            incident.latitude, incident.longitude, resp.latitude, resp.longitude
        )

        # Estimate realistic transit speed based on craft capability
        speed_kmh = 30.0 if resp.capability == "FLOOD_BOAT" else 38.0
        eta_minutes = round(max(1.0, (dist_km / max(1.0, speed_kmh)) * 60.0), 1)
        eta_formatted = f"{int(round(eta_minutes))} min"

        # 2. Compute Individual Component Scores (Weights sum to exactly 100)
        cap_score, cap_reason, cap_pct = compute_capability_score(
            incident.type, resp.capability, weights
        )
        avail_score, _ = compute_availability_score(resp.status, weights)
        dist_score, _ = compute_distance_score(dist_km, weights)
        eta_score, _ = compute_eta_score(eta_minutes, weights)
        work_score, _ = compute_workload_score(resp.current_load, resp.max_capacity, weights)
        sev_score, sev_reason = compute_severity_fit_score(incident.severity, resp, weights)

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
        elif dist_km < 8.0:
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
            max_weights=weights.as_dict(),
            # Legacy compatibility mappings
            severity_alignment=sev_score,
            proximity_score=dist_score,
            workload_penalty=weights.workload - work_score,
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

        candidate_obj = CandidateResponderResponse(
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
            distance_km=round(dist_km, 2),
            eta_minutes=eta_minutes,
            eta_formatted=eta_formatted,
            match_score=final_score,
            match_reason=cap_reason,
            is_recommended=False,
            rank=1,
            explanation=explanation,
            comparative_reason=None,
            calculated_at=now_iso,
            route_geometry=[],
            route_status="ESTIMATED",
        )
        scored_candidates.append((candidate_obj, cap_pct))

    # 5. Deterministic Multi-Level Tie-Breaking:
    # 1st by match_score DESC, 2nd by distance_km ASC, 3rd by eta_minutes ASC,
    # 4th by current_load ASC, 5th by ID ASC (guarantees strict reproducible ordering)
    scored_candidates.sort(
        key=lambda item: (
            -item[0].match_score,
            item[0].distance_km,
            item[0].eta_minutes,
            item[0].current_load,
            item[0].id,
        )
    )

    # 6. Apply Top N Limit & Assign Explicit 1-based Ranks and Comparative Reasons
    top_items = scored_candidates[:limit] if limit > 0 else scored_candidates
    top_candidates = [item[0] for item in top_items]

    if top_candidates:
        primary_cand = top_candidates[0]
        primary_cap_pct = top_items[0][1]
        primary_cand.rank = 1
        primary_cand.is_recommended = True
        if primary_cand.explanation:
            primary_cand.explanation.headline = (
                f"★ PRIMARY RECOMMENDATION — {primary_cand.unit_name}"
            )
            # Ensure match_reason has deterministic full primary explanation
            primary_cand.match_reason = _generate_primary_reason(
                primary_cand, incident, primary_cand.match_reason, primary_cap_pct
            )

        for idx, (alt_cand, alt_cap_pct) in enumerate(top_items[1:], start=2):
            alt_cand.rank = idx
            alt_cand.is_recommended = False
            alt_cand.comparative_reason = _generate_comparative_reason(
                alt_cand, primary_cand, alt_cap_pct, primary_cap_pct
            )

    return top_candidates
