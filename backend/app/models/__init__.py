"""Pydantic models and enums for the Salvus disaster coordination domain."""

from __future__ import annotations

from enum import StrEnum

from pydantic import BaseModel, Field, field_validator

# ---------------------------------------------------------------------------
# Enums
# ---------------------------------------------------------------------------


class IncidentType(StrEnum):
    FLOOD = "flood"
    FIRE = "fire"
    MEDICAL = "medical"
    HAZARD = "hazard"
    POWER_LINE = "power_line"
    STRUCTURAL = "structural"
    OTHER = "other"


class IncidentSeverity(StrEnum):
    CRITICAL = "CRITICAL"
    HIGH = "HIGH"
    MEDIUM = "MEDIUM"
    LOW = "LOW"


class IncidentStatus(StrEnum):
    NEW = "NEW"
    TRIAGE_PENDING = "TRIAGE_PENDING"
    VERIFIED = "VERIFIED"
    ASSIGNED = "ASSIGNED"
    EN_ROUTE = "EN_ROUTE"
    NEARBY = "NEARBY"
    ON_SCENE = "ON_SCENE"
    RESOLVED = "RESOLVED"
    CANCELLED = "CANCELLED"


class ResponderStatus(StrEnum):
    AVAILABLE = "AVAILABLE"
    ASSIGNED = "ASSIGNED"
    EN_ROUTE = "EN_ROUTE"
    NEARBY = "NEARBY"
    ON_SCENE = "ON_SCENE"
    OFFLINE = "OFFLINE"


class AssignmentStatus(StrEnum):
    PROPOSED = "PROPOSED"
    ASSIGNED = "ASSIGNED"
    EN_ROUTE = "EN_ROUTE"
    NEARBY = "NEARBY"
    ON_SCENE = "ON_SCENE"
    COMPLETED = "COMPLETED"
    CANCELLED = "CANCELLED"


class ResponderCapability(StrEnum):
    FLOOD_BOAT = "FLOOD_BOAT"
    AMBULANCE = "AMBULANCE"
    STRETCHER_TEAM = "STRETCHER_TEAM"
    DEBRIS_CLEAR = "DEBRIS_CLEAR"
    HAZMAT = "HAZMAT"


class ShelterStatus(StrEnum):
    OPEN = "OPEN"
    NEAR_CAPACITY = "NEAR_CAPACITY"
    FULL = "FULL"
    CLOSED = "CLOSED"


class HazardSeverity(StrEnum):
    CRITICAL = "CRITICAL"
    WARNING = "WARNING"
    WATCH = "WATCH"
    ADVISORY = "ADVISORY"
    INFO = "INFO"


class HazardType(StrEnum):
    FLOOD = "FLOOD"
    EARTHQUAKE = "EARTHQUAKE"
    WEATHER = "WEATHER"
    CYCLONE = "CYCLONE"
    FIRE = "FIRE"
    INFRASTRUCTURE = "INFRASTRUCTURE"
    OTHER = "OTHER"


# ---------------------------------------------------------------------------
# Incident Models
# ---------------------------------------------------------------------------


class IncidentCreate(BaseModel):
    """Payload for creating a new incident."""

    type: IncidentType
    severity: IncidentSeverity = IncidentSeverity.MEDIUM
    description: str = Field(default="", max_length=2000)
    reporter_name: str = Field(default="Anonymous", max_length=200)
    reporter_phone: str | None = Field(default=None, max_length=20)
    latitude: float = Field(ge=-90, le=90)
    longitude: float = Field(ge=-180, le=180)
    affected_count: int = Field(default=1, ge=1, le=10000)
    is_sos: bool = False

    @field_validator("description")
    @classmethod
    def description_not_empty_for_non_sos(cls, v: str, info) -> str:
        return v.strip()


class IncidentStatusUpdate(BaseModel):
    """Payload for updating incident status."""

    status: IncidentStatus
    actor: str = Field(default="authority", max_length=200)


class IncidentEventResponse(BaseModel):
    """A single audit event in the incident timeline."""

    id: str
    incident_id: str
    event_type: str
    previous_status: str | None = None
    new_status: str | None = None
    actor: str
    metadata: str | None = None
    created_at: str


# ---------------------------------------------------------------------------
# AI Triage Models
# ---------------------------------------------------------------------------


class AITriageAssessment(BaseModel):
    """Structured decision-support triage output produced by AI or fallback engine."""

    incident_type: IncidentType
    severity: IncidentSeverity
    severity_level: int = Field(
        ge=1, le=5, description="1=LOW, 2=MODERATE, 3=HIGH, 4=CRITICAL, 5=LIFE_THREATENING"
    )
    confidence: float = Field(ge=0.0, le=1.0, description="Confidence score between 0.0 and 1.0")
    hazard_type: str = Field(
        description="Domain-specific hazard label, e.g. Flash Flood & Surge Inundation"
    )
    affected_people: int = Field(default=1, ge=1)
    key_signals: list[str] = Field(
        default_factory=list, description="Concrete grounded signals extracted from report"
    )
    recommended_capability: ResponderCapability = Field(
        description="Matched responder equipment requirement"
    )
    priority_reasoning: str = Field(
        description="Concise evidence-grounded justification for operational urgency"
    )
    uncertainty_flags: list[str] = Field(
        default_factory=list, description="Ambiguities or unverified conditions"
    )
    image_assessment_hint: str | None = Field(
        default=None, description="Tagged with 'AI ESTIMATE — UNVERIFIED'"
    )
    provider: str = Field(
        default="gemini-2.0-flash", description="AI Provider or fallback identifier"
    )
    model: str = Field(default="gemini-2.0-flash", description="Underlying model name")
    evaluated_at: str
    needs_review: bool = Field(
        default=False, description="True if confidence < 0.75 or critical flags present"
    )
    review_status: str = Field(
        default="PENDING", description="PENDING | VERIFIED | ADJUSTED | REJECTED"
    )


class TriageVerificationRequest(BaseModel):
    """Operator verification or adjustment payload for human-in-the-loop triage approval."""

    actor: str = Field(default="authority", max_length=200)
    reviewer_notes: str | None = Field(default=None, max_length=1000)
    adjusted_severity: IncidentSeverity | None = None
    adjusted_type: IncidentType | None = None
    adjusted_capability: ResponderCapability | None = None


class AITriageSingleResponse(BaseModel):
    """Response wrapper for AI triage assessment."""

    success: bool = True
    data: AITriageAssessment


class IncidentResponse(BaseModel):
    """Full incident response with event history and optional AI decision support."""

    id: str
    ticket_id: str
    type: str
    severity: str
    description: str
    reporter_name: str
    reporter_phone: str | None = None
    latitude: float
    longitude: float
    affected_count: int
    is_sos: bool
    status: str
    created_at: str
    updated_at: str
    events: list[IncidentEventResponse] = []
    ai_triage: AITriageAssessment | None = None


class IncidentListResponse(BaseModel):
    """Response for listing incidents."""

    success: bool = True
    data: list[IncidentResponse]
    count: int


class IncidentSingleResponse(BaseModel):
    """Response for a single incident."""

    success: bool = True
    data: IncidentResponse


# ---------------------------------------------------------------------------
# Responder Models
# ---------------------------------------------------------------------------


class ResponderStatusUpdate(BaseModel):
    """Payload for updating responder status or incident assignment."""

    status: ResponderStatus | None = None
    assigned_incident_id: str | None = None
    actor: str = Field(default="authority", max_length=200)


class ResponderAssignmentRequest(BaseModel):
    """Payload for assigning a responder unit to an incident."""

    incident_id: str
    status: ResponderStatus = ResponderStatus.ASSIGNED
    actor: str = Field(default="authority", max_length=200)


class ResponderLocationUpdate(BaseModel):
    """Payload for updating real-time coordinates of a response unit."""

    latitude: float = Field(ge=-90, le=90)
    longitude: float = Field(ge=-180, le=180)
    actor: str = Field(default="responder", max_length=200)


class ResponderResponse(BaseModel):
    """Responder fleet unit schema."""

    id: str
    unit_name: str
    team_lead: str
    vehicle_type: str
    capability: str
    status: str
    latitude: float
    longitude: float
    radio_channel: str
    max_capacity: int
    current_load: int
    assigned_incident_id: str | None = None
    last_seen: str
    created_at: str
    updated_at: str


class ResponderListResponse(BaseModel):
    """Response for listing responders."""

    success: bool = True
    data: list[ResponderResponse]
    count: int


class ResponderSingleResponse(BaseModel):
    """Response for a single responder."""

    success: bool = True
    data: ResponderResponse


class ScoreBreakdown(BaseModel):
    """Auditable scoring factor breakdown."""

    capability_score: int
    severity_alignment: int
    availability_score: int
    proximity_score: int
    workload_penalty: int
    total_score: int


class CandidateExplanation(BaseModel):
    """Deterministic explanation for a responder recommendation."""

    headline: str
    positive_factors: list[str] = []
    negative_factors: list[str] = []
    breakdown: ScoreBreakdown


class CandidateResponderResponse(BaseModel):
    """Candidate responder ranked by capability, proximity, ETA, and workload."""

    id: str
    unit_name: str
    team_lead: str
    vehicle_type: str
    capability: str
    status: str
    latitude: float
    longitude: float
    radio_channel: str
    max_capacity: int
    current_load: int
    assigned_incident_id: str | None = None
    distance_km: float
    eta_minutes: float = 0.0
    eta_formatted: str = "N/A"
    match_score: int
    match_reason: str
    is_recommended: bool
    explanation: CandidateExplanation | None = None
    route_geometry: list[list[float]] = []
    route_status: str = "ESTIMATED"


class ResponderCandidateListResponse(BaseModel):
    """Response for candidate responders matching an incident."""

    success: bool = True
    incident_id: str
    data: list[CandidateResponderResponse]
    count: int


class ResponderLifecycleAdvanceRequest(BaseModel):
    """Payload for advancing responder along operational journey."""

    target_status: ResponderStatus
    actor: str = Field(default="authority", max_length=200)
    notes: str | None = None


# ---------------------------------------------------------------------------
# Assignment Models
# ---------------------------------------------------------------------------


class AssignmentScoreBreakdown(BaseModel):
    """Structured breakdown of deterministic or AI scoring factors."""

    capability: float = Field(default=0.0, description="Capability match factor score")
    distance: float = Field(default=0.0, description="Proximity factor score")
    eta: float = Field(default=0.0, description="Travel time factor score")
    workload: float = Field(default=0.0, description="Load/capacity factor score")
    severity_fit: float = Field(default=0.0, description="Severity alignment factor score")


class AssignmentCreate(BaseModel):
    """Payload for creating a new incident-to-responder assignment."""

    incident_id: str
    responder_id: str
    status: AssignmentStatus = AssignmentStatus.ASSIGNED
    assigned_by: str = Field(default="authority", max_length=200)
    score: float | None = None
    score_breakdown: AssignmentScoreBreakdown | None = None
    assignment_reason: str | None = Field(default=None, max_length=1000)


class AssignmentStatusUpdate(BaseModel):
    """Payload for transitioning assignment status along its controlled lifecycle."""

    status: AssignmentStatus
    actor: str = Field(default="authority", max_length=200)
    notes: str | None = Field(default=None, max_length=1000)


class AssignmentResponse(BaseModel):
    """Domain model representing an active or historical responder assignment."""

    id: str
    incident_id: str
    responder_id: str
    status: str
    assigned_by: str
    assigned_at: str
    accepted_at: str | None = None
    started_at: str | None = None
    arrived_at: str | None = None
    completed_at: str | None = None
    cancelled_at: str | None = None
    score: float | None = None
    score_breakdown: AssignmentScoreBreakdown | None = None
    assignment_reason: str | None = None
    created_at: str
    updated_at: str


class AssignmentSingleResponse(BaseModel):
    """Response envelope for a single assignment entity."""

    success: bool = True
    data: AssignmentResponse


class AssignmentListResponse(BaseModel):
    """Response envelope for listing assignments."""

    success: bool = True
    data: list[AssignmentResponse]
    count: int


# ---------------------------------------------------------------------------
# Routing Models
# ---------------------------------------------------------------------------


class RouteProfile(StrEnum):
    DRIVING = "driving"
    WALKING = "walking"
    BOAT = "boat"


class RouteStatus(StrEnum):
    OPTIMAL_OSRM = "OPTIMAL_OSRM"
    FALLBACK_CORRIDOR = "FALLBACK_CORRIDOR"
    ERROR = "ERROR"


class RouteRequest(BaseModel):
    """Payload for requesting route between coordinates."""

    origin_latitude: float = Field(ge=-90, le=90)
    origin_longitude: float = Field(ge=-180, le=180)
    destination_latitude: float = Field(ge=-90, le=90)
    destination_longitude: float = Field(ge=-180, le=180)
    profile: RouteProfile = RouteProfile.DRIVING


class RouteResponse(BaseModel):
    """Standardized route calculation schema."""

    distance_km: float
    distance_meters: float
    duration_seconds: float
    duration_minutes: float
    eta_formatted: str
    coordinates: list[list[float]]
    profile: str
    status: RouteStatus
    summary: str | None = None
    is_fallback: bool = False


class RouteSingleResponse(BaseModel):
    """Response envelope for routing service."""

    success: bool = True
    data: RouteResponse


class SimulationStepRequest(BaseModel):
    """Telemetry payload for driving simulated movement along route."""

    responder_id: str
    incident_id: str
    step_index: int
    total_steps: int
    latitude: float
    longitude: float
    target_status: ResponderStatus | None = None


# ---------------------------------------------------------------------------
# Shelter Models
# ---------------------------------------------------------------------------


class ShelterUpdate(BaseModel):
    """Payload for updating shelter beds / occupancy status."""

    available_beds: int | None = None
    status: ShelterStatus | None = None
    supplies_status: str | None = None
    actor: str = Field(default="authority", max_length=200)


class ShelterResponse(BaseModel):
    """Safe evacuation shelter schema."""

    id: str
    name: str
    address: str
    latitude: float
    longitude: float
    total_beds: int
    available_beds: int
    occupancy_rate: str
    supplies_status: str
    status: str
    amenities: list[str] = []
    is_active: bool
    created_at: str
    updated_at: str


class RecommendedShelterResponse(BaseModel):
    """Candidate evacuation shelter ranked by capacity, proximity, and safety."""

    id: str
    name: str
    address: str
    latitude: float
    longitude: float
    total_beds: int
    available_beds: int
    occupancy_rate: str
    supplies_status: str
    status: str
    distance_km: float
    estimated_walk_min: int
    suitability_score: int
    recommendation_reason: str
    amenities: list[str] = []
    is_safe: bool = True
    safety_status: str = "SAFE"
    hazard_proximity_warning: str | None = None


class ShelterListResponse(BaseModel):
    """Response for listing shelters."""

    success: bool = True
    data: list[ShelterResponse]
    count: int


class ShelterSingleResponse(BaseModel):
    """Response for a single shelter."""

    success: bool = True
    data: ShelterResponse


class ShelterRecommendationListResponse(BaseModel):
    """Response for candidate recommended shelters."""

    success: bool = True
    data: list[RecommendedShelterResponse]
    count: int


# ---------------------------------------------------------------------------
# Disaster Intelligence & Situation Models
# ---------------------------------------------------------------------------


class NormalizedHazard(BaseModel):
    """Canonical disaster intelligence hazard signal normalized from external feeds."""

    hazard_id: str
    source: str = Field(description="Open-Meteo, USGS, GDACS, or Regional Sensor Network")
    hazard_type: HazardType
    severity: HazardSeverity
    title: str
    description: str
    why_it_matters: str
    recommended_action: str
    latitude: float
    longitude: float
    affected_radius_km: float
    observed_at: str
    expires_at: str
    confidence: float = Field(ge=0.0, le=1.0)
    is_active: bool = True
    source_timestamp: str


class HazardListResponse(BaseModel):
    """Response for listing active normalized hazards."""

    success: bool = True
    data: list[NormalizedHazard]
    count: int
    source_summary: str = "Multi-Source Normalized Feed"


class IncidentCluster(BaseModel):
    """Geographic cluster of nearby emergency incident reports."""

    cluster_id: str
    cluster_name: str
    centroid_lat: float
    centroid_lon: float
    incident_count: int
    critical_count: int
    verified_count: int
    radius_km: float
    incident_ids: list[str] = []
    primary_hazard_type: str


class IncidentClusterListResponse(BaseModel):
    """Response for spatial incident clusters."""

    success: bool = True
    data: list[IncidentCluster]
    count: int


class SituationStatistics(BaseModel):
    """Structured situational intelligence metrics computed strictly from ground truth data."""

    total_active_incidents: int
    critical_incidents_count: int
    pending_triage_count: int
    verified_incidents_count: int
    assigned_incidents_count: int
    resolved_incidents_count: int
    active_clusters_count: int
    total_responders: int
    available_responders: int
    deployed_responders: int
    total_shelters: int
    available_beds: int
    active_hazards_count: int
    timestamp: str


class SituationSummaryResponse(BaseModel):
    """Complete situation intelligence response with structured stats and grounded AI briefing."""

    success: bool = True
    statistics: SituationStatistics
    briefing: str
    key_priorities: list[str] = []
    provider: str
    generated_at: str
