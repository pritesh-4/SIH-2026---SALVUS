import { useEffect, useRef } from 'react'
import L from 'leaflet'

/**
 * Salvus Geospatial Interactive Leaflet Map
 *
 * Provides high-performance OpenStreetMap rendering with dark styling,
 * status-coded tactical div-icons, smooth camera transitions,
 * and memory-safe lifecycle management.
 */

// Default center: Salt Lake / Sector 12, Kolkata
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
  showLayers = { incidents: true, shelters: true, responders: true },
  interactive = true,
  className = 'h-full w-full',
  autoFocusSelected = true,
}) => {
  const mapContainerRef = useRef(null)
  const mapInstanceRef = useRef(null)
  const markersGroupRef = useRef(null)
  const userMarkerRef = useRef(null)

  // ---------------------------------------------------------------------------
  // 1. Initialize Map Instance
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

    // Standard OpenStreetMap tiles with custom dark-mode CSS filter
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      className: 'dark-tiles',
    }).addTo(map)

    // Attribution control (compact bottom-right)
    L.control
      .attribution({
        position: 'bottomright',
        prefix: '<span class="text-[9px] text-slate-500 font-mono">© OpenStreetMap</span>',
      })
      .addTo(map)

    const markersGroup = L.layerGroup().addTo(map)
    markersGroupRef.current = markersGroup
    mapInstanceRef.current = map

    return () => {
      map.remove()
      mapInstanceRef.current = null
      markersGroupRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []) // Run once on mount

  // ---------------------------------------------------------------------------
  // 2. Center/Pan Camera on Target Coordinates
  // ---------------------------------------------------------------------------
  const centerLat = center && typeof center[0] === 'number' ? center[0] : null
  const centerLng = center && typeof center[1] === 'number' ? center[1] : null

  useEffect(() => {
    const map = mapInstanceRef.current
    if (!map) return

    if (centerLat != null && centerLng != null) {
      map.panTo([centerLat, centerLng], { animate: true, duration: 0.6 })
    }
  }, [centerLat, centerLng])

  // ---------------------------------------------------------------------------
  // 3. Render User Location Marker & Accuracy Ring
  // ---------------------------------------------------------------------------
  useEffect(() => {
    const map = mapInstanceRef.current
    if (!map) return

    // Clean previous user marker
    if (userMarkerRef.current) {
      userMarkerRef.current.remove()
      userMarkerRef.current = null
    }

    if (userLocation && userLocation.latitude && userLocation.longitude) {
      const userGroup = L.layerGroup()

      // User location pulsing blue dot
      const userIcon = L.divIcon({
        className: 'custom-user-pin',
        html: `
          <div class="relative flex items-center justify-center w-8 h-8">
            <span class="absolute w-7 h-7 rounded-full bg-cyan-500/30 animate-ping"></span>
            <span class="relative w-4 h-4 rounded-full bg-cyan-400 border-2 border-white shadow-lg shadow-cyan-500/50"></span>
          </div>
        `,
        iconSize: [32, 32],
        iconAnchor: [16, 16],
      })

      const marker = L.marker([userLocation.latitude, userLocation.longitude], {
        icon: userIcon,
        zIndexOffset: 1000,
      }).bindPopup(`
        <div class="p-3 text-slate-200 text-xs font-sans">
          <div class="font-bold text-cyan-400 flex items-center gap-1.5 mb-1">
            <span class="h-2 w-2 rounded-full bg-cyan-400"></span>
            <span>YOUR REPORTED LOCATION</span>
          </div>
          <p class="text-slate-300">${userLocation.address || 'Active Device Coordinates'}</p>
          <p class="text-[10px] text-slate-400 font-mono mt-1">${userLocation.coordinates || `${userLocation.latitude.toFixed(4)}°, ${userLocation.longitude.toFixed(4)}°`}</p>
          ${userLocation.accuracy ? `<div class="mt-1 text-[10px] text-emerald-400 font-bold">Accuracy: ${userLocation.accuracy}</div>` : ''}
        </div>
      `)

      userGroup.addLayer(marker)

      // Accuracy circle if numeric accuracy available
      if (userLocation.accuracyM && userLocation.accuracyM < 500) {
        const accuracyCircle = L.circle([userLocation.latitude, userLocation.longitude], {
          radius: userLocation.accuracyM,
          color: '#38bdf8',
          fillColor: '#38bdf8',
          fillOpacity: 0.1,
          weight: 1,
          dashArray: '4, 4',
        })
        userGroup.addLayer(accuracyCircle)
      }

      userGroup.addTo(map)
      userMarkerRef.current = userGroup
    }
  }, [userLocation])

  // ---------------------------------------------------------------------------
  // 4. Render Markers (Incidents, Shelters, Responders)
  // ---------------------------------------------------------------------------
  useEffect(() => {
    const map = mapInstanceRef.current
    const group = markersGroupRef.current
    if (!map || !group) return

    group.clearLayers()

    // A. Render Shelters
    if (showLayers.shelters && shelters.length > 0) {
      shelters.forEach((shelter) => {
        if (!shelter.lat || !shelter.lng) return

        const shelterIcon = L.divIcon({
          className: 'custom-shelter-pin',
          html: `
            <div class="flex items-center justify-center w-7 h-7 rounded-lg bg-emerald-950/90 border border-emerald-500/80 text-emerald-300 shadow-md shadow-emerald-950/80 text-xs font-bold">
              <span>🏠</span>
            </div>
          `,
          iconSize: [28, 28],
          iconAnchor: [14, 14],
        })

        const shelterMarker = L.marker([shelter.lat, shelter.lng], { icon: shelterIcon })
          .bindPopup(`
            <div class="p-3 text-slate-200 text-xs font-sans">
              <div class="font-bold text-emerald-400 flex items-center gap-1.5 mb-1">
                <span>🏠</span>
                <span>${shelter.name || 'Emergency Evacuation Shelter'}</span>
              </div>
              <p class="text-slate-300">${shelter.address || 'Safe assembly point'}</p>
              <div class="mt-2 flex items-center justify-between text-[11px] bg-slate-900/80 p-1.5 rounded border border-slate-800">
                <span class="text-slate-400">Capacity:</span>
                <span class="font-bold text-emerald-300">${shelter.capacity || 'Open'}</span>
              </div>
            </div>
          `)

        group.addLayer(shelterMarker)
      })
    }

    // B. Render Responders (Simulated Units)
    if (showLayers.responders && responders.length > 0) {
      responders.forEach((unit) => {
        if (!unit.lat || !unit.lng) return

        const unitIcon = L.divIcon({
          className: 'custom-responder-pin',
          html: `
            <div class="flex items-center justify-center w-7 h-7 rounded-full bg-cyan-950/90 border border-cyan-400 text-cyan-300 shadow-md shadow-cyan-950/80 text-xs font-bold">
              <span>🛥️</span>
            </div>
          `,
          iconSize: [28, 28],
          iconAnchor: [14, 14],
        })

        const unitMarker = L.marker([unit.lat, unit.lng], { icon: unitIcon }).bindPopup(`
          <div class="p-3 text-slate-200 text-xs font-sans">
            <div class="font-bold text-cyan-400 flex items-center gap-1.5 mb-1">
              <span>🛥️</span>
              <span>${unit.name || 'NDRF Rescue Unit'}</span>
            </div>
            <p class="text-slate-300">${unit.vessel || 'Tactical Inflatable Craft'}</p>
            <div class="mt-2 flex items-center justify-between text-[10px] text-purple-300 bg-purple-950/40 px-1.5 py-0.5 rounded border border-purple-500/30 font-mono">
              <span>SIMULATED ASSET</span>
            </div>
          </div>
        `)

        group.addLayer(unitMarker)
      })
    }

    // C. Render Incident Markers
    if (showLayers.incidents && incidents.length > 0) {
      incidents.forEach((inc) => {
        if (typeof inc.latitude !== 'number' || typeof inc.longitude !== 'number') return

        const isSelected = inc.id === selectedIncidentId
        const isResolved = inc.status === 'RESOLVED'
        const isCancelled = inc.status === 'CANCELLED'
        const isCritical = inc.severity === 'CRITICAL' && !isResolved && !isCancelled

        // Determine marker colors
        let bgStyle = 'bg-rose-500'
        let borderStyle = 'border-rose-300'
        let glowStyle = 'shadow-rose-500/50'
        let statusBadgeColor = 'bg-rose-950/80 text-rose-300 border-rose-500/40'

        if (inc.status === 'RESOLVED') {
          bgStyle = 'bg-emerald-500'
          borderStyle = 'border-emerald-300'
          glowStyle = 'shadow-emerald-500/40'
          statusBadgeColor = 'bg-emerald-950/80 text-emerald-300 border-emerald-500/40'
        } else if (inc.status === 'CANCELLED') {
          bgStyle = 'bg-slate-600'
          borderStyle = 'border-slate-400'
          glowStyle = 'shadow-slate-600/30'
          statusBadgeColor = 'bg-slate-900/80 text-slate-400 border-slate-700'
        } else if (inc.status === 'VERIFIED') {
          bgStyle = 'bg-sky-500'
          borderStyle = 'border-sky-300'
          glowStyle = 'shadow-sky-500/50'
          statusBadgeColor = 'bg-sky-950/80 text-sky-300 border-sky-500/40'
        } else if (inc.status === 'TRIAGE_PENDING') {
          bgStyle = 'bg-amber-500'
          borderStyle = 'border-amber-300'
          glowStyle = 'shadow-amber-500/50'
          statusBadgeColor = 'bg-amber-950/80 text-amber-300 border-amber-500/40'
        }

        const size = isSelected ? 36 : 28
        const pinHtml = `
          <div class="relative flex items-center justify-center cursor-pointer transition-transform ${isSelected ? 'scale-125 z-50' : 'hover:scale-110'}" style="width:${size}px; height:${size}px;">
            ${isCritical ? `<span class="absolute inset-0 rounded-full ${bgStyle} opacity-40 animate-ping"></span>` : ''}
            <div class="relative flex items-center justify-center w-full h-full rounded-full ${bgStyle} border-2 ${borderStyle} shadow-lg ${glowStyle}">
              <span class="text-[11px] font-black text-slate-950">${inc.is_sos ? 'SOS' : '!'}</span>
            </div>
            ${isSelected ? `<span class="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-cyan-400 border border-slate-950"></span>` : ''}
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

        // Popup with rich information
        const popupContent = document.createElement('div')
        popupContent.className = 'p-3 text-slate-200 text-xs font-sans min-w-[200px]'
        popupContent.innerHTML = `
          <div class="flex items-center justify-between gap-2 mb-1.5">
            <span class="font-mono font-bold text-[11px] text-cyan-400">#${inc.ticket_id || inc.id.slice(0, 8)}</span>
            <span class="px-1.5 py-0.5 rounded text-[9px] font-mono font-bold uppercase border ${statusBadgeColor}">${inc.status}</span>
          </div>
          <div class="font-bold text-sm text-slate-100 mb-1 capitalize">${inc.type?.replace('_', ' ') || 'Incident'}</div>
          <p class="text-slate-300 text-[11px] line-clamp-2 mb-2">${inc.description || 'Emergency incident reported'}</p>
          <div class="text-[10px] text-slate-400 font-mono flex items-center justify-between border-t border-slate-800/80 pt-1.5">
            <span>${inc.reporter_name || 'Anonymous'}</span>
            <span>${inc.affected_count || 1} Affected</span>
          </div>
        `

        // Add action button to popup
        const actionBtn = document.createElement('button')
        actionBtn.className =
          'w-full mt-2 py-1 px-2 rounded-lg bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold text-[10px] tracking-wide uppercase transition-all text-center cursor-pointer'
        actionBtn.textContent = isSelected ? 'Selected Incident' : 'Inspect in Console'
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
  }, [incidents, selectedIncidentId, shelters, responders, showLayers, onSelectIncident])

  // ---------------------------------------------------------------------------
  // 5. Auto Focus Selected Incident
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (!autoFocusSelected || !selectedIncidentId) return
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
        duration: 0.5,
      })
    }
  }, [selectedIncidentId, autoFocusSelected, incidents])

  return (
    <div className={`relative overflow-hidden rounded-2xl ${className}`}>
      <div ref={mapContainerRef} className="h-full w-full" />
    </div>
  )
}
