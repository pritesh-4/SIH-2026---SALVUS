"""Health check route."""

from fastapi import APIRouter

router = APIRouter()


@router.get("/health")
async def health_check():
    """Minimal structured health check."""
    return {
        "status": "healthy",
        "service": "Salvus API",
        "version": "0.1.0",
    }
