"""Comprehensive integration tests for Duplicate Action & Idempotency Hardening (Pass 3A).

Verifies that slow connections, double clicks, network retries, and rapid concurrent actions
never create duplicate SOS distress incidents, duplicate assignments, or duplicate timeline events.
"""

import aiosqlite
import pytest

VALID_SOS = {
    "type": "flood",
    "severity": "CRITICAL",
    "description": "Flood water rising fast. Family stranded on rooftop.",
    "reporter_name": "Priya Sharma",
    "reporter_phone": "+91 98301 11222",
    "latitude": 22.5726,
    "longitude": 88.3639,
    "affected_count": 4,
    "is_sos": True,
}


class TestDuplicateAndIdempotency:
    """Pass 3A: Complete Duplicate Action & Idempotency Hardening Test Suite."""

    @pytest.mark.asyncio
    async def test_1_double_click_sos_with_idempotency_key(self, client):
        """Scenario 1: User double-clicks SOS -> server resolves to single logical incident."""
        key = "idemp_sos_double_click_001"

        # First click
        resp1 = await client.post(
            "/api/incidents",
            json=VALID_SOS,
            headers={"Idempotency-Key": key},
        )
        assert resp1.status_code == 201
        data1 = resp1.json()["data"]

        # Immediate second click (simulating double click)
        resp2 = await client.post(
            "/api/incidents",
            json=VALID_SOS,
            headers={"Idempotency-Key": key},
        )
        assert resp2.status_code in (200, 201)
        data2 = resp2.json()["data"]

        assert data1["id"] == data2["id"]
        assert data1["ticket_id"] == data2["ticket_id"]

        # Verify exactly one incident exists
        list_resp = await client.get("/api/incidents")
        incidents = [i for i in list_resp.json()["data"] if i["id"] == data1["id"]]
        assert len(incidents) == 1

    @pytest.mark.asyncio
    async def test_2_rapid_triple_click_sos(self, client):
        """Scenario 2: Rapid triple-click with same idempotency key produces single incident."""
        key = "idemp_sos_triple_click_002"

        resps = []
        for _ in range(3):
            r = await client.post(
                "/api/incidents",
                json=VALID_SOS,
                headers={"Idempotency-Key": key},
            )
            resps.append(r)

        ids = [r.json()["data"]["id"] for r in resps]
        assert len(set(ids)) == 1

    @pytest.mark.asyncio
    async def test_3_timeout_and_retry_scenario(self, client):
        """Scenario 3: Client timeout + retry with same key returns identical incident."""
        key = "idemp_sos_timeout_retry_003"

        # Request 1
        resp1 = await client.post(
            "/api/incidents",
            json=VALID_SOS,
            headers={"Idempotency-Key": key},
        )
        assert resp1.status_code == 201
        created = resp1.json()["data"]

        # Simulated client retry after response lost / timeout
        retry_resp = await client.post(
            "/api/incidents",
            json=VALID_SOS,
            headers={"Idempotency-Key": key},
        )
        assert retry_resp.status_code in (200, 201)
        rehydrated = retry_resp.json()["data"]

        assert rehydrated["id"] == created["id"]
        assert rehydrated["ticket_id"] == created["ticket_id"]

    @pytest.mark.asyncio
    async def test_4_active_sos_invariant_per_citizen(self, client, citizen_headers):
        """Scenario 4: Citizen cannot create a 2nd active SOS incident while one is ongoing."""
        # First SOS
        resp1 = await client.post("/api/incidents", json=VALID_SOS, headers=citizen_headers)
        assert resp1.status_code == 201
        id1 = resp1.json()["data"]["id"]

        # Attempt to create another SOS without key
        resp2 = await client.post(
            "/api/incidents",
            json={**VALID_SOS, "description": "Another SOS trigger"},
            headers=citizen_headers,
        )
        assert resp2.status_code in (200, 201)
        id2 = resp2.json()["data"]["id"]

        # Server returns the existing active SOS
        assert id1 == id2

    @pytest.mark.asyncio
    async def test_5_database_invariant_unique_active_sos(self, test_db):
        """Scenario 5: Database partial unique index strictly prevents duplicate active SOS."""
        citizen_id = "cit-db-invariant-user-99"

        # Insert active SOS 1
        await test_db.execute(
            """
            INSERT INTO incidents (
                id, ticket_id, type, severity, description, reporter_name,
                reporter_id, latitude, longitude, affected_count, is_sos, status,
                ai_state, created_at, updated_at
            )
            VALUES ('inc-db-1', 'SV-9001', 'flood', 'CRITICAL', 'SOS 1', 'Citizen',
                    ?, 22.57, 88.36, 1, 1, 'NEW', 'NOT_STARTED',
                    '2026-08-30T10:00:00Z', '2026-08-30T10:00:00Z')
            """,
            (citizen_id,),
        )
        await test_db.commit()

        # Direct DB insert for active SOS 2 for same citizen MUST violate unique constraint
        with pytest.raises(aiosqlite.IntegrityError):
            await test_db.execute(
                """
                INSERT INTO incidents (
                    id, ticket_id, type, severity, description, reporter_name,
                    reporter_id, latitude, longitude, affected_count, is_sos, status,
                    ai_state, created_at, updated_at
                )
                VALUES ('inc-db-2', 'SV-9002', 'flood', 'CRITICAL', 'SOS 2', 'Citizen',
                        ?, 22.57, 88.36, 1, 1, 'NEW', 'NOT_STARTED',
                        '2026-08-30T10:01:00Z', '2026-08-30T10:01:00Z')
                """,
                (citizen_id,),
            )
            await test_db.commit()

    @pytest.mark.asyncio
    async def test_6_double_click_verify_ai_triage_no_duplicate_events(
        self, client, authority_headers
    ):
        """Scenario 6: Double-clicking VERIFY does not generate duplicate timeline events."""
        # Create an incident
        inc_resp = await client.post("/api/incidents", json=VALID_SOS)
        inc_id = inc_resp.json()["data"]["id"]

        # 1. First verification
        v_resp1 = await client.post(
            f"/api/triage/verify/{inc_id}",
            json={"actor": "Operator A", "reviewer_notes": "All clear"},
            headers=authority_headers,
        )
        assert v_resp1.status_code == 200
        events_1 = v_resp1.json()["data"]["events"]
        verify_events_1 = [e for e in events_1 if e["event_type"] == "TRIAGE_VERIFIED"]
        assert len(verify_events_1) == 1

        # 2. Second verification click with same parameters
        v_resp2 = await client.post(
            f"/api/triage/verify/{inc_id}",
            json={"actor": "Operator A", "reviewer_notes": "All clear"},
            headers=authority_headers,
        )
        assert v_resp2.status_code == 200
        events_2 = v_resp2.json()["data"]["events"]
        verify_events_2 = [e for e in events_2 if e["event_type"] == "TRIAGE_VERIFIED"]
        # Must NOT produce a second TRIAGE_VERIFIED event
        assert len(verify_events_2) == 1

    @pytest.mark.asyncio
    async def test_7_double_click_assign_via_assignments_api(self, client, authority_headers):
        """Scenario 7: Double assignment via /api/assignments returns existing assignment."""
        inc_resp = await client.post("/api/incidents", json=VALID_SOS)
        inc_id = inc_resp.json()["data"]["id"]

        resp_list = await client.get("/api/responders", headers=authority_headers)
        available = [r for r in resp_list.json()["data"] if r["status"] == "AVAILABLE"]
        assert len(available) >= 1
        responder_id = available[0]["id"]

        payload = {
            "incident_id": inc_id,
            "responder_id": responder_id,
            "status": "ASSIGNED",
        }

        # First assign
        res1 = await client.post("/api/assignments", json=payload, headers=authority_headers)
        assert res1.status_code == 201
        assign_id_1 = res1.json()["data"]["id"]

        # Immediate second assign
        res2 = await client.post("/api/assignments", json=payload, headers=authority_headers)
        assert res2.status_code in (200, 201)
        assign_id_2 = res2.json()["data"]["id"]

        assert assign_id_1 == assign_id_2

    @pytest.mark.asyncio
    async def test_8_double_click_assign_via_responders_api(self, client, authority_headers):
        """Scenario 8: Double assignment via /api/responders/{id}/assign is idempotent."""
        inc_resp = await client.post("/api/incidents", json=VALID_SOS)
        inc_id = inc_resp.json()["data"]["id"]

        resp_list = await client.get("/api/responders", headers=authority_headers)
        available = [r for r in resp_list.json()["data"] if r["status"] == "AVAILABLE"]
        assert len(available) >= 1
        responder_id = available[0]["id"]

        payload = {
            "incident_id": inc_id,
            "status": "ASSIGNED",
            "actor": "authority",
        }

        # First assign
        res1 = await client.post(
            f"/api/responders/{responder_id}/assign",
            json=payload,
            headers=authority_headers,
        )
        assert res1.status_code == 200
        assert res1.json()["data"]["status"] == "ASSIGNED"

        # Immediate second assign
        res2 = await client.post(
            f"/api/responders/{responder_id}/assign",
            json=payload,
            headers=authority_headers,
        )
        assert res2.status_code == 200
        assert res2.json()["data"]["status"] == "ASSIGNED"

    @pytest.mark.asyncio
    async def test_9_repeated_same_state_transition_no_duplicate_events(
        self, client, authority_headers
    ):
        """Scenario 9: Repeated transition to the current status produces no extra audit events."""
        inc_resp = await client.post("/api/incidents", json=VALID_SOS)
        inc_id = inc_resp.json()["data"]["id"]

        # Transition to VERIFIED
        await client.patch(
            f"/api/incidents/{inc_id}/status",
            json={"status": "VERIFIED"},
            headers=authority_headers,
        )

        get1 = await client.get(f"/api/incidents/{inc_id}", headers=authority_headers)
        count1 = len(get1.json()["data"]["events"])

        # Repeat VERIFIED transition
        await client.patch(
            f"/api/incidents/{inc_id}/status",
            json={"status": "VERIFIED"},
            headers=authority_headers,
        )

        get2 = await client.get(f"/api/incidents/{inc_id}", headers=authority_headers)
        count2 = len(get2.json()["data"]["events"])

        # No duplicate event added
        assert count1 == count2

    @pytest.mark.asyncio
    async def test_10_repeated_responder_lifecycle_advance(self, client, authority_headers):
        """Scenario 10: Advancing EN_ROUTE -> EN_ROUTE does not produce duplicate events."""
        # 1. Create incident & assign responder
        inc_resp = await client.post("/api/incidents", json=VALID_SOS)
        inc_id = inc_resp.json()["data"]["id"]

        resp_list = await client.get("/api/responders", headers=authority_headers)
        available = [r for r in resp_list.json()["data"] if r["status"] == "AVAILABLE"]
        responder_id = available[0]["id"]

        await client.post(
            f"/api/responders/{responder_id}/assign",
            json={"incident_id": inc_id, "status": "ASSIGNED"},
            headers=authority_headers,
        )

        # 2. Advance to EN_ROUTE
        adv1 = await client.post(
            f"/api/responders/{responder_id}/lifecycle",
            json={"target_status": "EN_ROUTE"},
            headers=authority_headers,
        )
        assert adv1.status_code == 200

        inc1 = await client.get(f"/api/incidents/{inc_id}", headers=authority_headers)
        events_1 = inc1.json()["data"]["events"]
        en_route_events_1 = [
            e
            for e in events_1
            if e["event_type"] == "assignment.status_changed" and e["new_status"] == "EN_ROUTE"
        ]
        assert len(en_route_events_1) == 1

        # 3. Advance to EN_ROUTE again (repeated click)
        adv2 = await client.post(
            f"/api/responders/{responder_id}/lifecycle",
            json={"target_status": "EN_ROUTE"},
            headers=authority_headers,
        )
        assert adv2.status_code == 200

        inc2 = await client.get(f"/api/incidents/{inc_id}", headers=authority_headers)
        events_2 = inc2.json()["data"]["events"]
        en_route_events_2 = [
            e
            for e in events_2
            if e["event_type"] == "assignment.status_changed" and e["new_status"] == "EN_ROUTE"
        ]
        # Must remain 1 event
        assert len(en_route_events_2) == 1
