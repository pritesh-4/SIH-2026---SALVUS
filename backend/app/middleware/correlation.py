"""Request correlation ID middleware for distributed tracing and observability."""

from __future__ import annotations

import contextvars
import uuid
from collections.abc import Callable

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response

# Context variable for retrieving current request ID anywhere in coroutine call hierarchy
CORRELATION_HEADER = "X-Request-ID"
current_request_id: contextvars.ContextVar[str] = contextvars.ContextVar(
    "current_request_id", default="req-system"
)


def get_current_request_id() -> str:
    """Retrieve the active request correlation ID or fallback to default."""
    return current_request_id.get()


class CorrelationIdMiddleware(BaseHTTPMiddleware):
    """Extract or generate X-Request-ID and propagate to response header & ContextVar."""

    async def dispatch(self, request: Request, call_next: Callable) -> Response:
        incoming_id = request.headers.get(CORRELATION_HEADER)
        if incoming_id and incoming_id.strip():
            req_id = incoming_id.strip()
        else:
            req_id = f"req-{uuid.uuid4().hex[:12]}"

        # Store on request state and context variable
        request.state.request_id = req_id
        token = current_request_id.set(req_id)

        try:
            response: Response = await call_next(request)
            response.headers[CORRELATION_HEADER] = req_id
            return response
        finally:
            current_request_id.reset(token)
