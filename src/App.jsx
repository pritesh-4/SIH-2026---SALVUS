import { Routes, Route, Navigate } from 'react-router-dom'
import { LocationProvider } from './context/LocationContext'
import { AlertProvider } from './context/AlertContext'
import { useAuth } from './hooks/useAuth'
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
  const { isAuthenticated, isLoading } = useAuth()

  // While checking for existing session, show nothing (LoginPage handles its own loading)
  if (isLoading) {
    return (
      <div className="min-h-screen bg-salvus-bg flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 border-2 border-salvus-info border-t-transparent rounded-full animate-spin" />
          <span className="text-salvus-text-secondary text-sm">Loading Salvus…</span>
        </div>
      </div>
    )
  }

  return (
    <LocationProvider>
      <AlertProvider>
        <Routes>
          {/* Authentication Gateway */}
          <Route path="/login" element={<LoginPage />} />

          {/* Redirect unauthenticated users to login */}
          <Route
            path="/"
            element={
              isAuthenticated ? (
                <Navigate to="/citizen" replace />
              ) : (
                <Navigate to="/login" replace />
              )
            }
          />

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
          <Route
            path="*"
            element={
              isAuthenticated ? (
                <Navigate to="/citizen" replace />
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
