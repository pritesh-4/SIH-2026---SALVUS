import { useState } from 'react'
import { citizenProfileData } from '../data/citizen/profile.mock'

export const CitizenProfile = () => {
  const { identity, emergencyContacts, privacyAndSettings, appInfo } = citizenProfileData
  const [settings, setSettings] = useState(privacyAndSettings)
  const [showMedicalDetails, setShowMedicalDetails] = useState(false)
  const [showAddressDetails, setShowAddressDetails] = useState(false)
  const [testToneActive, setTestToneActive] = useState(false)
  const [downloadSuccess, setDownloadSuccess] = useState(false)

  const toggleSetting = (id) => {
    setSettings((prev) =>
      prev.map((s) => (s.id === id && !s.locked ? { ...s, value: !s.value } : s))
    )
  }

  const handleTestTone = () => {
    setTestToneActive(true)
    setTimeout(() => setTestToneActive(false), 2000)
  }

  const handleDownloadCard = () => {
    setDownloadSuccess(true)
    setTimeout(() => setDownloadSuccess(false), 2500)
  }

  const totalMedicalCount =
    (identity.medicalInfo.conditions?.length || 0) + (identity.medicalInfo.allergies?.length || 0)

  return (
    <div className="max-w-[1440px] w-full mx-auto px-4 sm:px-8 lg:px-12 py-6 sm:py-8 animate-fadeIn space-y-6">
      {/* Top Header */}
      <div>
        <span className="text-xs font-semibold text-slate-400">Emergency identity & readiness</span>
        <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-100 tracking-tight mt-1">
          Citizen Emergency Profile
        </h1>
      </div>

      {/* 2-Column Responsive Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Identity & Emergency Contacts (7 cols) */}
        <div className="lg:col-span-7 space-y-6">
          {/* Identity Card */}
          <div className="bg-[#0D141F] border border-[#1A2533] rounded-2xl p-6 relative overflow-hidden">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-5 border-b border-[#1A2533]">
              <div className="flex items-center gap-4">
                <div className="h-14 w-14 rounded-2xl bg-sky-500/10 border border-sky-500/30 flex items-center justify-center text-sky-400 text-xl font-bold">
                  {identity.avatarInitials}
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-xl font-bold text-slate-100 tracking-tight">
                      {identity.fullName}
                    </h2>
                    <span className="text-[10px] bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 px-2 py-0.5 rounded-full font-semibold">
                      Verified
                    </span>
                  </div>
                  <p className="text-xs text-slate-400 font-mono mt-0.5">
                    Emergency ID: {identity.emergencyId}
                  </p>
                </div>
              </div>

              {/* Blood Group Badge */}
              <div className="bg-[#080C12] border border-[#182332] px-4 py-2 rounded-xl text-center self-start sm:self-auto">
                <span className="text-[10px] text-slate-400 uppercase font-medium block">
                  Blood group
                </span>
                <span className="text-lg font-bold text-rose-400">{identity.bloodGroup}</span>
              </div>
            </div>

            {/* Address & Contact (Progressive Disclosure) */}
            <div className="mt-4 space-y-4">
              <div className="bg-[#080C12] border border-[#182332] p-3.5 rounded-xl">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-slate-300">
                    Registered emergency residence
                  </span>
                  <button
                    type="button"
                    onClick={() => setShowAddressDetails(!showAddressDetails)}
                    className="text-xs text-sky-400 hover:text-sky-300 font-medium cursor-pointer"
                  >
                    {showAddressDetails ? 'Hide' : 'Show address'}
                  </button>
                </div>
                {showAddressDetails ? (
                  <p className="text-xs text-slate-300 mt-2 font-normal leading-relaxed">
                    {identity.registeredAddress} · {identity.phone}
                  </p>
                ) : (
                  <p className="text-xs text-slate-500 mt-1 font-mono">
                    Sector 12, Salt Lake, Kolkata (••••••••)
                  </p>
                )}
              </div>

              {/* Critical Medical & Allergy Profile (Progressive Disclosure) */}
              <div className="bg-[#080C12] border border-[#182332] p-4 rounded-xl">
                <div className="flex items-center justify-between">
                  <div>
                    <span className="text-xs font-semibold text-slate-200 block">
                      Emergency medical information
                    </span>
                    <span className="text-xs text-slate-400">
                      {totalMedicalCount} critical items configured
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowMedicalDetails(!showMedicalDetails)}
                    className="text-xs font-medium text-sky-400 hover:text-sky-300 cursor-pointer"
                  >
                    {showMedicalDetails ? 'Hide details' : 'View medical profile'}
                  </button>
                </div>

                {showMedicalDetails && (
                  <div className="mt-3 pt-3 border-t border-[#182332] space-y-2 animate-fadeIn">
                    <div className="flex flex-wrap gap-2">
                      {identity.medicalInfo.conditions.map((c, i) => (
                        <span
                          key={i}
                          className="text-xs bg-rose-950/40 border border-rose-500/30 text-rose-200 px-2.5 py-1 rounded-lg font-medium"
                        >
                          Medical: {c}
                        </span>
                      ))}
                      {identity.medicalInfo.allergies.map((a, i) => (
                        <span
                          key={i}
                          className="text-xs bg-amber-950/40 border border-amber-500/30 text-amber-200 px-2.5 py-1 rounded-lg font-medium"
                        >
                          Allergy: {a}
                        </span>
                      ))}
                    </div>
                    <p className="text-xs text-slate-400 pt-1">
                      Mobility status: {identity.medicalInfo.mobilityNote}
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Emergency Contacts Section */}
          <div className="bg-[#0D141F] border border-[#1A2533] rounded-2xl p-6">
            <div className="flex items-center justify-between gap-3 mb-4">
              <div>
                <h3 className="text-sm font-bold text-slate-100">Designated Emergency Contacts</h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Linked for instant emergency communication when an SOS beacon is active.
                </p>
              </div>
            </div>

            <div className="space-y-3">
              {emergencyContacts.map((contact) => (
                <div
                  key={contact.id}
                  className="bg-[#080C12] border border-[#182332] rounded-xl p-4 flex items-center justify-between gap-4"
                >
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-xl bg-slate-800 border border-slate-700 flex items-center justify-center text-slate-300 font-bold text-sm">
                      {contact.isPrimary ? '1' : '2'}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h4 className="text-sm font-semibold text-slate-100">{contact.name}</h4>
                        {contact.isPrimary && (
                          <span className="text-[10px] bg-sky-500/15 border border-sky-500/30 text-sky-300 px-1.5 py-0.2 rounded font-semibold">
                            Primary
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-slate-400">
                        {contact.relationship} ·{' '}
                        <span className="font-mono text-slate-300">{contact.phone}</span>
                      </p>
                    </div>
                  </div>

                  <a
                    href={`tel:${contact.phone}`}
                    className="px-3.5 py-1.5 rounded-lg bg-[#182332] hover:bg-[#223042] text-slate-100 text-xs font-semibold transition-colors shrink-0"
                  >
                    Call
                  </a>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Right Column: Privacy, Emergency Settings & Actions (5 cols) */}
        <div className="lg:col-span-5 space-y-6">
          {/* Privacy & Settings */}
          <div className="bg-[#0D141F] border border-[#1A2533] rounded-2xl p-6">
            <h3 className="text-sm font-bold text-slate-100 mb-4">
              Privacy & Emergency Permissions
            </h3>

            <div className="space-y-4">
              {settings.map((item) => (
                <div
                  key={item.id}
                  className="flex items-start justify-between gap-3 pb-3 border-b border-[#182332] last:border-none last:pb-0"
                >
                  <div className="pr-2">
                    <div className="flex items-center gap-2">
                      <h4 className="text-xs font-semibold text-slate-200">{item.title}</h4>
                      {item.badge && (
                        <span className="text-[9px] bg-sky-500/15 text-sky-300 border border-sky-500/30 px-1.5 py-0.2 rounded font-semibold">
                          {item.badge}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-slate-400 mt-0.5 leading-relaxed font-normal">
                      {item.description}
                    </p>
                  </div>

                  <button
                    type="button"
                    disabled={item.locked}
                    onClick={() => toggleSetting(item.id)}
                    className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                      item.value ? 'bg-sky-500' : 'bg-slate-800'
                    } ${item.locked ? 'opacity-70 cursor-not-allowed' : ''}`}
                  >
                    <span
                      className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${
                        item.value ? 'translate-x-4' : 'translate-x-0'
                      }`}
                    />
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* Emergency Readiness Tools */}
          <div className="bg-[#0D141F] border border-[#1A2533] rounded-2xl p-6 space-y-3">
            <h3 className="text-sm font-bold text-slate-100 mb-2">Emergency Readiness Tools</h3>

            <button
              type="button"
              onClick={handleTestTone}
              className="w-full py-2.5 px-4 rounded-xl bg-[#182332] hover:bg-[#223042] text-slate-200 text-xs font-semibold tracking-wide transition-all flex items-center justify-center gap-2 cursor-pointer"
            >
              <span>
                {testToneActive ? '🔊 Testing Siren Tone...' : '🔊 Test Emergency Siren Tone'}
              </span>
            </button>

            <button
              type="button"
              onClick={handleDownloadCard}
              className="w-full py-2.5 px-4 rounded-xl bg-[#080C12] border border-[#182332] hover:border-slate-600 text-slate-300 text-xs font-semibold tracking-wide transition-all flex items-center justify-center gap-2 cursor-pointer"
            >
              <span>
                {downloadSuccess
                  ? '✓ Emergency Pass Saved Locally'
                  : '💾 Save Offline Emergency Pass'}
              </span>
            </button>
          </div>

          {/* App Info Footer (Truthful claims) */}
          <div className="text-xs text-slate-500 text-center font-mono space-y-1">
            <p>
              {appInfo.version} · {appInfo.build}
            </p>
            <p className="text-slate-600">🔒 Local encrypted device storage</p>
          </div>
        </div>
      </div>
    </div>
  )
}

export default CitizenProfile
