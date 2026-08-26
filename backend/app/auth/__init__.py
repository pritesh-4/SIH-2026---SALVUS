"""Authentication and authorization package for Salvus."""

from app.auth.dependencies import (
    get_current_user,
    get_optional_user,
    require_authority,
    require_citizen,
    require_responder,
    require_roles,
    require_system,
)
from app.auth.jwt_handler import (
    AuthenticatedUser,
    TokenResponse,
    UserRole,
    create_access_token,
    get_secret_key,
    verify_access_token,
)

__all__ = [
    "AuthenticatedUser",
    "TokenResponse",
    "UserRole",
    "create_access_token",
    "get_current_user",
    "get_optional_user",
    "get_secret_key",
    "require_authority",
    "require_citizen",
    "require_responder",
    "require_roles",
    "require_system",
    "verify_access_token",
]
