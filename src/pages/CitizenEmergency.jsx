import { useNavigate, useSearchParams } from 'react-router-dom'
import { useEmergencyState } from '../features/citizen/emergency/useEmergencyState'
import { EmergencyHeader } from '../components/citizen/emergency/EmergencyHeader'
import { LocationStatusBanner } from '../components/citizen/emergency/LocationStatusBanner'
import { EmergencyStatusCard } from '../components/citizen/emergency/EmergencyStatusCard'
import { RescueRadarMap } from '../components/citizen/emergency/RescueRadarMap'
import { AiTriageCard } from '../components/citizen/emergency/AiTriageCard'
import { ResponderPreviewCard } from '../components/citizen/emergency/ResponderPreviewCard'
import { EmergencyTimeline } from '../components/citizen/emergency/EmergencyTimeline'
import { EmergencyInstructionCard } from '../components/citizen/emergency/EmergencyInstructionCard'
import { EmergencyDemoControls } from '../components/citizen/emergency/EmergencyDemoControls'
import { EmergencyCancelModal } from '../components/citizen/emergency/EmergencyCancelModal'
import { GlobalNotificationBanner } from '../components/common/GlobalNotificationBanner'

export const CitizenEmergency = () => {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const urlIncidentId = searchParams.get('incidentId')

  const {
    currentState,
    currentInfo,
    focalCategory,
    etaMinutes,
    distanceText,
    responderPos,
    locationStatus,
    connectivityStatus,
    setConnectivityStatus,
    isAutoPlaying,
    simulationSpeed,
    setSimulationSpeed,
    isCancelModalOpen,
    openCancelModal,
    closeCancelModal,
    confirmCancelEmergency,
    incident,
    aiTriage,
    responder,
    emergencyContacts,
    timelineSteps,
    instructions,
    setCurrentState,
    goToNextState,
    goToPrevState,
    resetEmergency,
    triggerSos,
    triggerLiveDemoSos,
    toggleAutoPlay,
  } = useEmergencyState('SOS_ACTIVE', urlIncidentId)

  // Cancelled State Screen
  if (currentState === 'CANCELLED') {
    return (
      <div className="min-h-screen bg-salvus-bg text-salvus-text-primary flex flex-col items-center justify-center p-6 selection:bg-salvus-critical selection:text-white transition-colors duration-200">
        <div className="bg-salvus-surface border border-salvus-border rounded-2xl max-w-md w-full p-8 text-center shadow-xl animate-fadeIn">
          <div className="h-16 w-16 rounded-full bg-salvus-muted border border-salvus-border mx-auto flex items-center justify-center text-2xl mb-4">
            🛑
          </div>
          <h2 className="text-2xl font-bold text-salvus-text-primary tracking-tight">
            Emergency Request Cancelled
          </h2>
          <p className="text-sm text-salvus-text-secondary mt-2 leading-relaxed">
            Your emergency beacon was deactivated and coordinators have been notified that you are
            safe.
          </p>
          <div className="mt-6 flex flex-col gap-3">
            <button
              type="button"
              onClick={() => navigate('/citizen')}
              className="w-full py-3.5 rounded-xl bg-salvus-surface-elevated hover:bg-salvus-surface-hover border border-salvus-border text-salvus-text-primary text-xs font-bold tracking-wider uppercase transition-colors cursor-pointer"
            >
              Return to Home
            </button>
            <button
              type="button"
              onClick={triggerSos}
              className="w-full py-3.5 rounded-xl bg-salvus-critical hover:opacity-90 text-white text-xs font-bold tracking-wider uppercase transition-colors cursor-pointer shadow-xs"
            >
              Re-activate SOS Beacon
            </button>
          </div>
        </div>
      </div>
    )
  }

  const isResolved = currentState === 'RESOLVED'
  const isNearby = currentState === 'NEARBY'
  const isOnScene = currentState === 'ON_SCENE'

  return (
    <div className="min-h-screen bg-salvus-bg text-salvus-text-primary flex flex-col selection:bg-salvus-critical selection:text-white pb-32 transition-colors duration-200">
      {/* Calm System Notifications */}
      <GlobalNotificationBanner />

      {/* Cancellation Confirmation Safeguard Modal */}
      <EmergencyCancelModal
        isOpen={isCancelModalOpen}
        onConfirm={confirmCancelEmergency}
        onCancel={closeCancelModal}
      />

      {/* Top Emergency Mode Header */}
      <EmergencyHeader
        incidentId={incident.id}
        phaseLabel={currentInfo.phaseLabel}
        badgeColor={currentInfo.badgeColor}
        onCancelClick={isResolved ? null : openCancelModal}
      />

      {/* Main Responsive Container */}
      <main className="flex-1 max-w-[1440px] w-full mx-auto px-4 sm:px-8 lg:px-12 py-6 space-y-6">
        {/* Location & Network Health Banner */}
        <LocationStatusBanner
          location={incident.userLocation}
          locationStatus={locationStatus}
          connectivityStatus={connectivityStatus}
        />

        {/* Resolved Dedicated Screen View */}
        {isResolved ? (
          <div className="space-y-6 animate-fadeIn">
            <div className="bg-salvus-safe-bg border border-salvus-safe-border rounded-2xl p-6 sm:p-8 flex flex-col md:flex-row items-start md:items-center justify-between gap-6 shadow-md text-salvus-safe-text">
              <div className="flex items-start gap-4 flex-1 min-w-0">
                <div className="h-14 w-14 rounded-2xl bg-salvus-safe/20 border border-salvus-safe/40 flex items-center justify-center text-3xl shrink-0">
                  ✅
                </div>
                <div>
                  <span className="text-xs font-bold uppercase tracking-wider block">
                    Incident Safely Resolved
                  </span>
                  <h2 className="text-2xl font-extrabold tracking-tight mt-1">
                    Rescue & Safety Check Complete
                  </h2>
                  <p className="text-xs sm:text-sm opacity-90 mt-1 max-w-2xl leading-relaxed">
                    Emergency response team has safely attended to your request. You can return to
                    the home screen or view guidance below.
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => navigate('/citizen')}
                className="py-3 px-6 rounded-xl bg-salvus-safe hover:opacity-90 text-white font-bold text-xs tracking-wider uppercase transition-colors cursor-pointer shrink-0 shadow-xs"
              >
                Return to Citizen Home
              </button>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              <div className="lg:col-span-7">
                <EmergencyInstructionCard instructions={instructions} />
              </div>
              <div className="lg:col-span-5">
                <EmergencyTimeline timelineSteps={timelineSteps} currentState={currentState} />
              </div>
            </div>
          </div>
        ) : (
          /* Progressive Disclosure 2-Column Responsive Layout */
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Left Column (7 cols on lg) */}
            <div className="lg:col-span-7 flex flex-col gap-6">
              {/* Proximity Urgent Callout in NEARBY State */}
              {isNearby && (
                <div className="bg-salvus-warning-bg border-2 border-salvus-warning-border rounded-2xl p-5 text-salvus-warning-text flex items-start gap-3.5 shadow-md">
                  <span className="text-3xl shrink-0" aria-hidden="true">
                    🚨
                  </span>
                  <div>
                    <span className="font-extrabold block uppercase tracking-wider text-xs">
                      Responder is within 100 meters
                    </span>
                    <h3 className="text-lg font-bold tracking-tight mt-0.5">
                      Signal the Rescue Team Now
                    </h3>
                    <p className="text-xs opacity-90 mt-1 leading-relaxed">
                      Turn on your phone flashlight, wave a bright cloth, or call out. Responders
                      are on your street.
                    </p>
                  </div>
                </div>
              )}

              {/* On-Scene Arrival Callout in ON_SCENE State */}
              {isOnScene && (
                <div className="bg-salvus-safe-bg border-2 border-salvus-safe-border rounded-2xl p-5 text-salvus-safe-text flex items-start gap-3.5 shadow-md animate-fadeIn">
                  <span className="text-3xl shrink-0" aria-hidden="true">
                    🚤
                  </span>
                  <div>
                    <span className="font-extrabold block uppercase tracking-wider text-xs">
                      Rescue Team has Arrived
                    </span>
                    <h3 className="text-lg font-bold tracking-tight mt-0.5">
                      Help is at your reported location
                    </h3>
                    <p className="text-xs opacity-90 mt-1 leading-relaxed">
                      Stay in place until responders reach your entrance. Follow instructions from
                      the team lead.
                    </p>
                  </div>
                </div>
              )}

              {/* Core Status Hero Card */}
              <EmergencyStatusCard
                statusInfo={currentInfo}
                severity={incident.severity}
                category={incident.category}
              />

              {/* Progressive Centerpiece: Tactical Radar Map for Tracking/Nearby/Scene */}
              {['tracking', 'proximity', 'on_scene'].includes(focalCategory) ? (
                <RescueRadarMap
                  currentState={currentState}
                  responderPos={responderPos}
                  userLocation={incident.userLocation}
                  responder={responder}
                  distanceText={distanceText}
                  etaMinutes={etaMinutes}
                />
              ) : (
                /* Progressive Centerpiece: Operational AI Intelligence Triage for Triage/Verified */
                <AiTriageCard currentState={currentState} aiTriage={aiTriage} />
              )}

              {/* State-Specific Life-Safety Guidance */}
              <EmergencyInstructionCard instructions={instructions} />

              {/* Designated Emergency Contacts SOS Notification Panel */}
              {emergencyContacts && emergencyContacts.length > 0 && (
                <div className="bg-salvus-surface border border-salvus-border rounded-2xl p-4 sm:p-5 shadow-xs">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <span className="text-sm">🔔</span>
                      <h3 className="text-xs font-bold uppercase tracking-wider text-salvus-text-primary">
                        Designated Emergency Contacts Notified
                      </h3>
                    </div>
                    <span className="text-[10px] text-salvus-safe bg-salvus-safe-bg border border-salvus-safe-border px-2 py-0.5 rounded-full font-bold">
                      SOS Alert Queued
                    </span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    {emergencyContacts.map((contact) => (
                      <div
                        key={contact.id}
                        className="bg-salvus-muted/40 border border-salvus-border rounded-xl p-2.5 flex items-center justify-between text-xs"
                      >
                        <div>
                          <div className="flex items-center gap-1.5">
                            <span className="font-semibold text-salvus-text-primary">
                              {contact.name}
                            </span>
                            {contact.is_primary && (
                              <span className="text-[9px] bg-salvus-info-bg text-salvus-info px-1.5 py-0.5 rounded-md font-bold">
                                Primary
                              </span>
                            )}
                          </div>
                          <span className="text-[11px] text-salvus-text-muted">
                            {contact.relationship}
                          </span>
                        </div>
                        <a
                          href={`tel:${contact.phone}`}
                          className="px-2.5 py-1 rounded-lg bg-salvus-surface-elevated hover:bg-salvus-surface-hover border border-salvus-border text-salvus-text-primary text-[11px] font-semibold"
                        >
                          📞 Call
                        </a>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Right Column (5 cols on lg) */}
            <div className="lg:col-span-5 flex flex-col gap-6">
              {/* Assigned Responder Details & Radio Link */}
              <ResponderPreviewCard
                currentState={currentState}
                responder={responder}
                etaMinutes={etaMinutes}
                distanceText={distanceText}
              />

              {/* Comprehensive Incident Progression Timeline */}
              <EmergencyTimeline timelineSteps={timelineSteps} currentState={currentState} />
            </div>
          </div>
        )}
      </main>

      {/* Floating Demo Simulator Controls (Collapsible) */}
      <EmergencyDemoControls
        currentState={currentState}
        onSelectState={setCurrentState}
        onNext={goToNextState}
        onPrev={goToPrevState}
        onReset={resetEmergency}
        isAutoPlaying={isAutoPlaying}
        onToggleAutoPlay={toggleAutoPlay}
        simulationSpeed={simulationSpeed}
        onSpeedChange={setSimulationSpeed}
        connectivityStatus={connectivityStatus}
        onConnectivityChange={setConnectivityStatus}
        onTriggerLiveSos={triggerLiveDemoSos}
        incidentTicket={incident.id}
      />
    </div>
  )
}

export default CitizenEmergency
