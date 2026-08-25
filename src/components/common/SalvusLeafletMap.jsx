import { useEffect, useRef } from 'react'
import L from 'leaflet'

/**
 * Salvus Geospatial Tactical Map
 *
 * High-performance OpenStreetMap tactical surface with calm styling,
 * standardized semantic markers, smooth camera transitions,
 * dynamic OSRM / vector corridor polyline rendering, and automatic viewport resize handling.
 */

const DEFAULT_CENTER = [22.5726, 88.3639]
const DEFAULT_ZOOM = 13

export const SalvusLeafletMap = ({
  center = DEFAULT_CENTER,
  zoom = DEFAULT_ZOOM,
  incidents = [],
  selectedIncidentId = null,
  onSelectIncident = null,
  userLocation = null,
  shelters = [],
  responders = [],
  hazards = [],
  clusters = [],
  activeRoute = null, // { coordinates: [[lat, lon], ...], distanceKm, etaFormatted, status, isFallback, label }
  previewRoute = null, // { coordinates: [[lat, lon], ...], label, color }
  showLayers = {
    incidents: true,
    shelters: true,
    responders: true,
    routes: true,
    hazards: true,
    clusters: true,
  },
  interactive = true,
  className = 'h-full w-full',
  autoFocusSelected = true,
}) => {
  const mapContainerRef = useRef(null)
  const mapInstanceRef = useRef(null)
  const markersGroupRef = useRef(null)
  const routesGroupRef = useRef(null)
  const userMarkerRef = useRef(null)

  // ---------------------------------------------------------------------------
  // 1. Initialize Map Instance & Viewport Observer
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (!mapContainerRef.current) return
    if (mapInstanceRef.current) return

    const map = L.map(mapContainerRef.current, {
      center: center && center[0] ? center : DEFAULT_CENTER,
      zoom,
      zoomControl: interactive,
      dragging: interactive,
      scrollWheelZoom: interactive ? 'center' : false,
      doubleClickZoom: interactive,
      attributionControl: false,
    })

    // Dark-themed tiles
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      className: 'dark-tiles',
    }).addTo(map)

    // Attribution control
    L.control
      .attribution({
        position: 'bottomright',
        prefix: '<span class="text-[9px] text-slate-500 font-mono">© OpenStreetMap · OSRM</span>',
      })
      .addTo(map)

    const routesGroup = L.layerGroup().addTo(map)
    const markersGroup = L.layerGroup().addTo(map)

    routesGroupRef.current = routesGroup
    markersGroupRef.current = markersGroup
    mapInstanceRef.current = map

    // Resize observer to ensure Leaflet renders correctly across layout adjustments
    const resizeObserver = new ResizeObserver(() => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.invalidateSize()
      }
    })
    resizeObserver.observe(mapContainerRef.current)

    return () => {
      resizeObserver.disconnect()
      map.remove()
      mapInstanceRef.current = null
      markersGroupRef.current = null
      routesGroupRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ---------------------------------------------------------------------------
  // 2. Center/Pan Camera on Target Coordinates
  // ---------------------------------------------------------------------------
  const centerLat = center && typeof center[0] === 'number' ? center[0] : null
  const centerLng = center && typeof center[1] === 'number' ? center[1] : null

  useEffect(() => {
    const map = mapInstanceRef.current
    if (!map) return

    if (centerLat != null && centerLng != null && !activeRoute?.coordinates?.length) {
      map.panTo([centerLat, centerLng], { animate: true, duration: 0.5 })
    }
  }, [centerLat, centerLng, activeRoute])

  // ---------------------------------------------------------------------------
  // 3. Render Tactical Route Polylines (Active & Preview)
  // ---------------------------------------------------------------------------
  useEffect(() => {
    const map = mapInstanceRef.current
    const routeGroup = routesGroupRef.current
    if (!map || !routeGroup) return

    routeGroup.clearLayers()

    if (!showLayers.routes) return

    // A. Candidate Preview Route (Dashed amber or slate)
    if (
      previewRoute &&
      Array.isArray(previewRoute.coordinates) &&
      previewRoute.coordinates.length >= 2
    ) {
      const previewPolyline = L.polyline(previewRoute.coordinates, {
        color: previewRoute.color || '#f59e0b',
        weight: 3,
        opacity: 0.8,
        dashArray: '5, 5',
        lineCap: 'round',
        lineJoin: 'round',
      })
      routeGroup.addLayer(previewPolyline)
    }

    // B. Primary Active Dispatch Route (Glowing tactical corridor)
    if (
      activeRoute &&
      Array.isArray(activeRoute.coordinates) &&
      activeRoute.coordinates.length >= 2
    ) {
      const coords = activeRoute.coordinates
      const isFallback = activeRoute.isFallback || activeRoute.status === 'FALLBACK_CORRIDOR'

      // Outer glow corridor
      const outerCorridor = L.polyline(coords, {
        color: isFallback ? '#0369a1' : '#0284c7',
        weight: 8,
        opacity: 0.25,
        lineCap: 'round',
        lineJoin: 'round',
      })
      routeGroup.addLayer(outerCorridor)

      // Core route vector
      const coreRoute = L.polyline(coords, {
        color: isFallback ? '#38bdf8' : '#0ea5e9',
        weight: 3.5,
        opacity: 0.95,
        dashArray: isFallback ? '6, 6' : undefined,
        lineCap: 'round',
        lineJoin: 'round',
      })
      routeGroup.addLayer(coreRoute)

      // Midpoint ETA / Distance tactical pill badge
      const midIdx = Math.floor(coords.length / 2)
      const midPoint = coords[midIdx]
      if (midPoint && (activeRoute.etaFormatted || activeRoute.distanceKm)) {
        const etaBadgeIcon = L.divIcon({
          className: 'custom-route-badge',
          html: `
            <div class="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-[#080E17]/95 border border-sky-500/60 shadow-lg text-[10px] font-mono font-bold text-sky-300 whitespace-nowrap">
              <span class="h-1.5 w-1.5 rounded-full bg-sky-400 animate-ping"></span>
              <span>${activeRoute.etaFormatted || 'ETA 4m'}</span>
              <span class="text-slate-400 font-normal">(${activeRoute.distanceKm || '1.2'} km)</span>
            </div>
          `,
          iconSize: [110, 22],
          iconAnchor: [55, 11],
        })

        const etaMarker = L.marker(midPoint, { icon: etaBadgeIcon, zIndexOffset: 200 })
        routeGroup.addLayer(etaMarker)
      }

      // Auto-fit bounds if requested
      if (coords.length > 0) {
        const bounds = L.latLngBounds(coords)
        map.fitBounds(bounds, { padding: [40, 40], maxZoom: 15, animate: true })
      }
    }
  }, [activeRoute, previewRoute, showLayers.routes])

  // ---------------------------------------------------------------------------
  // 4. Render User Location Marker
  // ---------------------------------------------------------------------------
  useEffect(() => {
    const map = mapInstanceRef.current
    if (!map) return

    if (userMarkerRef.current) {
      userMarkerRef.current.remove()
      userMarkerRef.current = null
    }

    if (userLocation && userLocation.latitude && userLocation.longitude) {
      const userGroup = L.layerGroup()

      const userIcon = L.divIcon({
        className: 'custom-user-pin',
        html: `
          <div class="relative flex items-center justify-center w-7 h-7">
            <span class="absolute w-6 h-6 rounded-full bg-blue-500/20"></span>
            <span class="relative w-3.5 h-3.5 rounded-full bg-blue-500 border-2 border-white shadow-md"></span>
          </div>
        `,
        iconSize: [28, 28],
        iconAnchor: [14, 14],
      })

      const marker = L.marker([userLocation.latitude, userLocation.longitude], {
        icon: userIcon,
        zIndexOffset: 1000,
      }).bindPopup(`
        <div class="p-3 text-slate-200 text-xs font-sans">
          <div class="font-bold text-blue-400 flex items-center gap-1.5 mb-1 font-mono text-[11px]">
            <span class="h-2 w-2 rounded-full bg-blue-400"></span>
            <span>REPORTED LOCATION</span>
          </div>
          <p class="text-slate-300">${userLocation.address || 'Active Device Coordinates'}</p>
          <p class="text-[10px] text-slate-500 font-mono mt-1">${userLocation.coordinates || `${userLocation.latitude.toFixed(4)}°, ${userLocation.longitude.toFixed(4)}°`}</p>
        </div>
      `)

      userGroup.addLayer(marker)

      if (userLocation.accuracyM && userLocation.accuracyM < 500) {
        const accuracyCircle = L.circle([userLocation.latitude, userLocation.longitude], {
          radius: userLocation.accuracyM,
          color: '#3b82f6',
          fillColor: '#3b82f6',
          fillOpacity: 0.08,
          weight: 1,
          dashArray: '3, 3',
        })
        userGroup.addLayer(accuracyCircle)
      }

      userGroup.addTo(map)
      userMarkerRef.current = userGroup
    }
  }, [userLocation])

  // ---------------------------------------------------------------------------
  // 5. Render Tactical Layer Markers (Incidents, Shelters, Responders)
  // ---------------------------------------------------------------------------
  useEffect(() => {
    const map = mapInstanceRef.current
    const group = markersGroupRef.current
    if (!map || !group) return

    group.clearLayers()

    // 0. Hazards Layer (Perimeter Circles & Risk Zones)
    if (showLayers.hazards !== false && hazards.length > 0) {
      hazards.forEach((hz) => {
        if (typeof hz.latitude !== 'number' || typeof hz.longitude !== 'number') return

        const isCritical = hz.severity === 'CRITICAL'
        const isWarning = hz.severity === 'WARNING'
        const strokeColor = isCritical ? '#F43F5E' : isWarning ? '#F59E0B' : '#38BDF8'
        const fillColor = isCritical ? '#BE123C' : isWarning ? '#B45309' : '#0284C7'

        const circle = L.circle([hz.latitude, hz.longitude], {
          radius: (hz.affected_radius_km || 2.0) * 1000,
          color: strokeColor,
          weight: 1.5,
          opacity: 0.7,
          fillColor: fillColor,
          fillOpacity: 0.12,
          dashArray: isCritical ? null : '4, 6',
        }).bindPopup(`
          <div class="p-3 text-slate-200 text-xs font-sans min-w-[220px]">
            <div class="flex items-center justify-between gap-2 mb-1">
              <span class="px-2 py-0.5 rounded text-[10px] font-bold uppercase font-mono ${
                isCritical
                  ? 'bg-rose-950 text-rose-300 border border-rose-500/40'
                  : 'bg-amber-950 text-amber-300 border border-amber-500/40'
              }">${hz.severity} HAZARD</span>
              <span class="text-[10px] text-slate-400 font-mono">${hz.affected_radius_km} km zone</span>
            </div>
            <div class="font-bold text-slate-100 text-xs mb-1">${hz.title}</div>
            <p class="text-slate-400 text-[11px] mb-2">${hz.description}</p>
            <div class="text-[10px] text-slate-400 border-t border-slate-800 pt-1 flex items-center justify-between font-mono">
              <span>Source:</span>
              <span class="text-slate-300 truncate max-w-[120px]">${hz.source}</span>
            </div>
          </div>
        `)
        group.addLayer(circle)
      })
    }

    // 0.5 Spatial Incident Clusters
    if (showLayers.clusters !== false && clusters.length > 0) {
      clusters.forEach((cl) => {
        if (typeof cl.centroid_lat !== 'number' || typeof cl.centroid_lon !== 'number') return

        const isCritCluster = cl.critical_count > 0
        const clusterIcon = L.divIcon({
          className: 'custom-cluster-pin',
          html: `
            <div class="flex items-center gap-1 px-2 py-1 rounded-full ${
              isCritCluster
                ? 'bg-rose-950/90 border border-rose-500 text-rose-300 shadow-[0_0_10px_#F43F5E]'
                : 'bg-slate-900/90 border border-sky-500/80 text-sky-300'
            } text-[10px] font-mono font-bold whitespace-nowrap shadow-lg">
              <span>📍</span>
              <span>${cl.incident_count} reports</span>
            </div>
          `,
          iconSize: [80, 24],
          iconAnchor: [40, 12],
        })

        const clusterMarker = L.marker([cl.centroid_lat, cl.centroid_lon], {
          icon: clusterIcon,
          zIndexOffset: 150,
        }).bindPopup(`
          <div class="p-3 text-slate-200 text-xs font-sans min-w-[210px]">
            <div class="font-bold text-slate-100 text-xs mb-1">${cl.cluster_name}</div>
            <div class="text-[11px] text-slate-400 mb-2">
              <span>Total reports: <strong class="text-slate-200">${cl.incident_count}</strong></span>
              ${cl.critical_count > 0 ? `<br/><span class="text-rose-400 font-bold">⚠️ ${cl.critical_count} Critical Distress</span>` : ''}
              <br/><span class="text-emerald-400">✓ ${cl.verified_count} Verified</span>
            </div>
            <div class="text-[10px] text-slate-500 font-mono">Radius: ${cl.radius_km} km</div>
          </div>
        `)
        group.addLayer(clusterMarker)
      })
    }

    // A. Shelters Layer
    if (showLayers.shelters && shelters.length > 0) {
      shelters.forEach((shelter) => {
        if (!shelter.lat || !shelter.lng) return

        const isUnsafe =
          shelter.safety_status === 'HAZARD_PROXIMITY_WARNING' || shelter.is_safe === false

        const shelterIcon = L.divIcon({
          className: 'custom-shelter-pin',
          html: `
            <div class="flex items-center justify-center w-6 h-6 rounded-md ${
              isUnsafe
                ? 'bg-[#2A1115] border border-rose-500 text-rose-300 shadow-md animate-pulse'
                : 'bg-[#0F1D1A] border border-emerald-500/60 text-emerald-300 shadow-md'
            } text-xs">
              <span class="text-[10px]">${isUnsafe ? '⚠️' : '🏠'}</span>
            </div>
          `,
          iconSize: [24, 24],
          iconAnchor: [12, 12],
        })

        const shelterMarker = L.marker([shelter.lat, shelter.lng], { icon: shelterIcon })
          .bindPopup(`
            <div class="p-3 text-slate-200 text-xs font-sans min-w-[200px]">
              <div class="font-bold text-slate-100 flex items-center gap-1.5 mb-1">
                <span>${isUnsafe ? '⚠️' : '🏠'}</span>
                <span>${shelter.name || 'Evacuation Shelter'}</span>
              </div>
              <p class="text-slate-400 text-[11px]">${shelter.address || 'Designated relief facility'}</p>
              ${
                isUnsafe
                  ? '<div class="mt-1.5 text-[10px] text-rose-400 bg-rose-950/60 p-1.5 rounded border border-rose-500/40 font-mono">⚠️ HAZARD PROXIMITY WARNING</div>'
                  : ''
              }
              <div class="mt-2 flex items-center justify-between text-[11px] bg-slate-900/90 p-1.5 rounded border border-slate-800 font-mono">
                <span class="text-slate-400">Available:</span>
                <span class="font-semibold ${isUnsafe ? 'text-amber-400' : 'text-emerald-400'}">${shelter.capacity || 'Open'}</span>
              </div>
            </div>
          `)

        group.addLayer(shelterMarker)
      })
    }

    // B. Responders Layer
    if (showLayers.responders && responders.length > 0) {
      responders.forEach((unit) => {
        if (!unit.lat || !unit.lng) return

        const isAssigned =
          unit.status === 'ASSIGNED' || unit.status === 'EN_ROUTE' || unit.status === 'NEARBY'
        const isSelectedUnit = activeRoute && unit.id === activeRoute.responderId

        const unitIcon = L.divIcon({
          className: 'custom-responder-pin',
          html: `
            <div class="relative flex items-center justify-center w-7 h-7 rounded-full ${
              isSelectedUnit
                ? 'bg-sky-500 border-2 border-white shadow-[0_0_12px_#38BDF8] text-white'
                : isAssigned
                  ? 'bg-blue-600 border-2 border-sky-300 text-white shadow-md'
                  : 'bg-[#0F1724] border border-blue-400/80 text-blue-300 shadow-md'
            } text-xs">
              <span class="text-[11px]">🚤</span>
            </div>
          `,
          iconSize: [28, 28],
          iconAnchor: [14, 14],
        })

        const unitMarker = L.marker([unit.lat, unit.lng], {
          icon: unitIcon,
          zIndexOffset: isSelectedUnit ? 600 : 300,
        }).bindPopup(`
          <div class="p-3 text-slate-200 text-xs font-sans min-w-[210px]">
            <div class="font-bold text-slate-100 flex items-center gap-1.5 mb-1">
              <span class="text-blue-400">🚤</span>
              <span>${unit.name || 'NDRF Unit'}</span>
            </div>
            <p class="text-slate-400 text-[11px]">${unit.vessel || 'Rescue Vehicle'}</p>
            <div class="mt-2 flex items-center justify-between text-[10px] text-slate-400 bg-slate-900/90 px-2 py-1 rounded border border-slate-800 font-mono">
              <span>FIELD STATUS</span>
              <span class="text-blue-300 font-semibold uppercase">${unit.status || 'ACTIVE'}</span>
            </div>
          </div>
        `)

        group.addLayer(unitMarker)
      })
    }

    // C. Incidents Layer
    if (showLayers.incidents && incidents.length > 0) {
      incidents.forEach((inc) => {
        if (typeof inc.latitude !== 'number' || typeof inc.longitude !== 'number') return

        const isSelected = inc.id === selectedIncidentId
        const isResolved = inc.status === 'RESOLVED'
        const isCancelled = inc.status === 'CANCELLED'
        const isCritical = inc.severity === 'CRITICAL' && !isResolved && !isCancelled

        let bgStyle = 'bg-rose-500'
        let borderStyle = 'border-rose-300'
        let statusBadge = 'bg-rose-950/60 text-rose-300 border-rose-500/40'

        if (isResolved) {
          bgStyle = 'bg-emerald-500'
          borderStyle = 'border-emerald-300'
          statusBadge = 'bg-emerald-950/60 text-emerald-300 border-emerald-500/40'
        } else if (isCancelled) {
          bgStyle = 'bg-slate-600'
          borderStyle = 'border-slate-400'
          statusBadge = 'bg-slate-900 text-slate-400 border-slate-700'
        } else if (
          inc.status === 'ASSIGNED' ||
          inc.status === 'EN_ROUTE' ||
          inc.status === 'NEARBY' ||
          inc.status === 'ON_SCENE'
        ) {
          bgStyle = 'bg-sky-500'
          borderStyle = 'border-sky-300'
          statusBadge = 'bg-sky-950/60 text-sky-300 border-sky-500/40'
        } else if (inc.status === 'VERIFIED') {
          bgStyle = 'bg-blue-500'
          borderStyle = 'border-blue-300'
          statusBadge = 'bg-blue-950/60 text-blue-300 border-blue-500/40'
        } else if (inc.status === 'TRIAGE_PENDING' || inc.severity === 'HIGH') {
          bgStyle = 'bg-amber-500'
          borderStyle = 'border-amber-300'
          statusBadge = 'bg-amber-950/60 text-amber-300 border-amber-500/40'
        }

        const size = isSelected ? 32 : 24
        const pinHtml = `
          <div class="relative flex items-center justify-center cursor-pointer transition-transform ${
            isSelected
              ? 'scale-115 z-50 ring-2 ring-blue-400 ring-offset-2 ring-offset-slate-900 rounded-full'
              : 'hover:scale-105'
          }" style="width:${size}px; height:${size}px;">
            ${isCritical ? `<span class="absolute inset-0 rounded-full ${bgStyle} opacity-30 animate-ping"></span>` : ''}
            <div class="relative flex items-center justify-center w-full h-full rounded-full ${bgStyle} border-2 ${borderStyle} shadow-md text-slate-950 font-bold font-mono">
              <span style="font-size: ${size > 28 ? '11px' : '9px'}">${inc.is_sos ? 'SOS' : isResolved ? '✓' : '!'}</span>
            </div>
          </div>
        `

        const markerIcon = L.divIcon({
          className: 'custom-incident-pin',
          html: pinHtml,
          iconSize: [size, size],
          iconAnchor: [size / 2, size / 2],
        })

        const marker = L.marker([inc.latitude, inc.longitude], {
          icon: markerIcon,
          zIndexOffset: isSelected ? 500 : 100,
        })

        const popupContent = document.createElement('div')
        popupContent.className = 'p-3 text-slate-200 text-xs font-sans min-w-[210px]'
        popupContent.innerHTML = `
          <div class="flex items-center justify-between gap-2 mb-1.5 pb-1 border-b border-slate-800">
            <span class="font-mono font-bold text-[11px] text-slate-200">#${inc.ticket_id || inc.id.slice(0, 8)}</span>
            <span class="px-1.5 py-0.2 rounded text-[9px] font-mono font-bold uppercase border ${statusBadge}">${inc.status}</span>
          </div>
          <div class="font-semibold text-slate-100 text-xs mb-1 capitalize">${inc.type?.replace('_', ' ') || 'Emergency Incident'}</div>
          <p class="text-slate-400 text-[11px] line-clamp-2 mb-2">${inc.description || 'Hazard report filed.'}</p>
          <div class="text-[10px] text-slate-400 font-mono flex items-center justify-between border-t border-slate-800/80 pt-1.5">
            <span>👤 ${inc.reporter_name || 'Citizen'}</span>
            <span class="font-semibold text-slate-300">${inc.affected_count || 1} Affected</span>
          </div>
        `

        const actionBtn = document.createElement('button')
        actionBtn.className =
          'w-full mt-2 py-1 px-2 rounded-md bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 font-semibold text-[10px] tracking-wide uppercase transition-colors text-center cursor-pointer'
        actionBtn.textContent = isSelected ? 'Focused in Inspector' : 'Inspect Incident'
        actionBtn.onclick = () => {
          if (onSelectIncident) onSelectIncident(inc)
          map.closePopup()
        }
        popupContent.appendChild(actionBtn)

        marker.bindPopup(popupContent)

        marker.on('click', () => {
          if (onSelectIncident) onSelectIncident(inc)
        })

        group.addLayer(marker)
      })
    }
  }, [
    incidents,
    selectedIncidentId,
    shelters,
    responders,
    hazards,
    clusters,
    showLayers,
    onSelectIncident,
    activeRoute,
  ])

  // ---------------------------------------------------------------------------
  // 6. Auto Focus Selected Incident
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (!autoFocusSelected || !selectedIncidentId || activeRoute?.coordinates?.length) return
    const map = mapInstanceRef.current
    if (!map) return

    const selected = incidents.find((i) => i.id === selectedIncidentId)
    if (
      selected &&
      typeof selected.latitude === 'number' &&
      typeof selected.longitude === 'number'
    ) {
      map.setView([selected.latitude, selected.longitude], Math.max(map.getZoom(), 14), {
        animate: true,
        duration: 0.4,
      })
    }
  }, [selectedIncidentId, autoFocusSelected, incidents, activeRoute])

  return (
    <div className={`relative overflow-hidden rounded-xl border border-slate-800 ${className}`}>
      <div ref={mapContainerRef} className="h-full w-full" />
    </div>
  )
}

export default SalvusLeafletMap
