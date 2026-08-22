import { Routes, Route, Navigate } from 'react-router-dom'
import CitizenLayout from './layouts/CitizenLayout'
import CitizenHome from './pages/CitizenHome'
import CitizenMap from './pages/CitizenMap'
import CitizenAlerts from './pages/CitizenAlerts'
import CitizenProfile from './pages/CitizenProfile'
import CitizenEmergency from './pages/CitizenEmergency'

const App = () => {
  return (
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

      {/* Catch-all redirect */}
      <Route path="*" element={<Navigate to="/citizen" replace />} />
    </Routes>
  )
}

export default App
