"""Salvus Candidate Generation Domain Service.

Provides deterministic eligibility filtering for emergency responder candidate pools.

Separates responders into:
- Eligible responders (ready, valid GPS, matching capability)
- Excluded responders (with explicit, auditable exclusion reasons)

DOES NOT rank or compute scores.
DOES NOT assign.
DOES NOT call AI.
"""

from __future__ import annotations

import math
from typing import Final

import aiosqlite

from app.models import (
    CandidateFilterItem,
    CandidateGenerationResult,
    IncidentResponse,
    ResponderResponse,
)
from app.services.incident_service import get_incident_by_id

# ---------------------------------------------------------------------------
# Deterministic Capability Compatibility Matrix
# ---------------------------------------------------------------------------

DETERMINISTIC_CAPABILITY_MATRIX: Final[dict[str, dict[str, str]]] = {
    "flood": {
        "FLOOD_BOAT": "Specialized Inflatable Flood Rescue Watercraft",
        "AMBULANCE": "High-Water Medical Evacuation Support",
        "STRETCHER_TEAM": "Shallow Water Stretcher Extraction",
        "DEBRIS_CLEAR": "Waterway Obstruction Clearance",
    },
    "medical": {
        "AMBULANCE": "Primary Advanced Life Support Ambulance",
        "STRETCHER_TEAM": "Field Triage & Stretcher Transfer",
        "FLOOD_BOAT": "Amphibious Medical Transport",
    },
    "fire": {
        "HAZMAT": "Hazard Mitigation & Structural Isolation",
        "DEBRIS_CLEAR": "Perimeter Isolation & Clearance",
        "AMBULANCE": "Burn & Trauma Medical Standby",
        "STRETCHER_TEAM": "Perimeter Evacuation & Crowd Safety",
    },
    "hazard": {
        "HAZMAT": "Hazardous Material Mitigation & Containment",
        "DEBRIS_CLEAR": "Contaminated Debris Isolation",
        "AMBULANCE": "Chemical & Toxic Exposure Trauma Support",
        "STRETCHER_TEAM": "Perimeter Safety & Evacuation",
    },
    "power_line": {
        "HAZMAT": "Electrical Arc & Grid Infrastructure Isolation",
        "DEBRIS_CLEAR": "Downed Line & Debris Clearance",
        "AMBULANCE": "Electrocution Trauma Medical Standby",
        "STRETCHER_TEAM": "Perimeter Safety & Cordon Support",
    },
    "structural": {
        "DEBRIS_CLEAR": "Heavy Debris Removal & Breaching",
        "STRETCHER_TEAM": "Confined Space Search & Extraction",
        "AMBULANCE": "Structural Collapse Trauma Support",
        "HAZMAT": "Gas Leak & Structural Hazard Control",
    },
}

DEFAULT_COMPATIBLE_CAPABILITIES: Final[dict[str, str]] = {
    "FLOOD_BOAT": "Auxiliary Watercraft Support",
    "AMBULANCE": "Emergency Medical Support",
    "STRETCHER_TEAM": "General Rescue & Stretcher Support",
    "DEBRIS_CLEAR": "General Debris Clearance",
    "HAZMAT": "General Hazardous Mitigation",
}


def evaluate_responder_eligibility(
    incident: IncidentResponse,
    responder: ResponderResponse,
    required_capability: str | None = None,
) -> CandidateFilterItem:
    """Evaluate a single responder against an incident using deterministic hard filters.

    Returns a CandidateFilterItem with is_eligible=True or explicit exclusion_reason.
    """
    # 1. Hard Filter: Location Validity
    if responder.latitude is None or responder.longitude is None:
        return CandidateFilterItem(
            responder_id=responder.id,
            unit_name=responder.unit_name,
            capability=responder.capability,
            status=responder.status,
            is_eligible=False,
            exclusion_reason="Invalid or missing GPS coordinates",
            responder=responder,
        )

    if math.isnan(responder.latitude) or math.isnan(responder.longitude):
        return CandidateFilterItem(
            responder_id=responder.id,
            unit_name=responder.unit_name,
            capability=responder.capability,
            status=responder.status,
            is_eligible=False,
            exclusion_reason="Invalid or NaN GPS coordinates",
            responder=responder,
        )

    if not (-90.0 <= responder.latitude <= 90.0 and -180.0 <= responder.longitude <= 180.0):
        return CandidateFilterItem(
            responder_id=responder.id,
            unit_name=responder.unit_name,
            capability=responder.capability,
            status=responder.status,
            is_eligible=False,
            exclusion_reason=(
                f"Coordinates out of bounds ({responder.latitude}, {responder.longitude})"
            ),
            responder=responder,
        )

    # 2. Hard Filter: Operational Status (OFFLINE)
    st = (responder.status or "").upper().strip()
    if st == "OFFLINE":
        return CandidateFilterItem(
            responder_id=responder.id,
            unit_name=responder.unit_name,
            capability=responder.capability,
            status=responder.status,
            is_eligible=False,
            exclusion_reason="Unit is OFFLINE / Out of Service",
            responder=responder,
        )

    # 3. Hard Filter: Active Assignment
    if (
        responder.assigned_incident_id is not None
        and responder.assigned_incident_id != incident.id
        and st in ("ASSIGNED", "ON_SCENE")
    ):
        return CandidateFilterItem(
            responder_id=responder.id,
            unit_name=responder.unit_name,
            capability=responder.capability,
            status=responder.status,
            is_eligible=False,
            exclusion_reason=(
                f"Already actively assigned to mission #{responder.assigned_incident_id[:8]}"
            ),
            responder=responder,
        )

    # 4. Capability Filter: Explicit Required Capability check
    req_cap = (required_capability or "").upper().strip()
    resp_cap = (responder.capability or "").upper().strip()

    if req_cap and resp_cap != req_cap:
        return CandidateFilterItem(
            responder_id=responder.id,
            unit_name=responder.unit_name,
            capability=responder.capability,
            status=responder.status,
            is_eligible=False,
            exclusion_reason=f"Required capability '{req_cap}' not met by '{resp_cap}'",
            responder=responder,
        )

    # 5. Capability Filter: Incident Type Compatibility
    inc_type = (incident.type or "").lower().strip()
    compatible_map = DETERMINISTIC_CAPABILITY_MATRIX.get(inc_type, DEFAULT_COMPATIBLE_CAPABILITIES)

    if resp_cap not in compatible_map:
        return CandidateFilterItem(
            responder_id=responder.id,
            unit_name=responder.unit_name,
            capability=responder.capability,
            status=responder.status,
            is_eligible=False,
            exclusion_reason=(
                f"Capability mismatch ('{resp_cap}' cannot service '{inc_type}' incident)"
            ),
            responder=responder,
        )

    match_reason = compatible_map[resp_cap]
    return CandidateFilterItem(
        responder_id=responder.id,
        unit_name=responder.unit_name,
        capability=responder.capability,
        status=responder.status,
        is_eligible=True,
        exclusion_reason=None,
        match_reason=match_reason,
        responder=responder,
    )


def generate_candidate_pool(
    incident: IncidentResponse,
    responders: list[ResponderResponse],
    required_capability: str | None = None,
) -> CandidateGenerationResult:
    """Evaluate full responder fleet against an incident and partition into sets."""
    eligible: list[CandidateFilterItem] = []
    excluded: list[CandidateFilterItem] = []

    for resp in responders:
        item = evaluate_responder_eligibility(
            incident=incident,
            responder=resp,
            required_capability=required_capability,
        )
        if item.is_eligible:
            eligible.append(item)
        else:
            excluded.append(item)

    return CandidateGenerationResult(
        incident_id=incident.id,
        incident_type=incident.type,
        required_capability=required_capability,
        eligible_responders=eligible,
        excluded_responders=excluded,
        total_evaluated=len(responders),
        total_eligible=len(eligible),
        total_excluded=len(excluded),
    )


async def get_candidate_pool_for_incident(
    db: aiosqlite.Connection,
    incident_id: str,
    required_capability: str | None = None,
) -> CandidateGenerationResult | None:
    """Fetch incident and responders from DB and perform deterministic candidate generation."""
    from app.services.responder_service import get_all_responders

    incident = await get_incident_by_id(db, incident_id)
    if not incident:
        return None

    responders = await get_all_responders(db)
    return generate_candidate_pool(
        incident=incident,
        responders=responders,
        required_capability=required_capability,
    )
