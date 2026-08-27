import { useState } from 'react'
import { Card } from '../../ui/Card'
import { Badge } from '../../ui/Badge'
import { StatusIndicator } from '../../ui/StatusIndicator'

/**
 * Reassuring Emergency Location & Status Banner
 */
export const LocationStatusBanner = ({
  location = {
    address: 'Sector 12, Salt Lake, Kolkata',
    coordinates: '22.5726° N, 88.3639° E',
    accuracy: 'High Precision (±4m)',
    accuracyLabel: 'High Precision (±4m)',
    source: 'BROWSER',
    status: 'ACTIVE',
  },
  locationStatus = 'ACTIVE',
  connectivityStatus = 'CONNECTED',
}) => {
  const [showCoordinates, setShowCoordinates] = useState(false)

  const isLandmark = location?.source === 'LANDMARK' || location?.isFallback

  const getLocationLabel = () => {
    switch (locationStatus) {
      case 'ACTIVE':
        return {
          status: 'safe',
          label: isLandmark ? 'Approximate Location Shared' : 'Location Shared Live',
        }
      case 'ACQUIRING':
        return { status: 'warning', label: 'Acquiring GPS...' }
      case 'TEMPORARILY UNAVAILABLE':
        return { status: 'warning', label: 'Approximate Location' }
      default:
        return { status: 'safe', label: 'Location Active' }
    }
  }

  const getConnectivityLabel = () => {
    switch (connectivityStatus) {
      case 'CONNECTED':
        return { status: 'safe', label: 'Online' }
      case 'LIMITED_CONNECTION':
        return { status: 'warning', label: 'Limited Signal' }
      case 'OFFLINE':
        return { status: 'warning', label: 'Offline Backup' }
      case 'RECONNECTING':
        return { status: 'info', label: 'Reconnecting...' }
      default:
        return { status: 'safe', label: 'Online' }
    }
  }

  const loc = getLocationLabel()
  const conn = getConnectivityLabel()
  const isDisrupted =
    connectivityStatus === 'OFFLINE' ||
    connectivityStatus === 'LIMITED_CONNECTION' ||
    connectivityStatus === 'RECONNECTING'

  const accuracyText = location?.accuracyLabel || location?.accuracy || 'Active'

  return (
    <div className="space-y-3">
      <Card
        padding="sm"
        className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4"
      >
        {/* Left: Location Information */}
        <div className="flex items-start sm:items-center gap-3.5">
          <div className="h-10 w-10 rounded-xl bg-salvus-info-bg border border-salvus-info-border flex items-center justify-center text-salvus-info shrink-0 text-base">
            📍
          </div>
          <div>
            <div className="flex items-center gap-2 mb-0.5">
              <span className="text-xs font-bold text-salvus-text-primary">
                Your Shared Location
              </span>
              <Badge variant={isLandmark ? 'warning' : 'safe'} size="sm">
                {isLandmark ? 'APPROXIMATE LANDMARK' : 'GPS LOCKED'}
              </Badge>
              {!isLandmark && accuracyText && (
                <span className="text-[10px] text-salvus-text-muted font-mono font-medium">
                  {accuracyText}
                </span>
              )}
            </div>
            <p className="text-xs sm:text-sm font-semibold text-salvus-text-primary">
              {location.address || (isLandmark ? location.landmarkName : 'Detected Location')}
            </p>
            <div className="flex items-center gap-2 text-xs text-salvus-text-muted mt-0.5">
              <span>Shared with emergency response grid</span>
              <span>·</span>
              <button
                type="button"
                onClick={() => setShowCoordinates(!showCoordinates)}
                className="text-salvus-info hover:underline cursor-pointer"
              >
                {showCoordinates ? 'Hide coordinates' : 'View coordinates'}
              </button>
            </div>
            {showCoordinates && (
              <p className="text-[11px] font-mono text-salvus-text-secondary mt-1">
                {location.coordinates || 'Coordinates unavailable'}{' '}
                {location.accuracy ? `(${location.accuracyLabel || `±${location.accuracy}m`})` : ''}
              </p>
            )}
          </div>
        </div>

        {/* Right: Status Indicators */}
        <div className="flex items-center gap-3 self-stretch md:self-auto flex-wrap">
          <StatusIndicator status={loc.status} label={loc.label} showDot={true} size="sm" />
          <StatusIndicator status={conn.status} label={conn.label} showDot={true} size="sm" />
        </div>
      </Card>

      {/* Disruption Reassurance */}
      {isDisrupted && (
        <div className="bg-salvus-warning-bg border border-salvus-warning-border rounded-xl px-4 py-2.5 flex items-center justify-between text-xs text-salvus-warning-text animate-fadeIn">
          <div className="flex items-center gap-2">
            <span aria-hidden="true">⚠️</span>
            <span>
              <strong>Live updates are temporarily reconnecting.</strong> Your emergency beacon
              remains active.
            </span>
          </div>
          <Badge variant="warning" isMono={true}>
            SOS ACTIVE
          </Badge>
        </div>
      )}
    </div>
  )
}

export default LocationStatusBanner
