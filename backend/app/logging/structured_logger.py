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


def sanitize_telemetry_dict(data: dict[str, Any] | None) -> dict[str, Any]:
    """Sanitize dictionary to prevent secret, token, password, or PII leakage in structured logs."""
    if not data:
        return {}
    sensitive_keys = {
        "key",
        "secret",
        "auth",
        "token",
        "password",
        "phone",
        "email",
        "ssn",
        "aadhaar",
    }
    safe = {}
    for k, v in data.items():
        if any(secret in str(k).lower() for secret in sensitive_keys):
            safe[k] = "[REDACTED]"
        elif isinstance(v, dict):
            safe[k] = sanitize_telemetry_dict(v)
        else:
            safe[k] = v
    return safe


def log_incident_event(
    incident_id: str,
    action: str,
    actor: str | None = None,
    details: dict[str, Any] | None = None,
    request_id: str | None = None,
    status: str | None = None,
) -> None:
    """Emit structured audit log for incident lifecycle state transitions."""
    entry: dict[str, Any] = {
        "type": "incident_lifecycle",
        "timestamp": datetime.now(UTC).isoformat(),
        "incident_id": incident_id,
        "action": action,
    }
    if actor:
        entry["actor"] = actor
    if status:
        entry["status"] = status
    if request_id:
        entry["request_id"] = request_id
    if details:
        entry["details"] = sanitize_telemetry_dict(details)

    logger.info(f"INCIDENT_LIFECYCLE: {json.dumps(entry)}")


def log_assignment_event(
    assignment_id: str | None,
    incident_id: str,
    responder_id: str,
    action: str,
    actor: str | None = None,
    success: bool = True,
    error_type: str | None = None,
    request_id: str | None = None,
    details: dict[str, Any] | None = None,
) -> None:
    """Emit structured audit log for responder dispatch and reassignment events."""
    entry: dict[str, Any] = {
        "type": "assignment_event",
        "timestamp": datetime.now(UTC).isoformat(),
        "incident_id": incident_id,
        "responder_id": responder_id,
        "action": action,
        "success": success,
    }
    if assignment_id:
        entry["assignment_id"] = assignment_id
    if actor:
        entry["actor"] = actor
    if error_type:
        entry["error_type"] = error_type
    if request_id:
        entry["request_id"] = request_id
    if details:
        entry["details"] = sanitize_telemetry_dict(details)

    level = logging.INFO if success else logging.WARNING
    logger.log(level, f"ASSIGNMENT_EVENT: {json.dumps(entry)}")


def log_resilience_event(
    component: str,
    event_type: str,
    status: str,
    details: dict[str, Any] | None = None,
    request_id: str | None = None,
) -> None:
    """Emit structured resilience/failover event for system observability."""
    entry: dict[str, Any] = {
        "type": "resilience_event",
        "timestamp": datetime.now(UTC).isoformat(),
        "component": component,
        "event_type": event_type,
        "status": status,
    }
    if request_id:
        entry["request_id"] = request_id
    if details:
        entry["details"] = sanitize_telemetry_dict(details)

    level = logging.INFO if status in ("HEALTHY", "RECOVERED") else logging.WARNING
    logger.log(level, f"RESILIENCE_EVENT: {json.dumps(entry)}")


def log_attachment_telemetry(
    incident_id: str,
    action: str,
    provider: str,
    duration_ms: float,
    success: bool,
    attachment_id: str | None = None,
    size_bytes: int | None = None,
    mime_type: str | None = None,
    client_ip: str | None = None,
    actor: str | None = None,
    error_type: str | None = None,
) -> None:
    """Emit structured audit telemetry for incident evidence storage operations."""
    entry: dict[str, Any] = {
        "type": "attachment_telemetry",
        "timestamp": datetime.now(UTC).isoformat(),
        "incident_id": incident_id,
        "action": action,
        "provider": provider,
        "duration_ms": round(duration_ms, 2),
        "success": success,
    }
    if attachment_id:
        entry["attachment_id"] = attachment_id
    if size_bytes is not None:
        entry["size_bytes"] = size_bytes
    if mime_type:
        entry["mime_type"] = mime_type
    if client_ip:
        entry["client_ip"] = client_ip
    if actor:
        entry["actor"] = actor
    if error_type:
        entry["error_type"] = error_type

    level = logging.INFO if success else logging.WARNING
    logger.log(level, f"ATTACHMENT_AUDIT: {json.dumps(entry)}")
