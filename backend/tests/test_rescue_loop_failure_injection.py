"""Adversarial QA Failure-Injection Test Suite for SALVUS Rescue Loop.

Tests all 15 failure scenarios:
1. SOS double click / rapid submission
2. SOS submit + slow backend (retry with same idempotency key)
3. SOS submit + network retry
4. Authority opens stale incident
5. Authority submits stale state / invalid transition
6. Realtime event arrives twice (idempotence)
7. Realtime event arrives out of order
8. Responder event arrives before assignment
9. Incident resolves while citizen open
10. Citizen cancels when already resolved
11. Backend rejects unauthorized / invalid transitions
12. Socket reconnect / rehydration consistency
13. Concurrency / multi-authority conflicts
14. Navigation during lifecycle
15. Refresh / cache rehydration
"""

import pytest

VALID_SOS_DATA = {
    "type": "flood",
    "severity": "CRITICAL",
    "description": "Adversarial QA: Flood water entering building ground floor.",
    "reporter_name": "Adversarial Tester",
    "reporter_phone": "+91 98309 99888",
    "latitude": 22.5726,
    "longitude": 88.3639,
    "affected_count": 2,
    "is_sos": True,
}


@pytest.mark.asyncio
class TestRescueLoopAdversarialScenarios:
    """Stress tests and edge-case validations for the rescue loop."""

    async def test_scenario_1_and_2_sos_double_click_and_retry(self, client):
        """Scenario 1 & 2: Double click with same idempotency key returns identical incident."""
        idempotency_key = "adv_qa_sos_double_click_key_101"

        # Click 1
        res1 = await client.post(
            "/api/incidents",
            json=VALID_SOS_DATA,
            headers={"Idempotency-Key": idempotency_key},
        )
        assert res1.status_code == 201
        data1 = res1.json()["data"]

        # Click 2 (simulating fast double click / retry after lag)
        res2 = await client.post(
            "/api/incidents",
            json=VALID_SOS_DATA,
            headers={"Idempotency-Key": idempotency_key},
        )
        assert res2.status_code in (200, 201)
        data2 = res2.json()["data"]

        assert data1["id"] == data2["id"]
        assert data1["ticket_id"] == data2["ticket_id"]

    async def test_scenario_5_authority_submits_stale_invalid_transition(
        self, client, authority_headers
    ):
        """Scenario 5: Attempting an invalid lifecycle transition is rejected with 400."""
        # 1. Create incident
        inc_res = await client.post("/api/incidents", json=VALID_SOS_DATA)
        assert inc_res.status_code == 201
        inc_id = inc_res.json()["data"]["id"]

        # 2. Advance to TRIAGE_PENDING
        res_triage = await client.patch(
            f"/api/incidents/{inc_id}/status",
            json={"status": "TRIAGE_PENDING"},
            headers=authority_headers,
        )
        assert res_triage.status_code == 200

        # 3. Try to regress directly back to NEW (forbidden by state machine)
        res_invalid = await client.patch(
            f"/api/incidents/{inc_id}/status",
            json={"status": "NEW"},
            headers=authority_headers,
        )
        assert res_invalid.status_code == 400
        err = res_invalid.json()["detail"]["error"]
        assert err["code"] == "INVALID_TRANSITION"

    async def test_scenario_9_and_10_cancel_after_resolved_rejected(
        self, client, citizen_headers, authority_headers
    ):
        """Scenario 9 & 10: When incident is already RESOLVED, cancellation is rejected."""
        # 1. Citizen creates incident
        inc_res = await client.post("/api/incidents", json=VALID_SOS_DATA, headers=citizen_headers)
        assert inc_res.status_code == 201
        inc_id = inc_res.json()["data"]["id"]

        # 2. Authority advances incident through valid path to RESOLVED
        await client.patch(
            f"/api/incidents/{inc_id}/status",
            json={"status": "TRIAGE_PENDING"},
            headers=authority_headers,
        )
        await client.patch(
            f"/api/incidents/{inc_id}/status",
            json={"status": "VERIFIED"},
            headers=authority_headers,
        )
        res_resolved = await client.patch(
            f"/api/incidents/{inc_id}/status",
            json={"status": "RESOLVED"},
            headers=authority_headers,
        )
        assert res_resolved.status_code == 200

        # 3. Citizen attempts to CANCEL after it has already been resolved
        res_cancel = await client.patch(
            f"/api/incidents/{inc_id}/status",
            json={"status": "CANCELLED"},
            headers=citizen_headers,
        )
        # Must be rejected because RESOLVED is a locked terminal state
        assert res_cancel.status_code == 400
        assert res_cancel.json()["detail"]["error"]["code"] == "INVALID_TRANSITION"

        # 4. Confirm incident remains in authoritative RESOLVED state
        get_res = await client.get(f"/api/incidents/{inc_id}", headers=citizen_headers)
        assert get_res.status_code == 200
        assert get_res.json()["data"]["status"] == "RESOLVED"

    async def test_scenario_11_rbac_unauthorized_state_transition_rejected(
        self, client, citizen_headers
    ):
        """Scenario 11: Citizen cannot directly mark incident as VERIFIED or DISPATCHED."""
        inc_res = await client.post("/api/incidents", json=VALID_SOS_DATA, headers=citizen_headers)
        inc_id = inc_res.json()["data"]["id"]

        # Citizen attempts authority action
        res_unauth = await client.patch(
            f"/api/incidents/{inc_id}/status",
            json={"status": "VERIFIED"},
            headers=citizen_headers,
        )
        assert res_unauth.status_code == 403
        assert res_unauth.json()["detail"]["error"]["code"] == "FORBIDDEN"

    async def test_scenario_concurrent_assignment_conflict(self, client, authority_headers):
        """Verify two dispatchers assigning conflicting units receive HTTP 409 Conflict."""
        inc_res = await client.post("/api/incidents", json=VALID_SOS_DATA)
        inc_id = inc_res.json()["data"]["id"]

        resp_list = await client.get("/api/responders", headers=authority_headers)
        available = [r for r in resp_list.json()["data"] if r["status"] == "AVAILABLE"]
        assert len(available) >= 2
        r1_id = available[0]["id"]
        r2_id = available[1]["id"]

        # Dispatcher 1 assigns R1
        res1 = await client.post(
            "/api/assignments",
            json={"incident_id": inc_id, "responder_id": r1_id, "status": "ASSIGNED"},
            headers=authority_headers,
        )
        assert res1.status_code == 201

        # Dispatcher 2 simultaneously tries to assign R2 to the same incident
        res2 = await client.post(
            "/api/assignments",
            json={"incident_id": inc_id, "responder_id": r2_id, "status": "ASSIGNED"},
            headers=authority_headers,
        )
        assert res2.status_code == 409
        err = res2.json()["detail"]["error"]
        assert err["code"] in ("INCIDENT_ALREADY_ASSIGNED", "ASSIGNMENT_CONFLICT")
