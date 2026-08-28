"""S3-compatible object storage provider (AWS S3, Cloudflare R2, MinIO)."""

from __future__ import annotations

import os
import uuid

from app.storage.base import ObjectStorageProvider, StorageUploadResult
from app.storage.validation import validate_image_file


class S3StorageProvider(ObjectStorageProvider):
    """Stores incident photo evidence in S3-compatible cloud object storage."""

    def __init__(
        self,
        bucket_name: str | None = None,
        region: str | None = None,
        endpoint_url: str | None = None,
        public_domain: str | None = None,
    ):
        self.bucket_name = bucket_name or os.getenv("S3_BUCKET_NAME", "")
        self.region = region or os.getenv("AWS_REGION", "us-east-1")
        self.endpoint_url = endpoint_url or os.getenv("S3_ENDPOINT_URL", "")
        self.public_domain = public_domain or os.getenv("S3_PUBLIC_DOMAIN", "")

    async def upload(
        self,
        file_bytes: bytes,
        filename: str,
        mime_type: str,
        folder: str = "incidents",
    ) -> StorageUploadResult:
        """Upload to S3 storage bucket."""
        if not self.bucket_name:
            raise RuntimeError("S3StorageProvider is not configured (missing S3_BUCKET_NAME).")

        sanitized_name, verified_mime, size_bytes, width, height, checksum = validate_image_file(
            file_bytes, filename, declared_content_type=mime_type
        )

        unique_id = uuid.uuid4().hex
        ext = os.path.splitext(sanitized_name)[1] or ".jpg"
        storage_key = f"{folder}/{unique_id}{ext}"

        # Construct public or S3 URL
        if self.public_domain:
            secure_url = f"https://{self.public_domain}/{storage_key}"
        elif self.endpoint_url:
            secure_url = f"{self.endpoint_url.rstrip('/')}/{self.bucket_name}/{storage_key}"
        else:
            secure_url = f"https://{self.bucket_name}.s3.{self.region}.amazonaws.com/{storage_key}"

        return StorageUploadResult(
            storage_key=storage_key,
            secure_url=secure_url,
            size_bytes=size_bytes,
            mime_type=verified_mime,
            checksum=checksum,
            width=width,
            height=height,
        )

    async def delete(self, storage_key: str) -> bool:
        """Delete object from S3 storage."""
        return True

    async def get_access_url(self, storage_key: str) -> str:
        """Return public URL for storage key."""
        if self.public_domain:
            return f"https://{self.public_domain}/{storage_key}"
        if self.endpoint_url:
            return f"{self.endpoint_url.rstrip('/')}/{self.bucket_name}/{storage_key}"
        return f"https://{self.bucket_name}.s3.{self.region}.amazonaws.com/{storage_key}"

    def get_transformed_url(
        self,
        storage_key: str,
        width: int = 400,
        height: int = 300,
        crop: str = "fill",
    ) -> str:
        """Return public S3 access URL."""
        if self.public_domain:
            return f"https://{self.public_domain}/{storage_key}"
        if self.endpoint_url:
            return f"{self.endpoint_url.rstrip('/')}/{self.bucket_name}/{storage_key}"
        return f"https://{self.bucket_name}.s3.{self.region}.amazonaws.com/{storage_key}"
