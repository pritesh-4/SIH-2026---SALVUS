"""Global error handler and security middleware with structured taxonomy and correlation ID."""

from __future__ import annotations

import logging
from typing import Any

from fastapi import HTTPException, Request
from fastapi.encoders import jsonable_encoder
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

from app.middleware.correlation import CorrelationIdMiddleware, get_current_request_id
from app.middleware.request_logger import RequestLoggingMiddleware
from app.middleware.security import PayloadLimitMiddleware, SecurityHeadersMiddleware

logger = logging.getLogger("salvus.error_handler")

__all__ = [
    "CorrelationIdMiddleware",
    "PayloadLimitMiddleware",
    "RequestLoggingMiddleware",
    "SecurityHeadersMiddleware",
    "generic_exception_handler",
    "get_current_request_id",
    "http_exception_handler",
    "validation_exception_handler",
]


def _infer_error_code(status_code: int) -> str:
    """Map HTTP status codes to the Salvus standard error taxonomy."""
    mapping = {
        400: "VALIDATION_ERROR",
        401: "AUTH_ERROR",
        403: "FORBIDDEN",
        404: "NOT_FOUND",
        409: "CONFLICT",
        413: "PAYLOAD_TOO_LARGE",
        422: "VALIDATION_ERROR",
        429: "RATE_LIMITED",
        500: "INTERNAL_ERROR",
        502: "EXTERNAL_SERVICE_ERROR",
        503: "DATABASE_ERROR",
        504: "TIMEOUT",
    }
    return mapping.get(status_code, "INTERNAL_ERROR")


def _is_retryable_status(status_code: int) -> bool:
    """Determine whether an error status code is safe for automated retry."""
    return status_code in (408, 429, 502, 503, 504)


async def http_exception_handler(
    request: Request, exc: HTTPException | StarletteHTTPException
) -> JSONResponse:
    """Normalize all HTTPExceptions into the standard Salvus structured error schema."""
    req_id = getattr(request.state, "request_id", get_current_request_id())
    status_code = exc.status_code
    default_code = _infer_error_code(status_code)
    retryable = _is_retryable_status(status_code)

    detail = exc.detail
    code = default_code
    message = "An error occurred during request processing."
    details: Any = None

    if isinstance(detail, dict):
        if "error" in detail and isinstance(detail["error"], dict):
            err_dict = detail["error"]
            code = err_dict.get("code", default_code)
            message = err_dict.get("message", message)
            details = err_dict.get("details", None)
            if "retryable" in err_dict:
                retryable = bool(err_dict["retryable"])
        else:
            code = detail.get("code", default_code)
            message = detail.get("message", str(detail))
            details = detail.get("details", None)
            if "retryable" in detail:
                retryable = bool(detail["retryable"])
    elif isinstance(detail, str):
        message = detail

    content: dict[str, Any] = {
        "success": False,
        "error": {
            "code": code,
            "message": message,
            "retryable": retryable,
        },
        "detail": (
            detail
            if isinstance(detail, (dict, list, str))
            else {"error": {"code": code, "message": message}}
        ),
        "request_id": req_id,
    }
    if details is not None:
        content["error"]["details"] = details

    headers = getattr(exc, "headers", None)
    return JSONResponse(status_code=status_code, content=content, headers=headers)


async def validation_exception_handler(
    request: Request, exc: RequestValidationError
) -> JSONResponse:
    """Return a consistent structured JSON error for Pydantic validation failures."""
    req_id = getattr(request.state, "request_id", get_current_request_id())
    errors = exc.errors()
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
                "retryable": False,
            },
            "detail": jsonable_encoder(errors),
            "request_id": req_id,
        },
    )


async def generic_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    """Catch-all handler — log trace on server, return safe structured payload to client."""
    req_id = getattr(request.state, "request_id", get_current_request_id())
    logger.error(
        f"[Internal Server Error] Unhandled exception for {request.method} "
        f"{request.url.path} (request_id={req_id}): {exc}",
        exc_info=True,
    )
    return JSONResponse(
        status_code=500,
        content={
            "success": False,
            "error": {
                "code": "INTERNAL_ERROR",
                "message": "An unexpected error occurred. Please try again.",
                "retryable": False,
            },
            "request_id": req_id,
        },
    )
