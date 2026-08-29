"""Base Abstract Adapter for External Disaster Alert Providers (Phase 2)."""

from __future__ import annotations

from abc import ABC, abstractmethod
from datetime import UTC, datetime

import httpx

from app.models import (
    AlertProvenance,
    NormalizedAlert,
    SourceHealthReport,
    SourceStatus,
    SourceType,
)


class BaseAlertAdapter(ABC):
    """Abstract interface and health telemetry registry for disaster alert adapters."""

    def __init__(
        self,
        source_id: str,
        source_name: str,
        source_type: SourceType,
        cache_ttl_seconds: int = 300,
    ):
        self.source_id = source_id
        self.source_name = source_name
        self.source_type = source_type
        self.cache_ttl_seconds = cache_ttl_seconds

        self._health = SourceHealthReport(
            source_id=source_id,
            source_name=source_name,
            source_type=source_type,
            status=SourceStatus.AVAILABLE,
            last_fetched_at=None,
            last_successful_at=None,
            last_error=None,
            latency_ms=None,
            active_alerts_count=0,
        )

    def get_health(self) -> SourceHealthReport:
        """Return the current health telemetry report for this adapter."""
        return self._health.model_copy()

    def clear_cache(self) -> None:
        """Reset cached state and restore healthy status."""
        self._health.status = SourceStatus.AVAILABLE
        self._health.last_error = None

    def update_health(
        self,
        status: SourceStatus,
        latency_ms: float | None = None,
        error: str | None = None,
        active_alerts_count: int | None = None,
    ) -> None:
        """Update source health status, latency, error telemetry, and active alert count."""
        now_iso = datetime.now(UTC).isoformat()
        self._health.status = status
        self._health.last_fetched_at = now_iso
        if latency_ms is not None:
            self._health.latency_ms = round(latency_ms, 2)
        if error is not None:
            self._health.last_error = error
        if status in (SourceStatus.AVAILABLE, SourceStatus.STALE):
            self._health.last_successful_at = now_iso
            self._health.last_error = None
        if active_alerts_count is not None:
            self._health.active_alerts_count = active_alerts_count

    @abstractmethod
    async def fetch_alerts(
        self,
        lat: float | None = None,
        lon: float | None = None,
        client: httpx.AsyncClient | None = None,
        **kwargs,
    ) -> tuple[list[NormalizedAlert], AlertProvenance]:
        """Fetch and normalize alerts from the external provider.

        Returns:
            Tuple of (list_of_normalized_alerts, alert_provenance)
        """
        raise NotImplementedError
