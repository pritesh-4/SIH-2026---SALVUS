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


class IncidentResponse(BaseModel):
    """Full incident response with event history."""

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
