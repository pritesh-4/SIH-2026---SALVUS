"""Global error handler and security middleware."""

from __future__ import annotations

from fastapi import Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse

from app.middleware.correlation import CorrelationIdMiddleware, get_current_request_id
from app.middleware.request_logger import RequestLoggingMiddleware
from app.middleware.security import PayloadLimitMiddleware, SecurityHeadersMiddleware

__all__ = [
    "CorrelationIdMiddleware",
    "PayloadLimitMiddleware",
    "RequestLoggingMiddleware",
    "SecurityHeadersMiddleware",
    "generic_exception_handler",
    "get_current_request_id",
    "validation_exception_handler",
]


from fastapi.encoders import jsonable_encoder


async def validation_exception_handler(
    request: Request, exc: RequestValidationError
) -> JSONResponse:
    """Return a consistent JSON error for Pydantic validation failures."""
    errors = exc.errors()
    # Build a human-readable message from the first error
    first = errors[0] if errors else {}
    field = " → ".join(str(loc) for loc in first.get("loc", []))
    msg = first.get("msg", "Validation failed")

    return JSONResponse(
        status_code=422,
        content={
            "success": False,
            "error": {
                "code": "VALIDATION_ERROR",
                "message": f"{field}: {msg}" if field else msg,
                "details": jsonable_encoder(errors),
            },
        },
    )


async def generic_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    """Catch-all handler — never expose stack traces to clients."""
    return JSONResponse(
        status_code=500,
        content={
            "success": False,
            "error": {
                "code": "INTERNAL_ERROR",
                "message": "An unexpected error occurred. Please try again.",
            },
        },
    )
