"""Storage provider factory and lifecycle manager."""

from __future__ import annotations

import os

from app.storage.base import ObjectStorageProvider
from app.storage.cloudinary import CloudinaryStorageProvider
from app.storage.local import LocalStorageProvider
from app.storage.s3 import S3StorageProvider

_provider_instance: ObjectStorageProvider | None = None


def get_storage_provider() -> ObjectStorageProvider:
    """Retrieve or initialize the active storage provider based on environment configuration."""
    global _provider_instance
    if _provider_instance is not None:
        return _provider_instance

    provider_name = os.getenv("STORAGE_PROVIDER", "local").strip().lower()

    if provider_name == "cloudinary":
        provider = CloudinaryStorageProvider()
        if provider.is_configured:
            _provider_instance = provider
            print(f"[STORAGE] Initialized CloudinaryStorageProvider (cloud={provider.cloud_name})")
            return _provider_instance
        print("[STORAGE] Cloudinary not fully configured. Falling back to LocalStorageProvider.")

    elif provider_name == "s3":
        _provider_instance = S3StorageProvider()
        print("[STORAGE] Initialized S3StorageProvider")
        return _provider_instance

    # Default to LocalStorageProvider
    _provider_instance = LocalStorageProvider()
    print(f"[STORAGE] Initialized LocalStorageProvider (base_dir={_provider_instance.base_dir})")
    return _provider_instance


def set_storage_provider(provider: ObjectStorageProvider | None) -> None:
    """Explicitly set or override the storage provider (primarily for unit tests and mocks)."""
    global _provider_instance
    _provider_instance = provider
