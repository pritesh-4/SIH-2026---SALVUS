import { Outlet } from 'react-router-dom'
import { Navbar } from '../components/citizen/Navbar'
import { BottomNav } from '../components/citizen/BottomNav'
import { ActiveEmergencyBanner } from '../components/citizen/ActiveEmergencyBanner'
import { DevDemoControls } from '../components/common/DevDemoControls'
import { GlobalNotificationBanner } from '../components/common/GlobalNotificationBanner'
import { useAlerts } from '../hooks/useAlerts'

export const CitizenLayout = () => {
  const { badgeCount } = useAlerts()

  return (
    <div className="min-h-screen bg-salvus-bg text-salvus-text-primary flex flex-col selection:bg-salvus-critical selection:text-white transition-colors duration-200">
      {/* Calm System Notifications */}
      <GlobalNotificationBanner />

      {/* Top Persistent Navigation */}
      <Navbar unreadAlertsCount={badgeCount} />

      {/* Active Emergency Cross-Page Status Banner */}
      <ActiveEmergencyBanner />

      {/* Main Page Area */}
      <main className="flex-1 w-full pb-20 md:pb-10">
        <Outlet />
      </main>

      {/* Mobile Persistent Bottom Navigation */}
      <BottomNav unreadAlertsCount={badgeCount} />

      {/* Developer Demo & Resilience Panel */}
      <DevDemoControls />
    </div>
  )
}

export default CitizenLayout
