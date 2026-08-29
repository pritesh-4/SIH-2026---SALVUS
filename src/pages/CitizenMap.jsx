import { useState, useMemo, useEffect, useRef, useCallback } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useLocation } from '../hooks/useLocation'
import { LANDMARKS } from '../lib/location'
import {
  loadNearbyPlaces,
  hasMovedSignificantly,
  PLACE_CATEGORIES,
} from '../services/placesService'
import { fetchHazards, fetchPlaceRoute } from '../services/api'
import { fetchRoute } from '../services/routingService'
import { formatRelativeFreshness } from '../services/locationIntelligenceService'
import { SalvusLeafletMap } from '../components/common/SalvusLeafletMap'
import { PlaceCard } from '../components/citizen/PlaceCard'
import { PlaceDetailPanel } from '../components/citizen/PlaceDetailPanel'
import { Card } from '../components/ui/Card'
import { Badge } from '../components/ui/Badge'
import { Button } from '../components/ui/Button'
import { StatusIndicator } from '../components/ui/StatusIndicator'

const ALL_CATEGORY_FILTERS = [
  ...PLACE_CATEGORIES,
  { id: 'hazards', label: 'Active Hazards', icon: '⚠️', color: 'rose' },
]

export const CitizenMap = () => {
  const [searchParams] = useSearchParams()

  const [activeFilter, setActiveFilter] = useState('all')
  const [selectedPlace, setSelectedPlace] = useState(null)
  const [activeMapRoute, setActiveMapRoute] = useState(null)
  const [isCalculatingRoute, setIsCalculatingRoute] = useState(false)
  const [searchRadiusMeters, setSearchRadiusMeters] = useState(2000)

  // Real-world nearby places and live hazards state
  const [nearbyPlaces, setNearbyPlaces] = useState([])
  const [liveHazards, setLiveHazards] = useState([])
  const [isLoadingPlaces, setIsLoadingPlaces] = useState(false)
  const [placesError, setPlacesError] = useState(null)
  const [placesFreshness, setPlacesFreshness] = useState('FRESH')
  const [lastFetchedAt, setLastFetchedAt] = useState(null)

  const { location, isAcquiring, recenterSignal, requestLocation, selectLandmark, recenterMap } =
    useLocation()

  const prevCoordsRef = useRef(null)
  const initialUrlHandledRef = useRef(false)

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

  // Fetch real-world nearby places and normalized hazards from backend
  const fetchPlacesAndHazards = useCallback(
    async (force = false, radius = searchRadiusMeters) => {
      const lat = location.latitude
      const lon = location.longitude

      if (lat == null || lon == null) {
        setIsLoadingPlaces(false)
        setNearbyPlaces([])
        setPlacesError(
          'Location access is off. Enable GPS or select an approximate landmark to discover nearby verified facilities.'
        )
        setPlacesFreshness('UNAVAILABLE')
        return
      }

      const currentCoords = { latitude: lat, longitude: lon }

      if (
        !force &&
        !hasMovedSignificantly(prevCoordsRef.current, currentCoords, 150) &&
        radius === searchRadiusMeters
      ) {
        return
      }

      prevCoordsRef.current = currentCoords
      setIsLoadingPlaces(true)
      setPlacesError(null)

      try {
        const [placesRes, hazardsRes] = await Promise.allSettled([
          loadNearbyPlaces({
            latitude: lat,
            longitude: lon,
            radius,
            includeVerified: true,
          }),
          fetchHazards(lat, lon, 15.0),
        ])

        setIsLoadingPlaces(false)
        setLastFetchedAt(new Date().toISOString())

        if (placesRes.status === 'fulfilled') {
          if (placesRes.value?.success) {
            setNearbyPlaces(placesRes.value.data || [])
            setPlacesFreshness(placesRes.value.freshness || 'FRESH')
            setPlacesError(null)

            // Select first place if none selected
            if (placesRes.value.data?.length > 0) {
              setSelectedPlace((prev) => prev || placesRes.value.data[0])
            }
          } else {
            setPlacesError(
              placesRes.value.error?.message || 'Nearby places are temporarily unavailable.'
            )
            setPlacesFreshness('UNAVAILABLE')
          }
        }

        if (hazardsRes.status === 'fulfilled' && hazardsRes.value?.success) {
          setLiveHazards(hazardsRes.value.data || [])
        }
      } catch {
        setIsLoadingPlaces(false)
        setPlacesError('Nearby places are temporarily unavailable.')
        setPlacesFreshness('UNAVAILABLE')
      }
    },
    [location.latitude, location.longitude, searchRadiusMeters]
  )

  // Refetch when citizen location becomes available or moves
  useEffect(() => {
    const timer = setTimeout(() => {
      fetchPlacesAndHazards(false)
    }, 0)
    return () => clearTimeout(timer)
  }, [fetchPlacesAndHazards])

  // On-demand turn-by-turn routing to a single selected place
  const handleGetRoute = useCallback(
    async (targetPlace) => {
      if (
        !targetPlace ||
        typeof targetPlace.latitude !== 'number' ||
        typeof targetPlace.longitude !== 'number'
      ) {
        return
      }

      const userLat = location.latitude
      const userLon = location.longitude

      if (userLat == null || userLon == null) {
        alert(
          'Your device location is required to calculate turn-by-turn walking routes. Please enable location.'
        )
        return
      }

      setIsCalculatingRoute(true)

      try {
        // Try backend place route endpoint first
        let routeResult = null
        if (targetPlace.id) {
          const res = await fetchPlaceRoute({
            placeId: targetPlace.id,
            originLat: userLat,
            originLon: userLon,
            profile: 'walking',
          })
          if (res.success && res.data) {
            routeResult = res.data
          }
        }

        // Fallback to general OSRM routing service
        if (!routeResult) {
          const fallbackRes = await fetchRoute(
            userLat,
            userLon,
            targetPlace.latitude,
            targetPlace.longitude,
            'walking'
          )
          if (fallbackRes.success && fallbackRes.data) {
            routeResult = fallbackRes.data
          }
        }

        setIsCalculatingRoute(false)

        if (routeResult) {
          const routeData = {
            ...routeResult,
            placeId: targetPlace.id,
            place: targetPlace,
            label: `Route to ${targetPlace.name}`,
            targetName: targetPlace.name,
            targetAddress: targetPlace.address,
          }
          setActiveMapRoute(routeData)
        }
      } catch {
        setIsCalculatingRoute(false)
      }
    },
    [location.latitude, location.longitude]
  )

  // Handle URL query parameters (e.g. ?shelterId=...&action=route)
  useEffect(() => {
    if (initialUrlHandledRef.current) return
    const shelterIdParam = searchParams.get('shelterId')
    const actionParam = searchParams.get('action')

    if (shelterIdParam && nearbyPlaces.length > 0) {
      initialUrlHandledRef.current = true
      const match =
        nearbyPlaces.find(
          (p) =>
            p.id === shelterIdParam ||
            p.id === `salvus-${shelterIdParam}` ||
            p.name.toLowerCase().includes(shelterIdParam.toLowerCase())
        ) || nearbyPlaces.find((p) => p.category === 'SHELTER')

      if (match) {
        setTimeout(() => {
          setSelectedPlace(match)
          if (actionParam === 'route') {
            handleGetRoute(match)
          }
        }, 0)
      }
    }
  }, [searchParams, nearbyPlaces, handleGetRoute])

  // Filter places based on active category
  const displayedPlaces = useMemo(() => {
    if (activeFilter === 'hazards') return []
    if (activeFilter === 'all') return nearbyPlaces
    return nearbyPlaces.filter((p) => {
      const cat = (p.category || '').toLowerCase()
      if (activeFilter === 'hospital') return cat === 'hospital' || cat === 'clinic'
      if (activeFilter === 'pharmacy') return cat === 'pharmacy'
      if (activeFilter === 'police') return cat === 'police'
      if (activeFilter === 'fire_station') return cat === 'fire_station'
      if (activeFilter === 'shelter') return cat === 'shelter'
      return true
    })
  }, [nearbyPlaces, activeFilter])

  const displayedHazards = useMemo(() => {
    if (activeFilter !== 'all' && activeFilter !== 'hazards') return []
    return liveHazards
  }, [liveHazards, activeFilter])

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
              Real-World Nearby Facilities
            </span>
            <span className="h-1 w-1 rounded-full bg-salvus-border-strong"></span>
            <span className="text-xs text-salvus-info truncate max-w-[280px]">
              {location.latitude
                ? location.address
                : isLandmarkFallback
                  ? `${location.landmarkName} (Approximate)`
                  : 'Location access off'}
            </span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-salvus-text-primary tracking-tight mt-0.5">
            What is near me?
          </h1>
        </div>

        <div className="flex items-center gap-2.5 flex-wrap">
          {placesFreshness === 'STALE' && (
            <Badge
              variant="warning"
              dot={true}
              title="Displaying cached geographic context during provider latency"
            >
              Cached Feed
            </Badge>
          )}

          <button
            type="button"
            onClick={() => fetchPlacesAndHazards(true)}
            disabled={isLoadingPlaces}
            className="px-3 py-1.5 rounded-xl bg-salvus-surface border border-salvus-border hover:border-salvus-info text-salvus-text-secondary hover:text-salvus-text-primary text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer shadow-xs disabled:opacity-50"
            title="Refresh nearby places around your GPS"
          >
            <span>{isLoadingPlaces ? '⏳' : '🔄'}</span>
            <span>{isLoadingPlaces ? 'Refreshing...' : 'Refresh'}</span>
          </button>

          {location.latitude && (
            <button
              type="button"
              onClick={recenterMap}
              className="px-3 py-1.5 rounded-xl bg-salvus-surface border border-salvus-border hover:border-salvus-info text-salvus-text-secondary hover:text-salvus-text-primary text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer shadow-xs"
              title="Center map on your location"
            >
              <span>🎯</span>
              <span>My Location</span>
            </button>
          )}

          <StatusIndicator status="safe" label="Real-World Data" showDot={true} />
        </div>
      </div>

      {/* Geolocation Permission / Fallback Banner */}
      {(isPermissionDenied ||
        isLocationUnavailable ||
        (!location.latitude && !isLandmarkFallback)) && (
        <div className="mb-5 bg-salvus-surface border border-salvus-border rounded-2xl p-4 sm:p-5 flex flex-col md:flex-row items-start md:items-center justify-between gap-4 shadow-sm animate-fadeIn">
          <div className="flex items-start gap-3.5 flex-1 min-w-0">
            <div className="h-10 w-10 rounded-xl bg-salvus-muted border border-salvus-border flex items-center justify-center text-salvus-text-secondary shrink-0 text-base">
              📍
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-salvus-text-primary">
                  {isPermissionDenied
                    ? 'Location access is off'
                    : isLocationUnavailable
                      ? 'Browser cannot provide location'
                      : 'Detecting device location...'}
                </span>
                <Badge variant={isPermissionDenied ? 'warning' : 'neutral'} size="sm">
                  {isPermissionDenied ? 'OFF' : 'OPTIONAL'}
                </Badge>
              </div>
              <p className="text-xs text-salvus-text-secondary mt-0.5 max-w-xl leading-relaxed">
                {isPermissionDenied
                  ? 'Enable location access to view real hospitals, pharmacies, and safe shelters closest to you.'
                  : 'Select your nearest sector landmark to load real-world facilities in that area.'}
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
              {isAcquiring ? 'Acquiring...' : 'Detect Location'}
            </Button>

            <select
              aria-label="Select Landmark Fallback"
              onChange={(e) => {
                if (e.target.value) selectLandmark(e.target.value)
              }}
              defaultValue=""
              className="bg-salvus-surface-elevated border border-salvus-border hover:border-salvus-border-strong text-salvus-text-primary text-xs rounded-xl px-3 py-2 focus:outline-hidden focus:border-salvus-info cursor-pointer font-medium"
            >
              <option value="" disabled>
                Select Sector Landmark...
              </option>
              {LANDMARKS.map((lm) => (
                <option key={lm.name} value={lm.name}>
                  {lm.name} (Approx.)
                </option>
              ))}
            </select>
          </div>
        </div>
      )}

      {/* Provider Notice / Resilient Offline Alert */}
      {placesError && (
        <div className="mb-4 bg-salvus-surface border border-salvus-warning-border/60 rounded-xl px-4 py-3 flex items-center justify-between text-xs text-salvus-text-secondary animate-fadeIn">
          <div className="flex items-center gap-2">
            <span>ℹ️</span>
            <span>
              <strong>Nearby places are temporarily unavailable.</strong> Your live GPS location and
              verified civil defense shelters remain active.
            </span>
          </div>
          <button
            type="button"
            onClick={() => fetchPlacesAndHazards(true)}
            className="text-xs font-semibold text-salvus-info hover:underline cursor-pointer"
          >
            Retry Feed
          </button>
        </div>
      )}

      {/* Calm Category Filter Navigation */}
      <div
        role="tablist"
        aria-label="Facility Categories"
        className="flex items-center gap-2 overflow-x-auto pb-3 mb-4 no-scrollbar"
      >
        {ALL_CATEGORY_FILTERS.map((f) => {
          const count =
            f.id === 'all'
              ? nearbyPlaces.length
              : f.id === 'hazards'
                ? liveHazards.length
                : nearbyPlaces.filter((p) => {
                    const cat = (p.category || '').toLowerCase()
                    if (f.id === 'hospital') return cat === 'hospital' || cat === 'clinic'
                    return cat === f.id
                  }).length

          const isSelectedTab = activeFilter === f.id

          return (
            <button
              key={f.id}
              role="tab"
              type="button"
              aria-selected={isSelectedTab}
              onClick={() => setActiveFilter(f.id)}
              className={`px-3.5 py-1.5 rounded-full text-xs font-semibold tracking-wide transition-all whitespace-nowrap cursor-pointer flex items-center gap-2 ${
                isSelectedTab
                  ? 'bg-salvus-text-primary text-salvus-bg shadow-xs'
                  : 'bg-salvus-surface border border-salvus-border text-salvus-text-secondary hover:text-salvus-text-primary'
              }`}
            >
              <span>{f.icon}</span>
              <span>{f.label}</span>
              <span
                className={`text-[10px] px-1.5 py-0.2 rounded-full font-bold ${
                  isSelectedTab
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

      {/* Main Content Layout: Map Canvas (7 cols) + Detail Inspector / List (5 cols) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Column: Interactive Map */}
        <div className="lg:col-span-7 flex flex-col gap-4">
          <Card
            padding="sm"
            className="flex flex-col relative overflow-hidden min-h-[440px] sm:min-h-[520px]"
          >
            {/* Map Top Status Header */}
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
                      : 'Overview Mode'}
                </span>
              </div>

              <div className="flex items-center gap-2">
                <span
                  className={`px-2 py-0.5 rounded-md text-[10px] font-mono font-bold border ${
                    location.accuracyBadgeClass || 'bg-slate-800 text-slate-400 border-slate-700'
                  }`}
                >
                  {isLandmarkFallback ? 'APPROXIMATE' : location.accuracyLabel || 'GPS Accurate'}
                </span>
              </div>
            </div>

            {/* Leaflet Map Surface */}
            <div className="relative w-full h-[400px] sm:h-[480px] rounded-xl border border-salvus-border overflow-hidden">
              <SalvusLeafletMap
                center={
                  location.latitude && location.longitude
                    ? [location.latitude, location.longitude]
                    : selectedPlace?.latitude && selectedPlace?.longitude
                      ? [selectedPlace.latitude, selectedPlace.longitude]
                      : [20.5937, 78.9629]
                }
                zoom={location.latitude && location.longitude ? 14 : 5}
                userLocation={location.latitude ? location : null}
                recenterSignal={recenterSignal}
                onRecenter={recenterMap}
                showRecenterBtn={Boolean(location.latitude)}
                places={displayedPlaces}
                selectedPlaceId={selectedPlace?.id}
                onSelectPlace={(p) => setSelectedPlace(p)}
                hazards={displayedHazards}
                activeRoute={activeMapRoute}
                onClearRoute={() => setActiveMapRoute(null)}
                showLayers={{
                  places: activeFilter !== 'hazards',
                  hazards: activeFilter === 'all' || activeFilter === 'hazards',
                  incidents: false,
                  shelters: false,
                  responders: false,
                  routes: true,
                }}
                className="h-full w-full"
              />

              {/* Calm Loading Overlay */}
              {isLoadingPlaces && (
                <div className="absolute inset-0 bg-salvus-bg/60 backdrop-blur-xs flex items-center justify-center z-30 pointer-events-none animate-fadeIn">
                  <div className="px-4 py-2.5 rounded-2xl bg-salvus-surface border border-salvus-border shadow-md flex items-center gap-3 text-xs font-semibold text-salvus-text-primary">
                    <span className="animate-spin text-base">⏳</span>
                    <span>Finding nearby services...</span>
                  </div>
                </div>
              )}
            </div>

            {/* Map Legend Footer */}
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
                  <span>Facilities ({displayedPlaces.length})</span>
                </div>
                {displayedHazards.length > 0 && (
                  <div className="flex items-center gap-1.5 font-medium">
                    <span className="h-2.5 w-2.5 rounded-full bg-salvus-critical"></span>
                    <span>Hazards ({displayedHazards.length})</span>
                  </div>
                )}
              </div>

              {lastFetchedAt && (
                <span className="text-[11px] text-salvus-text-muted font-mono">
                  {formatRelativeFreshness(lastFetchedAt)}
                </span>
              )}
            </div>
          </Card>

          {/* Place Cards List View (Accessible Equivalent & Mobile Companion) */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-bold text-salvus-text-primary uppercase tracking-wider">
                Facility Directory ({displayedPlaces.length})
              </h2>
              {searchRadiusMeters !== 2000 && (
                <button
                  type="button"
                  onClick={() => {
                    setSearchRadiusMeters(2000)
                    fetchPlacesAndHazards(true, 2000)
                  }}
                  className="text-xs text-salvus-info hover:underline font-semibold"
                >
                  Reset radius to 2 km
                </button>
              )}
            </div>

            {/* Empty State */}
            {!isLoadingPlaces && displayedPlaces.length === 0 && (
              <Card padding="lg" className="text-center py-8">
                <span className="text-3xl mb-2 block">📍</span>
                <h3 className="text-sm font-bold text-salvus-text-primary">
                  {`No ${activeFilter !== 'all' ? activeFilter : ''} facilities found within ${searchRadiusMeters / 1000} km.`}
                </h3>
                <p className="text-xs text-salvus-text-secondary mt-1 max-w-sm mx-auto">
                  Try searching a wider geographic area or switching categories.
                </p>
                {searchRadiusMeters < 5000 && (
                  <div className="mt-4">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setSearchRadiusMeters(5000)
                        fetchPlacesAndHazards(true, 5000)
                      }}
                    >
                      Search wider area (5 km) →
                    </Button>
                  </div>
                )}
              </Card>
            )}

            {/* Place Card Items */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {displayedPlaces.map((place) => (
                <PlaceCard
                  key={place.id}
                  place={place}
                  isSelected={selectedPlace?.id === place.id}
                  onSelect={(p) => {
                    setSelectedPlace(p)
                    // Scroll detail panel into view on mobile
                    if (window.innerWidth < 1024) {
                      const el = document.getElementById('place-inspector-panel')
                      if (el) el.scrollIntoView({ behavior: 'smooth' })
                    }
                  }}
                  onViewDetails={(p) => {
                    setSelectedPlace(p)
                    if (window.innerWidth < 1024) {
                      const el = document.getElementById('place-inspector-panel')
                      if (el) el.scrollIntoView({ behavior: 'smooth' })
                    }
                  }}
                />
              ))}
            </div>
          </div>
        </div>

        {/* Right Column: Selected Place Detail Panel / Inspector (5 cols) */}
        <div id="place-inspector-panel" className="lg:col-span-5 sticky top-6">
          {selectedPlace ? (
            <PlaceDetailPanel
              place={selectedPlace}
              activeRoute={activeMapRoute}
              isCalculatingRoute={isCalculatingRoute}
              onGetRoute={handleGetRoute}
              onClearRoute={() => setActiveMapRoute(null)}
              onClose={() => setSelectedPlace(null)}
            />
          ) : (
            <Card
              padding="lg"
              className="flex flex-col items-center justify-center text-center min-h-[380px]"
            >
              <span className="text-4xl mb-3 block" aria-hidden="true">
                📍
              </span>
              <h3 className="text-base font-bold text-salvus-text-primary">
                Select a facility to view details
              </h3>
              <p className="text-xs text-salvus-text-secondary mt-1.5 max-w-xs leading-relaxed">
                Click any marker on the map or select a facility from the directory to inspect
                verified contact details, phone numbers, and walking routes.
              </p>
            </Card>
          )}
        </div>
      </div>
    </div>
  )
}

export default CitizenMap
