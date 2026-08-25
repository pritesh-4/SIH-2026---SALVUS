"""Unified lifecycle state machine for Salvus incidents and responders.

Enforces deterministic, forward-only status transitions for the emergency
pipeline across both incident and responder domains.
"""

from app.models import AssignmentStatus, IncidentStatus, ResponderStatus

# ---------------------------------------------------------------------------
# Incident Transition Rules
# ---------------------------------------------------------------------------

# Maps each incident status to the set of statuses it may transition to.
ALLOWED_INCIDENT_TRANSITIONS: dict[IncidentStatus, set[IncidentStatus]] = {
    IncidentStatus.NEW: {
        IncidentStatus.TRIAGE_PENDING,
        IncidentStatus.CANCELLED,
    },
    IncidentStatus.TRIAGE_PENDING: {
        IncidentStatus.VERIFIED,
        IncidentStatus.CANCELLED,
    },
    IncidentStatus.VERIFIED: {
        IncidentStatus.ASSIGNED,
        IncidentStatus.RESOLVED,
        IncidentStatus.CANCELLED,
    },
    IncidentStatus.ASSIGNED: {
        IncidentStatus.EN_ROUTE,
        IncidentStatus.CANCELLED,
    },
    IncidentStatus.EN_ROUTE: {
        IncidentStatus.NEARBY,
        IncidentStatus.ON_SCENE,
        IncidentStatus.CANCELLED,
    },
    IncidentStatus.NEARBY: {
        IncidentStatus.ON_SCENE,
        IncidentStatus.CANCELLED,
    },
    IncidentStatus.ON_SCENE: {
        IncidentStatus.RESOLVED,
        IncidentStatus.CANCELLED,
    },
    # Terminal states — no further transitions allowed
    IncidentStatus.RESOLVED: set(),
    IncidentStatus.CANCELLED: set(),
}

TERMINAL_INCIDENT_STATUSES: set[IncidentStatus] = {
    IncidentStatus.RESOLVED,
    IncidentStatus.CANCELLED,
}

# Numeric ranks for ordering protection (higher = later in lifecycle)
INCIDENT_STATUS_RANKS: dict[IncidentStatus, int] = {
    IncidentStatus.NEW: 1,
    IncidentStatus.TRIAGE_PENDING: 2,
    IncidentStatus.VERIFIED: 3,
    IncidentStatus.ASSIGNED: 4,
    IncidentStatus.EN_ROUTE: 5,
    IncidentStatus.NEARBY: 6,
    IncidentStatus.ON_SCENE: 7,
    IncidentStatus.RESOLVED: 8,
    IncidentStatus.CANCELLED: 8,
}

# Backward compatibility alias
ALLOWED_TRANSITIONS = ALLOWED_INCIDENT_TRANSITIONS
STATUS_RANKS = INCIDENT_STATUS_RANKS
TERMINAL_STATUSES = TERMINAL_INCIDENT_STATUSES


# ---------------------------------------------------------------------------
# Responder Transition Rules
# ---------------------------------------------------------------------------

ALLOWED_RESPONDER_TRANSITIONS: dict[ResponderStatus, set[ResponderStatus]] = {
    ResponderStatus.AVAILABLE: {
        ResponderStatus.ASSIGNED,
        ResponderStatus.EN_ROUTE,
        ResponderStatus.OFFLINE,
    },
    ResponderStatus.ASSIGNED: {
        ResponderStatus.EN_ROUTE,
        ResponderStatus.NEARBY,
        ResponderStatus.ON_SCENE,
        ResponderStatus.AVAILABLE,
        ResponderStatus.OFFLINE,
    },
    ResponderStatus.EN_ROUTE: {
        ResponderStatus.NEARBY,
        ResponderStatus.ON_SCENE,
        ResponderStatus.AVAILABLE,
        ResponderStatus.OFFLINE,
    },
    ResponderStatus.NEARBY: {
        ResponderStatus.ON_SCENE,
        ResponderStatus.AVAILABLE,
        ResponderStatus.OFFLINE,
    },
    ResponderStatus.ON_SCENE: {
        ResponderStatus.AVAILABLE,
        ResponderStatus.OFFLINE,
    },
    ResponderStatus.OFFLINE: {
        ResponderStatus.AVAILABLE,
    },
}


# ---------------------------------------------------------------------------
# Assignment Transition Rules
# ---------------------------------------------------------------------------

ALLOWED_ASSIGNMENT_TRANSITIONS: dict[AssignmentStatus, set[AssignmentStatus]] = {
    AssignmentStatus.PROPOSED: {
        AssignmentStatus.ASSIGNED,
        AssignmentStatus.CANCELLED,
    },
    AssignmentStatus.ASSIGNED: {
        AssignmentStatus.EN_ROUTE,
        AssignmentStatus.CANCELLED,
    },
    AssignmentStatus.EN_ROUTE: {
        AssignmentStatus.NEARBY,
        AssignmentStatus.ON_SCENE,
        AssignmentStatus.CANCELLED,
    },
    AssignmentStatus.NEARBY: {
        AssignmentStatus.ON_SCENE,
        AssignmentStatus.CANCELLED,
    },
    AssignmentStatus.ON_SCENE: {
        AssignmentStatus.COMPLETED,
        AssignmentStatus.CANCELLED,
    },
    # Terminal states — no further transitions allowed
    AssignmentStatus.COMPLETED: set(),
    AssignmentStatus.CANCELLED: set(),
}

TERMINAL_ASSIGNMENT_STATUSES: set[AssignmentStatus] = {
    AssignmentStatus.COMPLETED,
    AssignmentStatus.CANCELLED,
}

ACTIVE_ASSIGNMENT_STATUSES: set[AssignmentStatus] = {
    AssignmentStatus.PROPOSED,
    AssignmentStatus.ASSIGNED,
    AssignmentStatus.EN_ROUTE,
    AssignmentStatus.NEARBY,
    AssignmentStatus.ON_SCENE,
}

ASSIGNMENT_STATUS_RANKS: dict[AssignmentStatus, int] = {
    AssignmentStatus.PROPOSED: 1,
    AssignmentStatus.ASSIGNED: 2,
    AssignmentStatus.EN_ROUTE: 3,
    AssignmentStatus.NEARBY: 4,
    AssignmentStatus.ON_SCENE: 5,
    AssignmentStatus.COMPLETED: 6,
    AssignmentStatus.CANCELLED: 6,
}


# ---------------------------------------------------------------------------
# Validation Functions
# ---------------------------------------------------------------------------


def validate_transition(current: str, target: str) -> bool:
    """Return True if transitioning incident from *current* to *target* is allowed."""
    try:
        current_status = IncidentStatus(current)
        target_status = IncidentStatus(target)
    except ValueError:
        return False

    return target_status in ALLOWED_INCIDENT_TRANSITIONS.get(current_status, set())


def validate_responder_transition(current: str, target: str) -> bool:
    """Return True if transitioning responder from *current* to *target* is allowed."""
    try:
        current_status = ResponderStatus(current)
        target_status = ResponderStatus(target)
    except ValueError:
        return False

    return target_status in ALLOWED_RESPONDER_TRANSITIONS.get(current_status, set())


def validate_assignment_transition(current: str, target: str) -> bool:
    """Return True if transitioning assignment from *current* to *target* is allowed."""
    try:
        current_status = AssignmentStatus(current)
        target_status = AssignmentStatus(target)
    except ValueError:
        return False

    return target_status in ALLOWED_ASSIGNMENT_TRANSITIONS.get(current_status, set())


def is_terminal(status: str) -> bool:
    """Return True if the incident status is a terminal (end-of-lifecycle) state."""
    try:
        return IncidentStatus(status) in TERMINAL_INCIDENT_STATUSES
    except ValueError:
        return False


def is_assignment_terminal(status: str) -> bool:
    """Return True if the assignment status is a terminal state."""
    try:
        return AssignmentStatus(status) in TERMINAL_ASSIGNMENT_STATUSES
    except ValueError:
        return False


def get_rank(status: str) -> int:
    """Return the numeric rank of a status for ordering protection."""
    try:
        return INCIDENT_STATUS_RANKS[IncidentStatus(status)]
    except (ValueError, KeyError):
        return 0


def get_assignment_rank(status: str) -> int:
    """Return the numeric rank of an assignment status."""
    try:
        return ASSIGNMENT_STATUS_RANKS[AssignmentStatus(status)]
    except (ValueError, KeyError):
        return 0
