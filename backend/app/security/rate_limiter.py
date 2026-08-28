"""Rate limiting and abuse prevention middleware/dependencies for Salvus."""

from __future__ import annotations

import os
import time
from collections import defaultdict
from typing import ClassVar

from fastapi import HTTPException, Request, status

# Default rate limits for file attachments: 10 uploads per 60 seconds
DEFAULT_UPLOAD_RATE_LIMIT = 10
DEFAULT_UPLOAD_RATE_WINDOW_SECONDS = 60


class AttachmentRateLimiter:
    """In-memory sliding window rate limiter for attachment upload endpoints."""

    _instance: ClassVar[AttachmentRateLimiter | None] = None

    def __init__(
        self,
        max_requests: int | None = None,
        window_seconds: int | None = None,
    ):
        self.max_requests = (
            max_requests
            if max_requests is not None
            else int(os.getenv("ATTACHMENT_RATE_LIMIT_MAX", str(DEFAULT_UPLOAD_RATE_LIMIT)))
        )
        self.window_seconds = (
            window_seconds
            if window_seconds is not None
            else int(
                os.getenv(
                    "ATTACHMENT_RATE_LIMIT_WINDOW_SECONDS",
                    str(DEFAULT_UPLOAD_RATE_WINDOW_SECONDS),
                )
            )
        )
        # Map client key -> list of Unix timestamps
        self._history: dict[str, list[float]] = defaultdict(list)
        self._last_cleanup: float = time.time()

    @classmethod
    def get_instance(cls) -> AttachmentRateLimiter:
        """Singleton accessor for attachment rate limiter."""
        if cls._instance is None:
            cls._instance = AttachmentRateLimiter()
        return cls._instance

    def _cleanup(self, now: float) -> None:
        """Evict stale timestamp entries older than window_seconds."""
        if now - self._last_cleanup < 30.0:
            return
        cutoff = now - self.window_seconds
        stale_keys = []
        for key, timestamps in self._history.items():
            valid_stamps = [t for t in timestamps if t > cutoff]
            if valid_stamps:
                self._history[key] = valid_stamps
            else:
                stale_keys.append(key)
        for key in stale_keys:
            self._history.pop(key, None)
        self._last_cleanup = now

    def check_rate_limit(self, identifier: str) -> None:
        """Check if client identifier exceeds the request limit in the current sliding window.

        Raises HTTPException(429) if limit is exceeded.
        """
        now = time.time()
        self._cleanup(now)

        cutoff = now - self.window_seconds
        timestamps = [t for t in self._history[identifier] if t > cutoff]
        self._history[identifier] = timestamps

        if len(timestamps) >= self.max_requests:
            retry_after = int(self.window_seconds - (now - timestamps[0])) + 1
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail={
                    "success": False,
                    "error": {
                        "code": "RATE_LIMIT_EXCEEDED",
                        "message": (
                            f"Upload rate limit exceeded ({self.max_requests} uploads per "
                            f"{self.window_seconds}s). Please try again in {retry_after} seconds."
                        ),
                    },
                },
                headers={"Retry-After": str(retry_after)},
            )

        self._history[identifier].append(now)


def get_client_identifier(request: Request, user_id: str | None = None) -> str:
    """Derive client rate-limiting identifier from authenticated user ID or remote IP."""
    if user_id:
        return f"user:{user_id}"

    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        client_ip = forwarded.split(",")[0].strip()
    else:
        client_ip = request.client.host if request.client else "127.0.0.1"
    return f"ip:{client_ip}"
