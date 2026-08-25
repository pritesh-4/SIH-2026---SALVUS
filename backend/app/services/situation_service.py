"""Authority Situation Intelligence & Grounded AI Briefing Service.

Aggregates ground-truth database metrics across incidents, clusters, responders,
shelters, and hazards to generate factual, traceable operational briefings.
"""

from __future__ import annotations

import logging
import os
from datetime import UTC, datetime

import aiosqlite
import httpx

from app.models import (
    IncidentResponse,
    SituationStatistics,
    SituationSummaryResponse,
)
from app.services import hazard_service, incident_service
from app.services.clustering_service import cluster_incidents

logger = logging.getLogger("salvus.situation")

GEMINI_API_URL = (
    "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent"
)
REQUEST_TIMEOUT_SECONDS = 3.5


async def compute_situation_statistics(db: aiosqlite.Connection) -> SituationStatistics:
    """Aggregate structured situation statistics strictly from ground truth records."""
    now_iso = datetime.now(UTC).isoformat()

    # 1. Incidents breakdown
    incidents: list[IncidentResponse] = await incident_service.get_all_incidents(db)
    active_incidents = [inc for inc in incidents if inc.status not in ("RESOLVED", "CANCELLED")]
    critical_count = sum(1 for inc in active_incidents if inc.severity == "CRITICAL" or inc.is_sos)
    triage_pending_count = sum(1 for inc in active_incidents if inc.status == "TRIAGE_PENDING")
    verified_count = sum(1 for inc in active_incidents if inc.status == "VERIFIED")
    assigned_count = sum(
        1
        for inc in active_incidents
        if inc.status in ("ASSIGNED", "EN_ROUTE", "NEARBY", "ON_SCENE")
    )
    resolved_count = sum(1 for inc in incidents if inc.status == "RESOLVED")

    # 2. Incident clusters
    clusters = cluster_incidents(incidents)

    # 3. Responders fleet stats
    cursor = await db.execute("SELECT status FROM responders")
    resp_rows = await cursor.fetchall()
    total_responders = len(resp_rows)
    available_responders = sum(1 for r in resp_rows if r["status"] == "AVAILABLE")
    deployed_responders = sum(
        1 for r in resp_rows if r["status"] in ("ASSIGNED", "EN_ROUTE", "NEARBY", "ON_SCENE")
    )

    # 4. Shelters capacity stats
    cursor = await db.execute("SELECT available_beds, is_active FROM shelters")
    shelter_rows = await cursor.fetchall()
    active_shelters = [s for s in shelter_rows if s["is_active"]]
    total_shelters = len(active_shelters)
    available_beds = sum(s["available_beds"] for s in active_shelters)

    # 5. External hazard signals
    hazards = await hazard_service.get_active_hazards()

    return SituationStatistics(
        total_active_incidents=len(active_incidents),
        critical_incidents_count=critical_count,
        pending_triage_count=triage_pending_count,
        verified_incidents_count=verified_count,
        assigned_incidents_count=assigned_count,
        resolved_incidents_count=resolved_count,
        active_clusters_count=len(clusters),
        total_responders=total_responders,
        available_responders=available_responders,
        deployed_responders=deployed_responders,
        total_shelters=total_shelters,
        available_beds=available_beds,
        active_hazards_count=len(hazards),
        timestamp=now_iso,
    )


def _deterministic_briefing(stats: SituationStatistics) -> str:
    """Generate concise, factual briefing templated strictly on calculated statistics."""
    p1 = (
        f"District Command reports {stats.total_active_incidents} active incidents "
        f"across {stats.active_clusters_count} operational cluster(s). "
        f"{stats.critical_incidents_count} critical incident(s) require prioritized response, "
        f"with {stats.pending_triage_count} awaiting triage and "
        f"{stats.verified_incidents_count} verified."
    )
    p2 = (
        f"Fleet status: {stats.deployed_responders} unit(s) deployed, "
        f"{stats.available_responders} unit(s) on standby. "
        f"Shelter reception capacity remains stable with {stats.available_beds} verified beds "
        f"across {stats.total_shelters} facilities."
    )
    return f"{p1} {p2}"


async def get_situation_summary(db: aiosqlite.Connection) -> SituationSummaryResponse:
    """Generate complete situation intelligence response with structured stats and AI brief."""
    stats = await compute_situation_statistics(db)
    now_iso = datetime.now(UTC).isoformat()

    # Priorities
    priorities = []
    if stats.critical_incidents_count > 0:
        priorities.append(
            f"Deploy craft to {stats.critical_incidents_count} high-severity distress signal(s)"
        )
    if stats.pending_triage_count > 0:
        priorities.append(
            f"Complete human triage verification for {stats.pending_triage_count} pending ticket(s)"
        )
    if stats.available_responders == 0:
        priorities.append("Alert mutual-aid reserve fleet — all local units deployed")
    if stats.available_beds < 100:
        priorities.append("Prepare secondary shelter overflow reception staging")
    if not priorities:
        priorities.append("Maintain active monitoring and responder staging across key sectors")

    # Try Gemini for grounded phrasing
    gemini_key = os.getenv("GEMINI_API_KEY")
    if gemini_key and gemini_key.strip():
        try:
            tot = stats.total_active_incidents
            crit = stats.critical_incidents_count
            pend = stats.pending_triage_count
            ver = stats.verified_incidents_count
            prompt = (
                f"You are SALVUS Command Center Briefing AI. Convert the following structured "
                f"emergency disaster statistics into a calm, concise 2-sentence briefing. "
                f"Do not hallucinate any unmentioned facts.\n\n"
                f"DATA:\n"
                f"- Active Incidents: {tot} (Critical: {crit}, Pending: {pend}, Verified: {ver})\n"
                f"- Active Clusters: {stats.active_clusters_count}\n"
                f"- Responders: {stats.deployed_responders} deployed, "
                f"{stats.available_responders} standby\n"
                f"- Shelters: {stats.available_beds} beds free across "
                f"{stats.total_shelters} shelters\n"
                f"- Hazards: {stats.active_hazards_count} active hazard perimeters\n\n"
                f"Output exactly 2 concise factual sentences."
            )
            url = f"{GEMINI_API_URL}?key={gemini_key.strip()}"
            payload = {"contents": [{"parts": [{"text": prompt}]}]}

            async with httpx.AsyncClient(timeout=REQUEST_TIMEOUT_SECONDS) as client:
                resp = await client.post(url, json=payload)
                if resp.status_code == 200:
                    cand = resp.json().get("candidates", [])
                    if cand:
                        text = cand[0]["content"]["parts"][0]["text"].strip()
                        return SituationSummaryResponse(
                            statistics=stats,
                            briefing=text,
                            key_priorities=priorities,
                            provider="gemini-2.0-flash",
                            generated_at=now_iso,
                        )
        except Exception as e:
            logger.debug(f"Gemini situation briefing failed: {e}")

    # Fallback to deterministic briefing
    briefing_text = _deterministic_briefing(stats)
    return SituationSummaryResponse(
        statistics=stats,
        briefing=briefing_text,
        key_priorities=priorities,
        provider="salvus-grounded-intelligence",
        generated_at=now_iso,
    )
