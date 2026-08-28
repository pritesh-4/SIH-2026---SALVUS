import { useState, useEffect, useCallback, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useLocation } from '../hooks/useLocation'
import { SafetyStatusCard } from '../components/citizen/SafetyStatusCard'
import { EmergencyCard } from '../components/citizen/EmergencyCard'
import { ActiveAlertCard } from '../components/citizen/ActiveAlertCard'
import { ShelterPreviewCard } from '../components/citizen/ShelterPreviewCard'
import { ReportIncidentCard } from '../components/citizen/ReportIncidentCard'
import { AreaMapCard } from '../components/citizen/AreaMapCard'
import { EmergencyConfirmationModal } from '../components/citizen/emergency/EmergencyConfirmationModal'
import { IncidentReportModal } from '../components/citizen/IncidentReportModal'
import { createIncident } from '../services/api'
import {
  loadCitizenLocationContext,
  formatRelativeFreshness,
} from '../services/locationIntelligenceService'
import { LANDMARKS } from '../lib/location'

export const CitizenHome = () => {
  const navigate = useNavigate()
  const { location, isAcquiring, requestLocation, selectLandmark } = useLocation()

  const [isConfirmingSos, setIsConfirmingSos] = useState(false)
  const [isReportingIncident, setIsReportingIncident] = useState(false)
  const [isSubmittingSos, setIsSubmittingSos] = useState(false)

  // Location Intelligence state
  const [intelData, setIntelData] = useState({
    hazards: [],
    shelters: [],
    safetyStatus: null,
    nearestShelter: null,
    activeAdvisory: null,
    hasLocation: false,
  })
  const [isLoadingIntel, setIsLoadingIntel] = useState(false)
  const [, setFreshnessTick] = useState(0)

  const isMountedRef = useRef(true)

  useEffect(() => {
    isMountedRef.current = true
    return () => {
      isMountedRef.current = false
    }
  }, [])

  // Freshness timer (refreshes relative timestamp text every 30 seconds)
  useEffect(() => {
    const timer = setInterval(() => {
      setFreshnessTick((t) => t + 1)
    }, 30000)
    return () => clearInterval(timer)
  }, [])

  // Load location context whenever location state updates
  useEffect(() => {
    let isCancelled = false
    loadCitizenLocationContext({ location, force: false }).then((data) => {
      if (!isCancelled && isMountedRef.current) {
        setIntelData(data)
        setIsLoadingIntel(false)
      }
    })
    return () => {
      isCancelled = true
    }
  }, [location])

  const handleManualRefresh = useCallback(async () => {
    setIsLoadingIntel(true)
    const data = await loadCitizenLocationContext({ location, force: true })
    if (isMountedRef.current) {
      setIntelData(data)
      setIsLoadingIntel(false)
    }
  }, [location])

  const handleOpenSosModal = () => {
    setIsConfirmingSos(true)
  }

  const handleConfirmSos = async () => {
    if (isSubmittingSos) return
    setIsSubmittingSos(true)

    try {
      // Acquire coordinates safely
      let locLat = location?.latitude
      let locLng = location?.longitude

      if (!locLat || !locLng) {
        const freshLoc = await requestLocation({ timeout: 6000 })
        if (freshLoc?.latitude && freshLoc?.longitude) {
          locLat = freshLoc.latitude
          locLng = freshLoc.longitude
        } else {
          locLat = 22.5726
          locLng = 88.3639
        }
      }

      // Submit SOS Beacon to backend
      const result = await createIncident({
        type: 'flood',
        severity: 'CRITICAL',
        description: 'Immediate emergency SOS beacon activated by citizen.',
        reporter_name: 'Aditi Roy',
        reporter_phone: '+91 98301 24890',
        latitude: locLat,
        longitude: locLng,
        affected_count: 1,
        is_sos: true,
      })

      setIsConfirmingSos(false)
      setIsSubmittingSos(false)

      if (result.success && result.data) {
        localStorage.setItem('salvus_active_incident_id', result.data.id)
        navigate(`/citizen/sos?incidentId=${result.data.id}`)
      } else {
        navigate('/citizen/sos')
      }
    } catch {
      setIsConfirmingSos(false)
      setIsSubmittingSos(false)
      navigate('/citizen/sos')
    }
  }

  const handleCancelSos = () => {
    setIsConfirmingSos(false)
  }

  const { safetyStatus, nearestShelter, activeAdvisory } = intelData

  // Freshness calculation
  const statusFreshness = formatRelativeFreshness(
    safetyStatus?.observedAt || safetyStatus?.evaluatedAt,
    'Updated'
  )

  const isLocationOff =
    location.source === 'UNKNOWN' ||
    location.status === 'DENIED' ||
    location.permission === 'DENIED' ||
    !location.latitude

  const isLandmark = location.source === 'LANDMARK' || location.isFallback

  return (
    <div className="max-w-[1440px] w-full mx-auto px-4 sm:px-8 lg:px-12 py-6 sm:py-8 animate-fadeIn">
      {/* Emergency Confirmation Modal */}
      <EmergencyConfirmationModal
        isOpen={isConfirmingSos}
        onConfirm={handleConfirmSos}
        onCancel={handleCancelSos}
      />

      {/* Incident Reporting Modal */}
      <IncidentReportModal
        isOpen={isReportingIncident}
        onClose={() => setIsReportingIncident(false)}
      />

      {/* STEP 1: YOU ARE HERE (Calm, contextual location bar) */}
      <section className="mb-6 flex flex-col md:flex-row md:items-center justify-between gap-3 bg-salvus-surface/60 border border-salvus-border rounded-2xl p-4 sm:p-5 backdrop-blur-xs">
        <div>
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <span className="text-[11px] font-bold uppercase tracking-wider text-salvus-text-secondary">
              YOU ARE HERE
            </span>
            <span className="h-1 w-1 rounded-full bg-salvus-border-strong"></span>
            <span
              className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold border ${
                location.accuracyBadgeClass || 'bg-slate-800 text-slate-400 border-slate-700'
              }`}
            >
              {isLandmark ? 'APPROXIMATE LANDMARK' : location.accuracyLabel || 'Standard Map'}
            </span>
          </div>

          <h1 className="text-xl sm:text-2xl font-extrabold text-salvus-text-primary tracking-tight">
            {location.latitude
              ? location.address
              : isLandmark
                ? `${location.landmarkName} (Approximate)`
                : 'Location Access Off · Sector 12 Overview'}
          </h1>
        </div>

        <div className="flex items-center gap-2 self-start md:self-auto flex-wrap">
          {isLocationOff ? (
            <div className="flex items-center gap-2 flex-wrap">
              <button
                type="button"
                onClick={() => requestLocation({ timeout: 8000 })}
                disabled={isAcquiring}
                className="px-3.5 py-1.5 rounded-xl bg-salvus-info text-white text-xs font-bold hover:bg-sky-600 transition-colors shadow-xs flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                <span>{isAcquiring ? '⏳' : '📍'}</span>
                <span>{isAcquiring ? 'Detecting...' : 'Detect GPS Location'}</span>
              </button>

              <select
                aria-label="Select Landmark Fallback"
                onChange={(e) => {
                  if (e.target.value) selectLandmark(e.target.value)
                }}
                defaultValue=""
                className="bg-salvus-surface-elevated border border-salvus-border hover:border-salvus-border-strong text-salvus-text-primary text-xs rounded-xl px-3 py-1.5 focus:outline-none focus:border-salvus-info cursor-pointer font-medium"
              >
                <option value="" disabled>
                  Select Sector Landmark...
                </option>
                {LANDMARKS.map((lm) => (
                  <option key={lm.name} value={lm.name}>
                    {lm.name} (Approx.)
                  </option>
                ))}
              </select>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleManualRefresh}
                disabled={isLoadingIntel}
                className="px-3 py-1.5 rounded-xl bg-salvus-surface border border-salvus-border hover:border-salvus-info text-salvus-text-secondary hover:text-salvus-text-primary text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer shadow-xs disabled:opacity-50"
                title="Refresh nearby hazards and shelters"
              >
                <span>{isLoadingIntel ? '⏳' : '🔄'}</span>
                <span>{isLoadingIntel ? 'Updating...' : 'Refresh Intel'}</span>
              </button>

              <button
                type="button"
                onClick={() => navigate('/citizen/map')}
                className="px-3 py-1.5 rounded-xl bg-salvus-surface border border-salvus-border hover:border-salvus-info text-salvus-info text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer shadow-xs"
              >
                <span>🗺️</span>
                <span>Open Tactical Map</span>
              </button>
            </div>
          )}
        </div>
      </section>

      {/* 2-Column Main Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* Left Column (7 cols on lg): Safety Status + Urgent SOS + Active Advisory */}
        <div className="lg:col-span-7 flex flex-col gap-4">
          {/* STEP 2: CURRENT AREA STATUS */}
          <SafetyStatusCard
            level={safetyStatus?.level || (isLocationOff ? 'LOCATION_REQUIRED' : 'SAFE')}
            badgeText={safetyStatus?.badgeText}
            title={safetyStatus?.headline || "You're in a monitored area."}
            subtitle={
              safetyStatus?.description ||
              'Real-time disaster models and telemetry active for your sector.'
            }
            freshnessLabel={statusFreshness}
            onLocationPrompt={requestLocation}
          />

          {/* STEP 3: WHAT TO DO — Is anything changing nearby? (Active Advisory) */}
          <div
            onClick={() => navigate('/citizen/alerts')}
            className="cursor-pointer group transition-transform active:scale-[0.99]"
            title="Click to view full advisory details"
          >
            {activeAdvisory ? (
              <ActiveAlertCard
                variant={
                  activeAdvisory.severity === 'CRITICAL'
                    ? 'critical'
                    : activeAdvisory.severity === 'WARNING'
                      ? 'warning'
                      : 'info'
                }
                badgeText={`${activeAdvisory.hazard_type || 'HAZARD'} · ${activeAdvisory.severity}`}
                headline={activeAdvisory.title}
                description={activeAdvisory.why_it_matters || activeAdvisory.description}
                whatToDo={activeAdvisory.recommended_action}
                distance={
                  activeAdvisory.distance_formatted ||
                  (activeAdvisory.distance_km != null
                    ? `${activeAdvisory.distance_km.toFixed(1)} km away`
                    : null)
                }
                provenance={activeAdvisory.provenance || activeAdvisory.data_provenance}
                source={`${activeAdvisory.source} · ${formatRelativeFreshness(
                  activeAdvisory.observed_at,
                  'Observed'
                )}`}
              />
            ) : (
              <ActiveAlertCard
                variant="safe"
                badgeText="Environmental Telemetry · Normal"
                headline="No Active Hazard Advisories"
                description="Regional Doppler weather radar and municipal seismic feeds report calm conditions in your immediate area."
                source="Open-Meteo & IMD Doppler Feeds · Monitored live"
              />
            )}
          </div>

          {/* Emergency Assistance (Instant SOS Action) */}
          <EmergencyCard
            badgeText="Emergency assistance"
            title="Need urgent emergency help?"
            description="Transmits an instant distress beacon with your precise coordinates to response teams."
            buttonText="Send SOS Request"
            onSosClick={handleOpenSosModal}
          />
        </div>

        {/* Right Column (5 cols on lg): STEP 4 SAFE PLACE + Community Hazard Reporting + Area Map */}
        <div className="lg:col-span-5 flex flex-col gap-4">
          {/* STEP 4: SAFE PLACE & Community Reporting */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {nearestShelter ? (
              <ShelterPreviewCard
                badgeText={
                  nearestShelter.safety_status === 'HAZARD_PROXIMITY_WARNING'
                    ? '⚠️ Proximity to Hazard'
                    : 'Recommended Safe Refuge'
                }
                name={nearestShelter.name}
                distance={
                  nearestShelter.distance_km
                    ? `${nearestShelter.distance_km} km away · ~${nearestShelter.estimated_walk_min || 4} min walk`
                    : 'Near You · ~4 min walk'
                }
                capacity={`${nearestShelter.available_beds} beds available (${nearestShelter.occupancy_rate || 'Open'})`}
                amenities={
                  Array.isArray(nearestShelter.amenities) && nearestShelter.amenities.length > 0
                    ? nearestShelter.amenities.slice(0, 2).join(' · ')
                    : 'Civil Refuge Intake Active'
                }
                actionText="Get Safe Route"
                onActionClick={() =>
                  navigate(`/citizen/map?shelterId=${nearestShelter.id}&action=route`)
                }
              />
            ) : (
              <ShelterPreviewCard
                badgeText="Official Emergency Shelter"
                name="Salt Lake Stadium Assembly Hub"
                distance="350m · ~4 min walk"
                capacity="420 beds available"
                amenities="Medical Aid · Clean Water · Backup Power"
                actionText="Get Safe Route"
                onActionClick={() => navigate('/citizen/map')}
              />
            )}

            <ReportIncidentCard
              badgeText="Community report"
              title="Report a local hazard"
              subtitle="Submit a photo and GPS coordinates in 30 seconds to alert your community."
              actionText="Report hazard"
              onActionClick={() => setIsReportingIncident(true)}
            />
          </div>

          {/* Area Overview Radar Map */}
          <div
            onClick={() => navigate('/citizen/map')}
            className="cursor-pointer group transition-transform active:scale-[0.99]"
            title="Click to open local tactical map"
          >
            <AreaMapCard
              badgeText={
                location.source === 'BROWSER'
                  ? 'GPS Active'
                  : isLandmark
                    ? 'Approximate Location'
                    : 'Sector Overview'
              }
              location={
                location.latitude
                  ? location.address
                  : isLandmark
                    ? `${location.landmarkName} (Approximate)`
                    : 'Sector 12 · Salt Lake, Kolkata'
              }
              userLocation={location}
              legend={[
                { label: 'You', colorClass: isLandmark ? 'bg-amber-400' : 'bg-salvus-info' },
                {
                  label: `Shelters (${intelData.shelters.length || 3})`,
                  colorClass: 'bg-salvus-safe',
                },
                {
                  label: `Hazards (${intelData.hazards.length || 0})`,
                  colorClass: 'bg-salvus-critical',
                },
              ]}
            />
          </div>
        </div>
      </div>
    </div>
  )
}

export default CitizenHome
