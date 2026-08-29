"""Salvus Facility Adapters and Orchestration Package."""

from app.adapters.facilities.base import BaseFacilityProvider
from app.adapters.facilities.deduplication import deduplicate_facilities
from app.adapters.facilities.geoapify_provider import GeoapifyFacilityProvider
from app.adapters.facilities.google_places_provider import GooglePlacesFacilityProvider
from app.adapters.facilities.orchestrator import FacilityOrchestrator, rank_facilities
from app.adapters.facilities.osm_provider import OSMFacilityProvider
from app.adapters.facilities.shelter_provider import VerifiedShelterFacilityAdapter

__all__ = [
    "BaseFacilityProvider",
    "FacilityOrchestrator",
    "GeoapifyFacilityProvider",
    "GooglePlacesFacilityProvider",
    "OSMFacilityProvider",
    "VerifiedShelterFacilityAdapter",
    "deduplicate_facilities",
    "rank_facilities",
]
