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
    ON_SCENE = "ON_SCENE"
    RESOLVED = "RESOLVED"
    CANCELLED = "CANCELLED"


class ResponderStatus(StrEnum):
    AVAILABLE = "AVAILABLE"
    ASSIGNED = "ASSIGNED"
    EN_ROUTE = "EN_ROUTE"
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


class ResponderLocationUpdate(BaseModel):
    """Payload for updating real-time coordinates of a response unit."""

    latitude: float = Field(ge=-90, le=90)
    longitude: float = Field(ge=-180, le=180)


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


# ---------------------------------------------------------------------------
# Shelter Models
# ---------------------------------------------------------------------------


class ShelterUpdate(BaseModel):
    """Payload for updating shelter beds / occupancy status."""

    available_beds: int | None = None
    status: ShelterStatus | None = None
    supplies_status: str | None = None


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
    is_active: bool
    created_at: str
    updated_at: str


class ShelterListResponse(BaseModel):
    """Response for listing shelters."""

    success: bool = True
    data: list[ShelterResponse]
    count: int


class ShelterSingleResponse(BaseModel):
    """Response for a single shelter."""

    success: bool = True
    data: ShelterResponse
