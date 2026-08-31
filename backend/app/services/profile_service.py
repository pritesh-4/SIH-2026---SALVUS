"""Business logic and database persistence service for Citizen Profiles & Emergency Readiness."""

from __future__ import annotations

import hashlib
import json
import uuid
from datetime import UTC, datetime
from typing import Any

import aiosqlite
from fastapi import HTTPException, status

from app.auth.jwt_handler import AuthenticatedUser
from app.models.profile import (
    CitizenProfileResponse,
    CitizenProfileUpdate,
    EmergencyContactCreate,
    EmergencyContactResponse,
    EmergencyContactUpdate,
    MedicalInfoResponse,
    MedicalInfoUpdate,
    PrivacySettingItem,
    PrivacySettingsUpdate,
)

DEFAULT_PRIVACY_SETTINGS = [
    {
        "id": "emergency_location",
        "title": "Emergency Location Sharing",
        "description": (
            "Your GPS location is shared with emergency coordinators only during "
            "an active SOS beacon or hazard submission."
        ),
        "value": True,
        "locked": True,
        "badge": "Privacy Protected",
    },
    {
        "id": "offline_cache",
        "title": "Offline Emergency Cache",
        "description": (
            "Stores local shelter locations, emergency contacts, and vital medical pass "
            "on device for zero-connectivity situations."
        ),
        "value": True,
        "locked": False,
        "badge": None,
    },
    {
        "id": "critical_push",
        "title": "Critical Threat Sirens",
        "description": (
            "Override silent mode for imminent disaster evacuation warnings in your sector."
        ),
        "value": True,
        "locked": False,
        "badge": None,
    },
    {
        "id": "battery_saver",
        "title": "Auto Low-Power Disaster Mode",
        "description": (
            "Reduces background animations and screen brightness when battery drops below 20%."
        ),
        "value": True,
        "locked": False,
        "badge": None,
    },
]


def derive_initials(name: str | None) -> str:
    """Generate 1-2 letter uppercase initials from a full name."""
    if not name:
        return "CZ"
    parts = [p.strip() for p in name.strip().split() if p.strip()]
    if not parts:
        return "CZ"
    if len(parts) == 1:
        return parts[0][:2].upper()
    return f"{parts[0][0]}{parts[-1][0]}".upper()


def generate_emergency_id(user_id: str) -> str:
    """Derive deterministic standard emergency ID (SLV-CIT-XXXX)."""
    digest = hashlib.sha256(user_id.encode("utf-8")).hexdigest()
    suffix = digest[:4].upper()
    return f"SLV-CIT-{suffix}"


def _row_to_profile(row: aiosqlite.Row) -> CitizenProfileResponse:
    """Transform SQLite database row into CitizenProfileResponse model."""
    data = dict(row)
    medical_raw = data.get("medical_info")
    medical_parsed: dict[str, Any] | None = None
    if medical_raw:
        try:
            medical_parsed = (
                json.loads(medical_raw) if isinstance(medical_raw, str) else medical_raw
            )
        except Exception:
            medical_parsed = None

    return CitizenProfileResponse(
        id=data["id"],
        emergency_id=data["emergency_id"],
        full_name=data["full_name"],
        phone=data.get("phone"),
        email=data.get("email"),
        registered_address=data.get("registered_address"),
        blood_group=data.get("blood_group") or "UNKNOWN",
        avatar_initials=data.get("avatar_initials") or derive_initials(data["full_name"]),
        avatar_url=data.get("avatar_url"),
        is_verified=bool(data.get("is_verified", 1)),
        created_at=data["created_at"],
        updated_at=data["updated_at"],
        medical_info=medical_parsed,
        medications_note=data.get("medications_note"),
    )


def _row_to_contact(row: aiosqlite.Row) -> EmergencyContactResponse:
    """Transform SQLite database row into EmergencyContactResponse model."""
    data = dict(row)
    return EmergencyContactResponse(
        id=data["id"],
        user_id=data["user_id"],
        name=data["name"],
        relationship=data["relationship"],
        phone=data["phone"],
        priority=int(data.get("priority", 1)),
        is_primary=bool(data.get("is_primary", 0)),
        notify_on_sos=bool(data.get("notify_on_sos", 1)),
        created_at=data["created_at"],
        updated_at=data["updated_at"],
    )


# ---------------------------------------------------------------------------
# Citizen Profile Core Service
# ---------------------------------------------------------------------------


async def get_profile_by_user_id(
    db: aiosqlite.Connection, user_id: str
) -> CitizenProfileResponse | None:
    """Fetch existing citizen profile by authenticated user_id."""
    cursor = await db.execute(
        "SELECT * FROM citizen_profiles WHERE id = ?",
        (user_id,),
    )
    row = await cursor.fetchone()
    if not row:
        return None
    return _row_to_profile(row)


async def get_or_create_profile(
    db: aiosqlite.Connection, user: AuthenticatedUser
) -> CitizenProfileResponse:
    """Retrieve caller's profile, or create default persistent profile if first visit."""
    existing = await get_profile_by_user_id(db, user.user_id)
    if existing:
        return existing

    # Check if this user is mapped to the seeded demo profile
    if user.user_id in ("cit-default", "citizen-user", "citizen-default"):
        cursor = await db.execute("SELECT * FROM citizen_profiles WHERE id = 'cit-default'")
        seed_row = await cursor.fetchone()
        if seed_row:
            return _row_to_profile(seed_row)

    now = datetime.now(UTC).isoformat()
    emergency_id = generate_emergency_id(user.user_id)
    display_name = user.name if user.name and user.name != "Anonymous" else "Citizen User"
    initials = derive_initials(display_name)

    default_medical = json.dumps(
        {
            "conditions": [],
            "allergies": [],
            "mobilityNote": "Fully Mobile / Ambulatory",
        }
    )
    default_settings = json.dumps(DEFAULT_PRIVACY_SETTINGS)

    await db.execute(
        """
        INSERT INTO citizen_profiles (
            id, emergency_id, full_name, phone, email, registered_address,
            blood_group, avatar_initials, avatar_url, medical_info, privacy_settings,
            medications_note, is_verified, created_at, updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            user.user_id,
            emergency_id,
            display_name,
            None,
            getattr(user, "email", None),
            None,
            "UNKNOWN",
            initials,
            None,
            default_medical,
            default_settings,
            None,
            1,
            now,
            now,
        ),
    )
    await db.commit()

    created = await get_profile_by_user_id(db, user.user_id)
    if not created:
        raise RuntimeError(f"Failed to persist created profile for user '{user.user_id}'")
    return created


async def update_profile(
    db: aiosqlite.Connection, user: AuthenticatedUser, payload: CitizenProfileUpdate
) -> CitizenProfileResponse:
    """Update editable profile fields for the authenticated user only."""
    current = await get_or_create_profile(db, user)

    updates: list[str] = []
    params: list[Any] = []

    if payload.full_name is not None:
        updates.append("full_name = ?")
        params.append(payload.full_name)
        if payload.avatar_initials is None:
            updates.append("avatar_initials = ?")
            params.append(derive_initials(payload.full_name))

    if payload.phone is not None:
        updates.append("phone = ?")
        params.append(payload.phone)

    if payload.email is not None:
        updates.append("email = ?")
        params.append(payload.email)

    if payload.registered_address is not None:
        updates.append("registered_address = ?")
        params.append(payload.registered_address)

    if payload.blood_group is not None:
        updates.append("blood_group = ?")
        params.append(payload.blood_group)

    if payload.avatar_initials is not None:
        updates.append("avatar_initials = ?")
        params.append(payload.avatar_initials)

    if payload.avatar_url is not None:
        updates.append("avatar_url = ?")
        params.append(payload.avatar_url)

    now = datetime.now(UTC).isoformat()
    updates.append("updated_at = ?")
    params.append(now)

    params.append(current.id)
    query = f"UPDATE citizen_profiles SET {', '.join(updates)} WHERE id = ?"

    await db.execute(query, params)
    await db.commit()

    updated = await get_profile_by_user_id(db, current.id)
    if not updated:
        raise RuntimeError(f"Failed to retrieve updated profile for user '{current.id}'")
    return updated


# ---------------------------------------------------------------------------
# Emergency Contacts Services
# ---------------------------------------------------------------------------


async def list_emergency_contacts(
    db: aiosqlite.Connection, user: AuthenticatedUser
) -> list[EmergencyContactResponse]:
    """Retrieve all emergency contacts belonging to the authenticated citizen."""
    await get_or_create_profile(db, user)

    cursor = await db.execute(
        """
        SELECT * FROM emergency_contacts
        WHERE user_id = ?
        ORDER BY is_primary DESC, priority ASC, created_at ASC
        """,
        (user.user_id,),
    )
    rows = await cursor.fetchall()
    return [_row_to_contact(r) for r in rows]


async def create_emergency_contact(
    db: aiosqlite.Connection, user: AuthenticatedUser, payload: EmergencyContactCreate
) -> EmergencyContactResponse:
    """Create a new emergency contact with single-primary enforcement."""
    await get_or_create_profile(db, user)

    # Check maximum 5 contacts limit
    cursor = await db.execute(
        "SELECT COUNT(*) FROM emergency_contacts WHERE user_id = ?",
        (user.user_id,),
    )
    count_row = await cursor.fetchone()
    current_count = count_row[0] if count_row else 0
    if current_count >= 5:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={
                "success": False,
                "error": {
                    "code": "CONTACT_LIMIT_REACHED",
                    "message": "Maximum of 5 designated emergency contacts reached.",
                },
            },
        )

    contact_id = f"ec-{uuid.uuid4().hex[:8]}"
    now = datetime.now(UTC).isoformat()

    # If this is the user's first contact or explicitly designated as primary, enforce primary
    is_primary = 1 if (payload.is_primary or current_count == 0) else 0

    if is_primary:
        await db.execute(
            "UPDATE emergency_contacts SET is_primary = 0, updated_at = ? WHERE user_id = ?",
            (now, user.user_id),
        )

    await db.execute(
        """
        INSERT INTO emergency_contacts (
            id, user_id, name, relationship, phone, priority, is_primary, notify_on_sos,
            created_at, updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            contact_id,
            user.user_id,
            payload.name,
            payload.relationship,
            payload.phone,
            payload.priority,
            is_primary,
            1 if payload.notify_on_sos else 0,
            now,
            now,
        ),
    )
    await db.commit()

    cursor = await db.execute("SELECT * FROM emergency_contacts WHERE id = ?", (contact_id,))
    row = await cursor.fetchone()
    if not row:
        raise RuntimeError("Failed to create emergency contact record.")
    return _row_to_contact(row)


async def update_emergency_contact(
    db: aiosqlite.Connection,
    user: AuthenticatedUser,
    contact_id: str,
    payload: EmergencyContactUpdate,
) -> EmergencyContactResponse:
    """Update an existing emergency contact belonging to caller."""
    cursor = await db.execute(
        "SELECT * FROM emergency_contacts WHERE id = ? AND user_id = ?",
        (contact_id, user.user_id),
    )
    existing = await cursor.fetchone()
    if not existing:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={
                "success": False,
                "error": {
                    "code": "CONTACT_NOT_FOUND",
                    "message": "Emergency contact not found or unauthorized.",
                },
            },
        )

    now = datetime.now(UTC).isoformat()
    updates: list[str] = []
    params: list[Any] = []

    if payload.name is not None:
        updates.append("name = ?")
        params.append(payload.name)

    if payload.relationship is not None:
        updates.append("relationship = ?")
        params.append(payload.relationship)

    if payload.phone is not None:
        updates.append("phone = ?")
        params.append(payload.phone)

    if payload.priority is not None:
        updates.append("priority = ?")
        params.append(payload.priority)

    if payload.notify_on_sos is not None:
        updates.append("notify_on_sos = ?")
        params.append(1 if payload.notify_on_sos else 0)

    if payload.is_primary is not None:
        if payload.is_primary:
            # Unset all other contacts as primary
            await db.execute(
                "UPDATE emergency_contacts SET is_primary = 0, updated_at = ? WHERE user_id = ?",
                (now, user.user_id),
            )
            updates.append("is_primary = ?")
            params.append(1)
        else:
            updates.append("is_primary = ?")
            params.append(0)

    if updates:
        updates.append("updated_at = ?")
        params.append(now)
        params.append(contact_id)
        params.append(user.user_id)

        query = f"UPDATE emergency_contacts SET {', '.join(updates)} WHERE id = ? AND user_id = ?"
        await db.execute(query, params)
        await db.commit()

    cursor = await db.execute("SELECT * FROM emergency_contacts WHERE id = ?", (contact_id,))
    row = await cursor.fetchone()
    if not row:
        raise RuntimeError("Failed to reload updated contact.")
    return _row_to_contact(row)


async def delete_emergency_contact(
    db: aiosqlite.Connection, user: AuthenticatedUser, contact_id: str
) -> bool:
    """Delete emergency contact and promote remaining contact to primary if necessary."""
    cursor = await db.execute(
        "SELECT * FROM emergency_contacts WHERE id = ? AND user_id = ?",
        (contact_id, user.user_id),
    )
    existing = await cursor.fetchone()
    if not existing:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={
                "success": False,
                "error": {
                    "code": "CONTACT_NOT_FOUND",
                    "message": "Emergency contact not found or unauthorized.",
                },
            },
        )

    was_primary = bool(existing["is_primary"])
    await db.execute(
        "DELETE FROM emergency_contacts WHERE id = ? AND user_id = ?",
        (contact_id, user.user_id),
    )

    # If the deleted contact was primary, promote the next highest priority contact
    if was_primary:
        cursor = await db.execute(
            """
            SELECT id FROM emergency_contacts
            WHERE user_id = ?
            ORDER BY priority ASC, created_at ASC
            LIMIT 1
            """,
            (user.user_id,),
        )
        next_contact = await cursor.fetchone()
        if next_contact:
            now = datetime.now(UTC).isoformat()
            await db.execute(
                "UPDATE emergency_contacts SET is_primary = 1, updated_at = ? WHERE id = ?",
                (now, next_contact["id"]),
            )

    await db.commit()
    return True


# ---------------------------------------------------------------------------
# Medical Information Services
# ---------------------------------------------------------------------------


async def get_medical_info(
    db: aiosqlite.Connection, user: AuthenticatedUser
) -> MedicalInfoResponse:
    """Retrieve emergency medical profile for the authenticated citizen."""
    profile = await get_or_create_profile(db, user)

    med_info = profile.medical_info or {}
    return MedicalInfoResponse(
        blood_group=profile.blood_group or "UNKNOWN",
        conditions=med_info.get("conditions", []),
        allergies=med_info.get("allergies", []),
        mobility_note=med_info.get("mobilityNote", "Fully Mobile / Ambulatory"),
        medications_note=profile.medications_note,
    )


async def update_medical_info(
    db: aiosqlite.Connection, user: AuthenticatedUser, payload: MedicalInfoUpdate
) -> MedicalInfoResponse:
    """Update emergency medical profile with strict validation and privacy."""
    profile = await get_or_create_profile(db, user)

    current_med = profile.medical_info or {}
    new_conditions = (
        payload.conditions if payload.conditions is not None else current_med.get("conditions", [])
    )
    new_allergies = (
        payload.allergies if payload.allergies is not None else current_med.get("allergies", [])
    )
    new_mobility = (
        payload.mobility_note
        if payload.mobility_note is not None
        else current_med.get("mobilityNote", "Fully Mobile / Ambulatory")
    )
    new_blood = (
        payload.blood_group
        if payload.blood_group is not None
        else (profile.blood_group or "UNKNOWN")
    )
    new_meds = (
        payload.medications_note
        if payload.medications_note is not None
        else profile.medications_note
    )

    updated_medical_json = json.dumps(
        {
            "conditions": new_conditions,
            "allergies": new_allergies,
            "mobilityNote": new_mobility,
        }
    )

    now = datetime.now(UTC).isoformat()
    await db.execute(
        """
        UPDATE citizen_profiles
        SET blood_group = ?, medical_info = ?, medications_note = ?, updated_at = ?
        WHERE id = ?
        """,
        (new_blood, updated_medical_json, new_meds, now, user.user_id),
    )
    await db.commit()

    return MedicalInfoResponse(
        blood_group=new_blood,
        conditions=new_conditions,
        allergies=new_allergies,
        mobility_note=new_mobility,
        medications_note=new_meds,
    )


# ---------------------------------------------------------------------------
# Privacy & Location Settings Services
# ---------------------------------------------------------------------------


async def get_privacy_settings(
    db: aiosqlite.Connection, user: AuthenticatedUser
) -> list[PrivacySettingItem]:
    """Retrieve privacy and emergency settings for the citizen."""
    cursor = await db.execute(
        "SELECT privacy_settings FROM citizen_profiles WHERE id = ?",
        (user.user_id,),
    )
    row = await cursor.fetchone()
    if not row or not row["privacy_settings"]:
        return [PrivacySettingItem(**item) for item in DEFAULT_PRIVACY_SETTINGS]

    try:
        data = json.loads(row["privacy_settings"])
        # Merge with defaults to ensure any newly added setting keys exist
        default_map = {item["id"]: item for item in DEFAULT_PRIVACY_SETTINGS}
        for saved in data:
            if saved.get("id") in default_map:
                # If setting is locked by system, value is forced to system default
                if not default_map[saved["id"]]["locked"]:
                    default_map[saved["id"]]["value"] = bool(saved.get("value", True))

        return [PrivacySettingItem(**item) for item in default_map.values()]
    except Exception:
        return [PrivacySettingItem(**item) for item in DEFAULT_PRIVACY_SETTINGS]


async def update_privacy_settings(
    db: aiosqlite.Connection, user: AuthenticatedUser, payload: PrivacySettingsUpdate
) -> list[PrivacySettingItem]:
    """Update toggleable privacy preferences (system-locked settings remain protected)."""
    current_settings = await get_privacy_settings(db, user)
    update_map = {item.id: item.value for item in payload.settings}

    updated_items: list[dict[str, Any]] = []
    for item in current_settings:
        item_dict = item.model_dump()
        if not item.locked and item.id in update_map:
            item_dict["value"] = bool(update_map[item.id])
        updated_items.append(item_dict)

    now = datetime.now(UTC).isoformat()
    await db.execute(
        "UPDATE citizen_profiles SET privacy_settings = ?, updated_at = ? WHERE id = ?",
        (json.dumps(updated_items), now, user.user_id),
    )
    await db.commit()

    return [PrivacySettingItem(**i) for i in updated_items]
