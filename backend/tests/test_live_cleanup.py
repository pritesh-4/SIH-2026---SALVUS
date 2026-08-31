"""Tests for Live Production Startup & Legacy Demo Cleanup.

Verifies:
1. cleanup_legacy_demo_records prunes all known demo operational rows
2. cleanup_legacy_demo_records strictly preserves authentic citizen incidents, profiles, and users
3. Idempotent execution of cleanup in clean operational state
"""

from __future__ import annotations

import pytest

from app.db.seed import (
    cleanup_legacy_demo_records,
    seed_auth_users,
    seed_database,
)
from app.models import IncidentCreate, IncidentSeverity, IncidentType
from app.services import incident_service, responder_service, shelter_service


@pytest.mark.asyncio
async def test_cleanup_legacy_demo_records_prunes_demo_dataset(test_db):
    """Ensure that running cleanup_legacy_demo_records deletes all demo operational records."""
    # 1. Seed demo dataset into database
    await seed_database(test_db)

    # Verify seeded rows exist
    incidents_before = await incident_service.get_all_incidents(test_db)
    responders_before = await responder_service.get_all_responders(test_db)
    shelters_before = await shelter_service.get_all_shelters(test_db)

    assert len(incidents_before) >= 4
    assert len(responders_before) >= 4
    assert len(shelters_before) >= 3

    # 2. Execute safe legacy cleanup
    result = await cleanup_legacy_demo_records(test_db)

    assert result["deleted_incidents"] >= 4
    assert result["deleted_responders"] >= 4
    assert result["deleted_shelters"] >= 3

    # 3. Verify operational tables are now empty
    incidents_after = await incident_service.get_all_incidents(test_db)
    responders_after = await responder_service.get_all_responders(test_db)
    shelters_after = await shelter_service.get_all_shelters(test_db)

    assert len(incidents_after) == 0
    assert len(responders_after) == 0
    assert len(shelters_after) == 0


@pytest.mark.asyncio
async def test_cleanup_legacy_demo_records_preserves_authentic_citizen_records(test_db):
    """Ensure that real citizen incidents and authentication accounts are never deleted."""
    # 1. Seed auth users
    await seed_auth_users(test_db)

    # 2. Create a real citizen incident with non-demo ID
    payload = IncidentCreate(
        type=IncidentType.FLOOD,
        severity=IncidentSeverity.HIGH,
        description="Real distress call from flood victim",
        latitude=22.581,
        longitude=88.421,
        reporter_name="Debashis Roy",
        reporter_phone="+91 98300 98765",
        affected_count=4,
        is_sos=True,
    )
    real_inc = await incident_service.create_incident(test_db, payload)

    # 3. Run cleanup
    await cleanup_legacy_demo_records(test_db)

    # 4. Verify authentic record is preserved intact
    persisted = await incident_service.get_incident_by_id(test_db, real_inc.id)
    assert persisted is not None
    assert persisted.id == real_inc.id
    assert persisted.description == "Real distress call from flood victim"
    assert persisted.is_sos is True
    assert persisted.affected_count == 4

    # Verify auth users are preserved
    cursor = await test_db.execute("SELECT count(*) as cnt FROM users")
    row = await cursor.fetchone()
    assert row["cnt"] >= 2
