"""Structured HTTP access logging middleware."""

from __future__ import annotations

import time
from collections.abc import Callable

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response

from app.logging.structured_logger import log_http_request


class RequestLoggingMiddleware(BaseHTTPMiddleware):
    """Log structured HTTP access events with latency and correlation ID."""

    async def dispatch(self, request: Request, call_next: Callable) -> Response:
        start_time = time.perf_counter()
        request_id = getattr(request.state, "request_id", "req-unknown")

        try:
            response: Response = await call_next(request)
            duration_ms = (time.perf_counter() - start_time) * 1000.0

            # Exclude health probe logs from spamming if desired, or log all
            client_ip = request.client.host if request.client else None
            log_http_request(
                request_id=request_id,
                method=request.method,
                path=request.url.path,
                status_code=response.status_code,
                duration_ms=duration_ms,
                client_ip=client_ip,
            )
            return response
        except Exception as exc:
            duration_ms = (time.perf_counter() - start_time) * 1000.0
            log_http_request(
                request_id=request_id,
                method=request.method,
                path=request.url.path,
                status_code=500,
                duration_ms=duration_ms,
                client_ip=request.client.host if request.client else None,
            )
            raise exc
