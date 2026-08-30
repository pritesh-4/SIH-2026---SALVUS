import { Routes, Route, Navigate } from 'react-router-dom'
import { LocationProvider } from './context/LocationContext'
import { AlertProvider } from './context/AlertContext'
import { useAuth } from './hooks/useAuth'
import ProtectedRoute from './components/common/ProtectedRoute'
import CitizenLayout from './layouts/CitizenLayout'
import CitizenHome from './pages/CitizenHome'
import CitizenMap from './pages/CitizenMap'
import CitizenAlerts from './pages/CitizenAlerts'
import CitizenProfile from './pages/CitizenProfile'
import CitizenEmergency from './pages/CitizenEmergency'
import AuthorityLayout from './layouts/AuthorityLayout'
import AuthorityCommandCenter from './pages/AuthorityCommandCenter'
import LoginPage from './pages/LoginPage'

const App = () => {
  const { isAuthenticated, role } = useAuth()

  return (
    <LocationProvider>
      <AlertProvider>
        <Routes>
          {/* Public Authentication Gateway */}
          <Route path="/login" element={<LoginPage />} />

          {/* Root Redirect based on authentication & verified role */}
          <Route
            path="/"
            element={
              isAuthenticated ? (
                <Navigate to={role === 'AUTHORITY' ? '/authority' : '/citizen'} replace />
              ) : (
                <Navigate to="/login" replace />
              )
            }
          />

          {/* Citizen Protected Application Routes (Requires CITIZEN role) */}
          <Route element={<ProtectedRoute allowedRoles={['CITIZEN']} />}>
            <Route path="/citizen" element={<CitizenLayout />}>
              <Route index element={<CitizenHome />} />
              <Route path="home" element={<Navigate to="/citizen" replace />} />
              <Route path="map" element={<CitizenMap />} />
              <Route path="alerts" element={<CitizenAlerts />} />
              <Route path="profile" element={<CitizenProfile />} />
            </Route>

            {/* Standalone Citizen Emergency Experience */}
            <Route path="/citizen/sos" element={<CitizenEmergency />} />
            <Route path="/citizen/emergency" element={<CitizenEmergency />} />
          </Route>

          {/* Authority Protected Application Routes (Requires AUTHORITY or SYSTEM role) */}
          <Route element={<ProtectedRoute allowedRoles={['AUTHORITY', 'SYSTEM']} />}>
            <Route path="/authority" element={<AuthorityLayout />}>
              <Route index element={<AuthorityCommandCenter />} />
              <Route path="command" element={<Navigate to="/authority" replace />} />
            </Route>
          </Route>

          {/* Catch-all Route: Redirect to appropriate role home or login */}
          <Route
            path="*"
            element={
              isAuthenticated ? (
                <Navigate to={role === 'AUTHORITY' ? '/authority' : '/citizen'} replace />
              ) : (
                <Navigate to="/login" replace />
              )
            }
          />
        </Routes>
      </AlertProvider>
    </LocationProvider>
  )
}

export default App
