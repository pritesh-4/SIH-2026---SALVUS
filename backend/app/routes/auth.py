"""Authentication and token issuance REST API routes for Salvus."""

from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field

from app.auth.dependencies import get_current_user
from app.auth.jwt_handler import (
    DEFAULT_ACCESS_TOKEN_EXPIRE_MINUTES,
    AuthenticatedUser,
    TokenResponse,
    UserRole,
    create_access_token,
)

router = APIRouter(prefix="/api/auth", tags=["auth"])


class TokenIssueRequest(BaseModel):
    """Request payload to issue a signed JWT token."""

    role: str = Field(
        default="AUTHORITY", description="Target role: CITIZEN, AUTHORITY, RESPONDER, SYSTEM"
    )
    user_id: str | None = Field(default=None, description="Optional custom user identity ID")
    name: str | None = Field(default=None, description="Human-readable actor name")
    scoped_incident_id: str | None = Field(
        default=None, description="Scope token to specific incident"
    )
    scoped_responder_id: str | None = Field(
        default=None, description="Scope token to specific responder unit"
    )


class UserProfileResponse(BaseModel):
    """Current authenticated user profile and capability scopes."""

    success: bool = True
    user: AuthenticatedUser
    permissions: list[str]


def _get_permissions_for_role(role: UserRole) -> list[str]:
    """Derive list of granted system permissions for a role."""
    if role == UserRole.AUTHORITY:
        return [
            "incidents:read_all",
            "incidents:mutate_status",
            "triage:analyze",
            "triage:verify",
            "triage:adjust",
            "assignments:create",
            "assignments:mutate_status",
            "responders:assign",
            "responders:mutate_status",
            "responders:update_location",
            "shelters:mutate",
            "simulation:control",
            "socket:join_authorities",
        ]
    if role == UserRole.RESPONDER:
        return [
            "assignments:read_assigned",
            "assignments:mutate_status_own",
            "responders:update_location_own",
            "responders:advance_lifecycle_own",
            "socket:join_mission_scope",
        ]
    if role == UserRole.CITIZEN:
        return [
            "incidents:create",
            "incidents:read_own",
            "incidents:cancel_own",
            "hazards:read",
            "shelters:read",
            "routes:read",
            "socket:join_own_incident",
        ]
    if role == UserRole.SYSTEM:
        return ["*"]
    return []


@router.post("/token", response_model=TokenResponse)
async def issue_token(payload: TokenIssueRequest):
    """Issue a cryptographically signed HMAC-SHA256 JWT access token for a role."""
    role_enum = UserRole.from_str(payload.role)
    user_id = payload.user_id or f"{role_enum.value.lower()}-{uuid.uuid4().hex[:8]}"

    default_names = {
        UserRole.AUTHORITY: "Duty Dispatcher",
        UserRole.RESPONDER: "NDRF Rescue Leader",
        UserRole.CITIZEN: "Citizen User",
        UserRole.SYSTEM: "Salvus Background Engine",
    }
    display_name = payload.name or default_names.get(role_enum, "User")

    token = create_access_token(
        user_id=user_id,
        role=role_enum,
        name=display_name,
        scoped_incident_id=payload.scoped_incident_id,
        scoped_responder_id=payload.scoped_responder_id,
    )

    return TokenResponse(
        access_token=token,
        token_type="bearer",
        role=role_enum,
        user_id=user_id,
        name=display_name,
        expires_in=DEFAULT_ACCESS_TOKEN_EXPIRE_MINUTES * 60,
    )


@router.post("/demo-token", response_model=TokenResponse)
async def issue_demo_token(role: str = "AUTHORITY"):
    """Quick helper for demo environments to mint valid role tokens."""
    return await issue_token(TokenIssueRequest(role=role))


@router.get("/me", response_model=UserProfileResponse)
async def get_current_user_profile(user: AuthenticatedUser = Depends(get_current_user)):
    """Retrieve verified profile, role claims, and granted permissions of the caller."""
    perms = _get_permissions_for_role(user.role)
    return UserProfileResponse(
        success=True,
        user=user,
        permissions=perms,
    )
