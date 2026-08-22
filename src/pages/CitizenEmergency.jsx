import { useNavigate } from 'react-router-dom'
import { useEmergencyState } from '../features/citizen/emergency/useEmergencyState'
import { EmergencyHeader } from '../components/citizen/emergency/EmergencyHeader'
import { LocationStatusBanner } from '../components/citizen/emergency/LocationStatusBanner'
import { EmergencyStatusCard } from '../components/citizen/emergency/EmergencyStatusCard'
import { ResponderPreviewCard } from '../components/citizen/emergency/ResponderPreviewCard'
import { EmergencyTimeline } from '../components/citizen/emergency/EmergencyTimeline'
import { EmergencyInstructionCard } from '../components/citizen/emergency/EmergencyInstructionCard'
import { EmergencyDemoControls } from '../components/citizen/emergency/EmergencyDemoControls'

export const CitizenEmergency = () => {
  const navigate = useNavigate()
  const {
    currentState,
    currentInfo,
    etaMinutes,
    isAutoPlaying,
    incident,
    responder,
    timelineSteps,
    instructions,
    setCurrentState,
    goToNextState,
    goToPrevState,
    cancelEmergency,
    resetEmergency,
    triggerSos,
    toggleAutoPlay,
  } = useEmergencyState('SOS_ACTIVE')

  if (currentState === 'CANCELLED') {
    return (
      <div className="min-h-screen bg-[#0B1118] text-slate-100 flex flex-col items-center justify-center p-6">
        <div className="bg-[#111A24] border border-[#1E293B] rounded-2xl max-w-md w-full p-8 text-center shadow-2xl">
          <div className="h-16 w-16 rounded-full bg-slate-800 border border-slate-700 mx-auto flex items-center justify-center text-2xl mb-4">
            🛑
          </div>
          <h2 className="text-2xl font-bold text-white tracking-tight">SOS Request Cancelled</h2>
          <p className="text-sm text-slate-400 mt-2">
            Your emergency beacon was deactivated and Salvus Command was notified.
          </p>
          <div className="mt-6 flex flex-col gap-3">
            <button
              type="button"
              onClick={() => navigate('/citizen')}
              className="w-full py-3 rounded-xl bg-[#1E293B] hover:bg-[#2A3B4E] text-white text-xs font-bold tracking-wider uppercase transition-colors cursor-pointer"
            >
              Return to Citizen Home
            </button>
            <button
              type="button"
              onClick={triggerSos}
              className="w-full py-3 rounded-xl bg-[#EF4444] hover:bg-rose-600 text-white text-xs font-bold tracking-wider uppercase transition-colors cursor-pointer"
            >
              Re-activate SOS Beacon
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#0B1118] text-slate-100 flex flex-col selection:bg-rose-500 selection:text-white pb-24">
      {/* Top Emergency Mode Bar */}
      <EmergencyHeader incidentId={incident.id} onCancelClick={cancelEmergency} />

      {/* Main Container */}
      <main className="flex-1 max-w-[1440px] w-full mx-auto px-4 sm:px-8 lg:px-12 py-6 space-y-6">
        {/* Location Telemetry */}
        <LocationStatusBanner location={incident.userLocation} />

        {/* 2-Column Responsive Layout */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Left Column (7 cols) */}
          <div className="lg:col-span-7 flex flex-col gap-6">
            <EmergencyStatusCard
              statusInfo={currentInfo}
              severity={incident.severity}
              category={incident.category}
            />

            <EmergencyInstructionCard instructions={instructions} />
          </div>

          {/* Right Column (5 cols) */}
          <div className="lg:col-span-5 flex flex-col gap-6">
            <ResponderPreviewCard
              currentState={currentState}
              responder={responder}
              etaMinutes={etaMinutes}
            />

            <EmergencyTimeline timelineSteps={timelineSteps} currentState={currentState} />
          </div>
        </div>
      </main>

      {/* Floating Demo Simulator Controls */}
      <EmergencyDemoControls
        currentState={currentState}
        onSelectState={setCurrentState}
        onNext={goToNextState}
        onPrev={goToPrevState}
        onReset={resetEmergency}
        isAutoPlaying={isAutoPlaying}
        onToggleAutoPlay={toggleAutoPlay}
      />
    </div>
  )
}

export default CitizenEmergency
