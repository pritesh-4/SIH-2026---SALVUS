"""MIME validation, magic-byte inspection, file size, and dimension parsing for attachments."""

from __future__ import annotations

import hashlib
import os
import re
import struct

# Supported MIME types strictly required for emergency photo evidence
ALLOWED_IMAGE_MIMES = frozenset(
    {
        "image/jpeg",
        "image/png",
        "image/webp",
    }
)

# Default limits
DEFAULT_MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024  # 5 MB
DEFAULT_MAX_ATTACHMENTS_PER_INCIDENT = 3


def get_max_attachment_size_bytes() -> int:
    """Retrieve maximum permitted file size in bytes from environment."""
    try:
        val = int(os.getenv("MAX_ATTACHMENT_SIZE_BYTES", str(DEFAULT_MAX_FILE_SIZE_BYTES)))
        return val if val > 0 else DEFAULT_MAX_FILE_SIZE_BYTES
    except (ValueError, TypeError):
        return DEFAULT_MAX_FILE_SIZE_BYTES


def get_max_attachments_per_incident() -> int:
    """Retrieve maximum attachments per incident limit from environment."""
    try:
        val = int(
            os.getenv("MAX_ATTACHMENTS_PER_INCIDENT", str(DEFAULT_MAX_ATTACHMENTS_PER_INCIDENT))
        )
        return val if val > 0 else DEFAULT_MAX_ATTACHMENTS_PER_INCIDENT
    except (ValueError, TypeError):
        return DEFAULT_MAX_ATTACHMENTS_PER_INCIDENT


def sanitize_filename(filename: str | None) -> str:
    """Sanitize original client filename to prevent path traversal and shell injection."""
    if not filename or not filename.strip():
        return "attachment.jpg"

    # Strip directory paths
    base = os.path.basename(filename.replace("\\", "/"))
    # Remove control characters and unsafe symbols
    cleaned = re.sub(r"[^\w\.\-_]", "_", base)
    # Strip leading dots to prevent hidden files
    cleaned = cleaned.lstrip(".")
    if not cleaned:
        cleaned = "attachment.jpg"
    return cleaned[:120]


def detect_image_mime(file_bytes: bytes) -> str | None:
    """Inspect binary magic bytes to determine genuine image format.

    Never trusts client Content-Type headers alone.
    """
    if len(file_bytes) < 12:
        return None

    # 1. JPEG signature: FF D8 FF
    if file_bytes.startswith(b"\xff\xd8\xff"):
        return "image/jpeg"

    # 2. PNG signature: 89 50 4E 47 0D 0A 1A 0A
    if file_bytes.startswith(b"\x89PNG\r\n\x1a\n"):
        return "image/png"

    # 3. WebP signature: RIFF....WEBP
    if file_bytes[:4] == b"RIFF" and file_bytes[8:12] == b"WEBP":
        return "image/webp"

    return None


def extract_image_dimensions(file_bytes: bytes, mime_type: str) -> tuple[int | None, int | None]:
    """Extract pixel width and height safely from image header bytes."""
    try:
        if mime_type == "image/png":
            # PNG IHDR chunk: 4B length + 4B 'IHDR' + 8B width/height
            if len(file_bytes) >= 24 and file_bytes[12:16] == b"IHDR":
                width, height = struct.unpack(">II", file_bytes[16:24])
                return width, height

        elif mime_type == "image/jpeg":
            # Scan JPEG markers for Start Of Frame (SOF)
            offset = 2
            size = len(file_bytes)
            while offset < size - 8:
                if file_bytes[offset] != 0xFF:
                    offset += 1
                    continue
                marker = file_bytes[offset + 1]
                # SOF0 (baseline), SOF1 (extended), SOF2 (progressive), SOF3 (lossless)
                if marker in (
                    0xC0,
                    0xC1,
                    0xC2,
                    0xC3,
                    0xC5,
                    0xC6,
                    0xC7,
                    0xC9,
                    0xCA,
                    0xCB,
                    0xCD,
                    0xCE,
                    0xCF,
                ):
                    # length (2 bytes), precision (1 byte), height (2 bytes), width (2 bytes)
                    height, width = struct.unpack(">HH", file_bytes[offset + 5 : offset + 9])
                    return width, height
                else:
                    # Skip segment length
                    if offset + 4 <= size:
                        segment_len = struct.unpack(">H", file_bytes[offset + 2 : offset + 4])[0]
                        offset += 2 + segment_len
                    else:
                        break

        elif mime_type == "image/webp":
            if len(file_bytes) >= 30:
                chunk_type = file_bytes[12:16]
                if chunk_type == b"VP8 " and len(file_bytes) >= 30:
                    # Lossy VP8
                    if file_bytes[23:26] == b"\x9d\x01\x2a":
                        width = struct.unpack("<H", file_bytes[26:28])[0] & 0x3FFF
                        height = struct.unpack("<H", file_bytes[28:30])[0] & 0x3FFF
                        return width, height
                elif chunk_type == b"VP8L" and len(file_bytes) >= 25:
                    # Lossless VP8L
                    if file_bytes[20] == 0x2F:
                        b0, b1, b2, b3 = file_bytes[21:25]
                        width = 1 + (((b1 & 0x3F) << 8) | b0)
                        height = 1 + (((b3 & 0xF) << 10) | (b2 << 2) | ((b1 & 0xC0) >> 6))
                        return width, height
                elif chunk_type == b"VP8X" and len(file_bytes) >= 30:
                    # Extended VP8X
                    width = 1 + struct.unpack("<I", file_bytes[24:27] + b"\x00")[0]
                    height = 1 + struct.unpack("<I", file_bytes[27:30] + b"\x00")[0]
                    return width, height

    except Exception:
        pass

    return None, None


def validate_image_file(
    file_bytes: bytes,
    filename: str,
    declared_content_type: str | None = None,
) -> tuple[str, str, int, int | None, int | None, str]:
    """Validate photo attachment payload and return sanitized metadata.

    Returns:
        tuple of (sanitized_filename, verified_mime, size_bytes, width, height, sha256_checksum)

    Raises:
        ValueError with specific error detail if validation fails.
    """
    if not file_bytes:
        raise ValueError("Attachment file payload is empty (0 bytes).")

    size_bytes = len(file_bytes)
    max_size = get_max_attachment_size_bytes()
    if size_bytes > max_size:
        max_mb = max_size / (1024 * 1024)
        actual_mb = size_bytes / (1024 * 1024)
        raise ValueError(
            f"Image file size ({actual_mb:.2f}MB) exceeds maximum limit of {max_mb:.1f}MB."
        )

    # Magic byte inspection
    detected_mime = detect_image_mime(file_bytes)
    if not detected_mime or detected_mime not in ALLOWED_IMAGE_MIMES:
        raise ValueError("Unsupported file format. Only JPEG, PNG, and WebP images are permitted.")

    # Optional cross-check against declared content-type
    if declared_content_type and declared_content_type.lower() in ALLOWED_IMAGE_MIMES:
        # If both are valid image types, use detected_mime as authoritative
        pass

    sanitized_name = sanitize_filename(filename)
    width, height = extract_image_dimensions(file_bytes, detected_mime)
    checksum = hashlib.sha256(file_bytes).hexdigest()

    return sanitized_name, detected_mime, size_bytes, width, height, checksum
