"""Canonical Facility Data Models for Salvus Nearby Emergency Intelligence.

Provides a clean, provider-independent facility schema decouple from any single
external API (Geoapify, Google Places, OpenStreetMap, Civil Defense).

Key Components:
- `FacilityCategory`: Controlled enum of emergency facility types.
- `FacilityResponseState`: Explicit status states (AVAILABLE, PARTIAL_RESULTS,
  NO_RESULTS, UNAVAILABLE, STALE, LOADING).
- `SafePlaceTrustLevel`: 3-tier hierarchy for verified shelters vs mapped records.
- `SafePlaceDetails`: Granular capacity, designation, and verification telemetry.
- `FacilityModel`: Canonical, project-owned facility entity.
- `FacilityQueryResponse`: Comprehensive response payload with category-level telemetry.
"""

from __future__ import annotations

from enum import IntEnum, StrEnum
from typing import Any

from pydantic import BaseModel, Field


class FacilityCategory(StrEnum):
    """Canonical emergency and safety facility categories."""

    HOSPITAL = "HOSPITAL"
    PHARMACY = "PHARMACY"
    POLICE = "POLICE"
    FIRE_STATION = "FIRE_STATION"
    AMBULANCE = "AMBULANCE"
    SAFE_PLACE = "SAFE_PLACE"
    OTHER = "OTHER"

    @classmethod
    def from_str(cls, val: str | None) -> FacilityCategory:
        """Parse arbitrary input string into a controlled FacilityCategory enum."""
        if not val:
            return cls.OTHER
        clean = str(val).strip().upper().replace(" ", "_").replace("-", "_")
        if clean in ("HOSPITAL", "HOSPITALS", "CLINIC", "CLINICS", "DOCTORS", "HEALTHCARE"):
            return cls.HOSPITAL
        if clean in ("PHARMACY", "PHARMACIES", "CHEMIST", "DRUGSTORE", "MEDICAL_SUPPLY"):
            return cls.PHARMACY
        if clean in ("POLICE", "POLICE_STATION", "POLICE_STATIONS", "POLICE_OUTPOST"):
            return cls.POLICE
        if clean in ("FIRE", "FIRE_STATION", "FIRE_STATIONS", "FIRE_SERVICE", "FIRE_DEPARTMENT"):
            return cls.FIRE_STATION
        if clean in (
            "AMBULANCE",
            "AMBULANCE_STATION",
            "EMERGENCY",
            "EMERGENCY_SERVICE",
            "EMERGENCY_FACILITY",
            "DISASTER_RESPONSE",
        ):
            return cls.AMBULANCE
        if clean in (
            "SAFE_PLACE",
            "SAFE_PLACES",
            "SHELTER",
            "SHELTERS",
            "REFUGE",
            "EVACUATION_CENTER",
            "EVACUATION_CENTRE",
            "COMMUNITY_CENTRE",
            "ASSEMBLY_POINT",
        ):
            return cls.SAFE_PLACE
        return cls.OTHER


class FacilityResponseState(StrEnum):
    """Explicit operational states for nearby facility intelligence queries."""

    LOADING = "LOADING"
    AVAILABLE = "AVAILABLE"
    NO_RESULTS = "NO_RESULTS"
    PARTIAL_RESULTS = "PARTIAL_RESULTS"
    UNAVAILABLE = "UNAVAILABLE"
    STALE = "STALE"


class FacilityFreshness(StrEnum):
    """Telemetry data freshness classification."""

    LIVE = "LIVE"
    CACHED = "CACHED"
    STALE = "STALE"
    PARTIAL = "PARTIAL"
    UNAVAILABLE = "UNAVAILABLE"


class SafePlaceTrustLevel(IntEnum):
    """3-Tier Trust and Verification Hierarchy for Safe Places / Evacuation Shelters."""

    LEVEL_1_SALVUS_VERIFIED = 1  # Officially audited and managed Salvus Civil Defense shelter
    LEVEL_2_AUTHORITY_OFFICIAL = 2  # Municipal / Government designated emergency shelter
    LEVEL_3_MAP_CONFIRMED = 3  # OSM / External records explicitly tagged for emergency use
    UNVERIFIED = 4  # Generic public shelter (community hall, school) not explicitly confirmed


class SafePlaceDetails(BaseModel):
    """Detailed structural and operational metrics for verified shelters."""

    designation_type: str = "Designated Emergency Shelter"
    verification_level: SafePlaceTrustLevel = SafePlaceTrustLevel.LEVEL_1_SALVUS_VERIFIED
    source_authority: str = "Salvus Civil Defense Network"
    emergency_use_confirmed: bool = True
    total_capacity: int | None = None
    available_beds: int | None = None
    occupancy_rate: str | None = None
    supplies_status: str | None = None
    is_safe: bool = True
    safety_status: str = "SAFE"
    hazard_proximity_warning: str | None = None


class FacilityModel(BaseModel):
    """Canonical, provider-independent facility representation."""

    id: str = Field(description="Unique Salvus facility identifier")
    provider: str = Field(
        default="geoapify", description="Origin provider (geoapify, google_places, osm, salvus)"
    )
    provider_place_id: str | None = Field(
        default=None, description="Native provider place identifier"
    )

    category: FacilityCategory = Field(description="Controlled primary category")
    subcategory: str | None = Field(
        default=None, description="Detailed sub-classification (e.g. clinic, outpost)"
    )

    name: str = Field(description="Human-readable facility name")

    latitude: float = Field(ge=-90.0, le=90.0)
    longitude: float = Field(ge=-180.0, le=180.0)

    straight_line_distance_meters: float | None = Field(
        default=None, description="Locally computed straight-line Haversine distance in meters"
    )
    distance_km: float | None = Field(
        default=None, description="Straight-line distance in kilometers"
    )
    distance_formatted: str = Field(
        default="Distance unknown", description="User-facing label ('850 m away', '1.3 km away')"
    )

    formatted_address: str | None = Field(default=None, description="Complete street address")
    city: str | None = Field(default=None, description="City / municipality / district")

    phone: str | None = Field(default=None, description="Normalized primary contact phone number")
    website: str | None = Field(default=None, description="Official external website URL")

    opening_hours: str | None = Field(
        default=None, description="Raw or formatted opening hours string"
    )
    open_now: bool | None = Field(default=None, description="Boolean flag if open at query time")

    verified: bool = Field(
        default=False, description="Whether facility is officially verified by authority"
    )
    confidence: float = Field(
        default=0.85, ge=0.0, le=1.0, description="Data trust and completeness score"
    )

    amenities: list[str] = Field(
        default_factory=list, description="Available services / capabilities"
    )
    safe_place_details: SafePlaceDetails | None = Field(
        default=None, description="Granular shelter parameters if category is SAFE_PLACE"
    )

    route_distance_m: float | None = Field(
        default=None, description="On-demand network routing distance in meters"
    )
    route_duration_s: float | None = Field(
        default=None, description="On-demand network routing travel duration in seconds"
    )

    fetched_at: str = Field(description="ISO 8601 timestamp when facility record was acquired")
    raw_source_metadata: dict[str, Any] = Field(
        default_factory=dict, description="Raw provider metadata preserved for debugging & audit"
    )


class CategoryStatusReport(BaseModel):
    """Per-category status report for granular UX transparency."""

    category: FacilityCategory
    status: str = "OK"  # 'OK' | 'EMPTY' | 'UNAVAILABLE' | 'TIMEOUT'
    count: int = 0
    provider_used: str = "geoapify"
    duration_ms: float = 0.0
    error_message: str | None = None


class FacilityQueryResponse(BaseModel):
    """Unified API response schema for nearby emergency facility queries."""

    success: bool = True
    status: FacilityResponseState = FacilityResponseState.AVAILABLE
    freshness: FacilityFreshness = FacilityFreshness.LIVE
    data: list[FacilityModel] = Field(default_factory=list)
    count: int = 0
    searched_radius_km: float = 10.0
    radius_meters: int = 10000
    query_center: dict[str, float] = Field(description="Exact GPS origin {latitude, longitude}")
    cached: bool = False
    fetched_at: str
    category_statuses: dict[str, CategoryStatusReport] = Field(default_factory=dict)
    provider_summary: str = "Geoapify Emergency Intelligence"
