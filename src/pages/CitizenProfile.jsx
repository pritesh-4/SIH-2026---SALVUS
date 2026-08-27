import { useState, useRef, useEffect } from 'react'
import { citizenProfileData } from '../data/citizen/profile.mock'
import { Card } from '../components/ui/Card'
import { Badge } from '../components/ui/Badge'
import { Button } from '../components/ui/Button'
import { Toggle } from '../components/ui/Toggle'
import { ThemeToggle } from '../components/ui/ThemeToggle'

export const CitizenProfile = () => {
  const { identity, emergencyContacts, privacyAndSettings, appInfo } = citizenProfileData
  const [settings, setSettings] = useState(privacyAndSettings)
  const [showMedicalDetails, setShowMedicalDetails] = useState(false)
  const [showAddressDetails, setShowAddressDetails] = useState(false)
  const [testToneActive, setTestToneActive] = useState(false)
  const [downloadSuccess, setDownloadSuccess] = useState(false)
  const testToneTimeoutRef = useRef(null)
  const downloadTimeoutRef = useRef(null)

  // Cleanup timeouts on unmount
  useEffect(() => {
    return () => {
      if (testToneTimeoutRef.current) clearTimeout(testToneTimeoutRef.current)
      if (downloadTimeoutRef.current) clearTimeout(downloadTimeoutRef.current)
    }
  }, [])

  const toggleSetting = (id) => {
    setSettings((prev) =>
      prev.map((s) => (s.id === id && !s.locked ? { ...s, value: !s.value } : s))
    )
  }

  const handleTestTone = () => {
    setTestToneActive(true)
    if (testToneTimeoutRef.current) clearTimeout(testToneTimeoutRef.current)
    testToneTimeoutRef.current = setTimeout(() => setTestToneActive(false), 2000)
  }

  const handleDownloadCard = () => {
    setDownloadSuccess(true)
    if (downloadTimeoutRef.current) clearTimeout(downloadTimeoutRef.current)
    downloadTimeoutRef.current = setTimeout(() => setDownloadSuccess(false), 2500)
  }

  const totalMedicalCount =
    (identity.medicalInfo.conditions?.length || 0) + (identity.medicalInfo.allergies?.length || 0)

  return (
    <div className="max-w-[1440px] w-full mx-auto px-4 sm:px-8 lg:px-12 py-6 sm:py-8 animate-fadeIn space-y-6">
      {/* Top Header */}
      <div>
        <span className="text-xs font-semibold text-salvus-text-secondary">
          Emergency Identity & Settings
        </span>
        <h1 className="text-2xl sm:text-3xl font-extrabold text-salvus-text-primary tracking-tight mt-0.5">
          My Emergency Profile
        </h1>
      </div>

      {/* 2-Column Responsive Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Identity & Emergency Contacts (7 cols) */}
        <div className="lg:col-span-7 space-y-6">
          {/* Identity Card */}
          <Card padding="lg" className="relative overflow-hidden">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-5 border-b border-salvus-border">
              <div className="flex items-center gap-4">
                <div className="h-14 w-14 rounded-2xl bg-salvus-info-bg border border-salvus-info-border flex items-center justify-center text-salvus-info text-xl font-bold">
                  {identity.avatarInitials}
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-xl font-bold text-salvus-text-primary tracking-tight">
                      {identity.fullName}
                    </h2>
                    <Badge variant="safe">Verified</Badge>
                  </div>
                  <p className="text-xs text-salvus-text-muted mt-0.5">
                    Emergency ID: {identity.emergencyId}
                  </p>
                </div>
              </div>

              {/* Blood Group Badge */}
              <div className="bg-salvus-critical-bg border border-salvus-critical-border px-4 py-2 rounded-xl text-center self-start sm:self-auto">
                <span className="text-[10px] text-salvus-critical uppercase font-medium block">
                  Blood Group
                </span>
                <span className="text-lg font-bold text-salvus-critical">
                  {identity.bloodGroup}
                </span>
              </div>
            </div>

            {/* Address & Medical (Progressive Disclosure) */}
            <div className="mt-4 space-y-3.5">
              <div className="bg-salvus-muted/40 border border-salvus-border p-3.5 rounded-xl">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-salvus-text-primary">
                    Registered Residence
                  </span>
                  <button
                    type="button"
                    onClick={() => setShowAddressDetails(!showAddressDetails)}
                    className="text-xs text-salvus-info hover:underline font-medium cursor-pointer"
                  >
                    {showAddressDetails ? 'Hide' : 'Show address'}
                  </button>
                </div>
                {showAddressDetails ? (
                  <p className="text-xs text-salvus-text-secondary mt-2 leading-relaxed">
                    {identity.registeredAddress} · {identity.phone}
                  </p>
                ) : (
                  <p className="text-xs text-salvus-text-muted mt-1 font-mono">
                    Sector 12, Salt Lake (••••••••)
                  </p>
                )}
              </div>

              {/* Critical Medical Profile */}
              <div className="bg-salvus-muted/40 border border-salvus-border p-3.5 rounded-xl">
                <div className="flex items-center justify-between">
                  <div>
                    <span className="text-xs font-semibold text-salvus-text-primary block">
                      Emergency Medical Information
                    </span>
                    <span className="text-xs text-salvus-text-muted">
                      {totalMedicalCount} critical items on file
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowMedicalDetails(!showMedicalDetails)}
                    className="text-xs font-medium text-salvus-info hover:underline cursor-pointer"
                  >
                    {showMedicalDetails ? 'Hide details' : 'View medical profile'}
                  </button>
                </div>

                {showMedicalDetails && (
                  <div className="mt-3 pt-3 border-t border-salvus-border space-y-2.5 animate-fadeIn">
                    <div className="flex flex-wrap gap-2">
                      {identity.medicalInfo.conditions.map((c) => (
                        <span
                          key={`cond-${c}`}
                          className="text-xs bg-salvus-critical-bg border border-salvus-critical-border text-salvus-critical px-2.5 py-1 rounded-lg font-medium"
                        >
                          Medical: {c}
                        </span>
                      ))}
                      {identity.medicalInfo.allergies.map((a) => (
                        <span
                          key={`allergy-${a}`}
                          className="text-xs bg-salvus-warning-bg border border-salvus-warning-border text-salvus-warning-text px-2.5 py-1 rounded-lg font-medium"
                        >
                          Allergy: {a}
                        </span>
                      ))}
                    </div>
                    <p className="text-xs text-salvus-text-secondary pt-1">
                      Mobility Note: {identity.medicalInfo.mobilityNote}
                    </p>
                  </div>
                )}
              </div>
            </div>
          </Card>

          {/* Emergency Contacts Section */}
          <Card padding="lg">
            <div className="mb-4">
              <h3 className="text-sm font-bold text-salvus-text-primary">
                Designated Emergency Contacts
              </h3>
              <p className="text-xs text-salvus-text-secondary mt-0.5">
                Automatically notified when you activate emergency SOS.
              </p>
            </div>

            <div className="space-y-3">
              {emergencyContacts.map((contact) => (
                <div
                  key={contact.id}
                  className="bg-salvus-muted/40 border border-salvus-border rounded-xl p-3.5 flex items-center justify-between gap-4"
                >
                  <div className="flex items-center gap-3">
                    <div className="h-9 w-9 rounded-xl bg-salvus-surface border border-salvus-border flex items-center justify-center text-salvus-text-primary font-bold text-xs">
                      {contact.isPrimary ? '1' : '2'}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h4 className="text-sm font-semibold text-salvus-text-primary">
                          {contact.name}
                        </h4>
                        {contact.isPrimary && (
                          <Badge variant="info" size="sm">
                            Primary
                          </Badge>
                        )}
                      </div>
                      <p className="text-xs text-salvus-text-secondary">
                        {contact.relationship} · <span>{contact.phone}</span>
                      </p>
                    </div>
                  </div>

                  <a
                    href={`tel:${contact.phone}`}
                    className="px-3.5 py-1.5 rounded-lg bg-salvus-surface-elevated hover:bg-salvus-surface-hover border border-salvus-border text-salvus-text-primary text-xs font-semibold transition-colors shrink-0 min-h-[36px] flex items-center"
                  >
                    📞 Call
                  </a>
                </div>
              ))}
            </div>
          </Card>
        </div>

        {/* Right Column: Privacy, Appearance & Tools (5 cols) */}
        <div className="lg:col-span-5 space-y-6">
          {/* Theme & Display Appearance */}
          <Card padding="md">
            <h3 className="text-sm font-bold text-salvus-text-primary mb-1">
              Display & Appearance
            </h3>
            <p className="text-xs text-salvus-text-secondary mb-3">
              Switch between High-Contrast Dark and Sunlight-Optimized Light theme.
            </p>
            <ThemeToggle showLabels={true} />
          </Card>

          {/* Privacy & Permissions */}
          <Card padding="md">
            <h3 className="text-sm font-bold text-salvus-text-primary mb-3">
              Emergency Permissions
            </h3>

            <div className="space-y-3.5">
              {settings.map((item) => (
                <div
                  key={item.id}
                  className="flex items-start justify-between gap-3 pb-3 border-b border-salvus-border last:border-none last:pb-0"
                >
                  <div className="pr-2">
                    <div className="flex items-center gap-2">
                      <h4 className="text-xs font-semibold text-salvus-text-primary">
                        {item.title}
                      </h4>
                      {item.badge && (
                        <Badge variant="info" size="sm">
                          {item.badge}
                        </Badge>
                      )}
                    </div>
                    <p className="text-xs text-salvus-text-secondary mt-0.5 leading-relaxed font-normal">
                      {item.description}
                    </p>
                  </div>

                  <Toggle
                    checked={item.value}
                    disabled={item.locked}
                    onChange={() => toggleSetting(item.id)}
                    ariaLabel={item.title}
                  />
                </div>
              ))}
            </div>
          </Card>

          {/* Emergency Readiness Tools */}
          <Card padding="md" className="space-y-3">
            <h3 className="text-sm font-bold text-salvus-text-primary mb-2">Readiness Tools</h3>

            <Button
              variant="secondary"
              size="md"
              fullWidth={true}
              onClick={handleTestTone}
              className="font-medium text-xs"
            >
              {testToneActive ? '🔊 Testing Siren Tone...' : '🔊 Test Emergency Siren Tone'}
            </Button>

            <Button
              variant="quiet"
              size="md"
              fullWidth={true}
              onClick={handleDownloadCard}
              className="font-medium text-xs"
            >
              {downloadSuccess
                ? '✓ Emergency Pass Saved Locally'
                : '💾 Save Offline Emergency Pass'}
            </Button>
          </Card>

          {/* App Info Footer */}
          <div className="text-xs text-salvus-text-muted text-center space-y-1">
            <p>
              {appInfo.version} · {appInfo.build}
            </p>
            <p>🔒 Local device storage · Offline resilience active</p>
          </div>
        </div>
      </div>
    </div>
  )
}

export default CitizenProfile
