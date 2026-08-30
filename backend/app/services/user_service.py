"""User authentication service for Salvus.

Handles user lookup and credential verification against the users database table.
"""

from __future__ import annotations

import aiosqlite

from app.auth.password import verify_password


async def get_user_by_email(db: aiosqlite.Connection, email: str) -> dict | None:
    """Look up a user by email address.

    Returns a dict of user fields (excluding password_hash from external callers)
    or None if not found.
    """
    cursor = await db.execute(
        "SELECT id, email, password_hash, full_name, role, is_active, "
        "created_at, updated_at FROM users WHERE email = ?",
        (email.strip().lower(),),
    )
    row = await cursor.fetchone()
    if not row:
        return None
    return {
        "id": row["id"],
        "email": row["email"],
        "password_hash": row["password_hash"],
        "full_name": row["full_name"],
        "role": row["role"],
        "is_active": bool(row["is_active"]),
        "created_at": row["created_at"],
        "updated_at": row["updated_at"],
    }


async def authenticate_user(db: aiosqlite.Connection, email: str, password: str) -> dict | None:
    """Authenticate a user by email and password.

    Returns the user dict (without password_hash) if credentials are valid
    and the account is active. Returns None on any failure.

    This function deliberately does not distinguish between:
    - email not found
    - wrong password
    - inactive account
    to prevent user enumeration.
    """
    user = await get_user_by_email(db, email)
    if not user:
        return None

    if not user["is_active"]:
        return None

    if not verify_password(password, user["password_hash"]):
        return None

    # Return user without the password_hash
    return {
        "id": user["id"],
        "email": user["email"],
        "full_name": user["full_name"],
        "role": user["role"],
        "is_active": user["is_active"],
        "created_at": user["created_at"],
        "updated_at": user["updated_at"],
    }
