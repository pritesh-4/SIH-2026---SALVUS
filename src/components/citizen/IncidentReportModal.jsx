import { useState, useEffect, useCallback, useRef } from 'react'
import { createIncident } from '../../services/api'
import { getCurrentLocation, LANDMARKS } from '../../lib/location'
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
  const [draft] = useState(getSavedDraft)
  const [step, setStep] = useState(1) // 1: Select Type, 2: Details & Location, 3: Success Confirmation
  const [category, setCategory] = useState(() => draft?.category || 'flood')
  const [severity, setSeverity] = useState(() => draft?.severity || 'HIGH')
  const [description, setDescription] = useState(() => draft?.description || '')
  const [reporterName, setReporterName] = useState(() => draft?.reporterName || '')
  const [reporterPhone, setReporterPhone] = useState(() => draft?.reporterPhone || '')
  const [affectedCount, setAffectedCount] = useState(() => draft?.affectedCount || 1)
  const [photoAttached, setPhotoAttached] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [submissionError, setSubmissionError] = useState(null)
  const [createdIncident, setCreatedIncident] = useState(null)

  // Geolocation state
  const [locationData, setLocationData] = useState({
    latitude: 22.5726,
    longitude: 88.3639,
    accuracy: 'Detecting...',
    coordinates: '22.5726° N, 88.3639° E',
    address: 'Sector 12 Community Hub',
    status: 'ACQUIRING',
  })
  const [isAcquiringLocation, setIsAcquiringLocation] = useState(false)
  const [selectedLandmarkName, setSelectedLandmarkName] = useState(LANDMARKS[0].name)
  const reportModalRef = useRef(null)

  const handleResetAndClose = useCallback(() => {
    setStep(1)
    setPhotoAttached(false)
    setIsSubmitting(false)
    setSubmissionError(null)
    setCreatedIncident(null)
    onClose?.()
  }, [onClose])

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

  const fetchLocation = useCallback(async () => {
    setIsAcquiringLocation(true)
    const loc = await getCurrentLocation()
    setLocationData({
      latitude: loc.latitude,
      longitude: loc.longitude,
      accuracy: loc.accuracy || 'Standard accuracy',
      coordinates: loc.coordinates,
      address: loc.address || 'Detected Location',
      status: loc.status || (loc.success ? 'ACTIVE' : 'FALLBACK'),
      error: loc.error,
    })
    setIsAcquiringLocation(false)
  }, [])

  useEffect(() => {
    if (!isOpen) return
    let isMounted = true

    getCurrentLocation().then((loc) => {
      if (!isMounted) return
      setLocationData({
        latitude: loc.latitude,
        longitude: loc.longitude,
        accuracy: loc.accuracy || 'Standard accuracy',
        coordinates: loc.coordinates,
        address: loc.address || 'Detected Location',
        status: loc.status || (loc.success ? 'ACTIVE' : 'FALLBACK'),
        error: loc.error,
      })
      setIsAcquiringLocation(false)
    })

    return () => {
      isMounted = false
    }
  }, [isOpen])

  const handleSelectLandmark = (e) => {
    const name = e.target.value
    setSelectedLandmarkName(name)
    const found = LANDMARKS.find((l) => l.name === name)
    if (found) {
      setLocationData({
        latitude: found.latitude,
        longitude: found.longitude,
        accuracy: 'Manual Confirmation',
        coordinates: `${found.latitude.toFixed(4)}° N, ${found.longitude.toFixed(4)}° E`,
        address: found.address,
        status: 'MANUAL_CONFIRMED',
      })
    }
  }

  const categories = [
    { id: 'flood', label: 'Flash Flood / Deep Water', icon: '🌊', type: 'flood' },
    { id: 'hazard', label: 'Blocked Road / Debris', icon: '🚧', type: 'hazard' },
    { id: 'power_line', label: 'Downed Power Lines', icon: '⚡', type: 'power_line' },
    { id: 'structural', label: 'Structural Hazard', icon: '🏚️', type: 'structural' },
    { id: 'medical', label: 'Medical Assistance', icon: '🚑', type: 'medical' },
    { id: 'fire', label: 'Fire / Chemical Hazard', icon: '🔥', type: 'fire' },
  ]

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (isSubmitting) return

    setIsSubmitting(true)
    setSubmissionError(null)

    const selectedCat = categories.find((c) => c.id === category)
    const incidentType = selectedCat?.type || 'flood'

    const result = await createIncident({
      type: incidentType,
      severity: severity.toUpperCase(),
      description:
        description.trim() ||
        `${selectedCat?.label || 'Hazard'} reported at ${locationData.address || locationData.coordinates}`,
      reporter_name: reporterName.trim() || 'Community Member',
      reporter_phone: reporterPhone.trim() || null,
      latitude: locationData.latitude,
      longitude: locationData.longitude,
      affected_count: Math.max(1, Number(affectedCount) || 1),
      is_sos: false,
    })

    setIsSubmitting(false)

    if (result.success && result.data) {
      setCreatedIncident(result.data)
      setStep(3)
      try {
        sessionStorage.removeItem(DRAFT_STORAGE_KEY)
      } catch {
        // Ignore storage error
      }
    } else {
      setSubmissionError(
        result.error?.message ||
          'Unable to submit hazard report. Please check connection and try again.'
      )
    }
  }

  if (!isOpen) return null

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="report-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-xs animate-fadeIn"
      onClick={(e) => {
        if (e.target === e.currentTarget) {
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
          className="absolute top-5 right-5 text-salvus-text-muted hover:text-salvus-text-primary text-base font-bold p-1 cursor-pointer select-none"
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
            <div className="flex items-center gap-2 mb-1">
              <Badge variant="neutral">Step 2 of 2</Badge>
            </div>
            <h2
              id="report-modal-title"
              className="text-xl font-bold text-salvus-text-primary tracking-tight mt-1"
            >
              Hazard Details & Location
            </h2>

            {submissionError && (
              <div className="bg-salvus-critical-bg border border-salvus-critical-border rounded-xl p-3 text-xs text-salvus-critical flex items-center justify-between">
                <span>{submissionError}</span>
                <Button variant="critical" size="sm" onClick={handleSubmit}>
                  Retry
                </Button>
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
                  <span>📍</span>
                  <span>Detected Location</span>
                </span>
                <Badge variant="safe" size="sm">
                  {isAcquiringLocation ? 'Locating...' : 'GPS Active'}
                </Badge>
              </div>

              <div className="bg-salvus-surface p-2.5 rounded-lg border border-salvus-border space-y-1">
                <div className="text-salvus-text-primary font-medium text-xs">
                  {locationData.address}
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

              {/* Landmark Selection */}
              <div>
                <label
                  htmlFor="landmark-select"
                  className="text-xs font-semibold text-salvus-text-secondary block mb-1"
                >
                  Or Select Nearest Landmark:
                </label>
                <select
                  id="landmark-select"
                  value={selectedLandmarkName}
                  onChange={handleSelectLandmark}
                  className="w-full bg-salvus-surface border border-salvus-border rounded-lg p-2 text-xs text-salvus-text-primary focus:outline-none focus:border-salvus-info cursor-pointer"
                >
                  {LANDMARKS.map((lm) => (
                    <option key={lm.name} value={lm.name}>
                      {lm.name} ({lm.address})
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex items-center justify-between pt-2 border-t border-salvus-border">
                <span className="text-salvus-text-secondary">Attach Photo:</span>
                <button
                  type="button"
                  onClick={() => setPhotoAttached((prev) => !prev)}
                  className={`px-3 py-1 rounded-lg text-xs font-bold transition-colors cursor-pointer ${
                    photoAttached
                      ? 'bg-salvus-safe-bg text-salvus-safe-text border border-salvus-safe-border'
                      : 'bg-salvus-surface border border-salvus-border text-salvus-text-secondary hover:text-salvus-text-primary'
                  }`}
                >
                  {photoAttached ? '✓ Photo Attached' : '📷 Add Photo'}
                </button>
              </div>
            </div>

            {/* Actions */}
            <div className="flex items-center justify-between pt-4 border-t border-salvus-border">
              <Button variant="quiet" size="md" onClick={() => setStep(1)} disabled={isSubmitting}>
                ← Back
              </Button>
              <Button variant="primary" size="md" type="submit" loading={isSubmitting}>
                {isSubmitting ? 'Submitting Report...' : 'Submit Hazard Report'}
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
              <strong className="text-salvus-text-primary">
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
