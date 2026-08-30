"""Integration tests for emergency hydration, SOS idempotency, and dispatch concurrency."""

import pytest

VALID_SOS = {
    "type": "flood",
    "severity": "CRITICAL",
    "description": "Flood water rising fast. Stranded on roof.",
    "reporter_name": "Priya Sharma",
    "reporter_phone": "+91 98301 11222",
    "latitude": 22.5726,
    "longitude": 88.3639,
    "affected_count": 4,
    "is_sos": True,
}


# ---------------------------------------------------------------------------
# Part B Tests: SOS Idempotency & Duplicate Request Protection
# ---------------------------------------------------------------------------


class TestSosIdempotency:
    """Verify client request ID and backend idempotency contracts."""

    @pytest.mark.asyncio
    async def test_same_idempotency_key_returns_identical_incident(self, client):
        """Repeated submission with the same idempotency key returns the exact same incident."""
        idempotency_key = "sos_test_unique_key_001"

        # 1. First submission
        resp1 = await client.post(
            "/api/incidents",
            json=VALID_SOS,
            headers={"Idempotency-Key": idempotency_key},
        )
        assert resp1.status_code == 201
        data1 = resp1.json()["data"]
        inc_id_1 = data1["id"]
        ticket_1 = data1["ticket_id"]

        # 2. Second submission with identical idempotency key (simulating retry / timeout recovery)
        resp2 = await client.post(
            "/api/incidents",
            json=VALID_SOS,
            headers={"Idempotency-Key": idempotency_key},
        )
        assert resp2.status_code == 201 or resp2.status_code == 200
        data2 = resp2.json()["data"]
        inc_id_2 = data2["id"]
        ticket_2 = data2["ticket_id"]

        # Must return the identical incident record, not create a duplicate
        assert inc_id_1 == inc_id_2
        assert ticket_1 == ticket_2

        # Verify DB contains only one incident
        list_resp = await client.get("/api/incidents")
        matching = [i for i in list_resp.json()["data"] if i["id"] == inc_id_1]
        assert len(matching) == 1

    @pytest.mark.asyncio
    async def test_idempotency_key_in_json_body(self, client):
        """Idempotency key supplied inside the JSON payload is honored."""
        payload = {**VALID_SOS, "idempotency_key": "sos_body_key_002"}

        resp1 = await client.post("/api/incidents", json=payload)
        assert resp1.status_code == 201
        id1 = resp1.json()["data"]["id"]

        resp2 = await client.post("/api/incidents", json=payload)
        assert resp2.status_code == 201 or resp2.status_code == 200
        id2 = resp2.json()["data"]["id"]

        assert id1 == id2

    @pytest.mark.asyncio
    async def test_active_citizen_sos_deduplication(self, client, citizen_headers):
        """A citizen with an ongoing active SOS cannot spawn multiple active emergency incidents."""
        # 1. First SOS by citizen
        resp1 = await client.post("/api/incidents", json=VALID_SOS, headers=citizen_headers)
        assert resp1.status_code == 201
        data1 = resp1.json()["data"]
        id1 = data1["id"]

        # 2. Second SOS attempt while first is still active (without idempotency key)
        resp2 = await client.post(
            "/api/incidents",
            json={**VALID_SOS, "description": "Second SOS attempt"},
            headers=citizen_headers,
        )
        assert resp2.status_code == 201 or resp2.status_code == 200
        id2 = resp2.json()["data"]["id"]

        # Returns the existing active SOS
        assert id1 == id2


# ---------------------------------------------------------------------------
# Part C Tests: Dispatch Concurrency & Conflict Protection
# ---------------------------------------------------------------------------


class TestDispatchConcurrency:
    """Verify race conditions, double assignments, and conflict contracts."""

    @pytest.mark.asyncio
    async def test_double_assign_same_responder_is_idempotent(self, client, authority_headers):
        """Operator clicking ASSIGN twice for same responder returns existing assignment."""
        # Create an incident
        inc_resp = await client.post("/api/incidents", json=VALID_SOS)
        inc_id = inc_resp.json()["data"]["id"]

        # Get an available responder
        resp_list = await client.get("/api/responders", headers=authority_headers)
        available = [r for r in resp_list.json()["data"] if r["status"] == "AVAILABLE"]
        assert len(available) >= 1
        responder_id = available[0]["id"]

        assign_payload = {
            "incident_id": inc_id,
            "responder_id": responder_id,
            "status": "ASSIGNED",
        }

        # 1. First assign click
        res1 = await client.post("/api/assignments", json=assign_payload, headers=authority_headers)
        assert res1.status_code == 201
        assign_id_1 = res1.json()["data"]["id"]

        # 2. Immediate second assign click by same operator
        res2 = await client.post("/api/assignments", json=assign_payload, headers=authority_headers)
        assert res2.status_code == 201 or res2.status_code == 200
        assign_id_2 = res2.json()["data"]["id"]

        assert assign_id_1 == assign_id_2

    @pytest.mark.asyncio
    async def test_simultaneous_assignment_different_responders_conflict(
        self, client, authority_headers
    ):
        """Two authorities assigning different responders to the same incident triggers 409."""
        # Create an incident
        inc_resp = await client.post("/api/incidents", json=VALID_SOS)
        inc_id = inc_resp.json()["data"]["id"]

        resp_list = await client.get("/api/responders", headers=authority_headers)
        available = [r for r in resp_list.json()["data"] if r["status"] == "AVAILABLE"]
        assert len(available) >= 2
        responder_a = available[0]["id"]
        responder_b = available[1]["id"]

        # Authority A assigns Responder A
        res_a = await client.post(
            "/api/assignments",
            json={"incident_id": inc_id, "responder_id": responder_a, "status": "ASSIGNED"},
            headers=authority_headers,
        )
        assert res_a.status_code == 201

        # Authority B attempts to assign Responder B to the same incident
        res_b = await client.post(
            "/api/assignments",
            json={"incident_id": inc_id, "responder_id": responder_b, "status": "ASSIGNED"},
            headers=authority_headers,
        )
        # Must return 409 Conflict
        assert res_b.status_code == 409
        err_code = res_b.json().get("detail", {}).get("error", {}).get("code")
        assert err_code in ("INCIDENT_ALREADY_ASSIGNED", "ASSIGNMENT_CONFLICT")

    @pytest.mark.asyncio
    async def test_responder_conflict_across_two_incidents(
        self, client, anon_client, authority_headers
    ):
        """Two incidents attempting to claim the same responder triggers 409 Conflict."""
        # Create Incident 1 and Incident 2 for two different citizens at different locations
        inc1_resp = await anon_client.post(
            "/api/incidents",
            json={
                **VALID_SOS,
                "description": "Unique Incident Alpha - North Sector",
                "reporter_phone": "+91 98301 11111",
                "reporter_name": "Citizen One",
                "latitude": 22.5710,
                "longitude": 88.3610,
            },
        )
        inc1_id = inc1_resp.json()["data"]["id"]

        inc2_resp = await anon_client.post(
            "/api/incidents",
            json={
                **VALID_SOS,
                "description": "Unique Incident Beta - South Sector",
                "reporter_phone": "+91 98301 22222",
                "reporter_name": "Citizen Two",
                "latitude": 22.5890,
                "longitude": 88.3790,
            },
        )
        inc2_id = inc2_resp.json()["data"]["id"]
        assert inc1_id != inc2_id

        resp_list = await client.get("/api/responders", headers=authority_headers)
        available = [r for r in resp_list.json()["data"] if r["status"] == "AVAILABLE"]
        assert len(available) >= 1
        shared_responder = available[0]["id"]

        # Assign shared responder to Incident 1
        res1 = await client.post(
            "/api/assignments",
            json={"incident_id": inc1_id, "responder_id": shared_responder, "status": "ASSIGNED"},
            headers=authority_headers,
        )
        assert res1.status_code == 201

        # Attempt to assign the same responder to Incident 2
        res2 = await client.post(
            "/api/assignments",
            json={"incident_id": inc2_id, "responder_id": shared_responder, "status": "ASSIGNED"},
            headers=authority_headers,
        )
        # Must return 409 Conflict
        assert res2.status_code == 409
        err_code = res2.json().get("detail", {}).get("error", {}).get("code")
        assert err_code in (
            "RESPONDER_ALREADY_ASSIGNED",
            "RESPONDER_UNAVAILABLE",
            "ASSIGNMENT_CONFLICT",
        )
