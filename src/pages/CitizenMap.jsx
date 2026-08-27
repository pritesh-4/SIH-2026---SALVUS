import { useState, useMemo, useEffect, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useLocation } from '../hooks/useLocation'
import { LANDMARKS } from '../lib/location'
import { loadNearbyPlaces, hasMovedSignificantly } from '../services/placesService'
import { SalvusLeafletMap } from '../components/common/SalvusLeafletMap'
import { SimulatedBadge } from '../components/common/SimulatedBadge'
import { Card } from '../components/ui/Card'
import { Badge } from '../components/ui/Badge'
import { Button } from '../components/ui/Button'
import { StatusIndicator } from '../components/ui/StatusIndicator'

const CITIZEN_HAZARDS = [
  {
    id: 'hz-1',
    ticket_id: 'SV-1982',
    name: 'Sector 12 Underpass Flooding',
    type: 'flood',
    severity: 'CRITICAL',
    status: 'NEW',
    description: 'Submerged underpass with 1.4m standing floodwater. Avoid vehicular transit.',
    latitude: 22.5841,
    longitude: 88.412,
    distance: '620m North',
    distance_formatted: 'Approx. 620 m',
    recommendedAction: 'Use elevated northern bypass route. Do not attempt to cross on foot.',
  },
  {
    id: 'hz-2',
    ticket_id: 'SV-1910',
    name: 'Downed Power Wire Hazard',
    type: 'power_line',
    severity: 'HIGH',
    status: 'VERIFIED',
    description: 'Power wire down near water channel. Area isolated by emergency crew.',
    latitude: 22.565,
    longitude: 88.358,
    distance: '480m West',
    distance_formatted: 'Approx. 480 m',
    recommendedAction: 'Maintain minimum 50-meter clearance. Keep clear of standing water.',
  },
]

const CATEGORY_FILTERS = [
  { id: 'all', label: 'All Places', icon: '📍' },
  { id: 'hospital', label: 'Hospitals & Clinics', icon: '🏥' },
  { id: 'pharmacy', label: 'Pharmacies', icon: '💊' },
  { id: 'police', label: 'Police', icon: '🛡️' },
  { id: 'fire_station', label: 'Fire & Rescue', icon: '🚒' },
  { id: 'shelter', label: 'Safe Shelters', icon: '🏠' },
  { id: 'hazards', label: 'Hazards', icon: '⚠️' },
]

export const CitizenMap = () => {
  const navigate = useNavigate()
  const [activeFilter, setActiveFilter] = useState('all')
  const [selectedItem, setSelectedItem] = useState(null)
  const [activeRouteGuide, setActiveRouteGuide] = useState(null)

  // Real-world nearby places state
  const [nearbyPlaces, setNearbyPlaces] = useState([])
  const [isLoadingPlaces, setIsLoadingPlaces] = useState(false)
  const [placesError, setPlacesError] = useState(null)

  const { location, isAcquiring, recenterSignal, requestLocation, selectLandmark, recenterMap } =
    useLocation()

  const routeModalRef = useRef(null)
  const prevCoordsRef = useRef(null)

  // Request location on map mount if not yet requested
  useEffect(() => {
    if (
      location.source === 'UNKNOWN' &&
      location.latitude === null &&
      location.permission !== 'DENIED'
    ) {
      requestLocation()
    }
  }, [location.source, location.latitude, location.permission, requestLocation])

  // Fetch real-world nearby places from backend
  const fetchPlaces = useCallback(
    async (force = false) => {
      const lat = location.latitude || 22.5726
      const lon = location.longitude || 88.3639

      const currentCoords = { latitude: lat, longitude: lon }

      if (!force && !hasMovedSignificantly(prevCoordsRef.current, currentCoords, 150)) {
        return
      }

      prevCoordsRef.current = currentCoords
      setIsLoadingPlaces(true)
      setPlacesError(null)

      const result = await loadNearbyPlaces({
        latitude: lat,
        longitude: lon,
        radius: 2500,
        includeVerified: true,
      })

      setIsLoadingPlaces(false)
      if (result.success && result.data?.length > 0) {
        setNearbyPlaces(result.data)
        setPlacesError(null)
        // If no item selected yet, select first nearby place or shelter
        setSelectedItem((prev) => prev || result.data[0])
      } else if (!result.success) {
        setPlacesError(result.error?.message || 'Nearby places are temporarily unavailable.')
      }
    },
    [location.latitude, location.longitude]
  )

  // Refetch nearby places when citizen location becomes available or moves
  useEffect(() => {
    const timer = setTimeout(() => {
      fetchPlaces(false)
    }, 0)
    return () => clearTimeout(timer)
  }, [fetchPlaces])

  // Escape key + body scroll lock for route modal
  useEffect(() => {
    if (!activeRouteGuide) return
    const originalOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    if (routeModalRef.current) routeModalRef.current.focus()

    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        setActiveRouteGuide(null)
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      document.body.style.overflow = originalOverflow
    }
  }, [activeRouteGuide])

  // Filter places based on active category filter
  const displayedPlaces = useMemo(() => {
    if (activeFilter === 'hazards') return []
    if (activeFilter === 'all') return nearbyPlaces
    return nearbyPlaces.filter((p) => {
      const cat = p.category?.toLowerCase() || ''
      if (activeFilter === 'hospital') return cat === 'hospital' || cat === 'clinic'
      if (activeFilter === 'pharmacy') return cat === 'pharmacy'
      if (activeFilter === 'police') return cat === 'police'
      if (activeFilter === 'fire_station') return cat === 'fire_station'
      if (activeFilter === 'shelter') return cat === 'shelter'
      return true
    })
  }, [nearbyPlaces, activeFilter])

  const displayedIncidents = useMemo(() => {
    if (activeFilter !== 'all' && activeFilter !== 'hazards') return []
    return CITIZEN_HAZARDS
  }, [activeFilter])

  const isPermissionDenied = location.permission === 'DENIED' || location.status === 'DENIED'
  const isLocationUnavailable =
    location.permission === 'UNAVAILABLE' || location.status === 'UNAVAILABLE'
  const isLandmarkFallback = location.source === 'LANDMARK' || location.isFallback

  return (
    <div className="max-w-[1440px] w-full mx-auto px-4 sm:px-8 lg:px-12 py-6 sm:py-8 animate-fadeIn">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-salvus-text-secondary">
              Real-World Geographic Intelligence
            </span>
            <span className="h-1 w-1 rounded-full bg-salvus-border-strong"></span>
            <span className="text-xs text-salvus-info">
              {location.latitude
                ? location.address
                : isLandmarkFallback
                  ? `${location.landmarkName} (Approximate)`
                  : 'Sector 12, Salt Lake'}
            </span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-salvus-text-primary tracking-tight mt-0.5">
            Nearby Emergency & Safe Facilities
          </h1>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => fetchPlaces(true)}
            disabled={isLoadingPlaces}
            className="px-3 py-1.5 rounded-xl bg-salvus-surface border border-salvus-border hover:border-salvus-info text-salvus-text-secondary hover:text-salvus-text-primary text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer shadow-xs disabled:opacity-50"
            title="Refresh real-world places around your coordinates"
          >
            <span>{isLoadingPlaces ? '⏳' : '🔄'}</span>
            <span>{isLoadingPlaces ? 'Searching...' : 'Refresh Places'}</span>
          </button>

          {location.latitude && (
            <button
              type="button"
              onClick={recenterMap}
              className="px-3 py-1.5 rounded-xl bg-salvus-surface border border-salvus-border hover:border-salvus-info text-salvus-text-secondary hover:text-salvus-text-primary text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer shadow-xs"
              title="Center map on your location"
            >
              <span>🎯</span>
              <span>Recenter on me</span>
            </button>
          )}
          <StatusIndicator status="safe" label="Area Monitored Live" showDot={true} />
        </div>
      </div>

      {/* Permission / Geolocation Guidance Banner (Calm & Non-Alarming) */}
      {(isPermissionDenied ||
        isLocationUnavailable ||
        (!location.latitude && !isLandmarkFallback)) && (
        <div className="mb-5 bg-salvus-surface border border-salvus-border rounded-2xl p-4 sm:p-5 flex flex-col md:flex-row items-start md:items-center justify-between gap-4 shadow-sm animate-fadeIn">
          <div className="flex items-start gap-3.5">
            <div className="h-10 w-10 rounded-xl bg-salvus-muted border border-salvus-border flex items-center justify-center text-salvus-text-secondary shrink-0 text-base">
              📍
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-salvus-text-primary">
                  {isPermissionDenied
                    ? 'Location access is off'
                    : isLocationUnavailable
                      ? 'Your browser cannot provide location right now'
                      : 'Detecting device location...'}
                </span>
                <Badge variant={isPermissionDenied ? 'warning' : 'neutral'} size="sm">
                  {isPermissionDenied ? 'OFF' : 'OPTIONAL'}
                </Badge>
              </div>
              <p className="text-xs text-salvus-text-secondary mt-0.5 max-w-xl leading-relaxed">
                {isPermissionDenied
                  ? 'Enable location to automatically center on your position, or select your nearest landmark below.'
                  : isLocationUnavailable
                    ? 'Browser security or device settings prevented location acquisition. You can select a sector landmark.'
                    : 'Salvus accesses your location on-demand to display nearby hospitals, pharmacies, police, and verified safe shelters.'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2.5 self-stretch md:self-auto flex-wrap">
            <Button
              variant="primary"
              size="sm"
              onClick={() => requestLocation({ timeout: 10000 })}
              loading={isAcquiring}
            >
              {isAcquiring
                ? 'Acquiring...'
                : isPermissionDenied
                  ? 'Enable Location'
                  : 'Detect Location'}
            </Button>

            {/* Landmark fallback selector */}
            <div className="relative">
              <select
                aria-label="Select Landmark Fallback"
                onChange={(e) => {
                  if (e.target.value) selectLandmark(e.target.value)
                }}
                defaultValue=""
                className="bg-salvus-surface-elevated border border-salvus-border hover:border-salvus-border-strong text-salvus-text-primary text-xs rounded-xl px-3 py-2 focus:outline-none focus:border-salvus-info cursor-pointer font-medium"
              >
                <option value="" disabled>
                  Select Landmark Fallback...
                </option>
                {LANDMARKS.map((lm) => (
                  <option key={lm.name} value={lm.name}>
                    {lm.name} (Approx.)
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>
      )}

      {/* Places Provider Failure Notice (Calm Resilience) */}
      {placesError && (
        <div className="mb-4 bg-salvus-surface border border-salvus-warning-border/60 rounded-xl px-4 py-2.5 flex items-center justify-between text-xs text-salvus-text-secondary animate-fadeIn">
          <div className="flex items-center gap-2">
            <span>ℹ️</span>
            <span>
              <strong>Nearby places feed is temporarily offline.</strong> Your live location and
              emergency beacon remain active.
            </span>
          </div>
          <button
            type="button"
            onClick={() => fetchPlaces(true)}
            className="text-xs font-semibold text-salvus-info hover:underline cursor-pointer"
          >
            Retry Feed
          </button>
        </div>
      )}

      {/* Layer Filter Pills */}
      <div className="flex items-center gap-2 overflow-x-auto pb-3 mb-4 no-scrollbar">
        {CATEGORY_FILTERS.map((f) => {
          let count
          if (f.id === 'all') count = nearbyPlaces.length + CITIZEN_HAZARDS.length
          else if (f.id === 'hazards') count = CITIZEN_HAZARDS.length
          else {
            count = nearbyPlaces.filter((p) => {
              const cat = p.category?.toLowerCase() || ''
              if (f.id === 'hospital') return cat === 'hospital' || cat === 'clinic'
              return cat === f.id
            }).length
          }

          return (
            <button
              key={f.id}
              type="button"
              onClick={() => setActiveFilter(f.id)}
              aria-pressed={activeFilter === f.id}
              className={`px-3.5 py-1.5 rounded-full text-xs font-semibold tracking-wide transition-all whitespace-nowrap cursor-pointer flex items-center gap-2 ${
                activeFilter === f.id
                  ? 'bg-salvus-text-primary text-salvus-bg shadow-xs'
                  : 'bg-salvus-surface border border-salvus-border text-salvus-text-secondary hover:text-salvus-text-primary'
              }`}
            >
              <span>{f.icon}</span>
              <span>{f.label}</span>
              <span
                className={`text-[10px] px-1.5 py-0.2 rounded-full font-bold ${
                  activeFilter === f.id
                    ? 'bg-salvus-bg/20 text-salvus-bg'
                    : 'bg-salvus-muted text-salvus-text-muted'
                }`}
              >
                {count}
              </span>
            </button>
          )
        })}
      </div>

      {/* Map Layout Grid: Left Canvas (7 cols), Right Detail Sheet (5 cols) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Map Surface (7 cols) */}
        <Card
          padding="sm"
          className="lg:col-span-7 flex flex-col justify-between relative overflow-hidden min-h-[440px] sm:min-h-[520px]"
        >
          {/* Map Top Status Bar */}
          <div className="flex items-center justify-between z-10 bg-salvus-surface/90 backdrop-blur-md px-3.5 py-2 rounded-xl border border-salvus-border text-xs mb-3 flex-wrap gap-2">
            <div className="flex items-center gap-2 font-medium text-salvus-text-primary">
              <span
                className={`h-2.5 w-2.5 rounded-full shrink-0 ${
                  location.source === 'BROWSER'
                    ? 'bg-salvus-info animate-pulse'
                    : isLandmarkFallback
                      ? 'bg-amber-400'
                      : 'bg-slate-500'
                }`}
              ></span>
              <span className="truncate max-w-[240px] sm:max-w-none">
                {location.source === 'BROWSER'
                  ? `Your location: ${location.address}`
                  : isLandmarkFallback
                    ? `Approximate landmark: ${location.landmarkName}`
                    : 'Location access off · Overview mode'}
              </span>
            </div>

            <div className="flex items-center gap-2">
              <span
                className={`px-2 py-0.5 rounded-md text-[10px] font-mono font-bold border ${location.accuracyBadgeClass || 'bg-slate-800 text-slate-400 border-slate-700'}`}
              >
                {isLandmarkFallback
                  ? 'APPROXIMATE LOCATION'
                  : location.accuracyLabel || 'Standard Map'}
              </span>

              {location.latitude && (
                <button
                  type="button"
                  onClick={recenterMap}
                  className="text-salvus-info hover:underline text-xs font-semibold cursor-pointer"
                  title="Recenter on me"
                >
                  Recenter
                </button>
              )}
            </div>
          </div>

          {/* Real Leaflet Map Surface */}
          <div className="relative w-full h-[380px] rounded-xl border border-salvus-border overflow-hidden">
            <SalvusLeafletMap
              center={
                location.latitude && location.longitude
                  ? [location.latitude, location.longitude]
                  : [22.5726, 88.3639]
              }
              zoom={14}
              userLocation={location.latitude ? location : null}
              recenterSignal={recenterSignal}
              onRecenter={recenterMap}
              showRecenterBtn={Boolean(location.latitude)}
              places={displayedPlaces}
              selectedPlaceId={selectedItem?.id}
              onSelectPlace={(p) => setSelectedItem(p)}
              incidents={displayedIncidents}
              shelters={[]}
              showLayers={{
                places: activeFilter !== 'hazards',
                incidents: activeFilter === 'all' || activeFilter === 'hazards',
                shelters: false,
                responders: false,
              }}
              onSelectIncident={(inc) => setSelectedItem(inc)}
              className="h-full w-full"
            />
          </div>

          {/* Map Footer Legend */}
          <div className="mt-3 bg-salvus-surface px-3.5 py-2 rounded-xl border border-salvus-border flex items-center justify-between text-xs text-salvus-text-secondary flex-wrap gap-2">
            <div className="flex items-center gap-4 flex-wrap">
              <div className="flex items-center gap-1.5 font-medium">
                <span
                  className={`h-2.5 w-2.5 rounded-full ${
                    isLandmarkFallback ? 'bg-amber-400' : 'bg-salvus-info'
                  }`}
                ></span>
                <span>{isLandmarkFallback ? 'Approximate (Landmark)' : 'You (GPS)'}</span>
              </div>
              <div className="flex items-center gap-1.5 font-medium">
                <span className="h-2.5 w-2.5 rounded-full bg-emerald-400"></span>
                <span>Places ({displayedPlaces.length})</span>
              </div>
              <div className="flex items-center gap-1.5 font-medium">
                <span className="h-2.5 w-2.5 rounded-full bg-salvus-critical"></span>
                <span>Hazards ({displayedIncidents.length})</span>
              </div>
            </div>
            <button
              type="button"
              onClick={() => {
                if (displayedPlaces.length > 0) {
                  setSelectedItem(displayedPlaces[0])
                }
                recenterMap()
              }}
              className="text-salvus-info hover:underline font-semibold cursor-pointer text-xs"
            >
              Reset view
            </button>
          </div>
        </Card>

        {/* Marker Detail Sheet / Side Card (5 cols) */}
        <div className="lg:col-span-5 flex flex-col gap-4">
          {selectedItem ? (
            <Card
              padding="md"
              className="flex flex-col justify-between min-h-[440px] transition-all"
            >
              <div>
                {/* Header Tag, Distance & Provenance Badge */}
                <div className="flex items-center justify-between gap-2 mb-3 flex-wrap">
                  <div className="flex items-center gap-2">
                    <Badge
                      variant={
                        selectedItem.provenance === 'SALVUS_VERIFIED'
                          ? 'safe'
                          : selectedItem.category === 'hospital' ||
                              selectedItem.category === 'clinic'
                            ? 'info'
                            : selectedItem.category === 'pharmacy'
                              ? 'safe'
                              : selectedItem.type === 'flood' || selectedItem.type === 'power_line'
                                ? 'critical'
                                : 'neutral'
                      }
                    >
                      {selectedItem.category?.toUpperCase() || selectedItem.type?.toUpperCase()}
                    </Badge>

                    {/* Strict Provenance Badge */}
                    <span
                      className={`text-[10px] px-2 py-0.5 rounded font-mono font-bold uppercase border ${
                        selectedItem.provenance === 'SALVUS_VERIFIED'
                          ? 'bg-emerald-950/80 text-emerald-300 border-emerald-500/50'
                          : 'bg-slate-900 text-slate-400 border-slate-700'
                      }`}
                    >
                      {selectedItem.provenance === 'SALVUS_VERIFIED'
                        ? '✓ SALVUS VERIFIED'
                        : 'MAPPED (OSM)'}
                    </span>
                  </div>

                  <span className="text-xs font-semibold text-salvus-text-primary bg-salvus-muted px-2.5 py-1 rounded-lg border border-salvus-border font-mono">
                    {selectedItem.distance_formatted || selectedItem.distance || 'Near You'}
                  </span>
                </div>

                {/* Title & Address */}
                <h2 className="text-xl font-bold text-salvus-text-primary tracking-tight">
                  {selectedItem.name || `Hazard #${selectedItem.ticket_id}`}
                </h2>
                <p className="text-xs text-salvus-text-secondary mt-1">
                  {selectedItem.address ||
                    selectedItem.description ||
                    'Address unlisted in OpenStreetMap'}
                </p>

                {/* Provenance Explainer Callout */}
                <div
                  className={`mt-4 p-3 rounded-xl border text-xs leading-relaxed ${
                    selectedItem.provenance === 'SALVUS_VERIFIED'
                      ? 'bg-emerald-950/30 border-emerald-500/40 text-emerald-300'
                      : 'bg-slate-900/60 border-slate-800 text-slate-400'
                  }`}
                >
                  {selectedItem.provenance === 'SALVUS_VERIFIED' ? (
                    <div className="flex items-start gap-2">
                      <span>🛡️</span>
                      <span>
                        <strong>Officially designated Salvus emergency refuge.</strong> Verified
                        civil defense resources and intake active.
                      </span>
                    </div>
                  ) : (
                    <div className="flex items-start gap-2">
                      <span>ℹ️</span>
                      <span>
                        <strong>Real-world geographic place (OpenStreetMap).</strong> For general
                        reference and situational orientation; not an official Salvus emergency
                        shelter.
                      </span>
                    </div>
                  )}
                </div>

                {/* Amenities / Resources Details */}
                {selectedItem.amenities && selectedItem.amenities.length > 0 && (
                  <div className="mt-4">
                    <span className="text-xs font-bold text-salvus-text-primary block mb-2">
                      Facilities & Tags:
                    </span>
                    <div className="flex flex-wrap gap-1.5">
                      {selectedItem.amenities.map((a) => (
                        <span
                          key={a}
                          className="bg-salvus-surface-elevated border border-salvus-border text-salvus-text-secondary text-xs px-2.5 py-1 rounded-lg font-medium"
                        >
                          ✓ {a}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Contact phone if available */}
                {selectedItem.phone && (
                  <div className="mt-3 bg-salvus-muted/40 border border-salvus-border p-2.5 rounded-xl flex items-center justify-between text-xs">
                    <span className="text-salvus-text-muted">Contact Phone:</span>
                    <a
                      href={`tel:${selectedItem.phone}`}
                      className="font-mono text-salvus-info font-bold hover:underline"
                    >
                      {selectedItem.phone}
                    </a>
                  </div>
                )}

                {/* Hazard-Specific Details */}
                {(selectedItem.type === 'flood' ||
                  selectedItem.type === 'power_line' ||
                  selectedItem.type === 'hazard') && (
                  <div className="mt-4 space-y-3">
                    <div className="bg-salvus-critical-bg border border-salvus-critical-border p-3.5 rounded-xl">
                      <div className="flex items-center gap-2 text-salvus-critical font-bold text-xs mb-1">
                        <span>⚠️ HAZARD WARNING</span>
                      </div>
                      <p className="text-xs text-salvus-critical font-medium leading-relaxed">
                        {selectedItem.description}
                      </p>
                    </div>

                    <div className="bg-salvus-muted/40 border border-salvus-border p-3 rounded-xl">
                      <span className="text-xs font-bold text-salvus-text-primary uppercase block mb-1">
                        Recommended Action
                      </span>
                      <p className="text-xs text-salvus-text-secondary leading-relaxed">
                        {selectedItem.recommendedAction ||
                          'Keep clear of the affected area. Follow safe elevated bypass.'}
                      </p>
                    </div>
                  </div>
                )}
              </div>

              {/* Action Buttons */}
              <div className="mt-6 pt-4 border-t border-salvus-border flex flex-col sm:flex-row gap-3">
                {selectedItem.provenance === 'SALVUS_VERIFIED' && (
                  <Button
                    variant="safe"
                    size="lg"
                    fullWidth={true}
                    onClick={() => setActiveRouteGuide(selectedItem)}
                    className="font-bold text-xs sm:text-sm"
                  >
                    View Safe Walking Route
                  </Button>
                )}
                {(selectedItem.type === 'flood' || selectedItem.type === 'power_line') && (
                  <Button
                    variant="critical"
                    size="lg"
                    fullWidth={true}
                    onClick={() => navigate('/citizen/sos')}
                    className="font-bold text-xs sm:text-sm"
                  >
                    Request Emergency SOS
                  </Button>
                )}
                {selectedItem.provenance === 'OSM_MAPPED' && (
                  <Button
                    variant="primary"
                    size="lg"
                    fullWidth={true}
                    onClick={() => setActiveRouteGuide(selectedItem)}
                    className="font-bold text-xs sm:text-sm"
                  >
                    View Directions / Walking Guide
                  </Button>
                )}
              </div>
            </Card>
          ) : (
            <Card
              padding="lg"
              className="flex flex-col items-center justify-center text-center min-h-[440px]"
            >
              <span className="text-3xl mb-2" aria-hidden="true">
                📍
              </span>
              <h3 className="text-base font-bold text-salvus-text-primary">
                Select any place on the map
              </h3>
              <p className="text-xs text-salvus-text-secondary mt-1 max-w-xs leading-relaxed">
                Click a hospital, pharmacy, police station, or safe shelter to view real-world
                geographic context and provenance.
              </p>
            </Card>
          )}
        </div>
      </div>

      {/* Interactive Safe Route Guidance Modal */}
      {activeRouteGuide && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="route-modal-title"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-xs animate-fadeIn"
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setActiveRouteGuide(null)
            }
          }}
        >
          <div
            ref={routeModalRef}
            tabIndex={-1}
            className="bg-salvus-surface border border-salvus-border rounded-2xl max-w-lg w-full p-6 sm:p-7 shadow-2xl relative text-salvus-text-primary outline-none"
          >
            <div className="flex items-center justify-between gap-3 mb-4">
              <div className="flex items-center gap-2">
                <Badge
                  variant={activeRouteGuide.provenance === 'SALVUS_VERIFIED' ? 'safe' : 'neutral'}
                  dot={true}
                >
                  {activeRouteGuide.provenance === 'SALVUS_VERIFIED'
                    ? 'Safe Route Guidance'
                    : 'Walking Guidance'}
                </Badge>
                <SimulatedBadge label="OFFLINE ROUTE" />
              </div>
              <button
                type="button"
                onClick={() => setActiveRouteGuide(null)}
                aria-label="Close route view"
                className="text-salvus-text-muted hover:text-salvus-text-primary text-base font-bold p-1 cursor-pointer select-none"
              >
                ✕
              </button>
            </div>

            <h3
              id="route-modal-title"
              className="text-xl font-extrabold text-salvus-text-primary tracking-tight"
            >
              Route to {activeRouteGuide.name}
            </h3>
            <p className="text-xs sm:text-sm text-salvus-text-secondary mt-1">
              Distance:{' '}
              <strong className="text-salvus-text-primary">
                {activeRouteGuide.distance_formatted || activeRouteGuide.distance}
              </strong>{' '}
              · Estimated Time: <strong className="text-salvus-safe">4-8 mins</strong>
            </p>

            <div className="bg-salvus-muted/40 border border-salvus-border rounded-xl p-4 my-4 space-y-3">
              <div className="flex items-start gap-3 text-xs">
                <span className="h-5 w-5 rounded-full bg-salvus-safe-bg border border-salvus-safe-border text-salvus-safe font-bold text-[11px] flex items-center justify-center shrink-0">
                  1
                </span>
                <div>
                  <strong className="text-salvus-text-primary block">
                    Head along main pedestrian access route
                  </strong>
                  <span className="text-salvus-text-secondary">
                    Stay on paved pathways and avoid low-lying water collection zones.
                  </span>
                </div>
              </div>

              <div className="flex items-start gap-3 text-xs">
                <span className="h-5 w-5 rounded-full bg-salvus-safe-bg border border-salvus-safe-border text-salvus-safe font-bold text-[11px] flex items-center justify-center shrink-0">
                  2
                </span>
                <div>
                  <strong className="text-salvus-text-primary block">
                    Approach destination entry
                  </strong>
                  <span className="text-salvus-text-secondary">
                    {activeRouteGuide.address || 'Follow destination signage.'}
                  </span>
                </div>
              </div>
            </div>

            <Button
              variant="safe"
              size="lg"
              fullWidth={true}
              onClick={() => setActiveRouteGuide(null)}
              className="font-bold text-xs sm:text-sm"
            >
              Close Route View
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}

export default CitizenMap
