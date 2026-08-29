import { useState, useMemo, useEffect, useRef, useCallback } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useLocation } from '../hooks/useLocation'
import { LANDMARKS } from '../lib/location'
import {
  loadNearbyPlaces,
  hasMovedSignificantly,
  matchesCategoryFilter,
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
  const [searchRadiusMeters, setSearchRadiusMeters] = useState(10000)

  // Real-world nearby places and live hazards state
  const [nearbyPlaces, setNearbyPlaces] = useState([])
  const [liveHazards, setLiveHazards] = useState([])
  const [isLoadingPlaces, setIsLoadingPlaces] = useState(false)
  const [isRefreshingPlaces, setIsRefreshingPlaces] = useState(false)
  const [feedStatus, setFeedStatus] = useState('IDLE') // 'IDLE' | 'AVAILABLE' | 'NO_RESULTS' | 'PARTIAL_RESULTS' | 'UNAVAILABLE' | 'STALE' | 'OK' | 'EMPTY'
  const [categoryTelemetry, setCategoryTelemetry] = useState({})
  const [placesError, setPlacesError] = useState(null)
  const [placesFreshness, setPlacesFreshness] = useState('LIVE')
  const [lastFetchedAt, setLastFetchedAt] = useState(null)

  const { location, isAcquiring, recenterSignal, requestLocation, selectLandmark, recenterMap } =
    useLocation()

  const prevCoordsRef = useRef(null)
  const initialUrlHandledRef = useRef(false)
  const fetchSeqRef = useRef(0)

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

  // Fetch real-world nearby places and normalized hazards with race-condition prevention
  const fetchPlacesAndHazards = useCallback(
    async (force = false, radius = searchRadiusMeters) => {
      const lat = location.latitude
      const lon = location.longitude

      if (lat == null || lon == null) {
        setIsLoadingPlaces(false)
        setIsRefreshingPlaces(false)
        setNearbyPlaces([])
        setFeedStatus('UNAVAILABLE')
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
      const currentSeq = ++fetchSeqRef.current

      // Non-blanking refresh: if we already have data, keep displaying it during refresh
      if (nearbyPlaces.length > 0) {
        setIsRefreshingPlaces(true)
      } else {
        setIsLoadingPlaces(true)
      }
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

        // Guard against race conditions / stale out-of-order responses
        if (currentSeq !== fetchSeqRef.current) return

        setIsLoadingPlaces(false)
        setIsRefreshingPlaces(false)
        setLastFetchedAt(new Date().toISOString())

        if (placesRes.status === 'fulfilled') {
          const res = placesRes.value
          if (res?.success) {
            const dataList = res.data || []
            setNearbyPlaces(dataList)
            setPlacesFreshness(res.freshness || 'LIVE')
            setFeedStatus(res.status || (dataList.length > 0 ? 'AVAILABLE' : 'NO_RESULTS'))
            setCategoryTelemetry(res.categoryStatuses || {})
            setPlacesError(null)

            // Select first place if none selected or if previous is no longer in dataset
            if (dataList.length > 0) {
              setSelectedPlace((prev) => {
                if (prev && dataList.some((p) => p.id === prev.id)) {
                  return prev
                }
                return dataList[0]
              })
            } else {
              setSelectedPlace(null)
            }
          } else {
            // Non-blanking fallback: preserve previous data if available
            if (nearbyPlaces.length > 0) {
              setPlacesError('Unable to refresh. Showing recently fetched data.')
              setPlacesFreshness('STALE')
              setFeedStatus('STALE')
            } else {
              setFeedStatus(res?.status || 'UNAVAILABLE')
              setPlacesError(
                res?.error ||
                  'Geographic places feed is temporarily unavailable from upstream providers.'
              )
              setPlacesFreshness(res?.freshness || 'UNAVAILABLE')
              setNearbyPlaces([])
              setSelectedPlace(null)
            }
          }
        } else {
          if (nearbyPlaces.length > 0) {
            setPlacesError('Unable to refresh. Showing recently fetched data.')
            setPlacesFreshness('STALE')
            setFeedStatus('STALE')
          } else {
            setFeedStatus('UNAVAILABLE')
            setPlacesError('Geographic data feed is temporarily unavailable.')
            setPlacesFreshness('UNAVAILABLE')
            setNearbyPlaces([])
            setSelectedPlace(null)
          }
        }

        if (hazardsRes.status === 'fulfilled' && hazardsRes.value?.success) {
          setLiveHazards(hazardsRes.value.data || [])
        }
      } catch {
        if (currentSeq !== fetchSeqRef.current) return
        setIsLoadingPlaces(false)
        setIsRefreshingPlaces(false)
        if (nearbyPlaces.length > 0) {
          setPlacesError('Unable to refresh. Showing recently fetched data.')
          setPlacesFreshness('STALE')
          setFeedStatus('STALE')
        } else {
          setFeedStatus('UNAVAILABLE')
          setPlacesError('Geographic data feed is temporarily unavailable.')
          setPlacesFreshness('UNAVAILABLE')
          setNearbyPlaces([])
        }
      }
    },
    [location.latitude, location.longitude, searchRadiusMeters, nearbyPlaces.length]
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
        ) || nearbyPlaces.find((p) => p.category === 'shelter')

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
    return nearbyPlaces.filter((p) => matchesCategoryFilter(p, activeFilter))
  }, [nearbyPlaces, activeFilter])

  const displayedHazards = useMemo(() => {
    if (activeFilter !== 'all' && activeFilter !== 'hazards') return []
    return liveHazards
  }, [liveHazards, activeFilter])

  // Per-category state evaluation (LOADING, SUCCESS, EMPTY, UNAVAILABLE, PARTIAL)
  const categoryStates = useMemo(() => {
    const states = {}

    ALL_CATEGORY_FILTERS.forEach((f) => {
      if (f.id === 'hazards') {
        states[f.id] = {
          count: liveHazards.length,
          status: isLoadingPlaces ? 'LOADING' : 'SUCCESS',
          displayBadge: isLoadingPlaces ? '...' : String(liveHazards.length),
          tooltip: `${liveHazards.length} active hazard alerts`,
        }
        return
      }

      if (f.id === 'all') {
        const count = nearbyPlaces.length
        let status = 'SUCCESS'
        let displayBadge = String(count)

        if (isLoadingPlaces) {
          status = 'LOADING'
          displayBadge = '...'
        } else if (feedStatus === 'UNAVAILABLE' || feedStatus === 'PROVIDER_UNAVAILABLE') {
          status = 'UNAVAILABLE'
          displayBadge = count > 0 ? `${count} (!)` : '!'
        } else if (feedStatus === 'PARTIAL_RESULTS' || feedStatus === 'PARTIAL') {
          status = 'PARTIAL'
          displayBadge = `${count}`
        } else if (count === 0) {
          status = 'EMPTY'
          displayBadge = '0'
        }

        states[f.id] = {
          count,
          status,
          displayBadge,
          tooltip:
            status === 'UNAVAILABLE'
              ? 'External data feed unavailable'
              : `${count} total nearby facilities (10 km)`,
        }
        return
      }

      // Individual facility category
      const matched = nearbyPlaces.filter((p) => matchesCategoryFilter(p, f.id))
      const count = matched.length

      const catKey =
        f.id === 'hospital'
          ? 'HOSPITAL'
          : f.id === 'pharmacy'
            ? 'PHARMACY'
            : f.id === 'police'
              ? 'POLICE'
              : f.id === 'fire_station'
                ? 'FIRE_STATION'
                : f.id === 'shelter'
                  ? 'SAFE_PLACE'
                  : null

      const report = catKey ? categoryTelemetry[catKey] : null
      const isCatUnavailable = report?.status === 'UNAVAILABLE'

      let status = 'SUCCESS'
      let displayBadge = String(count)
      let tooltip = `${count} ${f.label} found`

      if (isLoadingPlaces) {
        status = 'LOADING'
        displayBadge = '...'
        tooltip = `Searching ${f.label}...`
      } else if (isCatUnavailable && count === 0) {
        status = 'UNAVAILABLE'
        displayBadge = '!'
        tooltip = `${f.label} data feed temporarily unavailable`
      } else if (feedStatus === 'UNAVAILABLE' || feedStatus === 'PROVIDER_UNAVAILABLE') {
        status = 'UNAVAILABLE'
        displayBadge = count > 0 ? `${count} (!)` : '!'
        tooltip = `${f.label} data feed temporarily unavailable`
      } else if (count === 0) {
        status = 'EMPTY'
        displayBadge = '0'
        tooltip = `0 ${f.label} within ${searchRadiusMeters / 1000} km`
      }

      states[f.id] = {
        count,
        status,
        displayBadge,
        tooltip,
      }
    })

    return states
  }, [
    nearbyPlaces,
    liveHazards,
    isLoadingPlaces,
    feedStatus,
    searchRadiusMeters,
    categoryTelemetry,
  ])

  const activeCategoryState = categoryStates[activeFilter] || {
    count: displayedPlaces.length,
    status: 'SUCCESS',
    displayBadge: String(displayedPlaces.length),
  }

  const isPermissionDenied = location.permission === 'DENIED' || location.status === 'DENIED'
  const isLocationUnavailable =
    location.permission === 'UNAVAILABLE' || location.status === 'UNAVAILABLE'
  const isLandmarkFallback = location.source === 'LANDMARK' || location.isFallback

  const handleMyLocationClick = () => {
    requestLocation({ timeout: 10000 })
    recenterMap()
  }

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
            aria-label="Refresh nearby facilities"
          >
            <span className={isLoadingPlaces ? 'animate-spin' : ''}>
              {isLoadingPlaces ? '⏳' : '🔄'}
            </span>
            <span>{isLoadingPlaces ? 'Refreshing...' : 'Refresh'}</span>
          </button>

          {location.latitude && (
            <button
              type="button"
              onClick={handleMyLocationClick}
              className="px-3 py-1.5 rounded-xl bg-salvus-surface border border-salvus-border hover:border-salvus-info text-salvus-text-secondary hover:text-salvus-text-primary text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer shadow-xs"
              title="Detect and center on your device GPS location"
              aria-label="Center on my location"
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

      {/* Provider Notice / Resilient Alert when external feed is unavailable */}
      {placesError && (
        <div className="mb-4 bg-salvus-surface border border-salvus-warning-border/60 rounded-xl px-4 py-3 flex items-center justify-between text-xs text-salvus-text-secondary animate-fadeIn">
          <div className="flex items-center gap-2">
            <span>ℹ️</span>
            <span>
              <strong>Nearby geographic feed is unavailable.</strong> Verified Salvus civil defense
              shelters and live GPS remain active.
            </span>
          </div>
          <button
            type="button"
            onClick={() => fetchPlacesAndHazards(true)}
            className="text-xs font-semibold text-salvus-info hover:underline cursor-pointer ml-3 shrink-0"
          >
            Retry Feed
          </button>
        </div>
      )}

      {/* Category Filter Navigation with Transparent Category States */}
      <div
        role="tablist"
        aria-label="Facility Categories"
        className="flex items-center gap-2 overflow-x-auto pb-3 mb-4 no-scrollbar"
      >
        {ALL_CATEGORY_FILTERS.map((f) => {
          const state = categoryStates[f.id] || { count: 0, status: 'EMPTY', displayBadge: '0' }
          const isSelectedTab = activeFilter === f.id
          const isUnavailable = state.status === 'UNAVAILABLE'

          return (
            <button
              key={f.id}
              role="tab"
              type="button"
              aria-selected={isSelectedTab}
              aria-label={state.tooltip || `${f.label}: ${state.displayBadge}`}
              title={state.tooltip}
              onClick={() => {
                setActiveFilter(f.id)
                // Select first matching facility if current selection does not match
                const matched = nearbyPlaces.filter((p) => matchesCategoryFilter(p, f.id))
                if (matched.length > 0) {
                  setSelectedPlace((prev) =>
                    prev && matched.some((p) => p.id === prev.id) ? prev : matched[0]
                  )
                } else if (f.id !== 'hazards') {
                  setSelectedPlace(null)
                }
              }}
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
                    : isUnavailable
                      ? 'bg-amber-950/40 text-amber-400 border border-amber-500/30'
                      : 'bg-salvus-muted text-salvus-text-muted'
                }`}
              >
                {state.displayBadge}
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
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-bold text-salvus-text-primary uppercase tracking-wider">
                  Facility Directory ({displayedPlaces.length})
                </h2>
                {isRefreshingPlaces && (
                  <span className="text-xs text-salvus-info font-medium animate-pulse">
                    Refreshing...
                  </span>
                )}
              </div>
              {searchRadiusMeters !== 10000 && (
                <button
                  type="button"
                  onClick={() => {
                    setSearchRadiusMeters(10000)
                    fetchPlacesAndHazards(true, 10000)
                  }}
                  className="text-xs text-salvus-info hover:underline font-semibold cursor-pointer"
                >
                  Reset radius to 10 km
                </button>
              )}
            </div>

            {/* Honest Empty / Unavailable States */}
            {!isLoadingPlaces && displayedPlaces.length === 0 && (
              <Card padding="lg" className="text-center py-8">
                <span className="text-3xl mb-2 block" aria-hidden="true">
                  {activeCategoryState.status === 'UNAVAILABLE' ? '⚠️' : '📍'}
                </span>
                <h3 className="text-sm font-bold text-salvus-text-primary">
                  {activeCategoryState.status === 'UNAVAILABLE'
                    ? `${activeFilter !== 'all' ? activeFilter.toUpperCase() : 'Nearby'} data feed is temporarily unavailable.`
                    : `No ${activeFilter !== 'all' ? activeFilter : ''} facilities found within ${searchRadiusMeters / 1000} km.`}
                </h3>
                <p className="text-xs text-salvus-text-secondary mt-1 max-w-sm mx-auto leading-relaxed">
                  {activeCategoryState.status === 'UNAVAILABLE'
                    ? 'Upstream map providers are experiencing high latency. Your GPS location and verified civil defense shelters remain active.'
                    : 'Try expanding the geographic search radius or switching categories.'}
                </p>

                <div className="mt-4 flex items-center justify-center gap-3 flex-wrap">
                  {activeCategoryState.status === 'UNAVAILABLE' ? (
                    <Button variant="primary" size="sm" onClick={() => fetchPlacesAndHazards(true)}>
                      Retry Data Feed 🔄
                    </Button>
                  ) : searchRadiusMeters < 5000 ? (
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
                  ) : null}
                </div>
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
