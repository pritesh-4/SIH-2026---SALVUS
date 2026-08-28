"""Durable Cloudinary object storage provider for production and hackathon deployments."""

from __future__ import annotations

import hashlib
import os
import time
from urllib.parse import urlparse

import httpx

from app.storage.base import ObjectStorageProvider, StorageUploadResult
from app.storage.validation import validate_image_file


class CloudinaryStorageProvider(ObjectStorageProvider):
    """Stores incident photo evidence durably in Cloudinary cloud object storage."""

    def __init__(
        self,
        cloud_name: str | None = None,
        api_key: str | None = None,
        api_secret: str | None = None,
        upload_preset: str | None = None,
    ):
        # Allow CLOUDINARY_URL connection string parsing
        cloudinary_url = os.getenv("CLOUDINARY_URL", "").strip()
        parsed_cloud = None
        parsed_key = None
        parsed_secret = None

        if cloudinary_url and cloudinary_url.startswith("cloudinary://"):
            try:
                parsed = urlparse(cloudinary_url)
                parsed_cloud = parsed.hostname
                parsed_key = parsed.username
                parsed_secret = parsed.password
            except Exception:
                pass

        self.cloud_name = cloud_name or os.getenv("CLOUDINARY_CLOUD_NAME") or parsed_cloud or ""
        self.api_key = api_key or os.getenv("CLOUDINARY_API_KEY") or parsed_key or ""
        self.api_secret = api_secret or os.getenv("CLOUDINARY_API_SECRET") or parsed_secret or ""
        self.upload_preset = upload_preset or os.getenv("CLOUDINARY_UPLOAD_PRESET") or ""

    @property
    def is_configured(self) -> bool:
        return bool(self.cloud_name and (self.upload_preset or (self.api_key and self.api_secret)))

    def _generate_signature(self, params: dict[str, str]) -> str:
        """Generate Cloudinary SHA-1 API signature from sorted parameters."""
        sorted_keys = sorted(params.keys())
        to_sign = "&".join(f"{k}={params[k]}" for k in sorted_keys if params[k] is not None)
        to_sign += self.api_secret
        return hashlib.sha1(to_sign.encode("utf-8")).hexdigest()

    async def upload(
        self,
        file_bytes: bytes,
        filename: str,
        mime_type: str,
        folder: str = "salvus_incidents",
    ) -> StorageUploadResult:
        """Upload image to Cloudinary via REST API."""
        if not self.cloud_name:
            raise RuntimeError(
                "CloudinaryStorageProvider is not configured (missing CLOUDINARY_CLOUD_NAME)."
            )

        sanitized_name, verified_mime, size_bytes, width, height, checksum = validate_image_file(
            file_bytes, filename, declared_content_type=mime_type
        )

        upload_url = f"https://api.cloudinary.com/v1_1/{self.cloud_name}/image/upload"
        timestamp = str(int(time.time()))

        data_fields: dict[str, str] = {
            "folder": folder,
            "timestamp": timestamp,
        }

        # Use signed upload if API key & secret are provided, otherwise unsigned upload preset
        if self.api_key and self.api_secret:
            data_fields["api_key"] = self.api_key
            data_fields["signature"] = self._generate_signature(
                {
                    "folder": folder,
                    "timestamp": timestamp,
                }
            )
        elif self.upload_preset:
            data_fields["upload_preset"] = self.upload_preset
        else:
            raise RuntimeError(
                "Cloudinary upload requires either CLOUDINARY_API_KEY & SECRET or UPLOAD_PRESET."
            )

        files = {
            "file": (sanitized_name, file_bytes, verified_mime),
        }

        try:
            async with httpx.AsyncClient(timeout=20.0) as client:
                resp = await client.post(upload_url, data=data_fields, files=files)
        except httpx.TimeoutException as e:
            raise RuntimeError("Cloudinary upload timed out after 20 seconds.") from e
        except httpx.RequestError as e:
            raise RuntimeError(f"Cloudinary network connection failed: {str(e)}") from e

        if resp.status_code >= 400:
            error_msg = f"Cloudinary upload failed (HTTP {resp.status_code}): {resp.text}"
            raise RuntimeError(error_msg)

        try:
            result = resp.json()
        except Exception as e:
            raise RuntimeError(f"Cloudinary returned invalid JSON response: {str(e)}") from e

        public_id = result.get("public_id", "")
        secure_url = result.get("secure_url") or result.get("url") or ""
        resp_width = result.get("width") or width
        resp_height = result.get("height") or height
        thumbnail_url = self.get_transformed_url(public_id, width=400, height=300, crop="fill")

        return StorageUploadResult(
            storage_key=public_id,
            secure_url=secure_url,
            size_bytes=size_bytes,
            mime_type=verified_mime,
            checksum=checksum,
            width=resp_width,
            height=resp_height,
            thumbnail_url=thumbnail_url,
        )

    async def delete(self, storage_key: str) -> bool:
        """Delete an image from Cloudinary by public ID."""
        if not self.cloud_name or not self.api_key or not self.api_secret:
            return False

        destroy_url = f"https://api.cloudinary.com/v1_1/{self.cloud_name}/image/destroy"
        timestamp = str(int(time.time()))

        params = {
            "public_id": storage_key,
            "timestamp": timestamp,
        }
        signature = self._generate_signature(params)

        payload = {
            "public_id": storage_key,
            "timestamp": timestamp,
            "api_key": self.api_key,
            "signature": signature,
        }

        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                resp = await client.post(destroy_url, data=payload)
                return resp.status_code == 200
        except Exception:
            return False

    async def get_access_url(self, storage_key: str) -> str:
        """Construct secure public HTTPS Cloudinary image delivery URL."""
        if storage_key.startswith("http://") or storage_key.startswith("https://"):
            return storage_key
        return f"https://res.cloudinary.com/{self.cloud_name}/image/upload/{storage_key}"

    def get_transformed_url(
        self,
        storage_key: str,
        width: int = 400,
        height: int = 300,
        crop: str = "fill",
    ) -> str:
        """Construct a Cloudinary display derivative URL with auto quality and format."""
        if not self.cloud_name or not storage_key:
            return ""
        clean_key = (
            storage_key.split("/image/upload/")[-1]
            if "/image/upload/" in storage_key
            else storage_key
        )
        return (
            f"https://res.cloudinary.com/{self.cloud_name}/image/upload/"
            f"c_{crop},g_auto,w_{width},h_{height},q_auto,f_auto/{clean_key}"
        )
