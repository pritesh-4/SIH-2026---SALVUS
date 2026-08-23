"""Incident lifecycle state machine.

Enforces deterministic, forward-only status transitions for the incident
pipeline. Phase 1 statuses only — responder states (ASSIGNED, EN_ROUTE,
ON_SCENE) will be added in a later phase.
"""

from app.models import IncidentStatus

# ---------------------------------------------------------------------------
# Transition rules
# ---------------------------------------------------------------------------

# Maps each status to the set of statuses it may transition to.
ALLOWED_TRANSITIONS: dict[IncidentStatus, set[IncidentStatus]] = {
    IncidentStatus.NEW: {IncidentStatus.TRIAGE_PENDING, IncidentStatus.CANCELLED},
    IncidentStatus.TRIAGE_PENDING: {IncidentStatus.VERIFIED, IncidentStatus.CANCELLED},
    IncidentStatus.VERIFIED: {IncidentStatus.RESOLVED, IncidentStatus.CANCELLED},
    # Terminal states — no further transitions allowed
    IncidentStatus.RESOLVED: set(),
    IncidentStatus.CANCELLED: set(),
}

TERMINAL_STATUSES: set[IncidentStatus] = {IncidentStatus.RESOLVED, IncidentStatus.CANCELLED}

# Numeric ranks for ordering protection (higher = later in lifecycle)
STATUS_RANKS: dict[IncidentStatus, int] = {
    IncidentStatus.NEW: 1,
    IncidentStatus.TRIAGE_PENDING: 2,
    IncidentStatus.VERIFIED: 3,
    IncidentStatus.RESOLVED: 4,
    IncidentStatus.CANCELLED: 4,
}


def validate_transition(current: str, target: str) -> bool:
    """Return True if transitioning from *current* to *target* is allowed."""
    try:
        current_status = IncidentStatus(current)
        target_status = IncidentStatus(target)
    except ValueError:
        return False

    return target_status in ALLOWED_TRANSITIONS.get(current_status, set())


def is_terminal(status: str) -> bool:
    """Return True if the status is a terminal (end-of-lifecycle) state."""
    try:
        return IncidentStatus(status) in TERMINAL_STATUSES
    except ValueError:
        return False


def get_rank(status: str) -> int:
    """Return the numeric rank of a status for ordering protection."""
    try:
        return STATUS_RANKS[IncidentStatus(status)]
    except (ValueError, KeyError):
        return 0
