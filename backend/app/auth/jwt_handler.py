"""Cryptographic JWT token generation, verification, and role models for Salvus."""

from __future__ import annotations

import os
from datetime import UTC, datetime, timedelta
from enum import StrEnum
from typing import Any

import jwt
from pydantic import BaseModel, Field

# ---------------------------------------------------------------------------
# Constants & Configuration
# ---------------------------------------------------------------------------

ALGORITHM = "HS256"
DEFAULT_ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 24 * 7  # 7 days for hackathon/demo stability
FALLBACK_SECRET_KEY = "salvus-production-hardened-jwt-secret-key-do-not-leak-or-share-32char"


def get_secret_key() -> str:
    """Retrieve HMAC signing secret key from environment."""
    key = os.getenv("SECRET_KEY", "").strip()
    if not key:
        return FALLBACK_SECRET_KEY
    return key


# ---------------------------------------------------------------------------
# Domain Roles & Auth Models
# ---------------------------------------------------------------------------


class UserRole(StrEnum):
    """Normalized security roles for RBAC authorization."""

    CITIZEN = "CITIZEN"
    AUTHORITY = "AUTHORITY"
    RESPONDER = "RESPONDER"
    SYSTEM = "SYSTEM"

    @classmethod
    def from_str(cls, value: str) -> UserRole:
        """Parse role from string case-insensitively."""
        normalized = value.strip().upper()
        for role in cls:
            if role.value == normalized:
                return role
        raise ValueError(f"Unknown role '{value}'. Must be one of {[r.value for r in cls]}")


class AuthenticatedUser(BaseModel):
    """Verified identity extracted from cryptographic JWT claims."""

    user_id: str = Field(description="Unique identity subject ID")
    role: UserRole = Field(description="Role claim determining RBAC access")
    name: str = Field(default="Anonymous", description="Human-readable actor name")
    email: str | None = Field(default=None, description="Authenticated user email address")
    scoped_incident_id: str | None = Field(
        default=None, description="Optional incident UUID scope for citizen ownership"
    )
    scoped_responder_id: str | None = Field(
        default=None, description="Optional responder UUID scope for responder operations"
    )

    @property
    def is_authority(self) -> bool:
        return self.role in (UserRole.AUTHORITY, UserRole.SYSTEM)

    @property
    def is_responder(self) -> bool:
        return self.role == UserRole.RESPONDER

    @property
    def is_citizen(self) -> bool:
        return self.role == UserRole.CITIZEN

    @property
    def is_system(self) -> bool:
        return self.role == UserRole.SYSTEM


class TokenResponse(BaseModel):
    """Response payload for successful token issuance."""

    access_token: str
    token_type: str = "bearer"
    role: UserRole
    user_id: str
    name: str
    expires_in: int


# ---------------------------------------------------------------------------
# Token Operations
# ---------------------------------------------------------------------------


def create_access_token(
    user_id: str,
    role: UserRole | str,
    name: str | None = None,
    email: str | None = None,
    scoped_incident_id: str | None = None,
    scoped_responder_id: str | None = None,
    expires_delta: timedelta | None = None,
    extra_claims: dict[str, Any] | None = None,
) -> str:
    """Issue a cryptographically signed HMAC-SHA256 JWT access token."""
    role_enum = role if isinstance(role, UserRole) else UserRole.from_str(role)
    display_name = name or f"{role_enum.value.capitalize()} User"

    now = datetime.now(UTC)
    expire = now + (expires_delta or timedelta(minutes=DEFAULT_ACCESS_TOKEN_EXPIRE_MINUTES))

    to_encode: dict[str, Any] = {
        "sub": user_id,
        "role": role_enum.value,
        "name": display_name,
        "iat": int(now.timestamp()),
        "exp": int(expire.timestamp()),
    }

    if email:
        to_encode["email"] = email

    if scoped_incident_id:
        to_encode["incident_id"] = scoped_incident_id
    if scoped_responder_id:
        to_encode["responder_id"] = scoped_responder_id

    if extra_claims:
        to_encode.update(extra_claims)

    secret = get_secret_key()
    return jwt.encode(to_encode, secret, algorithm=ALGORITHM)


def verify_access_token(token: str) -> AuthenticatedUser:
    """Decode and cryptographically verify a JWT access token.

    Raises jwt.PyJWTError (ExpiredSignatureError, InvalidTokenError, etc.) on failure.
    """
    secret = get_secret_key()
    payload = jwt.decode(token, secret, algorithms=[ALGORITHM])

    user_id = payload.get("sub")
    if not user_id:
        raise jwt.InvalidTokenError("Missing 'sub' subject claim in token payload.")

    raw_role = payload.get("role", UserRole.CITIZEN.value)
    role_enum = UserRole.from_str(raw_role)

    return AuthenticatedUser(
        user_id=str(user_id),
        role=role_enum,
        name=str(payload.get("name", "User")),
        email=payload.get("email"),
        scoped_incident_id=payload.get("incident_id"),
        scoped_responder_id=payload.get("responder_id"),
    )
