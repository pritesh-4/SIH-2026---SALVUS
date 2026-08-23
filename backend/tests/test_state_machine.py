"""Tests for the incident lifecycle state machine."""

import pytest

from app.services.state_machine import (
    get_rank,
    is_terminal,
    validate_transition,
)

# -----------------------------------------------------------------------
# Valid forward transitions
# -----------------------------------------------------------------------


class TestValidTransitions:
    """Verify all happy-path forward transitions."""

    def test_new_to_triage_pending(self):
        assert validate_transition("NEW", "TRIAGE_PENDING") is True

    def test_triage_pending_to_verified(self):
        assert validate_transition("TRIAGE_PENDING", "VERIFIED") is True

    def test_verified_to_resolved(self):
        assert validate_transition("VERIFIED", "RESOLVED") is True


# -----------------------------------------------------------------------
# Cancellation from any active state
# -----------------------------------------------------------------------


class TestCancellation:
    """Any non-terminal state can be cancelled."""

    @pytest.mark.parametrize("status", ["NEW", "TRIAGE_PENDING", "VERIFIED"])
    def test_cancel_from_active_state(self, status):
        assert validate_transition(status, "CANCELLED") is True

    def test_cannot_cancel_resolved(self):
        assert validate_transition("RESOLVED", "CANCELLED") is False

    def test_cannot_cancel_already_cancelled(self):
        assert validate_transition("CANCELLED", "CANCELLED") is False


# -----------------------------------------------------------------------
# Invalid transitions
# -----------------------------------------------------------------------


class TestInvalidTransitions:
    """Backward and skip transitions must be rejected."""

    def test_cannot_go_backwards(self):
        assert validate_transition("VERIFIED", "TRIAGE_PENDING") is False

    def test_cannot_skip_triage(self):
        assert validate_transition("NEW", "VERIFIED") is False

    def test_cannot_transition_from_resolved(self):
        assert validate_transition("RESOLVED", "NEW") is False
        assert validate_transition("RESOLVED", "TRIAGE_PENDING") is False

    def test_cannot_transition_from_cancelled(self):
        assert validate_transition("CANCELLED", "NEW") is False

    def test_invalid_status_string(self):
        assert validate_transition("INVALID", "NEW") is False
        assert validate_transition("NEW", "INVALID") is False


# -----------------------------------------------------------------------
# Terminal state detection
# -----------------------------------------------------------------------


class TestTerminalStates:
    """Terminal states should be correctly identified."""

    def test_resolved_is_terminal(self):
        assert is_terminal("RESOLVED") is True

    def test_cancelled_is_terminal(self):
        assert is_terminal("CANCELLED") is True

    @pytest.mark.parametrize("status", ["NEW", "TRIAGE_PENDING", "VERIFIED"])
    def test_active_states_are_not_terminal(self, status):
        assert is_terminal(status) is False

    def test_invalid_status_not_terminal(self):
        assert is_terminal("FAKE") is False


# -----------------------------------------------------------------------
# Status ranking
# -----------------------------------------------------------------------


class TestStatusRanking:
    """Ranks must increase monotonically through the lifecycle."""

    def test_rank_ordering(self):
        assert get_rank("NEW") < get_rank("TRIAGE_PENDING")
        assert get_rank("TRIAGE_PENDING") < get_rank("VERIFIED")
        assert get_rank("VERIFIED") < get_rank("RESOLVED")

    def test_cancelled_same_rank_as_resolved(self):
        assert get_rank("CANCELLED") == get_rank("RESOLVED")

    def test_invalid_status_rank_zero(self):
        assert get_rank("NONSENSE") == 0
