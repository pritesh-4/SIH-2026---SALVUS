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
      <div className="min-h-screen bg-[#0B1118] text-slate-100 flex flex-col items-center justify-center p-6 selection:bg-rose-500 selection:text-white">
        <div className="bg-[#111A24] border border-[#1E293B] rounded-2xl max-w-md w-full p-8 text-center shadow-2xl animate-fadeIn">
          <div className="h-16 w-16 rounded-full bg-slate-800 border border-slate-700 mx-auto flex items-center justify-center text-2xl mb-4">
            🛑
          </div>
          <h2 className="text-2xl font-bold text-white tracking-tight">SOS Request Cancelled</h2>
          <p className="text-sm text-slate-400 mt-2 leading-relaxed">
            Your emergency beacon was deactivated and Salvus Command was notified. Allocated units
            have been stood down.
          </p>
          <div className="mt-6 flex flex-col gap-3">
            <button
              type="button"
              onClick={() => navigate('/citizen')}
              className="w-full py-3.5 rounded-xl bg-[#1E293B] hover:bg-[#2A3B4E] text-white text-xs font-bold tracking-wider uppercase transition-colors cursor-pointer"
            >
              Return to Citizen Home
            </button>
            <button
              type="button"
              onClick={triggerSos}
              className="w-full py-3.5 rounded-xl bg-[#EF4444] hover:bg-rose-600 text-white text-xs font-bold tracking-wider uppercase transition-colors cursor-pointer shadow-lg shadow-rose-950/50"
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
    <div className="min-h-screen bg-[#0B1118] text-slate-100 flex flex-col selection:bg-rose-500 selection:text-white pb-32">
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
            <div className="bg-emerald-950/40 border border-emerald-500/50 rounded-2xl p-6 sm:p-8 flex flex-col md:flex-row items-start md:items-center justify-between gap-6 shadow-xl shadow-emerald-950/30">
              <div className="flex items-start gap-4">
                <div className="h-14 w-14 rounded-2xl bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center text-3xl shrink-0">
                  ✅
                </div>
                <div>
                  <span className="text-xs font-bold text-emerald-400 uppercase tracking-widest block font-mono">
                    INCIDENT SAFELY RESOLVED · TOTAL TIME: 8 MIN 42 SEC
                  </span>
                  <h2 className="text-2xl font-extrabold text-white tracking-tight mt-1">
                    Rescue & Evacuation Complete
                  </h2>
                  <p className="text-xs sm:text-sm text-emerald-100/90 mt-1 max-w-2xl leading-relaxed">
                    NDRF Unit 4 (Capt. A. Roy) has safely evacuated you from Sector 12 flood zone to
                    the Salt Lake Stadium Emergency Shelter. Emergency telemetry channel is now
                    safely closed.
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => navigate('/citizen')}
                className="py-3 px-6 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs tracking-wider uppercase transition-colors cursor-pointer shrink-0 shadow-lg shadow-emerald-950/50"
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
                <div className="bg-amber-950/40 border-2 border-amber-500/60 rounded-2xl p-5 text-amber-200 flex items-start gap-3.5 shadow-xl shadow-amber-950/40 animate-pulse">
                  <span className="text-3xl shrink-0">🚨</span>
                  <div>
                    <span className="font-extrabold block text-amber-300 uppercase tracking-wider text-xs font-mono">
                      RESPONDER IS WITHIN 100 METERS
                    </span>
                    <h3 className="text-lg font-bold text-white tracking-tight mt-0.5">
                      Signal the Rescue Boat Now
                    </h3>
                    <p className="text-xs text-amber-100 mt-1 leading-relaxed">
                      Turn on your phone torch, wave a bright garment, or whistle. Keep your line
                      open. Responders are scanning your street with amber floodlights.
                    </p>
                  </div>
                </div>
              )}

              {/* On-Scene Arrival Callout in ON_SCENE State */}
              {isOnScene && (
                <div className="bg-emerald-950/40 border-2 border-emerald-500/60 rounded-2xl p-5 text-emerald-200 flex items-start gap-3.5 shadow-xl shadow-emerald-950/40 animate-fadeIn">
                  <span className="text-3xl shrink-0">🚤</span>
                  <div>
                    <span className="font-extrabold block text-emerald-300 uppercase tracking-wider text-xs font-mono">
                      RESCUE TEAM AT REPORTED LOCATION
                    </span>
                    <h3 className="text-lg font-bold text-white tracking-tight mt-0.5">
                      NDRF Alpha Team Has Reached You
                    </h3>
                    <p className="text-xs text-emerald-100 mt-1 leading-relaxed">
                      Stay in place until crew secures the mooring lines. Follow life jacket fitting
                      and boarding instructions from Capt. A. Roy.
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
