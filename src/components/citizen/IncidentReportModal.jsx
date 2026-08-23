import { useState, useEffect } from 'react'
import { createIncident } from '../../services/api'
import { getCurrentLocation } from '../../lib/location'

export const IncidentReportModal = ({ isOpen, onClose }) => {
  const [step, setStep] = useState(1) // 1: Select Type, 2: Details & Location, 3: Success Confirmation
  const [category, setCategory] = useState('flood')
  const [severity, setSeverity] = useState('HIGH')
  const [description, setDescription] = useState('')
  const [reporterName, setReporterName] = useState('')
  const [reporterPhone, setReporterPhone] = useState('')
  const [affectedCount, setAffectedCount] = useState(1)
  const [photoAttached, setPhotoAttached] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [submissionError, setSubmissionError] = useState(null)
  const [createdIncident, setCreatedIncident] = useState(null)

  // Geolocation state
  const [locationData, setLocationData] = useState({
    latitude: 22.5726,
    longitude: 88.3639,
    coordinates: '22.5726° N, 88.3639° E (Sector 12)',
    status: 'ACQUIRING',
  })

  useEffect(() => {
    if (isOpen) {
      // Request location when modal opens
      getCurrentLocation().then((loc) => {
        setLocationData({
          latitude: loc.latitude,
          longitude: loc.longitude,
          coordinates: loc.coordinates,
          status: loc.status,
        })
      })
    }
  }, [isOpen])

  const categories = [
    { id: 'flood', label: 'Flash Flood / Deep Water', icon: '🌊', type: 'flood' },
    { id: 'hazard', label: 'Blocked Road / Debris', icon: '🚧', type: 'hazard' },
    { id: 'power_line', label: 'Downed Power Lines', icon: '⚡', type: 'power_line' },
    { id: 'structural', label: 'Structural / Collapse', icon: '🏚️', type: 'structural' },
    { id: 'medical', label: 'Medical Emergency', icon: '🚑', type: 'medical' },
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
        `${selectedCat?.label || 'Hazard'} reported at ${locationData.coordinates}`,
      reporter_name: reporterName.trim() || 'Anonymous Citizen',
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
    } else {
      setSubmissionError(
        result.error?.message || 'Failed to transmit report. Salvus fallback grid logged locally.'
      )
    }
  }

  const handleResetAndClose = () => {
    setStep(1)
    setCategory('flood')
    setSeverity('HIGH')
    setDescription('')
    setReporterName('')
    setReporterPhone('')
    setAffectedCount(1)
    setPhotoAttached(false)
    setIsSubmitting(false)
    setSubmissionError(null)
    setCreatedIncident(null)
    onClose()
  }

  if (!isOpen) return null

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="report-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fadeIn"
    >
      <div className="bg-[#111A24] border border-[#1E293B] rounded-2xl max-w-lg w-full p-6 sm:p-8 shadow-2xl relative max-h-[90vh] overflow-y-auto">
        {/* Close Button */}
        <button
          type="button"
          onClick={handleResetAndClose}
          className="absolute top-5 right-5 text-slate-400 hover:text-white text-lg font-bold p-1 cursor-pointer"
          aria-label="Close modal"
        >
          ✕
        </button>

        {step === 1 && (
          <div>
            <span className="text-xs font-bold tracking-widest text-cyan-400 uppercase">
              CITIZEN HAZARD REPORT · STEP 1/2
            </span>
            <h2
              id="report-modal-title"
              className="text-xl font-bold text-white tracking-tight mt-1"
            >
              What type of hazard are you reporting?
            </h2>
            <p className="text-xs text-slate-400 mt-1">
              Your report updates the live situational map for local citizens and rescue teams.
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 my-5">
              {categories.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setCategory(c.id)}
                  className={`p-4 rounded-xl border text-left transition-all cursor-pointer flex items-center gap-3 ${
                    category === c.id
                      ? 'bg-cyan-500/15 border-cyan-500/60 text-white ring-2 ring-cyan-500/30'
                      : 'bg-[#0B1118] border-[#1E293B] text-slate-300 hover:border-slate-600'
                  }`}
                >
                  <span className="text-2xl">{c.icon}</span>
                  <span className="text-xs font-bold">{c.label}</span>
                </button>
              ))}
            </div>

            <div className="flex items-center justify-between pt-4 border-t border-[#1E293B]">
              <button
                type="button"
                onClick={handleResetAndClose}
                className="px-4 py-2.5 rounded-xl text-slate-400 hover:text-white text-xs font-semibold"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => setStep(2)}
                className="px-6 py-2.5 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold text-xs tracking-wider uppercase transition-colors shadow-lg shadow-cyan-500/20 cursor-pointer"
              >
                Continue to Details →
              </button>
            </div>
          </div>
        )}

        {step === 2 && (
          <form onSubmit={handleSubmit} className="space-y-4">
            <span className="text-xs font-bold tracking-widest text-cyan-400 uppercase">
              CITIZEN HAZARD REPORT · STEP 2/2
            </span>
            <h2
              id="report-modal-title"
              className="text-xl font-bold text-white tracking-tight mt-1"
            >
              Provide incident details & location
            </h2>

            {submissionError && (
              <div className="bg-rose-950/40 border border-rose-500/50 rounded-xl p-3 text-xs text-rose-300">
                {submissionError}
              </div>
            )}

            {/* Severity Level */}
            <div>
              <label className="text-xs font-semibold text-slate-300 block mb-1.5">
                Hazard Severity Level
              </label>
              <div className="grid grid-cols-4 gap-2">
                {[
                  { id: 'LOW', label: 'Low', color: 'border-sky-500/40 text-sky-300' },
                  {
                    id: 'MEDIUM',
                    label: 'Medium',
                    color: 'border-amber-500/40 text-amber-300',
                  },
                  {
                    id: 'HIGH',
                    label: 'High',
                    color: 'border-orange-500/40 text-orange-300',
                  },
                  {
                    id: 'CRITICAL',
                    label: 'Critical',
                    color: 'border-rose-500/40 text-rose-300',
                  },
                ].map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => setSeverity(s.id)}
                    className={`py-2 px-1 rounded-lg border text-[11px] font-bold transition-all cursor-pointer text-center ${
                      severity === s.id
                        ? `bg-[#0B1118] ${s.color} ring-2 ring-current`
                        : 'bg-[#0B1118]/60 border-[#1E293B] text-slate-400'
                    }`}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Description */}
            <div>
              <label
                htmlFor="incident-desc"
                className="text-xs font-semibold text-slate-300 block mb-1.5"
              >
                Incident Description & Landmarks
              </label>
              <textarea
                id="incident-desc"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="E.g., Water rising above knee level near Sector 12 community park. Power cables dangling."
                rows={3}
                required
                className="w-full bg-[#0B1118] border border-[#1E293B] rounded-xl p-3 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-cyan-500"
              />
            </div>

            {/* Reporter & People count */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label
                  htmlFor="reporter-name"
                  className="text-[11px] font-semibold text-slate-300 block mb-1"
                >
                  Your Name (Optional)
                </label>
                <input
                  id="reporter-name"
                  type="text"
                  value={reporterName}
                  onChange={(e) => setReporterName(e.target.value)}
                  placeholder="E.g., Amit Roy"
                  className="w-full bg-[#0B1118] border border-[#1E293B] rounded-xl p-2.5 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-cyan-500"
                />
              </div>

              <div>
                <label
                  htmlFor="affected-count"
                  className="text-[11px] font-semibold text-slate-300 block mb-1"
                >
                  Estimated People Affected
                </label>
                <input
                  id="affected-count"
                  type="number"
                  min="1"
                  max="1000"
                  value={affectedCount}
                  onChange={(e) => setAffectedCount(e.target.value)}
                  className="w-full bg-[#0B1118] border border-[#1E293B] rounded-xl p-2.5 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-cyan-500"
                />
              </div>
            </div>

            {/* GPS Tag & Photo Upload Simulation */}
            <div className="bg-[#0B1118] border border-[#1E293B] rounded-xl p-3.5 space-y-2 text-xs">
              <div className="flex items-center justify-between text-slate-300">
                <span className="flex items-center gap-1.5">
                  <span className="text-cyan-400">📍</span>
                  <span>Attached GPS Tag:</span>
                </span>
                <span className="font-mono text-cyan-300 text-[11px]">
                  {locationData.coordinates}
                </span>
              </div>

              <div className="flex items-center justify-between pt-2 border-t border-[#1E293B]">
                <span className="text-slate-400">Attach Photo:</span>
                <button
                  type="button"
                  onClick={() => setPhotoAttached((prev) => !prev)}
                  className={`px-3 py-1 rounded-lg text-xs font-bold transition-colors cursor-pointer ${
                    photoAttached
                      ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                      : 'bg-[#1E293B] text-slate-300 hover:text-white'
                  }`}
                >
                  {photoAttached ? '✓ photo_evidence.jpg attached' : '📷 Add Photo (Metadata)'}
                </button>
              </div>
            </div>

            {/* Actions */}
            <div className="flex items-center justify-between pt-4 border-t border-[#1E293B]">
              <button
                type="button"
                onClick={() => setStep(1)}
                disabled={isSubmitting}
                className="px-4 py-2.5 rounded-xl text-slate-400 hover:text-white text-xs font-semibold cursor-pointer disabled:opacity-50"
              >
                ← Back
              </button>
              <button
                type="submit"
                disabled={isSubmitting}
                className="px-6 py-2.5 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold text-xs tracking-wider uppercase transition-colors shadow-lg shadow-cyan-500/20 cursor-pointer disabled:opacity-50 flex items-center gap-2"
              >
                {isSubmitting ? (
                  <>
                    <span className="h-2 w-2 rounded-full bg-slate-950 animate-ping"></span>
                    <span>Transmitting Report...</span>
                  </>
                ) : (
                  'Submit Incident Report'
                )}
              </button>
            </div>
          </form>
        )}

        {step === 3 && (
          <div className="text-center py-4 space-y-4">
            <div className="h-16 w-16 rounded-full bg-emerald-500/20 border border-emerald-500/40 text-emerald-400 text-2xl mx-auto flex items-center justify-center">
              ✓
            </div>
            <h2 className="text-2xl font-bold text-white tracking-tight">
              Report Received & Logged
            </h2>
            <p className="text-xs sm:text-sm text-slate-300 max-w-sm mx-auto leading-relaxed">
              Ticket{' '}
              <strong className="text-cyan-400 font-mono">
                #{createdIncident?.ticket_id || 'SV-1001'}
              </strong>{' '}
              has been logged to the Salvus spatial intelligence grid with status{' '}
              <span className="px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 font-mono font-bold text-xs">
                {createdIncident?.status || 'NEW'}
              </span>
              . Nearby citizens and response coordinators can now see this hazard zone.
            </p>

            <div className="bg-[#0B1118] border border-[#1E293B] rounded-xl p-3 text-left text-xs font-mono space-y-1 max-w-sm mx-auto">
              <div className="flex justify-between text-slate-400">
                <span>Type:</span>
                <span className="text-white font-bold uppercase">
                  {createdIncident?.type || category}
                </span>
              </div>
              <div className="flex justify-between text-slate-400">
                <span>Severity:</span>
                <span className="text-rose-400 font-bold">
                  {createdIncident?.severity || severity}
                </span>
              </div>
              <div className="flex justify-between text-slate-400">
                <span>Timestamp:</span>
                <span className="text-cyan-300">
                  {createdIncident?.created_at
                    ? new Date(createdIncident.created_at).toLocaleTimeString()
                    : new Date().toLocaleTimeString()}
                </span>
              </div>
            </div>

            <div className="pt-4 border-t border-[#1E293B]">
              <button
                type="button"
                onClick={handleResetAndClose}
                className="w-full py-3 rounded-xl bg-[#1E293B] hover:bg-[#2A3B4E] text-white text-xs font-bold tracking-wider uppercase transition-colors cursor-pointer"
              >
                Return to Citizen Home
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
