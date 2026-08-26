"""Comprehensive security, identity, and trust boundary hardening tests.

Validates:
1. Cryptographic token generation & verification (JWT, expiration, roles).
2. Unauthenticated mutation rejection (401 Unauthorized on all protected endpoints).
3. Invalid / forged / expired token rejection.
4. Role-based access control (403 Forbidden on citizen privilege escalation).
5. Actor spoofing prevention (actor is strictly token-derived, client payload actor is ignored).
6. Citizen data isolation (unredacted own incident, 403 on cross-incident viewing).
7. Citizen lifecycle guard (citizens can ONLY cancel own incidents).
8. Responder fleet telemetry isolation (responders can only update own unit).
9. Socket.IO room protection (authorities room & incident room authorization).
"""

from __future__ import annotations

import datetime
from unittest.mock import AsyncMock, patch

import jwt
import pytest

from app.auth.jwt_handler import (
    ALGORITHM,
    AuthenticatedUser,
    UserRole,
    create_access_token,
    verify_access_token,
)
from app.realtime.socket_manager import join_room, sio


@pytest.fixture
def anyio_backend():
    return "asyncio"


# ==============================================================================
# 1. Cryptographic Token Verification Unit Tests
# ==============================================================================


def test_jwt_token_generation_and_decoding():
    """Verify JWT token contains correct cryptographic claims and roundtrips accurately."""
    token = create_access_token(
        user_id="usr-authority-99",
        role=UserRole.AUTHORITY,
        name="Dispatcher Sharma",
        expires_delta=datetime.timedelta(minutes=30),
    )
    assert isinstance(token, str)

    user = verify_access_token(token)
    assert user.user_id == "usr-authority-99"
    assert user.role == UserRole.AUTHORITY
    assert user.name == "Dispatcher Sharma"
    assert user.is_authority is True
    assert user.is_citizen is False


def test_jwt_token_expired_rejection():
    """Verify expired JWT tokens are rejected with token expiration exception."""
    expired_token = create_access_token(
        user_id="usr-expired-01",
        role=UserRole.CITIZEN,
        name="Expired Citizen",
        expires_delta=datetime.timedelta(seconds=-10),
    )
    with pytest.raises(Exception) as exc_info:
        verify_access_token(expired_token)
    assert "expired" in str(exc_info.value).lower()


def test_jwt_forged_signature_rejection():
    """Verify tokens signed with a different secret key fail verification."""
    forged_payload = {
        "sub": "attacker-01",
        "role": "AUTHORITY",
        "name": "Fake Dispatcher",
        "exp": datetime.datetime.now(datetime.UTC) + datetime.timedelta(hours=1),
    }
    forged_token = jwt.encode(
        forged_payload, "completely-wrong-secret-key-32chars-long", algorithm=ALGORITHM
    )

    with pytest.raises(Exception) as exc_info:
        verify_access_token(forged_token)
    assert "signature" in str(exc_info.value).lower() or "invalid" in str(exc_info.value).lower()


# ==============================================================================
# 2. Authentication & Profile Endpoints
# ==============================================================================


@pytest.mark.asyncio
async def test_auth_token_issuance_and_me_endpoint(anon_client):
    """Verify /api/auth/token generates valid tokens and /api/auth/me verifies profile."""
    # 1. Anonymous GET /api/auth/me -> 401
    me_anon = await anon_client.get("/api/auth/me")
    assert me_anon.status_code == 401
    assert me_anon.json()["detail"]["error"]["code"] == "UNAUTHORIZED"

    # 2. Request an authority token
    token_res = await anon_client.post(
        "/api/auth/token",
        json={"role": "AUTHORITY", "name": "Chief Dispatcher"},
    )
    assert token_res.status_code == 200
    token_data = token_res.json()
    assert "access_token" in token_data
    assert token_data["role"] == "AUTHORITY"

    # 3. Authenticated GET /api/auth/me
    auth_headers = {"Authorization": f"Bearer {token_data['access_token']}"}
    me_auth = await anon_client.get("/api/auth/me", headers=auth_headers)
    assert me_auth.status_code == 200
    profile = me_auth.json()
    assert profile["success"] is True
    assert profile["user"]["role"] == "AUTHORITY"
    assert profile["user"]["name"] == "Chief Dispatcher"
    assert "incidents:read_all" in profile["permissions"]
    assert "assignments:create" in profile["permissions"]


# ==============================================================================
# 3. Unauthenticated Mutation Rejection (401 Unauthorized)
# ==============================================================================


@pytest.mark.asyncio
async def test_unauthenticated_mutations_strictly_blocked(anon_client):
    """Verify that unauthenticated mutation requests receive 401 Unauthorized."""
    # 1. Assignment creation
    assign_res = await anon_client.post(
        "/api/assignments",
        json={"incident_id": "inc-2048", "responder_id": "resp-101"},
    )
    assert assign_res.status_code == 401

    # 2. Responder status patch
    resp_status = await anon_client.patch(
        "/api/responders/resp-101/status",
        json={"status": "ASSIGNED"},
    )
    assert resp_status.status_code == 401

    # 3. Responder direct assign
    resp_assign = await anon_client.post(
        "/api/responders/resp-101/assign",
        json={"incident_id": "inc-2048"},
    )
    assert resp_assign.status_code == 401

    # 4. Responder lifecycle progression
    resp_life = await anon_client.post(
        "/api/responders/resp-101/lifecycle",
        json={"target_status": "EN_ROUTE"},
    )
    assert resp_life.status_code == 401

    # 5. Responder location telemetry
    resp_loc = await anon_client.post(
        "/api/responders/resp-101/location",
        json={"latitude": 22.57, "longitude": 88.36},
    )
    assert resp_loc.status_code == 401

    # 6. Shelter update
    shl_res = await anon_client.patch(
        "/api/shelters/shl-01",
        json={"available_beds": 50},
    )
    assert shl_res.status_code == 401

    # 7. Simulation step
    sim_res = await anon_client.post(
        "/api/simulation/step",
        json={"responder_id": "resp-101", "latitude": 22.57, "longitude": 88.36},
    )
    assert sim_res.status_code == 401

    # 8. AI Triage verification
    triage_res = await anon_client.post(
        "/api/triage/verify/inc-2048",
        json={"reviewer_notes": "Attempt without auth"},
    )
    assert triage_res.status_code == 401


# ==============================================================================
# 4. Role Authorization & Citizen Privilege Escalation (403 Forbidden)
# ==============================================================================


@pytest.mark.asyncio
async def test_citizen_role_forbidden_from_authority_actions(anon_client):
    """Verify citizen tokens are forbidden (403) from authority mutations."""
    citizen_token = create_access_token(
        user_id="citizen-attacker",
        role=UserRole.CITIZEN,
        name="Malicious Citizen",
    )
    headers = {"Authorization": f"Bearer {citizen_token}"}

    # 1. Assignment creation
    res1 = await anon_client.post(
        "/api/assignments",
        json={"incident_id": "inc-2048", "responder_id": "resp-101"},
        headers=headers,
    )
    assert res1.status_code == 403

    # 2. Responder assignment
    res2 = await anon_client.post(
        "/api/responders/resp-101/assign",
        json={"incident_id": "inc-2048"},
        headers=headers,
    )
    assert res2.status_code == 403

    # 3. AI Triage verification
    res3 = await anon_client.post(
        "/api/triage/verify/inc-2048",
        json={"reviewer_notes": "Malicious override"},
        headers=headers,
    )
    assert res3.status_code == 403

    # 4. Shelter occupancy mutation
    res4 = await anon_client.patch(
        "/api/shelters/shl-01",
        json={"available_beds": 0},
        headers=headers,
    )
    assert res4.status_code == 403

    # 5. Simulation step
    res5 = await anon_client.post(
        "/api/simulation/step",
        json={"responder_id": "resp-101", "latitude": 22.57, "longitude": 88.36},
        headers=headers,
    )
    assert res5.status_code == 403


# ==============================================================================
# 5. Actor Spoofing Prevention
# ==============================================================================


@pytest.mark.asyncio
async def test_actor_spoofing_prevented(anon_client):
    """Verify that client-supplied actor strings in request bodies are ignored
    in favor of cryptographically verified identity from JWT token.
    """
    token = create_access_token(
        user_id="auth-operator-77",
        role=UserRole.AUTHORITY,
        name="Verified Officer Banerjee",
    )
    headers = {"Authorization": f"Bearer {token}"}

    # Create an incident
    create_res = await anon_client.post(
        "/api/incidents",
        json={
            "type": "flood",
            "description": "Rising waters in Sector 2",
            "reporter_name": "Citizen R. Sen",
            "latitude": 22.5726,
            "longitude": 88.3639,
        },
    )
    assert create_res.status_code == 201
    inc_id = create_res.json()["data"]["id"]

    # Transition status while attempting to spoof actor as 'Fake Dispatcher'
    patch_res = await anon_client.patch(
        f"/api/incidents/{inc_id}/status",
        json={"status": "TRIAGE_PENDING", "actor": "Spoofed Imposter Dispatcher"},
        headers=headers,
    )
    assert patch_res.status_code == 200

    # Verify that the generated event contains the verified token actor name
    events = patch_res.json()["data"]["events"]
    latest_event = events[-1]
    assert latest_event["actor"] == "Verified Officer Banerjee"
    assert "Spoofed" not in latest_event["actor"]


# ==============================================================================
# 6. Citizen Data Isolation & Scoped Access
# ==============================================================================


@pytest.mark.asyncio
async def test_citizen_data_isolation_and_ownership(anon_client):
    """Verify citizen privacy: unredacted view of own incident, 403 on cross-incident viewing,
    redacted public view, and cancellation ownership.
    """
    # 1. Citizen creates an incident
    create_res = await anon_client.post(
        "/api/incidents",
        json={
            "type": "medical",
            "severity": "HIGH",
            "description": "Urgent oxygen cylinder required for patient",
            "reporter_name": "Private Citizen Aditi",
            "reporter_phone": "+91-98765-43210",
            "latitude": 22.5726,
            "longitude": 88.3639,
        },
    )
    assert create_res.status_code == 201
    incident_data = create_res.json()["data"]
    inc_id = incident_data["id"]
    citizen_token = incident_data["access_token"]
    assert citizen_token is not None

    owner_headers = {"Authorization": f"Bearer {citizen_token}"}

    # 2. Owner fetches incident: full unredacted details
    owner_get = await anon_client.get(f"/api/incidents/{inc_id}", headers=owner_headers)
    assert owner_get.status_code == 200
    assert owner_get.json()["data"]["reporter_name"] == "Private Citizen Aditi"
    assert owner_get.json()["data"]["reporter_phone"] == "+91-98765-43210"

    # 3. Unauthenticated/Anonymous fetches incident: PII redacted
    anon_get = await anon_client.get(f"/api/incidents/{inc_id}")
    assert anon_get.status_code == 200
    assert anon_get.json()["data"]["reporter_name"] == "Private C."
    assert anon_get.json()["data"]["reporter_phone"] is None

    # 4. Another citizen attempts to fetch incident: 403 Forbidden
    other_citizen_token = create_access_token(
        user_id="other-citizen-99",
        role=UserRole.CITIZEN,
        name="Other Citizen",
        scoped_incident_id="some-different-incident-id",
    )
    other_headers = {"Authorization": f"Bearer {other_citizen_token}"}
    other_get = await anon_client.get(f"/api/incidents/{inc_id}", headers=other_headers)
    assert other_get.status_code == 403

    # 5. Other citizen attempts to cancel incident: 403 Forbidden
    other_cancel = await anon_client.patch(
        f"/api/incidents/{inc_id}/status",
        json={"status": "CANCELLED"},
        headers=other_headers,
    )
    assert other_cancel.status_code == 403

    # 6. Owner citizen cancels own incident: 200 OK
    owner_cancel = await anon_client.patch(
        f"/api/incidents/{inc_id}/status",
        json={"status": "CANCELLED"},
        headers=owner_headers,
    )
    assert owner_cancel.status_code == 200
    assert owner_cancel.json()["data"]["status"] == "CANCELLED"

    # 7. Owner citizen attempts to transition own incident to VERIFIED: 403 Forbidden
    owner_verify = await anon_client.patch(
        f"/api/incidents/{inc_id}/status",
        json={"status": "VERIFIED"},
        headers=owner_headers,
    )
    assert owner_verify.status_code == 403


# ==============================================================================
# 7. Responder Unit Telemetry Isolation
# ==============================================================================


@pytest.mark.asyncio
async def test_responder_telemetry_isolation(anon_client):
    """Verify responders can only publish telemetry for their own unit."""
    token_resp_101 = create_access_token(
        user_id="responder-driver-01",
        role=UserRole.RESPONDER,
        name="NDRF Unit 4 Driver",
        scoped_responder_id="resp-101",
    )
    headers = {"Authorization": f"Bearer {token_resp_101}"}

    # 1. Update own unit: 200 OK
    res_own = await anon_client.post(
        "/api/responders/resp-101/location",
        json={"latitude": 22.5800, "longitude": 88.3700},
        headers=headers,
    )
    assert res_own.status_code == 200
    assert res_own.json()["data"]["latitude"] == 22.5800

    # 2. Attempt to update different unit (resp-102): 403 Forbidden
    res_other = await anon_client.post(
        "/api/responders/resp-102/location",
        json={"latitude": 22.5800, "longitude": 88.3700},
        headers=headers,
    )
    assert res_other.status_code == 403


# ==============================================================================
# 8. Socket.IO Room Authorization Guard
# ==============================================================================


@pytest.mark.asyncio
async def test_socketio_authorities_room_protection():
    """Verify Socket.IO protects 'authorities' room against unauthenticated and citizen clients."""
    # 1. Unauthenticated client session
    with (
        patch.object(sio, "get_session", new_callable=AsyncMock) as mock_get_session,
        patch.object(sio, "enter_room", new_callable=AsyncMock) as mock_enter_room,
        patch.object(sio, "emit", new_callable=AsyncMock) as mock_emit,
    ):
        mock_get_session.return_value = {"user": None}
        await join_room("sid-anon-01", {"room": "authorities"})

        # Must NOT enter room
        assert not mock_enter_room.called
        # Must emit error event
        assert mock_emit.called
        assert mock_emit.call_args[0][0] == "error"
        assert mock_emit.call_args[0][1]["code"] == "FORBIDDEN"

    # 2. Citizen client session
    with (
        patch.object(sio, "get_session", new_callable=AsyncMock) as mock_get_session,
        patch.object(sio, "enter_room", new_callable=AsyncMock) as mock_enter_room,
        patch.object(sio, "emit", new_callable=AsyncMock) as mock_emit,
    ):
        citizen = AuthenticatedUser(user_id="cit-01", role=UserRole.CITIZEN, name="Citizen A")
        mock_get_session.return_value = {"user": citizen.model_dump()}
        await join_room("sid-citizen-01", {"room": "authorities"})

        # Must NOT enter room
        assert not mock_enter_room.called
        assert mock_emit.called
        assert mock_emit.call_args[0][1]["code"] == "FORBIDDEN"

    # 3. Authority client session
    with (
        patch.object(sio, "get_session", new_callable=AsyncMock) as mock_get_session,
        patch.object(sio, "enter_room", new_callable=AsyncMock) as mock_enter_room,
        patch.object(sio, "emit", new_callable=AsyncMock) as mock_emit,
    ):
        authority = AuthenticatedUser(
            user_id="auth-01", role=UserRole.AUTHORITY, name="Dispatcher Officer"
        )
        mock_get_session.return_value = {"user": authority.model_dump()}
        await join_room("sid-auth-01", {"room": "authorities"})

        # Must enter room
        assert mock_enter_room.called
        assert mock_enter_room.call_args[0][1] == "authorities"
        assert mock_emit.called
        assert mock_emit.call_args[0][0] == "room_joined"


@pytest.mark.asyncio
async def test_socketio_cross_incident_room_protection():
    """Verify Socket.IO blocks citizens from subscribing to other incident rooms."""
    with (
        patch.object(sio, "get_session", new_callable=AsyncMock) as mock_get_session,
        patch.object(sio, "enter_room", new_callable=AsyncMock) as mock_enter_room,
        patch.object(sio, "emit", new_callable=AsyncMock) as mock_emit,
    ):
        citizen = AuthenticatedUser(
            user_id="cit-10",
            role=UserRole.CITIZEN,
            name="Citizen 10",
            scoped_incident_id="incident-own-123",
        )
        mock_get_session.return_value = {"user": citizen.model_dump()}

        # Attempt to join another incident room
        await join_room("sid-cit-10", {"room": "incident:incident-other-999"})

        # Must NOT enter room
        assert not mock_enter_room.called
        assert mock_emit.called
        assert mock_emit.call_args[0][0] == "error"
        assert mock_emit.call_args[0][1]["code"] == "FORBIDDEN"
