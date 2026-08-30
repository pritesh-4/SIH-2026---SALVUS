"""Citizen Profile & Emergency Readiness REST API routes for Salvus."""

from __future__ import annotations

from fastapi import APIRouter, Depends

from app.auth.dependencies import get_current_user
from app.auth.jwt_handler import AuthenticatedUser
from app.db import get_database
from app.models.profile import (
    CitizenProfileUpdate,
    EmergencyContactCreate,
    EmergencyContactListResponse,
    EmergencyContactSingleResponse,
    EmergencyContactUpdate,
    MedicalInfoUpdate,
    MedicalSingleResponse,
    PrivacySettingsResponse,
    PrivacySettingsUpdate,
    ProfileSingleResponse,
)
from app.services import profile_service

router = APIRouter(prefix="/api/profile", tags=["profile"])


# ---------------------------------------------------------------------------
# Core Profile Endpoints
# ---------------------------------------------------------------------------


@router.get("/me", response_model=ProfileSingleResponse)
async def get_my_profile(
    user: AuthenticatedUser = Depends(get_current_user),
):
    """Retrieve the authoritative persistent profile of the authenticated citizen."""
    db = await get_database()
    profile = await profile_service.get_or_create_profile(db, user)
    return ProfileSingleResponse(success=True, data=profile)


@router.patch("/me", response_model=ProfileSingleResponse)
async def update_my_profile(
    payload: CitizenProfileUpdate,
    user: AuthenticatedUser = Depends(get_current_user),
):
    """Update editable profile fields for the authenticated citizen."""
    db = await get_database()
    updated_profile = await profile_service.update_profile(db, user, payload)
    return ProfileSingleResponse(success=True, data=updated_profile)


# ---------------------------------------------------------------------------
# Emergency Contacts Endpoints
# ---------------------------------------------------------------------------


@router.get("/emergency-contacts", response_model=EmergencyContactListResponse)
async def list_emergency_contacts(
    user: AuthenticatedUser = Depends(get_current_user),
):
    """Retrieve the authenticated citizen's designated emergency contacts."""
    db = await get_database()
    contacts = await profile_service.list_emergency_contacts(db, user)
    return EmergencyContactListResponse(success=True, data=contacts, count=len(contacts))


@router.post("/emergency-contacts", status_code=201, response_model=EmergencyContactSingleResponse)
async def create_emergency_contact(
    payload: EmergencyContactCreate,
    user: AuthenticatedUser = Depends(get_current_user),
):
    """Add a new designated emergency contact for the authenticated citizen."""
    db = await get_database()
    contact = await profile_service.create_emergency_contact(db, user, payload)
    return EmergencyContactSingleResponse(success=True, data=contact)


@router.patch("/emergency-contacts/{contact_id}", response_model=EmergencyContactSingleResponse)
async def update_emergency_contact(
    contact_id: str,
    payload: EmergencyContactUpdate,
    user: AuthenticatedUser = Depends(get_current_user),
):
    """Update an existing emergency contact belonging to caller."""
    db = await get_database()
    contact = await profile_service.update_emergency_contact(db, user, contact_id, payload)
    return EmergencyContactSingleResponse(success=True, data=contact)


@router.delete("/emergency-contacts/{contact_id}")
async def delete_emergency_contact(
    contact_id: str,
    user: AuthenticatedUser = Depends(get_current_user),
):
    """Delete an emergency contact and promote remaining contact to primary if needed."""
    db = await get_database()
    await profile_service.delete_emergency_contact(db, user, contact_id)
    return {"success": True, "message": "Emergency contact deleted successfully."}


# ---------------------------------------------------------------------------
# Medical Information Endpoints
# ---------------------------------------------------------------------------


@router.get("/medical", response_model=MedicalSingleResponse)
async def get_medical_information(
    user: AuthenticatedUser = Depends(get_current_user),
):
    """Retrieve emergency medical information for the authenticated citizen."""
    db = await get_database()
    medical = await profile_service.get_medical_info(db, user)
    return MedicalSingleResponse(success=True, data=medical)


@router.patch("/medical", response_model=MedicalSingleResponse)
async def update_medical_information(
    payload: MedicalInfoUpdate,
    user: AuthenticatedUser = Depends(get_current_user),
):
    """Update emergency medical information for the authenticated citizen."""
    db = await get_database()
    medical = await profile_service.update_medical_info(db, user, payload)
    return MedicalSingleResponse(success=True, data=medical)


# ---------------------------------------------------------------------------
# Privacy & Emergency Settings Endpoints
# ---------------------------------------------------------------------------


@router.get("/settings", response_model=PrivacySettingsResponse)
async def get_privacy_settings(
    user: AuthenticatedUser = Depends(get_current_user),
):
    """Retrieve privacy and emergency feature settings."""
    db = await get_database()
    settings = await profile_service.get_privacy_settings(db, user)
    return PrivacySettingsResponse(success=True, data=settings)


@router.patch("/settings", response_model=PrivacySettingsResponse)
async def update_privacy_settings(
    payload: PrivacySettingsUpdate,
    user: AuthenticatedUser = Depends(get_current_user),
):
    """Update toggleable emergency preferences."""
    db = await get_database()
    settings = await profile_service.update_privacy_settings(db, user, payload)
    return PrivacySettingsResponse(success=True, data=settings)
