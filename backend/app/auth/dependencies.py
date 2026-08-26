"""FastAPI authentication and RBAC authorization dependencies for Salvus."""

from __future__ import annotations

from collections.abc import Callable

import jwt
from fastapi import Depends, HTTPException, Security, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from app.auth.jwt_handler import AuthenticatedUser, UserRole, verify_access_token

# Configure HTTPBearer scheme with auto_error=False so we can provide structured JSON responses
bearer_scheme = HTTPBearer(auto_error=False)


async def get_optional_user(
    credentials: HTTPAuthorizationCredentials | None = Security(bearer_scheme),
) -> AuthenticatedUser | None:
    """Extract authenticated user if valid token is provided; otherwise return None."""
    if not credentials or not credentials.credentials:
        return None

    try:
        return verify_access_token(credentials.credentials)
    except jwt.PyJWTError:
        return None


async def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Security(bearer_scheme),
) -> AuthenticatedUser:
    """Extract and verify authenticated user from Authorization Bearer header.

    Raises HTTP 401 if token is missing, expired, or invalid.
    """
    if not credentials or not credentials.credentials:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={
                "success": False,
                "error": {
                    "code": "UNAUTHORIZED",
                    "message": (
                        "Authentication required. Missing Bearer token in Authorization header."
                    ),
                },
            },
            headers={"WWW-Authenticate": "Bearer"},
        )

    try:
        return verify_access_token(credentials.credentials)
    except jwt.ExpiredSignatureError as e:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={
                "success": False,
                "error": {
                    "code": "TOKEN_EXPIRED",
                    "message": "Authentication token has expired. Please refresh your session.",
                },
            },
            headers={"WWW-Authenticate": "Bearer"},
        ) from e
    except jwt.InvalidTokenError as e:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={
                "success": False,
                "error": {
                    "code": "INVALID_TOKEN",
                    "message": f"Invalid authentication token: {str(e)}",
                },
            },
            headers={"WWW-Authenticate": "Bearer"},
        ) from e


def require_roles(*allowed_roles: UserRole) -> Callable:
    """Create a FastAPI dependency that verifies the user possesses at least one allowed role."""

    async def role_checker(
        current_user: AuthenticatedUser = Depends(get_current_user),
    ) -> AuthenticatedUser:
        if current_user.role not in allowed_roles:
            role_names = ", ".join(r.value for r in allowed_roles)
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail={
                    "success": False,
                    "error": {
                        "code": "FORBIDDEN",
                        "message": (
                            f"Access denied. Role '{current_user.role.value}' is not authorized. "
                            f"Required role(s): {role_names}."
                        ),
                    },
                },
            )

        return current_user

    return role_checker


# ---------------------------------------------------------------------------
# Pre-configured role dependencies
# ---------------------------------------------------------------------------

require_authority = require_roles(UserRole.AUTHORITY, UserRole.SYSTEM)
require_responder = require_roles(UserRole.RESPONDER, UserRole.AUTHORITY, UserRole.SYSTEM)
require_citizen = require_roles(UserRole.CITIZEN, UserRole.AUTHORITY, UserRole.SYSTEM)
require_system = require_roles(UserRole.SYSTEM)
