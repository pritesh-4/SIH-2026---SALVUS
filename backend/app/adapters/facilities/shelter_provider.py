"""Safe Places & Evacuation Shelter Provider (3-Tier Trust Model).

Implements the multi-level trust model for emergency evacuation infrastructure:
- LEVEL 1: Officially designated & audited Salvus Civil Defense shelters (DB-grounded)
- LEVEL 2: Official municipal / authority disaster response centers
- LEVEL 3: Mapped facilities explicitly confirmed for emergency evacuation use

Rule: Generic commercial venues or unverified buildings must NEVER be presented
as official emergency evacuation shelters.
"""

from __future__ import annotations

import logging
from datetime import UTC, datetime

import aiosqlite

from app.models.facility import (
    FacilityCategory,
    FacilityModel,
    SafePlaceDetails,
    SafePlaceTrustLevel,
)
from app.utils.geospatial import (
    format_straight_line_distance,
    haversine_distance_km,
    haversine_distance_meters,
    is_within_strict_radius,
    normalize_phone_number,
)

logger = logging.getLogger("salvus.facilities.shelter")


class VerifiedShelterFacilityAdapter:
    """Safe Places adapter applying the 3-tier emergency trust hierarchy."""

    def __init__(self, db: aiosqlite.Connection | None = None):
        self.db = db

    async def fetch_verified_shelters(
        self,
        lat: float,
        lon: float,
        radius_m: int,
        db: aiosqlite.Connection | None = None,
    ) -> tuple[list[FacilityModel], str]:
        """Query official Salvus Civil Defense verified shelters from database."""
        target_db = db or self.db
        if target_db is None:
            try:
                from app.db import get_database

                target_db = await get_database()
            except Exception as exc:
                logger.warning(f"[ShelterProvider] Database connection failed: {exc}")
                return [], "UNAVAILABLE"

        clamped_radius = min(10000, max(100, radius_m))
        now_iso = datetime.now(UTC).isoformat()
        facilities: list[FacilityModel] = []

        try:
            from app.services import shelter_service

            verified_list = await shelter_service.get_all_shelters(target_db)

            for sh in verified_list:
                if sh.latitude is None or sh.longitude is None:
                    continue

                is_active = getattr(sh, "is_active", True)
                if not is_active:
                    continue

                if is_within_strict_radius(lat, lon, sh.latitude, sh.longitude, clamped_radius):
                    dist_m = haversine_distance_meters(lat, lon, sh.latitude, sh.longitude)
                    dist_km = haversine_distance_km(lat, lon, sh.latitude, sh.longitude)

                    phone = normalize_phone_number(getattr(sh, "contact_phone", None))
                    amenities = getattr(sh, "amenities", []) or []

                    shelter_details = SafePlaceDetails(
                        designation_type="Official Civil Defense Evacuation Center",
                        verification_level=SafePlaceTrustLevel.LEVEL_1_SALVUS_VERIFIED,
                        source_authority="Salvus Civil Defense Network",
                        emergency_use_confirmed=True,
                        total_capacity=getattr(sh, "total_beds", None),
                        available_beds=getattr(sh, "available_beds", None),
                        occupancy_rate=getattr(sh, "occupancy_rate", None),
                        supplies_status=getattr(sh, "supplies_status", "ADEQUATE"),
                        is_safe=True,
                        safety_status="SAFE",
                    )

                    facilities.append(
                        FacilityModel(
                            id=f"salvus-shelter-{sh.id}",
                            provider="salvus_civil_defense",
                            provider_place_id=str(sh.id),
                            category=FacilityCategory.SAFE_PLACE,
                            subcategory="Evacuation Center",
                            name=sh.name,
                            latitude=sh.latitude,
                            longitude=sh.longitude,
                            straight_line_distance_meters=dist_m,
                            distance_km=dist_km,
                            distance_formatted=format_straight_line_distance(dist_m),
                            formatted_address=sh.address,
                            city=None,
                            phone=phone,
                            website=None,
                            opening_hours="24/7 Emergency Operation",
                            open_now=True,
                            verified=True,
                            confidence=1.0,
                            amenities=amenities,
                            safe_place_details=shelter_details,
                            fetched_at=now_iso,
                            raw_source_metadata={
                                "shelter_id": sh.id,
                                "status": getattr(sh, "status", "OPEN"),
                            },
                        )
                    )

            status = "OK" if facilities else "EMPTY"
            return facilities, status

        except Exception as exc:
            logger.warning(f"[ShelterProvider] Failed to fetch verified shelters: {exc}")
            return [], "UNAVAILABLE"
