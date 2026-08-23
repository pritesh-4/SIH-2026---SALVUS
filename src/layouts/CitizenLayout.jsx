import { Outlet } from 'react-router-dom'
import { Navbar } from '../components/citizen/Navbar'
import { BottomNav } from '../components/citizen/BottomNav'
import { DevDemoControls } from '../components/common/DevDemoControls'

export const CitizenLayout = () => {
  return (
    <div className="min-h-screen bg-[#0B1118] text-slate-100 flex flex-col selection:bg-rose-500 selection:text-white">
      {/* Top Persistent Navigation */}
      <Navbar unreadAlertsCount={1} />

      {/* Main Page Area */}
      <main className="flex-1 w-full pb-20 md:pb-10">
        <Outlet />
      </main>

      {/* Mobile Persistent Bottom Navigation */}
      <BottomNav unreadAlertsCount={1} />

      {/* Developer Demo & Resilience Panel */}
      <DevDemoControls />
    </div>
  )
}

export default CitizenLayout
