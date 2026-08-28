/**
 * Photo attachment helper utilities for Salvus incident reports.
 *
 * Provides client-side validation, human-readable size formatting,
 * and safe blob object URL lifecycle management.
 */

export const MAX_PHOTO_SIZE_BYTES = 5 * 1024 * 1024 // 5 MB

export const ALLOWED_IMAGE_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp']

export const ALLOWED_IMAGE_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.webp']

/**
 * Validate a candidate file selected for incident photo evidence.
 *
 * @param {File|null} file
 * @returns {{ valid: boolean, error: string | null }}
 */
export const validateAttachmentFile = (file) => {
  if (!file) {
    return { valid: false, error: 'No file selected.' }
  }

  // 1. File size check
  if (file.size > MAX_PHOTO_SIZE_BYTES) {
    const formattedMax = formatFileSize(MAX_PHOTO_SIZE_BYTES)
    const formattedActual = formatFileSize(file.size)
    return {
      valid: false,
      error: `Photo is too large (${formattedActual}). Maximum allowed size is ${formattedMax}.`,
    }
  }

  // 2. MIME type check
  const mime = (file.type || '').toLowerCase()
  const name = (file.name || '').toLowerCase()
  const hasValidExt = ALLOWED_IMAGE_EXTENSIONS.some((ext) => name.endsWith(ext))
  const hasValidMime = ALLOWED_IMAGE_MIME_TYPES.includes(mime)

  if (!hasValidMime && !hasValidExt) {
    return {
      valid: false,
      error: 'Unsupported photo format. Please select a JPEG, PNG, or WebP photo.',
    }
  }

  return { valid: true, error: null }
}

/**
 * Format a byte count into a human-readable string (e.g. "450 KB", "1.8 MB").
 *
 * @param {number} bytes
 * @returns {string}
 */
export const formatFileSize = (bytes) => {
  if (typeof bytes !== 'number' || isNaN(bytes) || bytes < 0) {
    return '0 B'
  }
  if (bytes < 1024) {
    return `${bytes} B`
  }
  if (bytes < 1024 * 1024) {
    return `${Math.round(bytes / 1024)} KB`
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

/**
 * Safely revoke a Blob Object URL to prevent browser memory leaks.
 *
 * @param {string|null} url
 */
export const revokePreviewUrl = (url) => {
  if (url && typeof url === 'string' && url.startsWith('blob:')) {
    try {
      URL.revokeObjectURL(url)
    } catch {
      // Ignore cleanup error if already revoked or not supported
    }
  }
}
