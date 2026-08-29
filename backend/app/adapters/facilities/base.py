"""Abstract Base Class and Observability Framework for Facility Providers.

Ensures all provider implementations adhere to:
- Standardized asynchronous concurrent category querying.
- Isolated per-category error handling and response status reporting.
- Development-safe structured observability logging (never exposed to citizens).
- Health status and latency tracking.
"""

from __future__ import annotations

import asyncio
import logging
import time
from abc import ABC, abstractmethod
from datetime import UTC, datetime

import httpx

from app.models import SourceHealthReport, SourceStatus, SourceType
from app.models.facility import FacilityCategory, FacilityModel

logger = logging.getLogger("salvus.facilities")


class BaseFacilityProvider(ABC):
    """Abstract base provider for real-world emergency facilities."""

    def __init__(self, provider_id: str, provider_name: str):
        self.provider_id = provider_id
        self.provider_name = provider_name
        self._health = SourceHealthReport(
            source_id=provider_id,
            source_name=provider_name,
            source_type=SourceType.GEOSPATIAL_PROVIDER,
            status=SourceStatus.AVAILABLE,
            last_fetched_at=None,
            last_successful_at=None,
            last_error=None,
            latency_ms=None,
            active_alerts_count=0,
        )

    def get_health(self) -> SourceHealthReport:
        """Return provider health report."""
        return self._health.model_copy()

    def update_health(
        self,
        status: SourceStatus,
        latency_ms: float | None = None,
        error: str | None = None,
    ) -> None:
        """Update provider operational health metrics."""
        now_iso = datetime.now(UTC).isoformat()
        self._health.status = status
        self._health.last_fetched_at = now_iso
        if latency_ms is not None:
            self._health.latency_ms = round(latency_ms, 2)
        if error is not None:
            self._health.last_error = error
        if status == SourceStatus.AVAILABLE:
            self._health.last_successful_at = now_iso
            self._health.last_error = None

    def log_observability(
        self,
        category: FacilityCategory,
        lat: float,
        lon: float,
        radius_m: int,
        count: int,
        duration_ms: float,
        status: str,
        error_type: str | None = None,
    ) -> None:
        """Emit development-safe structured telemetry for audit and debugging."""
        err_suffix = f" | Error: {error_type}" if error_type else ""
        logger.info(
            f"[Nearby Facilities] Provider: {self.provider_name} | "
            f"Category: {category.value} | "
            f"Location: ({lat:.4f}, {lon:.4f}) | "
            f"Radius: {radius_m}m | "
            f"Result count: {count} | "
            f"Duration: {duration_ms:.1f}ms | "
            f"Status: {status}{err_suffix}"
        )

    @abstractmethod
    async def fetch_category(
        self,
        lat: float,
        lon: float,
        radius_m: int,
        category: FacilityCategory,
        client: httpx.AsyncClient | None = None,
    ) -> tuple[list[FacilityModel], str]:
        """Fetch facilities for a single category around coordinates.

        Returns:
            tuple[list[FacilityModel], str]: (facilities_list, status_code)
            status_code is one of: 'OK', 'EMPTY', 'UNAVAILABLE', 'TIMEOUT'
        """
        raise NotImplementedError

    async def fetch_all_categories_concurrent(
        self,
        lat: float,
        lon: float,
        radius_m: int,
        categories: list[FacilityCategory] | None = None,
        client: httpx.AsyncClient | None = None,
    ) -> dict[FacilityCategory, tuple[list[FacilityModel], str]]:
        """Concurrently fetch all requested categories using asyncio.gather (Promise.allSettled).

        Guarantee: Category-level failure isolation.
        A pharmacy failure or timeout will NEVER block or discard hospital results.
        """
        target_cats = (
            categories
            if categories
            else [
                FacilityCategory.HOSPITAL,
                FacilityCategory.PHARMACY,
                FacilityCategory.POLICE,
                FacilityCategory.FIRE_STATION,
                FacilityCategory.AMBULANCE,
                FacilityCategory.SAFE_PLACE,
            ]
        )

        async def _fetch_single(
            cat: FacilityCategory,
        ) -> tuple[FacilityCategory, list[FacilityModel], str]:
            start_t = time.perf_counter()
            try:
                places, status = await self.fetch_category(lat, lon, radius_m, cat, client=client)
                dur = (time.perf_counter() - start_t) * 1000.0
                self.log_observability(cat, lat, lon, radius_m, len(places), dur, status)
                return cat, places, status
            except TimeoutError:
                dur = (time.perf_counter() - start_t) * 1000.0
                self.log_observability(cat, lat, lon, radius_m, 0, dur, "TIMEOUT", "TimeoutError")
                return cat, [], "TIMEOUT"
            except Exception as exc:
                dur = (time.perf_counter() - start_t) * 1000.0
                self.log_observability(
                    cat, lat, lon, radius_m, 0, dur, "UNAVAILABLE", type(exc).__name__
                )
                return cat, [], "UNAVAILABLE"

        tasks = [_fetch_single(cat) for cat in target_cats]
        results = await asyncio.gather(*tasks, return_exceptions=False)

        results_map: dict[FacilityCategory, tuple[list[FacilityModel], str]] = {}
        for cat, places, status in results:
            results_map[cat] = (places, status)

        return results_map
