import { Routes, Route, Navigate } from 'react-router-dom'
import { LocationProvider } from './context/LocationContext'
import { AlertProvider } from './context/AlertContext'
import CitizenLayout from './layouts/CitizenLayout'
import CitizenHome from './pages/CitizenHome'
import CitizenMap from './pages/CitizenMap'
import CitizenAlerts from './pages/CitizenAlerts'
import CitizenProfile from './pages/CitizenProfile'
import CitizenEmergency from './pages/CitizenEmergency'
import AuthorityLayout from './layouts/AuthorityLayout'
import AuthorityCommandCenter from './pages/AuthorityCommandCenter'

const App = () => {
  return (
    <LocationProvider>
      <AlertProvider>
        <Routes>
          <Route path="/" element={<Navigate to="/citizen" replace />} />

          {/* Citizen Persistent SPA Experience */}
          <Route path="/citizen" element={<CitizenLayout />}>
            <Route index element={<CitizenHome />} />
            <Route path="home" element={<Navigate to="/citizen" replace />} />
            <Route path="map" element={<CitizenMap />} />
            <Route path="alerts" element={<CitizenAlerts />} />
            <Route path="profile" element={<CitizenProfile />} />
          </Route>

          {/* Standalone Citizen Emergency Mode */}
          <Route path="/citizen/sos" element={<CitizenEmergency />} />
          <Route path="/citizen/emergency" element={<CitizenEmergency />} />

          {/* Authority Command Center SPA Experience */}
          <Route path="/authority" element={<AuthorityLayout />}>
            <Route index element={<AuthorityCommandCenter />} />
            <Route path="command" element={<Navigate to="/authority" replace />} />
          </Route>

          {/* Catch-all redirect */}
          <Route path="*" element={<Navigate to="/citizen" replace />} />
        </Routes>
      </AlertProvider>
    </LocationProvider>
  )
}

export default App
