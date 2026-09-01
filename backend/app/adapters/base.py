"""Base Abstract Adapter for External Disaster Alert Providers (Phase 1 & Phase 2)."""

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
        endpoint_url: str | None = None,
        limitations: str | None = None,
        initial_status: SourceStatus = SourceStatus.AVAILABLE,
        display_name: str | None = None,
        initial_status_label: str | None = None,
        initial_is_live: bool = False,
    ):
        self.source_id = source_id
        self.source_name = source_name
        self.display_name = display_name or source_name
        self.source_type = source_type
        self.cache_ttl_seconds = cache_ttl_seconds
        self.endpoint_url = endpoint_url
        self.limitations = limitations
        self.initial_status_label = initial_status_label
        self.initial_is_live = initial_is_live

        status_lbl = (
            initial_status_label
            if initial_status_label is not None
            else ("LIVE" if initial_status == SourceStatus.AVAILABLE else "UNAVAILABLE")
        )

        self._health = SourceHealthReport(
            source_id=source_id,
            source_name=source_name,
            display_name=self.display_name,
            source_type=source_type,
            status=initial_status,
            status_label=status_lbl,
            is_live=initial_is_live,
            last_fetched_at=None,
            last_successful_at=None,
            last_error=None,
            latency_ms=None,
            active_alerts_count=0,
            endpoint_url=endpoint_url,
            limitations=limitations,
        )

    def get_health(self) -> SourceHealthReport:
        """Return the current health telemetry report for this adapter."""
        return self._health.model_copy()

    def clear_cache(self) -> None:
        """Reset cached state and restore healthy status."""
        self._health.status = (
            SourceStatus.AVAILABLE
            if self.source_id not in ("osdma_satark", "odisha_flood")
            else SourceStatus.UNAVAILABLE
        )
        if self.initial_status_label:
            self._health.status_label = self.initial_status_label
        else:
            self._health.status_label = (
                "LIVE" if self._health.status == SourceStatus.AVAILABLE else "UNAVAILABLE"
            )
        self._health.is_live = self.initial_is_live
        self._health.last_error = None

    def update_health(
        self,
        status: SourceStatus,
        latency_ms: float | None = None,
        error: str | None = None,
        active_alerts_count: int | None = None,
        status_label: str | None = None,
        is_live: bool | None = None,
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
            self._health.is_live = True if is_live is None else is_live
            self._health.status_label = status_label or "LIVE"
        else:
            self._health.is_live = False if is_live is None else is_live
            self._health.status_label = status_label or "UNAVAILABLE"
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
