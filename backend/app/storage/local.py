"""Local filesystem storage provider for Salvus development and testing environments."""

from __future__ import annotations

import os
import uuid

from app.storage.base import ObjectStorageProvider, StorageUploadResult
from app.storage.validation import validate_image_file

DEFAULT_LOCAL_STORAGE_DIR = os.path.join(
    os.path.dirname(os.path.dirname(os.path.dirname(__file__))), "data", "uploads"
)


class LocalStorageProvider(ObjectStorageProvider):
    """Stores files on the local filesystem for development and testing."""

    def __init__(self, base_dir: str | None = None):
        self.base_dir = os.path.abspath(
            base_dir or os.getenv("STORAGE_LOCAL_DIR") or DEFAULT_LOCAL_STORAGE_DIR
        )
        os.makedirs(self.base_dir, exist_ok=True)

    def _resolve_path(self, storage_key: str) -> str:
        """Resolve full path and verify it stays inside base_dir to guard against traversal."""
        normalized_key = os.path.normpath(storage_key.replace("\\", "/")).lstrip("/\\")
        full_path = os.path.abspath(os.path.join(self.base_dir, normalized_key))
        # Ensure path is strictly within base_dir
        if os.path.commonpath([self.base_dir, full_path]) != self.base_dir:
            raise ValueError(f"Path traversal detected for storage key: {storage_key}")
        return full_path

    async def upload(
        self,
        file_bytes: bytes,
        filename: str,
        mime_type: str,
        folder: str = "incidents",
    ) -> StorageUploadResult:
        """Persist binary image file to local storage and return metadata."""
        sanitized_name, verified_mime, size_bytes, width, height, checksum = validate_image_file(
            file_bytes, filename, declared_content_type=mime_type
        )

        unique_id = uuid.uuid4().hex
        ext = os.path.splitext(sanitized_name)[1] or (
            ".jpg" if verified_mime == "image/jpeg" else ".png"
        )
        storage_key = f"{folder}/{unique_id}{ext}"

        dest_path = self._resolve_path(storage_key)
        os.makedirs(os.path.dirname(dest_path), exist_ok=True)

        with open(dest_path, "wb") as f:
            f.write(file_bytes)

        access_url = await self.get_access_url(storage_key)
        thumbnail_url = self.get_transformed_url(storage_key)

        return StorageUploadResult(
            storage_key=storage_key,
            secure_url=access_url,
            size_bytes=size_bytes,
            mime_type=verified_mime,
            checksum=checksum,
            width=width,
            height=height,
            thumbnail_url=thumbnail_url,
        )

    async def delete(self, storage_key: str) -> bool:
        """Delete file from local disk."""
        try:
            target_path = self._resolve_path(storage_key)
            if os.path.exists(target_path):
                os.remove(target_path)
            return True
        except Exception:
            return False

    async def get_access_url(self, storage_key: str) -> str:
        """Return standardized relative access endpoint for local file serving."""
        normalized_key = storage_key.replace("\\", "/")
        return f"/api/attachments/raw/{normalized_key}"

    def get_transformed_url(
        self,
        storage_key: str,
        width: int = 400,
        height: int = 300,
        crop: str = "fill",
    ) -> str:
        """Return standard local access URL."""
        normalized_key = storage_key.replace("\\", "/")
        return f"/api/attachments/raw/{normalized_key}"
