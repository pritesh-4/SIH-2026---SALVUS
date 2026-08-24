import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { citizenHomeData } from '../data/citizenHome'
import { SafetyStatusCard } from '../components/citizen/SafetyStatusCard'
import { EmergencyCard } from '../components/citizen/EmergencyCard'
import { ActiveAlertCard } from '../components/citizen/ActiveAlertCard'
import { ShelterPreviewCard } from '../components/citizen/ShelterPreviewCard'
import { ReportIncidentCard } from '../components/citizen/ReportIncidentCard'
import { AreaMapCard } from '../components/citizen/AreaMapCard'
import { EmergencyConfirmationModal } from '../components/citizen/emergency/EmergencyConfirmationModal'
import { IncidentReportModal } from '../components/citizen/IncidentReportModal'
import { createIncident } from '../services/api'
import { getCurrentLocation } from '../lib/location'

export const CitizenHome = () => {
  const navigate = useNavigate()
  const [isConfirmingSos, setIsConfirmingSos] = useState(false)
  const [isReportingIncident, setIsReportingIncident] = useState(false)
  const [isSubmittingSos, setIsSubmittingSos] = useState(false)

  const { user, safetyStatus, emergency, activeAlert, nearestShelter, report, areaMap } =
    citizenHomeData

  const handleOpenSosModal = () => {
    setIsConfirmingSos(true)
  }

  const handleConfirmSos = async () => {
    if (isSubmittingSos) return
    setIsSubmittingSos(true)

    try {
      // 1. Acquire current coordinates safely
      const loc = await getCurrentLocation()

      // 2. Submit SOS Beacon to backend
      const result = await createIncident({
        type: 'flood',
        severity: 'CRITICAL',
        description: 'Immediate emergency SOS beacon activated by citizen.',
        reporter_name: 'Aditi Roy',
        reporter_phone: '+91 98301 24890',
        latitude: loc.latitude,
        longitude: loc.longitude,
        affected_count: 1,
        is_sos: true,
      })

      setIsConfirmingSos(false)
      setIsSubmittingSos(false)

      if (result.success && result.data) {
        navigate(`/citizen/sos?incidentId=${result.data.id}`)
      } else {
        // Fallback to standalone SOS mode if backend is unreachable
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

      {/* Header Greeting (Calm, Human, Sentence Case) */}
      <section className="mb-6">
        <p className="text-xs font-medium text-slate-400">{user.greeting}</p>
        <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-100 tracking-tight mt-1">
          {user.headline}
        </h1>
      </section>

      {/* 2-Column Main Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* Left Column (7 cols on lg): Safety Status + Urgent SOS + Active Advisory */}
        <div className="lg:col-span-7 flex flex-col gap-4">
          {/* 1. Am I safe? */}
          <SafetyStatusCard
            badgeText={safetyStatus.badgeText}
            title={safetyStatus.title}
            subtitle={safetyStatus.subtitle}
          />

          {/* 2. Is anything changing nearby? */}
          <div
            onClick={() => navigate('/citizen/alerts')}
            className="cursor-pointer group transition-transform active:scale-[0.99]"
            title="Click to view full advisory details"
          >
            <ActiveAlertCard
              badgeText={activeAlert.badgeText}
              description={activeAlert.description}
              source={activeAlert.source}
            />
          </div>

          {/* 5. How do I request help? (Prominent Emergency Action) */}
          <EmergencyCard
            badgeText={emergency.badgeText}
            title={emergency.title}
            description={emergency.description}
            buttonText={emergency.buttonText}
            onSosClick={handleOpenSosModal}
          />
        </div>

        {/* Right Column (5 cols on lg): Safe Haven + Community Hazard Reporting + Area Map */}
        <div className="lg:col-span-5 flex flex-col gap-4">
          {/* 4. Where is safety available? & Community Reporting */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <ShelterPreviewCard
              badgeText={nearestShelter.badgeText}
              name={nearestShelter.name}
              distance={nearestShelter.distance}
              capacity={nearestShelter.capacity}
              amenities={nearestShelter.amenities}
              actionText={nearestShelter.actionText}
              onActionClick={() => navigate('/citizen/map')}
            />

            <ReportIncidentCard
              badgeText={report.badgeText}
              title={report.title}
              subtitle={report.subtitle}
              actionText={report.actionText}
              onActionClick={() => setIsReportingIncident(true)}
            />
          </div>

          {/* Area Overview Map */}
          <div
            onClick={() => navigate('/citizen/map')}
            className="cursor-pointer group transition-transform active:scale-[0.99]"
            title="Click to open local situational map"
          >
            <AreaMapCard
              badgeText={areaMap.badgeText}
              location={areaMap.location}
              legend={areaMap.legend}
            />
          </div>
        </div>
      </div>
    </div>
  )
}

export default CitizenHome
