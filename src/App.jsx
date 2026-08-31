import { lazy, Suspense } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { LocationProvider } from './context/LocationContext'
import { AlertProvider } from './context/AlertContext'
import { useAuth } from './hooks/useAuth'
import ProtectedRoute from './components/common/ProtectedRoute'
import ErrorBoundary from './components/common/ErrorBoundary'
import CitizenLayout from './layouts/CitizenLayout'
import AuthorityLayout from './layouts/AuthorityLayout'

// Route-level code splitting for performance and load optimization
const CitizenHome = lazy(() => import('./pages/CitizenHome'))
const CitizenMap = lazy(() => import('./pages/CitizenMap'))
const CitizenAlerts = lazy(() => import('./pages/CitizenAlerts'))
const CitizenProfile = lazy(() => import('./pages/CitizenProfile'))
const CitizenEmergency = lazy(() => import('./pages/CitizenEmergency'))
const AuthorityCommandCenter = lazy(() => import('./pages/AuthorityCommandCenter'))
const LoginPage = lazy(() => import('./pages/LoginPage'))

const PageFallback = () => (
  <div className="min-h-[50vh] flex flex-col items-center justify-center gap-3 p-8">
    <div className="h-7 w-7 border-2 border-salvus-info border-t-transparent rounded-full animate-spin" />
    <span className="text-salvus-text-secondary text-xs font-medium tracking-wide">
      Loading view…
    </span>
  </div>
)

const App = () => {
  const { isAuthenticated, role } = useAuth()

  return (
    <ErrorBoundary variant="fullscreen" fallbackTitle="Salvus Emergency Console Degraded">
      <LocationProvider>
        <AlertProvider>
          <Suspense fallback={<PageFallback />}>
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
          </Suspense>
        </AlertProvider>
      </LocationProvider>
    </ErrorBoundary>
  )
}

export default App
