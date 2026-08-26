"""Structured logging and telemetry emitter for HTTP requests and AI decision support."""

from __future__ import annotations

import json
import logging
import sys
from datetime import UTC, datetime
from typing import Any

# Configure root salvus logger
logger = logging.getLogger("salvus")
if not logger.handlers:
    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(logging.Formatter("[%(asctime)s] [%(levelname)s] %(message)s"))
    logger.addHandler(handler)
    logger.setLevel(logging.INFO)


def get_logger(name: str = "salvus") -> logging.Logger:
    """Return a named logger under the salvus namespace."""
    return logging.getLogger(f"salvus.{name}" if name != "salvus" else "salvus")


def log_http_request(
    request_id: str,
    method: str,
    path: str,
    status_code: int,
    duration_ms: float,
    client_ip: str | None = None,
) -> None:
    """Emit structured log for HTTP request lifecycle."""
    entry = {
        "type": "http_request",
        "timestamp": datetime.now(UTC).isoformat(),
        "request_id": request_id,
        "method": method,
        "path": path,
        "status_code": status_code,
        "duration_ms": round(duration_ms, 2),
    }
    if client_ip:
        entry["client_ip"] = client_ip

    logger.info(f"HTTP_ACCESS: {json.dumps(entry)}")


def log_ai_telemetry(
    incident_id: str,
    provider: str,
    model: str,
    latency_ms: float,
    success: bool,
    fallback: bool = False,
    confidence: float | None = None,
    task_id: str | None = None,
    request_id: str | None = None,
    error_type: str | None = None,
    extra: dict[str, Any] | None = None,
) -> None:
    """Emit structured telemetry for AI triage execution without exposing secrets/PII."""
    entry: dict[str, Any] = {
        "type": "ai_telemetry",
        "timestamp": datetime.now(UTC).isoformat(),
        "incident_id": incident_id,
        "provider": provider,
        "model": model,
        "latency_ms": round(latency_ms, 2),
        "success": success,
        "fallback": fallback,
    }
    if confidence is not None:
        entry["confidence"] = round(confidence, 2)
    if task_id:
        entry["task_id"] = task_id
    if request_id:
        entry["request_id"] = request_id
    if error_type:
        entry["error_type"] = error_type
    if extra:
        # Sanitize extra fields to prevent secret/PII leaking
        safe_extra = {
            k: v
            for k, v in extra.items()
            if not any(
                secret in k.lower()
                for secret in ["key", "secret", "auth", "token", "phone", "email"]
            )
        }
        entry["extra"] = safe_extra

    level = logging.INFO if success else logging.WARNING
    logger.log(level, f"AI_TELEMETRY: {json.dumps(entry)}")
