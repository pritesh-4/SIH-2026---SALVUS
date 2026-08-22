import { useState } from 'react'

export const IncidentReportModal = ({ isOpen, onClose }) => {
  const [step, setStep] = useState(1) // 1: Select Type, 2: Details & Photo, 3: Success Confirmation
  const [category, setCategory] = useState('flood')
  const [severity, setSeverity] = useState('medium')
  const [description, setDescription] = useState('')
  const [photoAttached, setPhotoAttached] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const categories = [
    { id: 'flood', label: 'Flash Flood / Deep Water', icon: '🌊' },
    { id: 'blocked_road', label: 'Blocked Road / Debris', icon: '🚧' },
    { id: 'power_line', label: 'Downed Power Lines', icon: '⚡' },
    { id: 'trapped', label: 'Persons Requiring Help', icon: '🆘' },
  ]

  const handleSubmit = (e) => {
    e.preventDefault()
    setIsSubmitting(true)
    setTimeout(() => {
      setIsSubmitting(false)
      setStep(3)
    }, 1000)
  }

  const handleResetAndClose = () => {
    setStep(1)
    setCategory('flood')
    setSeverity('medium')
    setDescription('')
    setPhotoAttached(false)
    setIsSubmitting(false)
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
                className="px-6 py-2.5 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold text-xs tracking-wider uppercase transition-colors shadow-lg shadow-cyan-500/20"
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

            {/* Severity Level */}
            <div>
              <label className="text-xs font-semibold text-slate-300 block mb-1.5">
                Hazard Severity Level
              </label>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { id: 'low', label: 'Low / Advisory', color: 'border-sky-500/40 text-sky-300' },
                  {
                    id: 'medium',
                    label: 'Moderate / Warning',
                    color: 'border-amber-500/40 text-amber-300',
                  },
                  {
                    id: 'high',
                    label: 'Critical / Danger',
                    color: 'border-rose-500/40 text-rose-300',
                  },
                ].map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => setSeverity(s.id)}
                    className={`py-2 px-2 rounded-lg border text-[11px] font-bold transition-all cursor-pointer ${
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
                className="w-full bg-[#0B1118] border border-[#1E293B] rounded-xl p-3 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-cyan-500"
              />
            </div>

            {/* GPS Tag & Photo Upload Simulation */}
            <div className="bg-[#0B1118] border border-[#1E293B] rounded-xl p-3.5 space-y-2 text-xs">
              <div className="flex items-center justify-between text-slate-300">
                <span className="flex items-center gap-1.5">
                  <span className="text-cyan-400">📍</span>
                  <span>Attached GPS Tag:</span>
                </span>
                <span className="font-mono text-cyan-300 text-[11px]">
                  22.5726° N, 88.3639° E (Sector 12)
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
                  {photoAttached ? '✓ photo_flood_sector12.jpg' : '📷 Add Photo (Simulated)'}
                </button>
              </div>
            </div>

            {/* Actions */}
            <div className="flex items-center justify-between pt-4 border-t border-[#1E293B]">
              <button
                type="button"
                onClick={() => setStep(1)}
                className="px-4 py-2.5 rounded-xl text-slate-400 hover:text-white text-xs font-semibold"
              >
                ← Back
              </button>
              <button
                type="submit"
                disabled={isSubmitting}
                className="px-6 py-2.5 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold text-xs tracking-wider uppercase transition-colors shadow-lg shadow-cyan-500/20 cursor-pointer disabled:opacity-50"
              >
                {isSubmitting ? 'Transmitting Report...' : 'Submit Incident Report'}
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
              Ticket <strong className="text-cyan-400 font-mono">#REP-9102</strong> has been logged
              to the Salvus spatial intelligence grid. Nearby citizens and response coordinators can
              now see this hazard zone.
            </p>
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
