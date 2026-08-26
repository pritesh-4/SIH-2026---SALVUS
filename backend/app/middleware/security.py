"""Security headers and payload protection middleware for Salvus API."""

from __future__ import annotations

import os

from starlette.middleware.base import BaseHTTPMiddleware, RequestResponseEndpoint
from starlette.requests import Request
from starlette.responses import JSONResponse, Response

# Maximum permitted payload size for incoming JSON / POST bodies (5MB)
MAX_CONTENT_LENGTH_BYTES = 5 * 1024 * 1024


class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    """Inject industry-standard HTTP security headers on all outgoing responses."""

    async def dispatch(self, request: Request, call_next: RequestResponseEndpoint) -> Response:
        response = await call_next(request)

        # Prevent MIME type sniffing
        response.headers["X-Content-Type-Options"] = "nosniff"

        # Prevent clickjacking in legacy frames
        response.headers["X-Frame-Options"] = "DENY"

        # Cross-site scripting filter
        response.headers["X-XSS-Protection"] = "1; mode=block"

        # Control referrer leakage
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"

        # Restrict browser capabilities
        response.headers["Permissions-Policy"] = (
            "geolocation=(self), camera=(), microphone=(), payment=(), usb=()"
        )

        # Enforce HTTPS in production environments
        env = os.getenv("ENVIRONMENT", "development").lower()
        if env == "production" or request.url.scheme == "https":
            response.headers["Strict-Transport-Security"] = (
                "max-age=31536000; includeSubDomains; preload"
            )

        return response


class PayloadLimitMiddleware(BaseHTTPMiddleware):
    """Enforce a strict maximum request body size to guard against memory exhaustion attacks."""

    async def dispatch(self, request: Request, call_next: RequestResponseEndpoint) -> Response:
        content_length = request.headers.get("content-length")
        if content_length:
            try:
                length = int(content_length)
                if length > MAX_CONTENT_LENGTH_BYTES:
                    return JSONResponse(
                        status_code=413,
                        content={
                            "success": False,
                            "error": {
                                "code": "PAYLOAD_TOO_LARGE",
                                "message": (
                                    f"Request entity exceeds maximum permitted limit "
                                    f"({MAX_CONTENT_LENGTH_BYTES // (1024 * 1024)}MB)."
                                ),
                            },
                        },
                    )
            except ValueError:
                pass

        return await call_next(request)
