import { useState, useEffect, useCallback, useRef } from 'react'
import { createIncident, uploadIncidentAttachment } from '../../services/api'
import { useLocation } from '../../hooks/useLocation'
import {
  getCurrentLocation,
  createLandmarkLocation,
  LANDMARKS,
  INITIAL_LOCATION_STATE,
} from '../../lib/location'
import { loadNearbyLandmarks } from '../../services/placesService'
import { validateAttachmentFile, formatFileSize, revokePreviewUrl } from '../../lib/attachmentUtils'
import { Badge } from '../ui/Badge'
import { Button } from '../ui/Button'
import { Input, Textarea, FormField } from '../ui/Input'

const DRAFT_STORAGE_KEY = 'salvus_draft_incident_report'

const getSavedDraft = () => {
  try {
    const saved = sessionStorage.getItem(DRAFT_STORAGE_KEY)
    if (saved) return JSON.parse(saved)
  } catch {
    // Ignore storage parse error
  }
  return null
}

export const IncidentReportModal = ({ isOpen, onClose }) => {
  const { location: globalLocation } = useLocation()

  const [draft] = useState(getSavedDraft)
  const [step, setStep] = useState(1) // 1: Select Type, 2: Details & Location, 3: Success Confirmation
  const [category, setCategory] = useState(() => draft?.category || 'flood')
  const [severity, setSeverity] = useState(() => draft?.severity || 'HIGH')
  const [description, setDescription] = useState(() => draft?.description || '')
  const [reporterName, setReporterName] = useState(() => draft?.reporterName || '')
  const [reporterPhone, setReporterPhone] = useState(() => draft?.reporterPhone || '')
  const [affectedCount, setAffectedCount] = useState(() => draft?.affectedCount || 1)

  // Normalized photo attachment state
  const [selectedPhoto, setSelectedPhoto] = useState(null)
  const [previewUrl, setPreviewUrl] = useState(null)
  const [photoValidationError, setPhotoValidationError] = useState(null)
  const [photoUploadError, setPhotoUploadError] = useState(null)
  const [submissionPhase, setSubmissionPhase] = useState('IDLE')
  // 'IDLE' | 'CREATING_REPORT' | 'UPLOADING_PHOTO' | 'FINALIZING' | 'SUCCESS' | 'PHOTO_FAILED' | 'ERROR'

  const [submissionError, setSubmissionError] = useState(null)
  const [createdIncident, setCreatedIncident] = useState(null)

  // Local Geolocation state for modal
  const [locationData, setLocationData] = useState(() => {
    if (globalLocation && globalLocation.latitude) {
      return globalLocation
    }
    return INITIAL_LOCATION_STATE
  })
  const [isAcquiringLocation, setIsAcquiringLocation] = useState(false)
  const [selectedLandmarkName, setSelectedLandmarkName] = useState('')

  // Dynamic Nearby Landmarks Discovery State
  const [nearbyLandmarks, setNearbyLandmarks] = useState([])
  const [isLoadingLandmarks, setIsLoadingLandmarks] = useState(false)
  const [landmarksError, setLandmarksError] = useState(null)
  const [selectedLandmarkId, setSelectedLandmarkId] = useState('')
  const landmarkSeqRef = useRef(0)

  const reportModalRef = useRef(null)
  const fileInputRef = useRef(null)

  // Revoke preview URL on unmount or URL replacement
  useEffect(() => {
    return () => {
      revokePreviewUrl(previewUrl)
    }
  }, [previewUrl])

  const handleResetAndClose = useCallback(() => {
    revokePreviewUrl(previewUrl)
    setPreviewUrl(null)
    setSelectedPhoto(null)
    setPhotoValidationError(null)
    setPhotoUploadError(null)
    setNearbyLandmarks([])
    setSelectedLandmarkId('')
    setSelectedLandmarkName('')
    setStep(1)
    setSubmissionPhase('IDLE')
    setSubmissionError(null)
    setCreatedIncident(null)
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
    onClose?.()
  }, [onClose, previewUrl])

  // Escape key & body scroll lock
  useEffect(() => {
    if (!isOpen) return
    const originalOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    if (reportModalRef.current) reportModalRef.current.focus()

    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        handleResetAndClose()
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      document.body.style.overflow = originalOverflow
    }
  }, [isOpen, handleResetAndClose])

  // Save safe textual draft only (never persist image binaries in sessionStorage)
  useEffect(() => {
    if (step < 3) {
      try {
        sessionStorage.setItem(
          DRAFT_STORAGE_KEY,
          JSON.stringify({
            category,
            severity,
            description,
            reporterName,
            reporterPhone,
            affectedCount,
          })
        )
      } catch {
        // Ignore session storage errors
      }
    }
  }, [category, severity, description, reporterName, reporterPhone, affectedCount, step])

  // Fetch real-world dynamic landmarks for specific GPS coordinates
  const fetchLandmarksForLocation = useCallback(async (lat, lon) => {
    if (typeof lat !== 'number' || typeof lon !== 'number' || isNaN(lat) || isNaN(lon)) {
      return
    }

    const currentSeq = ++landmarkSeqRef.current
    setIsLoadingLandmarks(true)
    setLandmarksError(null)

    try {
      const res = await loadNearbyLandmarks({
        latitude: lat,
        longitude: lon,
        radius: 3000,
        maxResults: 15,
      })

      // Guard against out-of-order responses
      if (currentSeq !== landmarkSeqRef.current) return

      if (res.success) {
        setNearbyLandmarks(res.landmarks || [])
        setLandmarksError(null)
      } else {
        setNearbyLandmarks([])
        setLandmarksError(res.error || 'Nearby landmarks are temporarily unavailable.')
      }
    } catch {
      if (currentSeq !== landmarkSeqRef.current) return
      setNearbyLandmarks([])
      setLandmarksError('Failed to load nearby landmarks.')
    } finally {
      if (currentSeq === landmarkSeqRef.current) {
        setIsLoadingLandmarks(false)
      }
    }
  }, [])

  // Trigger landmark lookup asynchronously whenever location coordinates change
  useEffect(() => {
    if (
      isOpen &&
      locationData.latitude != null &&
      locationData.longitude != null &&
      !locationData.isFallback &&
      locationData.source === 'BROWSER'
    ) {
      const timer = setTimeout(() => {
        fetchLandmarksForLocation(locationData.latitude, locationData.longitude)
      }, 0)
      return () => clearTimeout(timer)
    }
  }, [
    isOpen,
    locationData.latitude,
    locationData.longitude,
    locationData.isFallback,
    locationData.source,
    fetchLandmarksForLocation,
  ])

  const fetchLocation = useCallback(async () => {
    setIsAcquiringLocation(true)
    const result = await getCurrentLocation({ timeout: 8000, force: true })
    if (result.success && result.model) {
      setLocationData(result.model)
      setSelectedLandmarkId('')
      setSelectedLandmarkName('')
    } else if (selectedLandmarkName) {
      const found = LANDMARKS.find((l) => l.name === selectedLandmarkName)
      if (found) {
        setLocationData(createLandmarkLocation(found, 'DENIED'))
      }
    }
    setIsAcquiringLocation(false)
  }, [selectedLandmarkName])

  useEffect(() => {
    if (!isOpen) return

    if (globalLocation?.latitude && globalLocation?.source === 'BROWSER') {
      return
    }

    const timer = setTimeout(() => {
      fetchLocation()
    }, 0)

    return () => {
      clearTimeout(timer)
    }
  }, [isOpen, globalLocation, fetchLocation])

  const handleSelectLandmark = (e) => {
    const val = e.target.value
    setSelectedLandmarkId(val)

    if (!val || val === 'none') {
      setSelectedLandmarkName('')
      return
    }

    // In GPS mode: select from real dynamic nearbyLandmarks without replacing GPS coordinates
    if (locationData.source === 'BROWSER' && !locationData.isFallback) {
      const found = nearbyLandmarks.find((lm) => lm.id === val)
      if (found) {
        setSelectedLandmarkName(found.name)
        // Note: locationData.latitude and locationData.longitude remain the user's exact GPS coordinates
      }
    } else {
      // In Fallback mode: select from static LANDMARKS to establish approximate manual location
      const found = LANDMARKS.find((l) => l.name === val)
      if (found) {
        setSelectedLandmarkName(found.name)
        setLocationData(createLandmarkLocation(found, locationData.permission || 'DENIED'))
      }
    }
  }

  // Handle Photo selection from native file / camera picker
  const handleFileSelect = (e) => {
    const file = e.target.files?.[0]
    if (!file) return

    const validation = validateAttachmentFile(file)
    if (!validation.valid) {
      setPhotoValidationError(validation.error)
      if (fileInputRef.current) fileInputRef.current.value = ''
      return
    }

    setPhotoValidationError(null)
    setPhotoUploadError(null)

    // Revoke previous object URL if any
    revokePreviewUrl(previewUrl)

    const objectUrl = URL.createObjectURL(file)
    setPreviewUrl(objectUrl)
    setSelectedPhoto(file)
  }

  // Remove photo selection
  const handleRemovePhoto = () => {
    revokePreviewUrl(previewUrl)
    setPreviewUrl(null)
    setSelectedPhoto(null)
    setPhotoValidationError(null)
    setPhotoUploadError(null)
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  const categories = [
    {
      id: 'flood',
      label: 'Flash Flood / Deep Water',
      icon: '🌊',
      type: 'flood',
    },
    {
      id: 'hazard',
      label: 'Blocked Road / Debris',
      icon: '🚧',
      type: 'hazard',
    },
    {
      id: 'power_line',
      label: 'Downed Power Lines',
      icon: '⚡',
      type: 'power_line',
    },
    {
      id: 'structural',
      label: 'Structural Hazard',
      icon: '🏚️',
      type: 'structural',
    },
    {
      id: 'medical',
      label: 'Medical Assistance',
      icon: '🚑',
      type: 'medical',
    },
    { id: 'fire', label: 'Fire / Chemical Hazard', icon: '🔥', type: 'fire' },
  ]

  // Submit hazard report and orchestrate evidence photo upload
  const handleSubmit = async (e) => {
    e.preventDefault()
    if (submissionPhase === 'CREATING_REPORT' || submissionPhase === 'UPLOADING_PHOTO') {
      return
    }

    setSubmissionError(null)
    setPhotoUploadError(null)

    if (locationData.latitude == null || locationData.longitude == null) {
      setSubmissionPhase('ERROR')
      setSubmissionError(
        'Location access is required to submit a hazard report. Please enable device GPS or select an approximate landmark.'
      )
      return
    }

    const selectedCat = categories.find((c) => c.id === category)
    const incidentType = selectedCat?.type || 'flood'

    const selectedLm = nearbyLandmarks.find((lm) => lm.id === selectedLandmarkId)
    let incidentDescription = description.trim()
    if (!incidentDescription) {
      incidentDescription = selectedLm
        ? `${selectedCat?.label || 'Hazard'} reported near ${selectedLm.name} (${selectedLm.distanceFormatted})`
        : `${selectedCat?.label || 'Hazard'} reported at ${locationData.address || locationData.coordinates}`
    } else if (selectedLm && !incidentDescription.includes(selectedLm.name)) {
      incidentDescription = `${incidentDescription}\n[Reference Landmark: ${selectedLm.name} (${selectedLm.distanceFormatted})]`
    }

    // Step 1: Create incident record
    let incident = createdIncident
    if (!incident) {
      setSubmissionPhase('CREATING_REPORT')
      const result = await createIncident({
        type: incidentType,
        severity: severity.toUpperCase(),
        description: incidentDescription,
        reporter_name: reporterName.trim() || 'Community Member',
        reporter_phone: reporterPhone.trim() || null,
        latitude: locationData.latitude,
        longitude: locationData.longitude,
        affected_count: Math.max(1, Number(affectedCount) || 1),
        is_sos: false,
      })

      if (!result.success || !result.data) {
        setSubmissionPhase('ERROR')
        setSubmissionError(
          result.error?.message ||
            'Unable to submit hazard report. Please check connection and try again.'
        )
        return
      }

      incident = result.data
      setCreatedIncident(incident)
    }

    // Step 2: If a photo is attached, upload it
    if (selectedPhoto) {
      setSubmissionPhase('UPLOADING_PHOTO')
      const uploadResult = await uploadIncidentAttachment(incident.id, selectedPhoto)

      if (!uploadResult.success) {
        setSubmissionPhase('PHOTO_FAILED')
        setPhotoUploadError(
          uploadResult.error?.message ||
            'Photo could not be uploaded due to a storage or network error.'
        )
        return
      }
    }

    // Step 3: Complete report submission
    setSubmissionPhase('SUCCESS')
    setStep(3)
    try {
      sessionStorage.removeItem(DRAFT_STORAGE_KEY)
    } catch {
      // Ignore storage error
    }
  }

  // Retry photo upload after partial failure
  const handleRetryPhotoUpload = async () => {
    if (!createdIncident || !selectedPhoto) return

    setSubmissionPhase('UPLOADING_PHOTO')
    setPhotoUploadError(null)

    const uploadResult = await uploadIncidentAttachment(createdIncident.id, selectedPhoto)

    if (uploadResult.success) {
      setSubmissionPhase('SUCCESS')
      setStep(3)
      try {
        sessionStorage.removeItem(DRAFT_STORAGE_KEY)
      } catch {
        // Ignore storage error
      }
    } else {
      setSubmissionPhase('PHOTO_FAILED')
      setPhotoUploadError(
        uploadResult.error?.message ||
          'Photo could not be uploaded due to a storage or network error.'
      )
    }
  }

  // Proceed to success if user chooses not to retry photo upload
  const handleContinueWithoutPhoto = () => {
    setSubmissionPhase('SUCCESS')
    setStep(3)
    try {
      sessionStorage.removeItem(DRAFT_STORAGE_KEY)
    } catch {
      // Ignore storage error
    }
  }

  if (!isOpen) return null

  const isSubmitting =
    submissionPhase === 'CREATING_REPORT' || submissionPhase === 'UPLOADING_PHOTO'

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="report-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-xs animate-fadeIn"
      onClick={(e) => {
        if (e.target === e.currentTarget && !isSubmitting) {
          handleResetAndClose()
        }
      }}
    >
      <div
        ref={reportModalRef}
        tabIndex={-1}
        className="bg-salvus-surface border border-salvus-border rounded-2xl max-w-lg w-full p-6 sm:p-7 shadow-2xl relative max-h-[90vh] overflow-y-auto text-salvus-text-primary outline-none"
      >
        {/* Close Button */}
        <button
          type="button"
          onClick={handleResetAndClose}
          disabled={isSubmitting}
          className="absolute top-5 right-5 text-salvus-text-muted hover:text-salvus-text-primary text-base font-bold p-1 cursor-pointer select-none disabled:opacity-50"
          aria-label="Close modal"
        >
          ✕
        </button>

        {step === 1 && (
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Badge variant="neutral">Step 1 of 2</Badge>
            </div>
            <h2
              id="report-modal-title"
              className="text-xl font-bold text-salvus-text-primary tracking-tight mt-1"
            >
              Report a Hazard
            </h2>
            <p className="text-xs text-salvus-text-secondary mt-1">
              Select the type of hazard to notify nearby residents and emergency coordinators.
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 my-5">
              {categories.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setCategory(c.id)}
                  className={`p-3.5 rounded-xl border text-left transition-all cursor-pointer flex items-center gap-3 ${
                    category === c.id
                      ? 'bg-salvus-surface-elevated border-salvus-text-primary text-salvus-text-primary shadow-xs ring-1 ring-salvus-text-primary'
                      : 'bg-salvus-muted/40 border-salvus-border text-salvus-text-secondary hover:border-salvus-border-strong hover:text-salvus-text-primary'
                  }`}
                >
                  <span className="text-2xl" aria-hidden="true">
                    {c.icon}
                  </span>
                  <span className="text-xs font-bold">{c.label}</span>
                </button>
              ))}
            </div>

            <div className="flex items-center justify-between pt-4 border-t border-salvus-border">
              <Button variant="quiet" size="md" onClick={handleResetAndClose}>
                Cancel
              </Button>
              <Button
                variant="primary"
                size="md"
                onClick={() => setStep(2)}
                rightIcon={<span aria-hidden="true">→</span>}
              >
                Continue to Details
              </Button>
            </div>
          </div>
        )}

        {step === 2 && (
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Hidden native camera / file input */}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              capture="environment"
              className="hidden"
              aria-label="Select or capture incident evidence photo"
              onChange={handleFileSelect}
            />

            <div className="flex items-center gap-2 mb-1">
              <Badge variant="neutral">Step 2 of 2</Badge>
            </div>
            <h2
              id="report-modal-title"
              className="text-xl font-bold text-salvus-text-primary tracking-tight mt-1"
            >
              Hazard Details & Location
            </h2>

            {/* General Submission Error */}
            {submissionError && (
              <div className="bg-salvus-critical-bg border border-salvus-critical-border rounded-xl p-3 text-xs text-salvus-critical flex items-center justify-between gap-2">
                <span>{submissionError}</span>
                <Button variant="critical" size="sm" onClick={handleSubmit} type="button">
                  Retry
                </Button>
              </div>
            )}

            {/* Partial Failure: Incident created, but photo upload failed */}
            {submissionPhase === 'PHOTO_FAILED' && (
              <div className="bg-salvus-warning-bg border border-salvus-warning-border rounded-xl p-3.5 space-y-2 text-xs text-salvus-warning-text animate-fadeIn">
                <div className="font-bold flex items-center gap-1.5">
                  <span>⚠️</span>
                  <span>Report submitted, but photo upload failed</span>
                </div>
                <p className="text-[11px] leading-relaxed text-salvus-text-secondary">
                  Your incident report{' '}
                  <strong className="text-salvus-text-primary font-mono">
                    #{createdIncident?.ticket_id || 'SV-1001'}
                  </strong>{' '}
                  has been saved, but the photo could not be attached: {photoUploadError}
                </p>
                <div className="flex items-center gap-2 pt-1">
                  <Button
                    variant="warning"
                    size="sm"
                    type="button"
                    onClick={handleRetryPhotoUpload}
                  >
                    ↻ Retry Photo Upload
                  </Button>
                  <Button
                    variant="quiet"
                    size="sm"
                    type="button"
                    onClick={handleContinueWithoutPhoto}
                  >
                    Continue without photo →
                  </Button>
                </div>
              </div>
            )}

            {/* Severity Level */}
            <div>
              <label className="text-xs font-semibold text-salvus-text-primary block mb-1.5">
                Severity Level
              </label>
              <div className="grid grid-cols-4 gap-2">
                {[
                  { id: 'LOW', label: 'Low', variant: 'neutral' },
                  { id: 'MEDIUM', label: 'Medium', variant: 'info' },
                  { id: 'HIGH', label: 'High', variant: 'warning' },
                  { id: 'CRITICAL', label: 'Critical', variant: 'critical' },
                ].map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => setSeverity(s.id)}
                    className={`py-2 px-1 rounded-lg border text-xs font-bold transition-all cursor-pointer text-center ${
                      severity === s.id
                        ? 'bg-salvus-surface-elevated border-salvus-text-primary text-salvus-text-primary shadow-xs ring-1 ring-salvus-text-primary'
                        : 'bg-salvus-muted/40 border-salvus-border text-salvus-text-muted hover:text-salvus-text-primary'
                    }`}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Description */}
            <FormField
              id="incident-desc"
              label="Description & What You See"
              caption="Draft is auto-saved locally"
            >
              <Textarea
                id="incident-desc"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="E.g., Rising floodwater on main road. Power lines down near tree."
                rows={3}
                required
              />
            </FormField>

            {/* Photo Attachment Section */}
            <div className="bg-salvus-muted/40 border border-salvus-border rounded-xl p-3.5 space-y-2.5 text-xs">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-salvus-text-primary flex items-center gap-1.5">
                  <span aria-hidden="true">📷</span>
                  <span>Photo Evidence (Optional)</span>
                </span>
                {selectedPhoto && (
                  <Badge variant="safe" size="sm">
                    Photo Attached
                  </Badge>
                )}
              </div>

              {/* Inline Photo Validation Error */}
              {photoValidationError && (
                <div className="bg-salvus-critical-bg border border-salvus-critical-border rounded-lg p-2 text-[11px] text-salvus-critical flex items-center justify-between gap-2 animate-fadeIn">
                  <span>{photoValidationError}</span>
                  <button
                    type="button"
                    onClick={() => setPhotoValidationError(null)}
                    className="text-salvus-critical font-bold text-xs p-1 cursor-pointer"
                    aria-label="Dismiss error"
                  >
                    ✕
                  </button>
                </div>
              )}

              {/* Photo Preview Card OR Add Photo Trigger */}
              {selectedPhoto && previewUrl ? (
                <div className="bg-salvus-surface border border-salvus-border p-2 rounded-lg flex items-center justify-between gap-3 animate-fadeIn">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <img
                      src={previewUrl}
                      alt="Incident evidence preview"
                      className="w-12 h-12 rounded-lg object-cover border border-salvus-border shrink-0"
                    />
                    <div className="min-w-0">
                      <span className="text-salvus-text-primary font-semibold text-xs block truncate">
                        {selectedPhoto.name}
                      </span>
                      <span className="text-salvus-text-muted text-[11px] block font-mono">
                        {formatFileSize(selectedPhoto.size)}
                      </span>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={handleRemovePhoto}
                    disabled={isSubmitting}
                    className="text-salvus-critical hover:underline text-xs font-semibold px-2 py-1 cursor-pointer shrink-0 disabled:opacity-50"
                    aria-label="Remove attached photo"
                  >
                    ✕ Remove
                  </button>
                </div>
              ) : (
                <div>
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={isSubmitting}
                    className="w-full py-2.5 px-3 rounded-lg border border-dashed border-salvus-border-strong hover:border-salvus-text-primary bg-salvus-surface/80 hover:bg-salvus-surface text-salvus-text-secondary hover:text-salvus-text-primary transition-all cursor-pointer flex items-center justify-center gap-2 text-xs font-semibold disabled:opacity-50"
                  >
                    <span aria-hidden="true">📸</span>
                    <span>Add photo or take picture</span>
                  </button>
                  <span className="text-[10px] text-salvus-text-muted mt-1 block text-center">
                    Accepts JPEG, PNG, or WebP up to 5 MB
                  </span>
                </div>
              )}
            </div>

            {/* Reporter info */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <FormField id="reporter-name" label="Your Name (Optional)">
                <Input
                  id="reporter-name"
                  type="text"
                  value={reporterName}
                  onChange={(e) => setReporterName(e.target.value)}
                  placeholder="E.g., Aditi Roy"
                />
              </FormField>

              <FormField id="reporter-phone" label="Phone (Optional)">
                <Input
                  id="reporter-phone"
                  type="tel"
                  value={reporterPhone}
                  onChange={(e) => setReporterPhone(e.target.value)}
                  placeholder="+91 98301 24890"
                />
              </FormField>

              <FormField id="affected-count" label="People (Est.)">
                <Input
                  id="affected-count"
                  type="number"
                  min="1"
                  max="500"
                  value={affectedCount}
                  onChange={(e) => setAffectedCount(e.target.value)}
                />
              </FormField>
            </div>

            {/* Location Confirmation Box */}
            <div className="bg-salvus-muted/40 border border-salvus-border rounded-xl p-3.5 space-y-3 text-xs">
              <div className="flex items-center justify-between">
                <span className="font-bold text-salvus-text-primary flex items-center gap-1.5">
                  <span aria-hidden="true">📍</span>
                  <span>
                    {locationData.source === 'LANDMARK' || locationData.isFallback
                      ? 'Landmark Fallback'
                      : 'Detected Location'}
                  </span>
                </span>
                <Badge
                  variant={
                    locationData.source === 'LANDMARK' || locationData.isFallback
                      ? 'warning'
                      : 'safe'
                  }
                  size="sm"
                >
                  {isAcquiringLocation
                    ? 'Locating...'
                    : locationData.source === 'LANDMARK' || locationData.isFallback
                      ? 'APPROXIMATE LOCATION'
                      : locationData.accuracyLabel || 'GPS Active'}
                </Badge>
              </div>

              <div className="bg-salvus-surface p-2.5 rounded-lg border border-salvus-border space-y-1">
                <div className="text-salvus-text-primary font-medium text-xs">
                  {locationData.address || locationData.landmarkName}
                </div>
                <div className="text-[11px] text-salvus-text-muted flex items-center justify-between">
                  <span>{locationData.coordinates}</span>
                  <button
                    type="button"
                    onClick={fetchLocation}
                    disabled={isAcquiringLocation}
                    className="text-salvus-info hover:underline font-semibold cursor-pointer disabled:opacity-50"
                  >
                    {isAcquiringLocation ? 'Acquiring...' : '↺ Refresh'}
                  </button>
                </div>
              </div>

              {/* Landmark Selection (Dynamic Real-World GPS or Manual Fallback) */}
              {locationData.source === 'BROWSER' && !locationData.isFallback ? (
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label
                      htmlFor="landmark-select"
                      className="text-xs font-semibold text-salvus-text-secondary block"
                    >
                      Nearby Landmark (Optional Reference):
                    </label>
                    {isLoadingLandmarks && (
                      <span className="text-[11px] text-salvus-info animate-pulse">
                        Searching nearby places...
                      </span>
                    )}
                  </div>

                  <select
                    id="landmark-select"
                    value={selectedLandmarkId}
                    onChange={handleSelectLandmark}
                    disabled={isLoadingLandmarks && nearbyLandmarks.length === 0}
                    className="w-full bg-salvus-surface border border-salvus-border rounded-lg p-2 text-xs text-salvus-text-primary focus:outline-none focus:border-salvus-info cursor-pointer disabled:opacity-60"
                  >
                    <option value="">📍 Current GPS Location (No landmark reference)</option>

                    {isLoadingLandmarks && nearbyLandmarks.length === 0 && (
                      <option value="" disabled>
                        🔄 Searching nearby landmarks...
                      </option>
                    )}

                    {landmarksError && nearbyLandmarks.length === 0 && (
                      <option value="" disabled>
                        ⚠️ Nearby landmarks unavailable
                      </option>
                    )}

                    {!isLoadingLandmarks && !landmarksError && nearbyLandmarks.length === 0 && (
                      <option value="" disabled>
                        No recognizable landmarks found within 3 km
                      </option>
                    )}

                    {nearbyLandmarks.map((lm) => (
                      <option key={lm.id} value={lm.id}>
                        {lm.name} — {lm.distanceFormatted} ({lm.categoryLabel})
                      </option>
                    ))}
                  </select>
                  <p className="text-[11px] text-salvus-text-muted mt-1">
                    {selectedLandmarkId && selectedLandmarkName
                      ? `Selected reference: ${selectedLandmarkName}. Your exact device GPS coordinates are preserved.`
                      : 'Exact GPS coordinates will be submitted as the primary incident location.'}
                  </p>
                </div>
              ) : (
                <div>
                  <label
                    htmlFor="landmark-select"
                    className="text-xs font-semibold text-salvus-text-secondary block mb-1"
                  >
                    Select Approximate Sector Landmark (GPS Inactive):
                  </label>
                  <select
                    id="landmark-select"
                    value={selectedLandmarkName}
                    onChange={handleSelectLandmark}
                    className="w-full bg-salvus-surface border border-salvus-border rounded-lg p-2 text-xs text-salvus-text-primary focus:outline-none focus:border-salvus-info cursor-pointer"
                  >
                    <option value="" disabled>
                      Choose an approximate landmark...
                    </option>
                    {LANDMARKS.map((lm) => (
                      <option key={lm.name} value={lm.name}>
                        {lm.name} ({lm.address})
                      </option>
                    ))}
                  </select>
                  <p className="text-[11px] text-salvus-warning-text mt-1">
                    ⚠️ Location access is off. Landmark coordinates will be used as an approximate
                    area estimate.
                  </p>
                </div>
              )}
            </div>

            {/* Actions */}
            <div className="flex items-center justify-between pt-4 border-t border-salvus-border">
              <Button variant="quiet" size="md" onClick={() => setStep(1)} disabled={isSubmitting}>
                ← Back
              </Button>
              <Button
                variant="primary"
                size="md"
                type="submit"
                loading={isSubmitting}
                disabled={isSubmitting}
              >
                {submissionPhase === 'CREATING_REPORT'
                  ? 'Submitting Report...'
                  : submissionPhase === 'UPLOADING_PHOTO'
                    ? 'Uploading Photo...'
                    : 'Submit Hazard Report'}
              </Button>
            </div>
          </form>
        )}

        {step === 3 && (
          <div className="text-center py-4 space-y-4">
            <div className="h-14 w-14 rounded-full bg-salvus-safe-bg border border-salvus-safe-border text-salvus-safe text-2xl mx-auto flex items-center justify-center">
              ✓
            </div>
            <h2 className="text-2xl font-bold text-salvus-text-primary tracking-tight">
              Hazard Report Received
            </h2>
            <p className="text-xs sm:text-sm text-salvus-text-secondary max-w-sm mx-auto leading-relaxed">
              Report ticket{' '}
              <strong className="text-salvus-text-primary font-mono">
                #{createdIncident?.ticket_id || 'SV-1001'}
              </strong>{' '}
              has been shared with coordinators and added to the local safety map. Thank you for
              protecting your neighbors.
            </p>

            <div className="bg-salvus-muted/40 border border-salvus-border rounded-xl p-3.5 text-left text-xs space-y-1.5 max-w-sm mx-auto">
              <div className="flex justify-between text-salvus-text-secondary">
                <span>Hazard Type:</span>
                <span className="text-salvus-text-primary font-bold uppercase">
                  {createdIncident?.type || category}
                </span>
              </div>
              <div className="flex justify-between text-salvus-text-secondary">
                <span>Severity:</span>
                <span className="text-salvus-critical font-bold">
                  {createdIncident?.severity || severity}
                </span>
              </div>
              <div className="flex justify-between text-salvus-text-secondary">
                <span>Photo Evidence:</span>
                <span className="text-salvus-text-primary font-semibold">
                  {selectedPhoto && submissionPhase === 'SUCCESS' ? '✓ Attached' : 'None provided'}
                </span>
              </div>
              <div className="flex justify-between text-salvus-text-secondary">
                <span>Status:</span>
                <span className="text-salvus-safe font-semibold">Logged Live</span>
              </div>
            </div>

            <div className="pt-4 border-t border-salvus-border">
              <Button variant="secondary" size="lg" fullWidth={true} onClick={handleResetAndClose}>
                Return to Citizen Home
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default IncidentReportModal
