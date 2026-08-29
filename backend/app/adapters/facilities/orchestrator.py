"""Salvus Facility Orchestration Engine.

Coordinates the entire multi-provider nearby emergency intelligence pipeline:
1. Primary Provider: Geoapify Places API v2
2. Fallback Providers: Google Places / OpenStreetMap (Overpass + Nominatim)
3. Safe Places Trust Provider: Verified Civil Defense Shelters (SQLite)
4. Concurrent Category Querying with Category-Level Failure Isolation
5. Multi-Level Layered Deduplication
6. Strict Local Distance Validation (<= 10,000 meters)
7. Multi-Factor Life-Safety Emergency Ranking
8. Location-Sensitive Tiered Caching with Stale-While-Revalidate
9. Granular Response State Determination (AVAILABLE, PARTIAL_RESULTS, NO_RESULTS,
   UNAVAILABLE, STALE)
"""

from __future__ import annotations

import asyncio
import logging
import time

import aiosqlite
import httpx

from app.adapters.facilities.base import BaseFacilityProvider
from app.adapters.facilities.deduplication import deduplicate_facilities
from app.adapters.facilities.geoapify_provider import GeoapifyFacilityProvider
from app.adapters.facilities.google_places_provider import GooglePlacesFacilityProvider
from app.adapters.facilities.osm_provider import OSMFacilityProvider
from app.adapters.facilities.shelter_provider import VerifiedShelterFacilityAdapter
from app.models.facility import (
    CategoryStatusReport,
    FacilityCategory,
    FacilityFreshness,
    FacilityModel,
    FacilityResponseState,
)
from app.utils.geospatial import (
    format_straight_line_distance,
    haversine_distance_km,
    haversine_distance_meters,
    snap_coordinate_to_grid,
)

logger = logging.getLogger("salvus.facilities.orchestrator")

FRESH_CACHE_TTL_SECONDS = 300.0  # 5 minutes fresh
STALE_CACHE_TTL_SECONDS = 1800.0  # 30 minutes stale fallback
DEFAULT_RADIUS_METERS = 10000  # 10 km default

# Emergency Ranking Weights
CATEGORY_EMERGENCY_WEIGHTS: dict[FacilityCategory, float] = {
    FacilityCategory.HOSPITAL: 100.0,
    FacilityCategory.AMBULANCE: 95.0,
    FacilityCategory.FIRE_STATION: 90.0,
    FacilityCategory.POLICE: 85.0,
    FacilityCategory.PHARMACY: 75.0,
    FacilityCategory.SAFE_PLACE: 70.0,
    FacilityCategory.OTHER: 50.0,
}


def calculate_ranking_score(facility: FacilityModel, safe_places_priority: bool = False) -> float:
    """Calculate multi-factor life-safety ranking score (higher score = ranked first)."""
    base_weight = CATEGORY_EMERGENCY_WEIGHTS.get(facility.category, 50.0)

    # Provenance bonus: Verified Civil Defense facilities receive highest trust tier
    provenance_bonus = 0.0
    if facility.verified:
        provenance_bonus = 40.0
        if safe_places_priority:
            provenance_bonus += 50.0

    if safe_places_priority and facility.category == FacilityCategory.SAFE_PLACE:
        base_weight += 40.0

    # Proximity score: closer facilities score higher (-8 points per km)
    dist_km = facility.distance_km if facility.distance_km is not None else 5.0
    dist_penalty = dist_km * 8.0

    return base_weight + provenance_bonus - dist_penalty


def rank_facilities(
    facilities: list[FacilityModel], safe_places_priority: bool = False
) -> list[FacilityModel]:
    """Rank facilities by emergency suitability, official verification, and proximity."""
    return sorted(
        facilities,
        key=lambda f: (
            -calculate_ranking_score(f, safe_places_priority=safe_places_priority),
            f.distance_km if f.distance_km is not None else 9999.0,
        ),
    )


class FacilityOrchestrator:
    """Master orchestrator for nearby facilities intelligence."""

    def __init__(
        self,
        primary_provider: BaseFacilityProvider | None = None,
        fallback_provider: BaseFacilityProvider | None = None,
        shelter_provider: VerifiedShelterFacilityAdapter | None = None,
    ):
        self.geoapify_provider = primary_provider or GeoapifyFacilityProvider()
        self.google_provider = GooglePlacesFacilityProvider()
        self.osm_provider = fallback_provider or OSMFacilityProvider()
        self.shelter_provider = shelter_provider or VerifiedShelterFacilityAdapter()

        # Cache: {(grid_lat, grid_lon, radius_bucket, cat_key):
        #         (facilities, fresh_until, stale_until, cat_statuses)}
        self._cache: dict[
            tuple[float, float, int, tuple[str, ...]],
            tuple[list[FacilityModel], float, float, dict[str, CategoryStatusReport]],
        ] = {}

        # In-flight task deduplication
        self._in_flight: dict[tuple[float, float, int, tuple[str, ...]], asyncio.Task] = {}

    def clear_cache(self) -> None:
        """Clear in-memory facility cache."""
        self._cache.clear()
        self._in_flight.clear()

    async def _execute_provider_pipeline(
        self,
        lat: float,
        lon: float,
        radius_m: int,
        categories: list[FacilityCategory],
        client: httpx.AsyncClient | None = None,
    ) -> tuple[list[FacilityModel], dict[str, CategoryStatusReport]]:
        """Run concurrent category queries with primary provider and selective category fallback."""
        category_statuses: dict[str, CategoryStatusReport] = {}
        collected_facilities: list[FacilityModel] = []

        # Determine primary provider: Geoapify if configured, else Google / OSM
        use_geoapify = (
            self.geoapify_provider.is_configured()
            if hasattr(self.geoapify_provider, "is_configured")
            else True
        )
        primary = self.geoapify_provider if use_geoapify else self.osm_provider

        # 1. Query primary provider concurrently across all requested categories
        start_t = time.perf_counter()
        primary_results = await primary.fetch_all_categories_concurrent(
            lat=lat, lon=lon, radius_m=radius_m, categories=categories, client=client
        )

        failed_categories: list[FacilityCategory] = []

        for cat, (places, status) in primary_results.items():
            dur_ms = (time.perf_counter() - start_t) * 1000.0
            category_statuses[cat.value] = CategoryStatusReport(
                category=cat,
                status=status,
                count=len(places),
                provider_used=primary.provider_name,
                duration_ms=dur_ms,
            )
            if status in ("OK", "EMPTY"):
                collected_facilities.extend(places)
            else:
                failed_categories.append(cat)

        # 2. Selective Fallback for failed categories ONLY
        if failed_categories:
            fallback = (
                self.google_provider if self.google_provider.is_configured() else self.osm_provider
            )
            if fallback.provider_id != primary.provider_id:
                failed_names = [c.value for c in failed_categories]
                logger.info(
                    f"[Orchestrator] Invoking fallback provider '{fallback.provider_name}' "
                    f"for failed categories: {failed_names}"
                )
                fallback_results = await fallback.fetch_all_categories_concurrent(
                    lat=lat, lon=lon, radius_m=radius_m, categories=failed_categories, client=client
                )

                for cat, (places, status) in fallback_results.items():
                    if status in ("OK", "EMPTY"):
                        collected_facilities.extend(places)
                        category_statuses[cat.value] = CategoryStatusReport(
                            category=cat,
                            status=status,
                            count=len(places),
                            provider_used=fallback.provider_name,
                            duration_ms=(time.perf_counter() - start_t) * 1000.0,
                        )
                    else:
                        # Fallback also failed for this category
                        category_statuses[cat.value] = CategoryStatusReport(
                            category=cat,
                            status="UNAVAILABLE",
                            count=0,
                            provider_used=fallback.provider_name,
                            duration_ms=(time.perf_counter() - start_t) * 1000.0,
                            error_message="All providers failed or timed out for this category",
                        )

        return collected_facilities, category_statuses

    async def get_nearby_facilities(
        self,
        lat: float,
        lon: float,
        radius_m: int = DEFAULT_RADIUS_METERS,
        categories: list[str | FacilityCategory] | None = None,
        include_verified_shelters: bool = True,
        safe_places_priority: bool = False,
        db: aiosqlite.Connection | None = None,
        client: httpx.AsyncClient | None = None,
        force_refresh: bool = False,
    ) -> tuple[
        list[FacilityModel],
        bool,
        FacilityFreshness,
        FacilityResponseState,
        dict[str, CategoryStatusReport],
    ]:
        """Retrieve nearby emergency facilities with full orchestration.

        Returns:
            tuple[facilities, is_cached, freshness, response_state, category_statuses]
        """
        # 1. Clamp radius up to strict 10,000 meters (10 km)
        clamped_radius = min(10000, max(100, radius_m))
        radius_bucket = max(100, (clamped_radius // 250) * 250)

        # 2. Parse category filters
        parsed_cats: list[FacilityCategory] = []
        if categories:
            for c in categories:
                parsed = c if isinstance(c, FacilityCategory) else FacilityCategory.from_str(str(c))
                if parsed and parsed not in parsed_cats:
                    parsed_cats.append(parsed)
        if not parsed_cats:
            parsed_cats = [
                FacilityCategory.HOSPITAL,
                FacilityCategory.PHARMACY,
                FacilityCategory.POLICE,
                FacilityCategory.FIRE_STATION,
                FacilityCategory.AMBULANCE,
                FacilityCategory.SAFE_PLACE,
            ]

        cat_key = tuple(sorted([c.value for c in parsed_cats]))

        # 3. Location grid snapping (~100m) for caching
        grid_lat = snap_coordinate_to_grid(lat, 3)
        grid_lon = snap_coordinate_to_grid(lon, 3)
        cache_key = (grid_lat, grid_lon, radius_bucket, cat_key)

        now = time.time()
        is_cached = False
        freshness = FacilityFreshness.LIVE
        facilities: list[FacilityModel] = []
        category_statuses: dict[str, CategoryStatusReport] = {}
        stale_candidate: tuple[list[FacilityModel], dict[str, CategoryStatusReport]] | None = None

        # 4. Cache Evaluation
        if not force_refresh and cache_key in self._cache:
            cached_data, fresh_until, stale_until, cached_statuses = self._cache[cache_key]
            if now < fresh_until:
                is_cached = True
                freshness = FacilityFreshness.CACHED
                category_statuses = cached_statuses
                # Recalculate straight-line distances from exact GPS coordinates
                recalculated: list[FacilityModel] = []
                for fac in cached_data:
                    dist_m = haversine_distance_meters(lat, lon, fac.latitude, fac.longitude)
                    dist_km = haversine_distance_km(lat, lon, fac.latitude, fac.longitude)
                    recalculated.append(
                        fac.model_copy(
                            update={
                                "straight_line_distance_meters": dist_m,
                                "distance_km": dist_km,
                                "distance_formatted": format_straight_line_distance(dist_m),
                            }
                        )
                    )
                facilities = recalculated
            elif now < stale_until:
                stale_candidate = (cached_data, cached_statuses)
            else:
                del self._cache[cache_key]

        # 5. Fetch from External Providers if not cached
        if not is_cached:
            try:
                fetched_places, cat_reports = await self._execute_provider_pipeline(
                    lat=lat, lon=lon, radius_m=clamped_radius, categories=parsed_cats, client=client
                )
                all_failed = (
                    all(rep.status in ("UNAVAILABLE", "TIMEOUT") for rep in cat_reports.values())
                    if cat_reports
                    else True
                )

                if all_failed and stale_candidate:
                    is_cached = True
                    freshness = FacilityFreshness.STALE
                    facilities, category_statuses = stale_candidate
                else:
                    facilities = fetched_places
                    category_statuses = cat_reports
                    # Populate cache
                    self._cache[cache_key] = (
                        facilities,
                        now + FRESH_CACHE_TTL_SECONDS,
                        now + STALE_CACHE_TTL_SECONDS,
                        category_statuses,
                    )

            except Exception as exc:
                logger.warning(f"[Orchestrator] Fetch pipeline failed: {exc}")
                if stale_candidate:
                    is_cached = True
                    freshness = FacilityFreshness.STALE
                    facilities, category_statuses = stale_candidate
                else:
                    facilities = []
                    freshness = FacilityFreshness.UNAVAILABLE

        # 6. Merge Civil Defense Verified Shelters (Level 1)
        if include_verified_shelters and FacilityCategory.SAFE_PLACE in parsed_cats:
            try:
                verified_shelters, sh_status = await self.shelter_provider.fetch_verified_shelters(
                    lat=lat, lon=lon, radius_m=clamped_radius, db=db
                )
                if verified_shelters:
                    facilities.extend(verified_shelters)
                    # Update SAFE_PLACE category status report
                    existing_sp = category_statuses.get(FacilityCategory.SAFE_PLACE.value)
                    sp_count = (existing_sp.count if existing_sp else 0) + len(verified_shelters)
                    category_statuses[FacilityCategory.SAFE_PLACE.value] = CategoryStatusReport(
                        category=FacilityCategory.SAFE_PLACE,
                        status="OK",
                        count=sp_count,
                        provider_used="Salvus Civil Defense Network",
                    )
            except Exception as sh_err:
                logger.debug(f"[Orchestrator] Verified shelter merge skipped: {sh_err}")

        # 7. Deduplicate overlapping facilities
        deduped = deduplicate_facilities(facilities)

        # 8. LOCAL DISTANCE VALIDATION: Strict <= 10,000m filter
        valid_facilities: list[FacilityModel] = []
        for fac in deduped:
            dist_m = haversine_distance_meters(lat, lon, fac.latitude, fac.longitude)
            if dist_m <= clamped_radius:
                # Ensure straight-line distance fields are populated accurately
                dist_km = haversine_distance_km(lat, lon, fac.latitude, fac.longitude)
                valid_facilities.append(
                    fac.model_copy(
                        update={
                            "straight_line_distance_meters": dist_m,
                            "distance_km": dist_km,
                            "distance_formatted": format_straight_line_distance(dist_m),
                        }
                    )
                )

        # 9. Emergency Multi-Factor Ranking
        ranked = rank_facilities(valid_facilities, safe_places_priority=safe_places_priority)

        # 10. Determine Response State (AVAILABLE, PARTIAL_RESULTS, NO_RESULTS, UNAVAILABLE, STALE)
        if freshness == FacilityFreshness.STALE:
            response_state = FacilityResponseState.STALE
        elif not category_statuses:
            response_state = FacilityResponseState.UNAVAILABLE
        else:
            statuses_list = [rep.status for rep in category_statuses.values()]
            all_unavailable = all(s in ("UNAVAILABLE", "TIMEOUT") for s in statuses_list)
            any_unavailable = any(s in ("UNAVAILABLE", "TIMEOUT") for s in statuses_list)

            if all_unavailable and len(ranked) == 0:
                response_state = FacilityResponseState.UNAVAILABLE
                freshness = FacilityFreshness.UNAVAILABLE
            elif any_unavailable:
                response_state = FacilityResponseState.PARTIAL_RESULTS
                freshness = FacilityFreshness.PARTIAL
            elif len(ranked) == 0:
                response_state = FacilityResponseState.NO_RESULTS
            else:
                response_state = FacilityResponseState.AVAILABLE

        return ranked, is_cached, freshness, response_state, category_statuses
