"""Pydantic models and enums for the Salvus disaster coordination domain."""

from __future__ import annotations

from enum import StrEnum
from typing import Any

from pydantic import BaseModel, Field, field_validator

from app.models.facility import (
    CategoryStatusReport as CategoryStatusReport,
)
from app.models.facility import (
    FacilityCategory as FacilityCategory,
)
from app.models.facility import (
    FacilityFreshness as FacilityFreshness,
)
from app.models.facility import (
    FacilityModel as FacilityModel,
)
from app.models.facility import (
    FacilityQueryResponse as FacilityQueryResponse,
)
from app.models.facility import (
    FacilityResponseState as FacilityResponseState,
)
from app.models.facility import (
    SafePlaceDetails as SafePlaceDetails,
)
from app.models.facility import (
    SafePlaceTrustLevel as SafePlaceTrustLevel,
)
from app.models.profile import (
    BloodGroup as BloodGroup,
)
from app.models.profile import (
    CitizenProfileResponse as CitizenProfileResponse,
)
from app.models.profile import (
    CitizenProfileUpdate as CitizenProfileUpdate,
)
from app.models.profile import (
    ProfileSingleResponse as ProfileSingleResponse,
)

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


class AttachmentStatus(StrEnum):
    AVAILABLE = "AVAILABLE"
    PENDING = "PENDING"
    FAILED = "FAILED"
    DELETED = "DELETED"


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


class PlaceProvenance(StrEnum):
    OSM_MAPPED = "OSM_MAPPED"
    SALVUS_VERIFIED = "SALVUS_VERIFIED"
    SEEDED_DEMO = "SEEDED_DEMO"


class PlaceFreshness(StrEnum):
    FRESH = "FRESH"
    STALE = "STALE"
    UNAVAILABLE = "UNAVAILABLE"


class PlaceCategory(StrEnum):
    HOSPITAL = "HOSPITAL"
    CLINIC = "CLINIC"
    PHARMACY = "PHARMACY"
    POLICE = "POLICE"
    FIRE_STATION = "FIRE_STATION"
    EMERGENCY_SERVICE = "EMERGENCY_SERVICE"
    SHELTER = "SHELTER"
    OTHER_RELEVANT = "OTHER_RELEVANT"

    @classmethod
    def from_str(cls, val: str) -> PlaceCategory:
        """Parse arbitrary input string into a controlled PlaceCategory enum."""
        clean = val.strip().upper().replace(" ", "_").replace("-", "_")
        if clean in ("HOSPITAL", "HOSPITALS"):
            return cls.HOSPITAL
        if clean in ("CLINIC", "CLINICS"):
            return cls.CLINIC
        if clean in ("PHARMACY", "PHARMACIES", "CHEMIST", "DRUGSTORE"):
            return cls.PHARMACY
        if clean in ("POLICE", "POLICE_STATION", "POLICE_STATIONS"):
            return cls.POLICE
        if clean in ("FIRE", "FIRE_STATION", "FIRE_STATIONS", "FIRE_DEPARTMENT"):
            return cls.FIRE_STATION
        if clean in (
            "EMERGENCY_SERVICE",
            "EMERGENCY_FACILITY",
            "EMERGENCY",
            "AMBULANCE",
            "DISASTER_RESPONSE",
        ):
            return cls.EMERGENCY_SERVICE
        if clean in ("SHELTER", "SHELTERS", "REFUGE", "EVACUATION_CENTER"):
            return cls.SHELTER
        return cls.OTHER_RELEVANT


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
    idempotency_key: str | None = Field(
        default=None,
        max_length=128,
        description="Client idempotency key for at-most-once submission",
    )
    image_data: str | None = Field(
        default=None, description="Optional base64 encoded scene imagery"
    )

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


class AIState(StrEnum):
    """Lifecycle state of AI intelligence triage processing."""

    NOT_STARTED = "NOT_STARTED"
    PROCESSING = "PROCESSING"
    AVAILABLE = "AVAILABLE"
    FAILED = "FAILED"
    STALE = "STALE"


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
    damage_type: str | None = Field(
        default=None, description="Visual damage classification, e.g. Structural Inundation"
    )
    hazard_detected: str | None = Field(
        default=None, description="Specific hazard detected in imagery"
    )
    water_depth_estimate: str | None = Field(
        default=None, description="Estimated visual water depth, e.g. 0.8m - 1.2m"
    )
    image_assessment_hint: str | None = Field(
        default=None, description="Tagged strictly with 'AI ESTIMATE — UNVERIFIED'"
    )
    provider: str = Field(
        default="gemini-2.0-flash", description="AI Provider or fallback identifier"
    )
    model: str = Field(default="gemini-2.0-flash", description="Underlying model name")
    evaluated_at: str
    ai_state: str = Field(default="AVAILABLE", description="AVAILABLE | FAILED | STALE")
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


class IncidentAttachmentResponse(BaseModel):
    """Domain model representing an evidence photo attachment for an incident."""

    id: str
    incident_id: str
    url: str = Field(description="Secure accessible URL or provider reference")
    thumbnail_url: str | None = Field(
        default=None, description="Transformed thumbnail derivative URL for responsive display"
    )
    original_filename: str
    mime_type: str
    size_bytes: int
    width: int | None = None
    height: int | None = None
    checksum: str = Field(description="SHA-256 hex digest for integrity and deduplication")
    uploaded_at: str
    uploaded_by: str = "citizen"
    status: str = AttachmentStatus.AVAILABLE.value
    vision_assessment: AIVisionAssessment | None = Field(
        default=None,
        description="Future multimodal AI vision decision support assessment (unverified)",
    )


class AIVisionObservation(BaseModel):
    """Specific visual observation extracted from incident evidence."""

    category: str = Field(
        description="Observation classification (e.g. water_level, debris, structural, flame)"
    )
    description: str = Field(description="Descriptive explanation of the observed visual feature")
    confidence: float = Field(
        default=0.0, ge=0.0, le=1.0, description="Confidence score from 0.0 to 1.0"
    )


class AIVisionAssessment(BaseModel):
    """Normalized AI Vision inference contract for multimodal evidence evaluation.

    STRICT GUARANTEE: This model represents unverified visual decision support.
    It must NEVER directly trigger autonomous responder dispatch, status changes,
    or incident resolution.
    """

    hazard_detected: bool = Field(
        default=True, description="Whether hazardous conditions were identified"
    )
    hazard_type: str = Field(
        description="Primary detected hazard classification (e.g. flood, fire, structural)"
    )
    observations: list[AIVisionObservation] = Field(
        default_factory=list, description="Granular visual observations extracted from photo"
    )
    water_depth_estimate: str | None = Field(
        default=None,
        description="Human-calibrated depth estimate (e.g., '0.5m - 1.0m (approx knee-depth)')",
    )
    damage_severity_hint: str | None = Field(
        default=None, description="Heuristic damage severity hint (e.g., 'MODERATE', 'SEVERE')"
    )
    confidence: float = Field(
        default=0.0, ge=0.0, le=1.0, description="Overall confidence level of visual assessment"
    )
    uncertainty_flags: list[str] = Field(
        default_factory=list,
        description="Flags indicating low resolution, occlusions, glare, or ambiguities",
    )
    analyzed_at: str | None = Field(
        default=None, description="ISO timestamp when image was processed"
    )
    model_version: str | None = Field(
        default=None, description="Vision model identifier (e.g., gemini-1.5-flash)"
    )
    disclaimer: str = Field(
        default="AI ESTIMATE — UNVERIFIED DECISION SUPPORT ONLY",
        description="Mandatory disclaimer affirming this is non-authoritative decision support",
    )


class AIVisionResponse(BaseModel):
    """API envelope for future vision analysis results."""

    success: bool = True
    attachment_id: str
    data: AIVisionAssessment


class AttachmentSingleResponse(BaseModel):
    """Response envelope for a single incident attachment."""

    success: bool = True
    data: IncidentAttachmentResponse


class AttachmentListResponse(BaseModel):
    """Response envelope for listing incident attachments."""

    success: bool = True
    data: list[IncidentAttachmentResponse] = Field(default_factory=list)
    count: int = 0


class IncidentResponse(BaseModel):
    """Full incident response with event history, evidence, and optional AI triage."""

    id: str
    ticket_id: str
    type: str
    severity: str
    description: str
    reporter_name: str
    reporter_phone: str | None = None
    reporter_id: str | None = None
    latitude: float
    longitude: float
    affected_count: int
    is_sos: bool
    status: str
    ai_state: str = "NOT_STARTED"
    triage_hash: str | None = None
    created_at: str
    updated_at: str
    events: list[IncidentEventResponse] = []
    attachments: list[IncidentAttachmentResponse] = Field(default_factory=list)
    ai_triage: AITriageAssessment | None = None
    image_data: str | None = None
    access_token: str | None = None


class IncidentListResponse(BaseModel):
    """Response for listing incidents."""

    success: bool = True
    data: list[IncidentResponse]
    count: int


class IncidentSingleResponse(BaseModel):
    """Response for a single incident."""

    success: bool = True
    data: IncidentResponse


class IncidentActiveLookupResponse(BaseModel):
    """Authoritative response envelope for citizen active incident lookup."""

    success: bool = True
    data: IncidentResponse | None = None
    responder: ResponderResponse | None = None
    is_terminal: bool = False


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
    """Auditable scoring factor breakdown with normalized components."""

    final_score: int
    capability_score: int
    distance_score: int
    eta_score: int
    workload_score: int
    availability_score: int
    severity_fit_score: int
    max_weights: dict[str, int] = Field(
        default_factory=lambda: {
            "capability": 30,
            "availability": 20,
            "distance": 15,
            "eta": 15,
            "workload": 10,
            "severity_fit": 10,
        }
    )
    severity_alignment: int | None = None
    proximity_score: int | None = None
    workload_penalty: int | None = None
    total_score: int | None = None


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
    rank: int = 1
    explanation: CandidateExplanation | None = None
    comparative_reason: str | None = None
    calculated_at: str | None = None
    route_geometry: list[list[float]] = []
    route_status: str = "ESTIMATED"


class ResponderCandidateListResponse(BaseModel):
    """Response for candidate responders matching an incident."""

    success: bool = True
    incident_id: str
    allocation_status: str = "RECOMMENDED"
    message: str | None = None
    data: list[CandidateResponderResponse]
    count: int


class CandidateEvaluationRequest(BaseModel):
    """Payload for evaluating candidates for an incident."""

    incident: IncidentResponse
    responders: list[ResponderResponse]


class CandidateEvaluationResponse(BaseModel):
    """Response envelope for standalone candidate evaluation."""

    success: bool = True
    incident_id: str
    allocation_status: str = "RECOMMENDED"
    message: str | None = None
    data: list[CandidateResponderResponse]
    count: int


# ---------------------------------------------------------------------------
# Candidate Generation (Decision Support Filtering) Models
# ---------------------------------------------------------------------------


class CandidateFilterItem(BaseModel):
    """Individual evaluated responder item with eligibility classification."""

    responder_id: str
    unit_name: str
    capability: str
    status: str
    is_eligible: bool
    exclusion_reason: str | None = None
    match_reason: str | None = None
    responder: ResponderResponse | None = None


class CandidateGenerationResult(BaseModel):
    """Factual eligibility partition separating eligible from excluded responders."""

    incident_id: str
    incident_type: str
    required_capability: str | None = None
    eligible_responders: list[CandidateFilterItem]
    excluded_responders: list[CandidateFilterItem]
    total_evaluated: int
    total_eligible: int
    total_excluded: int


class CandidateGenerationResponse(BaseModel):
    """Response envelope for candidate generation / filtering API."""

    success: bool = True
    data: CandidateGenerationResult


class CandidateFilterRequest(BaseModel):
    """Payload for offline candidate eligibility evaluation."""

    incident: IncidentResponse
    responders: list[ResponderResponse]
    required_capability: str | None = None


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
    nearby_at: str | None = None
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
    ROUTE_UNAVAILABLE = "ROUTE_UNAVAILABLE"
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
    eta_seconds: float | None = None
    eta_formatted: str
    coordinates: list[list[float]]  # Leaflet [lat, lon] pairs
    geometry: list[list[float]] | None = None  # GeoJSON / coordinate alias
    profile: str
    status: RouteStatus
    summary: str | None = None
    provider: str = "osrm"  # "osrm" or "salvus_fallback"
    calculated_at: str | None = None  # ISO timestamp
    is_fallback: bool = False
    is_safe_route: bool = True
    hazard_warning: str | None = None
    hazard_intersections: list[str] = Field(default_factory=list)
    safety_disclaimer: str = "Recommended route based on current available hazard data."


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
    address: str | None = None
    latitude: float
    longitude: float
    total_beds: int | None = None
    available_beds: int | None = None
    occupancy_rate: str | None = None
    supplies_status: str | None = None
    status: str | None = None
    distance_km: float | None = None
    distance_meters: float | None = None
    distance_formatted: str | None = None
    estimated_walk_min: int | None = None
    suitability_score: int = 0
    recommendation_reason: str = ""
    amenities: list[str] = Field(default_factory=list)
    contact_phone: str | None = None
    provenance: PlaceProvenance = PlaceProvenance.SALVUS_VERIFIED
    source: str = "Salvus Civil Defense"
    source_id: str | None = None
    is_safe: bool = True
    safety_status: str = "SAFE"
    hazard_proximity_warning: str | None = None
    is_recommended: bool = True
    fetched_at: str | None = None


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
# Disaster Intelligence, Hazards & Situation Models
# ---------------------------------------------------------------------------


class AreaSafetyLevel(StrEnum):
    SAFE = "SAFE"
    WATCH = "WATCH"
    WARNING = "WARNING"
    CRITICAL = "CRITICAL"
    NO_DATA = "NO_DATA"
    LOCATION_REQUIRED = "LOCATION_REQUIRED"


class AlertProvenance(StrEnum):
    """Verifiable data provenance classification for disaster alerts."""

    LIVE = "LIVE"
    CACHED = "CACHED"
    FALLBACK = "FALLBACK"
    SIMULATED = "SIMULATED"


class RelevanceLevel(StrEnum):
    """Geographic and situational life-safety relevance tier for a specific citizen location."""

    CRITICAL = "CRITICAL"
    HIGH = "HIGH"
    MODERATE = "MODERATE"
    LOW = "LOW"
    IRRELEVANT = "IRRELEVANT"


class SourceStatus(StrEnum):
    """Operational status of external disaster intelligence feeds."""

    AVAILABLE = "AVAILABLE"
    STALE = "STALE"
    FAILED = "FAILED"
    DISABLED = "DISABLED"


class SourceType(StrEnum):
    """Classification of upstream alert feed source."""

    WEATHER_SERVICE = "WEATHER_SERVICE"
    SEISMIC_NETWORK = "SEISMIC_NETWORK"
    CIVIL_DEFENSE = "CIVIL_DEFENSE"
    MUNICIPAL_TELEMETRY = "MUNICIPAL_TELEMETRY"
    SIMULATION_ENGINE = "SIMULATION_ENGINE"
    FALLBACK_MODEL = "FALLBACK_MODEL"
    GEOSPATIAL_PROVIDER = "GEOSPATIAL_PROVIDER"


class SourceHealthReport(BaseModel):
    """Health, latency, and freshness telemetry for an external or simulated alert source."""

    source_id: str
    source_name: str
    source_type: SourceType
    status: SourceStatus
    last_fetched_at: str | None = None
    last_successful_at: str | None = None
    last_error: str | None = None
    latency_ms: float | None = None
    active_alerts_count: int = 0


class NormalizedAlert(BaseModel):
    """Canonical disaster intelligence alert normalized across genuine sources."""

    id: str = Field(description="Unique normalized alert ID")
    source: str = Field(description="Authentic source provider name")
    source_event_id: str = Field(
        default="generic-evt", description="Upstream raw source event or sensor ID"
    )
    source_type: SourceType = Field(default=SourceType.WEATHER_SERVICE)
    hazard_type: HazardType
    severity: HazardSeverity
    title: str
    description: str
    why_it_matters: str | None = None
    recommended_action: str
    latitude: float = Field(ge=-90.0, le=90.0)
    longitude: float = Field(ge=-180.0, le=180.0)
    affected_area: str | None = None
    radius_km: float = Field(default=2.5, gt=0.0)
    observed_at: str
    issued_at: str
    expires_at: str
    fetched_at: str
    source_url: str | None = None
    provenance: AlertProvenance = AlertProvenance.LIVE
    confidence: float = Field(default=1.0, ge=0.0, le=1.0)
    is_active: bool = True

    # Spatial & Geo-Relevance enrichment fields (Phase 3)
    distance_km: float | None = None
    distance_formatted: str | None = None
    is_within_affected_area: bool = False
    geometry: list[list[float]] | None = None
    is_inside_geometry: bool = False
    relevance_level: RelevanceLevel | None = None
    sources_matched: list[str] = Field(default_factory=list)
    relative_time_label: str | None = None

    # Backward compatibility aliases for existing domain consumers
    hazard_id: str | None = None
    affected_radius_km: float | None = None
    source_timestamp: str | None = None
    data_provenance: str | None = None

    @classmethod
    def model_validate(cls, obj: Any, *args, **kwargs) -> NormalizedAlert:
        """Ensure backward compatibility fields and aliases are harmonized."""
        if isinstance(obj, dict):
            obj = dict(obj)
            if "hazard_id" in obj and "id" not in obj:
                obj["id"] = obj["hazard_id"]
            elif "id" in obj and "hazard_id" not in obj:
                obj["hazard_id"] = obj["id"]

            if "affected_radius_km" in obj and "radius_km" not in obj:
                obj["radius_km"] = obj["affected_radius_km"]
            elif "radius_km" in obj and "affected_radius_km" not in obj:
                obj["affected_radius_km"] = obj["radius_km"]

            if "data_provenance" in obj and "provenance" not in obj:
                obj["provenance"] = obj["data_provenance"]
            elif "provenance" in obj and "data_provenance" not in obj:
                prov_val = obj["provenance"]
                obj["data_provenance"] = str(
                    prov_val.value if hasattr(prov_val, "value") else prov_val
                )

            if "source_timestamp" in obj and "issued_at" not in obj:
                obj["issued_at"] = obj["source_timestamp"]
            elif "issued_at" in obj and "source_timestamp" not in obj:
                obj["source_timestamp"] = obj["issued_at"]

            if "observed_at" in obj and "fetched_at" not in obj:
                obj["fetched_at"] = obj["observed_at"]
            if "observed_at" in obj and "issued_at" not in obj:
                obj["issued_at"] = obj["observed_at"]

        res = super().model_validate(obj, *args, **kwargs)
        if not res.hazard_id:
            object.__setattr__(res, "hazard_id", res.id)
        if not res.affected_radius_km:
            object.__setattr__(res, "affected_radius_km", res.radius_km)
        if not res.source_timestamp:
            object.__setattr__(res, "source_timestamp", res.issued_at)
        if not res.data_provenance:
            prov_str = str(
                res.provenance.value if hasattr(res.provenance, "value") else res.provenance
            )
            object.__setattr__(res, "data_provenance", prov_str)
        return res

    def __init__(self, **data: Any):
        if "hazard_id" in data and "id" not in data:
            data["id"] = data["hazard_id"]
        elif "id" in data and "hazard_id" not in data:
            data["hazard_id"] = data["id"]

        if "affected_radius_km" in data and "radius_km" not in data:
            data["radius_km"] = data["affected_radius_km"]
        elif "radius_km" in data and "affected_radius_km" not in data:
            data["affected_radius_km"] = data["radius_km"]

        if "data_provenance" in data and "provenance" not in data:
            data["provenance"] = data["data_provenance"]
        elif "provenance" in data and "data_provenance" not in data:
            prov_val = data["provenance"]
            data["data_provenance"] = str(
                prov_val.value if hasattr(prov_val, "value") else prov_val
            )

        if "source_timestamp" in data and "issued_at" not in data:
            data["issued_at"] = data["source_timestamp"]
        elif "issued_at" in data and "source_timestamp" not in data:
            data["source_timestamp"] = data["issued_at"]

        if "observed_at" in data and "fetched_at" not in data:
            data["fetched_at"] = data["observed_at"]
        if "observed_at" in data and "issued_at" not in data:
            data["issued_at"] = data["observed_at"]

        super().__init__(**data)
        if not self.hazard_id:
            object.__setattr__(self, "hazard_id", self.id)
        if not self.affected_radius_km:
            object.__setattr__(self, "affected_radius_km", self.radius_km)
        if not self.source_timestamp:
            object.__setattr__(self, "source_timestamp", self.issued_at)
        if not self.data_provenance:
            prov_str = str(
                self.provenance.value if hasattr(self.provenance, "value") else self.provenance
            )
            object.__setattr__(self, "data_provenance", prov_str)


# Type alias for backward compatibility across all modules
NormalizedHazard = NormalizedAlert


class HazardListResponse(BaseModel):
    """Response for listing active normalized hazards and alerts."""

    success: bool = True
    data: list[NormalizedAlert]
    count: int
    source_summary: str = "Multi-Source Normalized Feed"
    sources: dict[str, SourceStatus] = Field(default_factory=dict)
    sources_health: list[SourceHealthReport] = Field(default_factory=list)


AlertListResponse = HazardListResponse


class AreaSafetyResponse(BaseModel):
    """Structured location-grounded citizen area safety assessment."""

    success: bool = True
    level: AreaSafetyLevel
    headline: str
    description: str
    recommended_action: str
    latitude: float | None = None
    longitude: float | None = None
    active_hazards_count: int = 0
    critical_hazards_count: int = 0
    warning_hazards_count: int = 0
    nearest_hazard_distance_km: float | None = None
    nearest_hazard_title: str | None = None
    nearest_shelter: RecommendedShelterResponse | None = None
    observed_at: str
    evaluated_at: str
    data_provenance: str = "LIVE"
    source_summary: str = "Normalized Multi-Source Emergency Feeds"


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


# ---------------------------------------------------------------------------
# Real-World Nearby Places Models (Phase 2: Proximity, Routing, Cache & Trust)
# ---------------------------------------------------------------------------


class PlaceModel(BaseModel):
    """Normalized backend representation of a real-world geographic place."""

    id: str
    source: str = "OpenStreetMap"
    source_id: str | None = None
    provenance: PlaceProvenance = PlaceProvenance.OSM_MAPPED
    category: PlaceCategory
    name: str
    latitude: float = Field(ge=-90.0, le=90.0)
    longitude: float = Field(ge=-180.0, le=180.0)
    address: str | None = None
    city: str | None = None
    phone: str | None = None
    website: str | None = None
    opening_hours: str | None = None
    distance_km: float | None = None
    route_distance_m: float | None = None
    route_duration_s: float | None = None
    fetched_at: str

    # Human-friendly formatting & compatibility fields
    distance_meters: float | None = None
    distance_formatted: str | None = None
    amenities: list[str] = Field(default_factory=list)
    safe_place_details: SafePlaceDetails | None = None
    confidence: float = Field(default=0.85, ge=0.0, le=1.0)


class PlacesResponse(BaseModel):
    """Response schema for nearby real-world places."""

    success: bool = True
    status: str = "OK"
    freshness: PlaceFreshness = PlaceFreshness.FRESH
    data: list[PlaceModel] = Field(default_factory=list)
    count: int = 0
    searched_radius_km: float = 10.0
    radius_meters: int = 10000
    query_center: dict[str, float]
    cached: bool = False
    fetched_at: str | None = None
    category_statuses: dict[str, CategoryStatusReport] = Field(default_factory=dict)
    provider_summary: str = "Salvus Real-World Facilities Engine"


class PlaceRouteResponse(BaseModel):
    """On-demand turn-by-turn route calculation response for a single selected place."""

    success: bool = True
    place: PlaceModel
    origin: dict[str, float]
    destination: dict[str, float]
    route_distance_m: float
    route_duration_s: float
    eta_formatted: str
    coordinates: list[list[float]] = Field(default_factory=list)
    profile: str = "walking"
    is_fallback: bool = False
    is_safe_route: bool = True
    hazard_warning: str | None = None
    calculated_at: str


# ---------------------------------------------------------------------------
# Weather & Environmental Intelligence Models (Build 04)
# ---------------------------------------------------------------------------


class WeatherCondition(BaseModel):
    """Normalized real-time environmental and weather observations."""

    temperature: float = Field(description="Current temperature in Celsius")
    feels_like: float = Field(description="Apparent temperature in Celsius")
    condition: str = Field(description="Human-friendly weather condition text")
    weather_code: int = Field(description="Standard WMO weather code")
    precipitation: float = Field(default=0.0, description="Precipitation rate in mm/h")
    precipitation_probability: int = Field(
        default=0, ge=0, le=100, description="Precipitation probability percentage"
    )
    humidity: int = Field(default=0, ge=0, le=100, description="Relative humidity percentage")
    wind_speed: float = Field(default=0.0, description="Wind speed in km/h")
    wind_direction: float = Field(default=0.0, description="Wind direction in degrees")
    wind_gusts: float = Field(default=0.0, description="Wind gusts in km/h")
    visibility_km: float = Field(default=10.0, description="Horizontal visibility in kilometers")
    uv_index: float = Field(default=0.0, description="UV exposure index")
    is_day: int = Field(default=1, description="1 if daytime, 0 if nighttime")
    sunrise: str | None = None
    sunset: str | None = None
    observed_at: str = Field(description="ISO timestamp of observation")
    source: str = "Open-Meteo Weather Service"
    provenance: AlertProvenance = AlertProvenance.LIVE
    summary: str = Field(description="Human-centric contextual situation summary")


class HourlyForecastItem(BaseModel):
    """Near-term hourly forecast data point."""

    time: str = Field(description="Display time label e.g. 14:00")
    time_iso: str = Field(description="ISO timestamp of forecast interval")
    temperature: float = Field(description="Forecast temperature in Celsius")
    condition: str = Field(description="Human-friendly condition text")
    weather_code: int = Field(description="Standard WMO weather code")
    precipitation: float = Field(default=0.0, description="Precipitation in mm")
    precipitation_probability: int = Field(
        default=0, ge=0, le=100, description="Precipitation chance %"
    )
    wind_speed: float = Field(default=0.0, description="Wind speed in km/h")


class DailyForecastSummary(BaseModel):
    """Daily forecast summary metrics."""

    max_temp: float = Field(description="Maximum temperature in Celsius")
    min_temp: float = Field(description="Minimum temperature in Celsius")
    max_precipitation_probability: int = Field(default=0, ge=0, le=100)
    max_uv_index: float = Field(default=0.0)
    sunrise: str | None = None
    sunset: str | None = None


class WeatherIntelligenceResponse(BaseModel):
    """Comprehensive weather and environmental telemetry response."""

    success: bool = True
    current: WeatherCondition
    hourly: list[HourlyForecastItem] = Field(default_factory=list)
    daily: DailyForecastSummary | None = None
    status: SourceStatus = SourceStatus.AVAILABLE
    freshness: str = "LIVE"
    data_provenance: str = "LIVE"
    latitude: float
    longitude: float
    observed_at: str
    evaluated_at: str
    error: str | None = None
