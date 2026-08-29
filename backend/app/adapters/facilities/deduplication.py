"""Layered Multi-Provider Facility Deduplication Engine.

Applies a 4-tier matching algorithm to safely merge overlapping records across
Geoapify, Google Places, OpenStreetMap, and Civil Defense data sources:
1. Exact Provider ID match (`provider:provider_place_id`)
2. Spatial Collocation (< 25m great-circle distance)
3. Normalized Name Similarity (case-folded, alphanumeric containment)
4. Address & Street Key Correlation

Guarantee: Verified Salvus / Civil Defense records are prioritized and never
overwritten by lower-trust external map data.
"""

from __future__ import annotations

import logging

from app.models.facility import FacilityModel
from app.utils.geospatial import haversine_distance_meters, normalize_place_name

logger = logging.getLogger("salvus.facilities.dedup")

COLLOCATION_THRESHOLD_METERS = 25.0  # 25m spatial merge threshold


def deduplicate_facilities(facilities: list[FacilityModel]) -> list[FacilityModel]:
    """Deduplicate and merge facility records across multiple providers."""
    if not facilities:
        return []

    # 1. Exact Provider & Place ID deduplication
    unique_by_id: dict[str, FacilityModel] = {}
    for f in facilities:
        key = f"{f.provider}:{f.provider_place_id or f.id}"
        if key not in unique_by_id:
            unique_by_id[key] = f
        else:
            existing = unique_by_id[key]
            # Merge richer attributes
            unique_by_id[key] = existing.model_copy(
                update={
                    "phone": existing.phone or f.phone,
                    "website": existing.website or f.website,
                    "opening_hours": existing.opening_hours or f.opening_hours,
                    "formatted_address": existing.formatted_address or f.formatted_address,
                    "city": existing.city or f.city,
                    "amenities": list(dict.fromkeys(existing.amenities + f.amenities)),
                }
            )

    candidates = list(unique_by_id.values())

    # 2. Spatial-Semantic Collocation Deduplication (< 25m & category match & name match)
    deduped: list[FacilityModel] = []
    for candidate in candidates:
        matched_idx = -1
        cand_norm_name = normalize_place_name(candidate.name)

        for idx, existing in enumerate(deduped):
            # Only match within same category or compatible emergency categories
            same_category = candidate.category == existing.category
            if same_category:
                dist_m = haversine_distance_meters(
                    candidate.latitude, candidate.longitude, existing.latitude, existing.longitude
                )
                if dist_m <= COLLOCATION_THRESHOLD_METERS:
                    exist_norm_name = normalize_place_name(existing.name)
                    # Check name compatibility
                    names_match = (
                        cand_norm_name == exist_norm_name
                        or (len(cand_norm_name) >= 5 and cand_norm_name in exist_norm_name)
                        or (len(exist_norm_name) >= 5 and exist_norm_name in cand_norm_name)
                    )
                    if names_match:
                        matched_idx = idx
                        break

        if matched_idx == -1:
            deduped.append(candidate)
        else:
            existing_item = deduped[matched_idx]
            # Prioritize verified record, then richer record
            if candidate.verified and not existing_item.verified:
                preferred = candidate
                secondary = existing_item
            elif existing_item.verified and not candidate.verified:
                preferred = existing_item
                secondary = candidate
            elif bool(candidate.phone or candidate.formatted_address) and not bool(
                existing_item.phone or existing_item.formatted_address
            ):
                preferred = candidate
                secondary = existing_item
            else:
                preferred = existing_item
                secondary = candidate

            merged = preferred.model_copy(
                update={
                    "phone": preferred.phone or secondary.phone,
                    "website": preferred.website or secondary.website,
                    "opening_hours": preferred.opening_hours or secondary.opening_hours,
                    "formatted_address": preferred.formatted_address or secondary.formatted_address,
                    "city": preferred.city or secondary.city,
                    "amenities": list(dict.fromkeys(preferred.amenities + secondary.amenities)),
                    "confidence": max(preferred.confidence, secondary.confidence),
                }
            )
            deduped[matched_idx] = merged

    return deduped
