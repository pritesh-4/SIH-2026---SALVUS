"""Pydantic models and validation schemas for Salvus Citizen Profile & Emergency Readiness."""

from __future__ import annotations

from enum import StrEnum
from typing import Any

from pydantic import BaseModel, Field, field_validator


class BloodGroup(StrEnum):
    """Recognized blood groups with Rh factor."""

    A_POS = "A+"
    A_NEG = "A-"
    B_POS = "B+"
    B_NEG = "B-"
    AB_POS = "AB+"
    AB_NEG = "AB-"
    O_POS = "O+"
    O_NEG = "O-"
    UNKNOWN = "UNKNOWN"

    @classmethod
    def from_str(cls, value: str | None) -> BloodGroup:
        """Parse blood group case-insensitively, defaulting to UNKNOWN if unrecognized."""
        if not value:
            return cls.UNKNOWN
        cleaned = value.strip().upper().replace("POSITIVE", "+").replace("NEGATIVE", "-")
        for bg in cls:
            if bg.value == cleaned:
                return bg
        return cls.UNKNOWN


class CitizenProfileResponse(BaseModel):
    """Authoritative persistent citizen profile representation."""

    id: str = Field(description="Unique citizen user ID (JWT sub)")
    emergency_id: str = Field(description="Protected system-generated emergency identifier")
    full_name: str = Field(description="Full name of the citizen")
    phone: str | None = Field(default=None, description="Primary contact phone number")
    email: str | None = Field(default=None, description="Verified email address")
    registered_address: str | None = Field(
        default=None, description="Registered residential address"
    )
    blood_group: str | None = Field(default="UNKNOWN", description="Blood group with Rh factor")
    avatar_initials: str | None = Field(
        default=None, description="Derived or custom avatar initials"
    )
    avatar_url: str | None = Field(default=None, description="Optional avatar profile image URL")
    is_verified: bool = Field(default=True, description="Verification status of the profile")
    created_at: str = Field(description="ISO 8601 creation timestamp")
    updated_at: str = Field(description="ISO 8601 last update timestamp")
    medical_info: dict[str, Any] | None = Field(
        default=None, description="Emergency medical info (conditions, allergies, mobility notes)"
    )
    medications_note: str | None = Field(
        default=None, description="Important emergency medication notes"
    )


class CitizenProfileUpdate(BaseModel):
    """Editable profile fields submitted by the citizen."""

    full_name: str | None = Field(
        default=None, min_length=1, max_length=100, description="Updated full name"
    )
    phone: str | None = Field(
        default=None, max_length=30, description="Updated contact phone number"
    )
    email: str | None = Field(
        default=None, max_length=100, description="Updated contact email address"
    )
    registered_address: str | None = Field(
        default=None, max_length=300, description="Updated registered address"
    )
    blood_group: str | None = Field(default=None, max_length=10, description="Updated blood group")
    avatar_initials: str | None = Field(
        default=None, max_length=5, description="Updated avatar initials"
    )
    avatar_url: str | None = Field(
        default=None, max_length=500, description="Updated avatar image URL"
    )

    @field_validator("blood_group")
    @classmethod
    def validate_blood_group(cls, v: str | None) -> str | None:
        if v is not None:
            parsed = BloodGroup.from_str(v)
            return parsed.value
        return v

    @field_validator("full_name")
    @classmethod
    def validate_full_name(cls, v: str | None) -> str | None:
        if v is not None:
            stripped = v.strip()
            if not stripped:
                raise ValueError("Full name cannot be blank or only whitespace.")
            return stripped
        return v


class ProfileSingleResponse(BaseModel):
    """Standardized API response wrapper for citizen profile."""

    success: bool = True
    data: CitizenProfileResponse


# ---------------------------------------------------------------------------
# Emergency Contacts Models
# ---------------------------------------------------------------------------


class EmergencyContactResponse(BaseModel):
    """Emergency contact representation."""

    id: str = Field(description="Unique contact ID")
    user_id: str = Field(description="Owning citizen ID")
    name: str = Field(description="Contact full name")
    relationship: str = Field(description="Relationship to citizen (e.g. Father, Sister, Spouse)")
    phone: str = Field(description="Contact phone number")
    priority: int = Field(default=1, description="Order priority (1 = highest)")
    is_primary: bool = Field(default=False, description="Whether this is the primary SOS contact")
    notify_on_sos: bool = Field(
        default=True, description="Whether to notify automatically during SOS"
    )
    created_at: str = Field(description="ISO creation timestamp")
    updated_at: str = Field(description="ISO update timestamp")


class EmergencyContactCreate(BaseModel):
    """Payload to create a new emergency contact."""

    name: str = Field(min_length=1, max_length=100, description="Contact name")
    relationship: str = Field(min_length=1, max_length=50, description="Relationship")
    phone: str = Field(min_length=5, max_length=30, description="Contact phone")
    priority: int = Field(default=1, ge=1, le=10, description="Priority rank (1-10)")
    is_primary: bool = Field(default=False, description="Designate as primary contact")
    notify_on_sos: bool = Field(default=True, description="Notify on SOS")

    @field_validator("name", "relationship", "phone")
    @classmethod
    def validate_non_empty(cls, v: str) -> str:
        stripped = v.strip()
        if not stripped:
            raise ValueError("Field cannot be blank or only whitespace.")
        return stripped


class EmergencyContactUpdate(BaseModel):
    """Payload to update an existing emergency contact."""

    name: str | None = Field(default=None, min_length=1, max_length=100)
    relationship: str | None = Field(default=None, min_length=1, max_length=50)
    phone: str | None = Field(default=None, min_length=5, max_length=30)
    priority: int | None = Field(default=None, ge=1, le=10)
    is_primary: bool | None = Field(default=None)
    notify_on_sos: bool | None = Field(default=None)

    @field_validator("name", "relationship", "phone")
    @classmethod
    def validate_non_empty_optional(cls, v: str | None) -> str | None:
        if v is not None:
            stripped = v.strip()
            if not stripped:
                raise ValueError("Field cannot be blank or only whitespace.")
            return stripped
        return v


class EmergencyContactListResponse(BaseModel):
    """API response containing list of emergency contacts."""

    success: bool = True
    data: list[EmergencyContactResponse]
    count: int


class EmergencyContactSingleResponse(BaseModel):
    """API response containing single emergency contact."""

    success: bool = True
    data: EmergencyContactResponse


# ---------------------------------------------------------------------------
# Medical Information Models
# ---------------------------------------------------------------------------


class MedicalInfoResponse(BaseModel):
    """Emergency medical info structure."""

    blood_group: str = "UNKNOWN"
    conditions: list[str] = Field(default_factory=list)
    allergies: list[str] = Field(default_factory=list)
    mobility_note: str = "Fully Mobile / Ambulatory"
    medications_note: str | None = None


class MedicalInfoUpdate(BaseModel):
    """Payload to update medical profile."""

    blood_group: str | None = Field(default=None, max_length=10)
    conditions: list[str] | None = Field(default=None, max_length=20)
    allergies: list[str] | None = Field(default=None, max_length=20)
    mobility_note: str | None = Field(default=None, max_length=200)
    medications_note: str | None = Field(default=None, max_length=300)

    @field_validator("blood_group")
    @classmethod
    def validate_blood_group(cls, v: str | None) -> str | None:
        if v is not None:
            return BloodGroup.from_str(v).value
        return v

    @field_validator("conditions", "allergies")
    @classmethod
    def validate_list_items(cls, v: list[str] | None) -> list[str] | None:
        if v is not None:
            cleaned: list[str] = []
            for item in v:
                s = item.strip()
                if s:
                    if len(s) > 100:
                        raise ValueError("Medical item exceeds maximum 100 characters.")
                    cleaned.append(s)
            return cleaned
        return v


class MedicalSingleResponse(BaseModel):
    """API response containing medical info."""

    success: bool = True
    data: MedicalInfoResponse


# ---------------------------------------------------------------------------
# Privacy & Location Settings Models
# ---------------------------------------------------------------------------


class PrivacySettingItem(BaseModel):
    """Individual privacy setting definition and current status."""

    id: str = Field(description="Unique setting ID")
    title: str = Field(description="User-friendly title")
    description: str = Field(description="Plain-language description")
    value: bool = Field(description="Current boolean state")
    locked: bool = Field(default=False, description="Locked for system safety requirement")
    badge: str | None = Field(default=None, description="Optional badge e.g. Privacy Protected")


class PrivacySettingsResponse(BaseModel):
    """API response containing privacy settings list."""

    success: bool = True
    data: list[PrivacySettingItem]


class PrivacySettingUpdateItem(BaseModel):
    """Update payload for an individual setting."""

    id: str
    value: bool


class PrivacySettingsUpdate(BaseModel):
    """Payload to update multiple privacy settings."""

    settings: list[PrivacySettingUpdateItem]
