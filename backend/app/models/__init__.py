"""Pydantic models and enums for the Salvus incident domain."""

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
    RESOLVED = "RESOLVED"
    CANCELLED = "CANCELLED"


# ---------------------------------------------------------------------------
# Request models
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
        # SOS may be submitted with minimal info; regular reports need description
        return v.strip()


class IncidentStatusUpdate(BaseModel):
    """Payload for updating incident status."""

    status: IncidentStatus
    actor: str = Field(default="authority", max_length=200)


# ---------------------------------------------------------------------------
# Response models
# ---------------------------------------------------------------------------


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
