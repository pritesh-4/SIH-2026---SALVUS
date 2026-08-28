"""Storage abstraction and providers package for Salvus."""

from app.storage.base import ObjectStorageProvider, StorageUploadResult
from app.storage.cloudinary import CloudinaryStorageProvider
from app.storage.factory import get_storage_provider, set_storage_provider
from app.storage.local import LocalStorageProvider
from app.storage.s3 import S3StorageProvider
from app.storage.validation import (
    ALLOWED_IMAGE_MIMES,
    get_max_attachment_size_bytes,
    get_max_attachments_per_incident,
    sanitize_filename,
    validate_image_file,
)

__all__ = [
    "ObjectStorageProvider",
    "StorageUploadResult",
    "LocalStorageProvider",
    "CloudinaryStorageProvider",
    "S3StorageProvider",
    "get_storage_provider",
    "set_storage_provider",
    "ALLOWED_IMAGE_MIMES",
    "get_max_attachment_size_bytes",
    "get_max_attachments_per_incident",
    "sanitize_filename",
    "validate_image_file",
]
