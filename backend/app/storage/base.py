"""Abstract base classes and dataclasses for Salvus object storage."""

from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass


@dataclass(frozen=True)
class StorageUploadResult:
    """Standardized metadata result returned by storage providers after file upload."""

    storage_key: str
    secure_url: str
    size_bytes: int
    mime_type: str
    checksum: str
    width: int | None = None
    height: int | None = None
    thumbnail_url: str | None = None


class ObjectStorageProvider(ABC):
    """Abstract interface defining durable object storage capabilities."""

    @abstractmethod
    async def upload(
        self,
        file_bytes: bytes,
        filename: str,
        mime_type: str,
        folder: str = "incidents",
    ) -> StorageUploadResult:
        """Upload raw binary bytes to the object storage provider."""
        ...

    @abstractmethod
    async def delete(self, storage_key: str) -> bool:
        """Delete an object from storage by its key/public ID."""
        ...

    @abstractmethod
    async def get_access_url(self, storage_key: str) -> str:
        """Retrieve a secure public or signed access URL for the stored object."""
        ...

    @abstractmethod
    def get_transformed_url(
        self,
        storage_key: str,
        width: int = 400,
        height: int = 300,
        crop: str = "fill",
    ) -> str:
        """Construct a display derivative URL (e.g. thumbnail or optimized size)."""
        ...
