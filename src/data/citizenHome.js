export const citizenHomeData = {
  user: {
    greeting: 'GOOD MORNING · ADITI',
    headline: "You're currently safe",
  },
  systemStatus: {
    isLive: true,
    label: 'LIVE',
    time: '14:42 IST',
  },
  navigation: [
    { id: 'home', label: 'Home', path: '/citizen', active: true },
    { id: 'map', label: 'Map', path: '/citizen/map', active: false },
    { id: 'alerts', label: 'Alerts', path: '/citizen/alerts', active: false },
    { id: 'profile', label: 'Profile', path: '/citizen/profile', active: false },
  ],
  safetyStatus: {
    level: 'SAFE',
    badgeText: 'STATUS · SAFE',
    title: 'No active threats in your area',
    subtitle: 'Based on live weather + local reports · Updated 2m ago',
  },
  emergency: {
    badgeText: 'EMERGENCY',
    title: 'Need help right now?',
    description: 'Send an emergency request with your live location to nearby responders.',
    buttonText: 'SEND SOS',
  },
  activeAlert: {
    badgeText: 'ACTIVE ALERT · HEAVY RAIN',
    description:
      'Localized flooding possible in low-lying sectors. Move to higher ground if water rises.',
    source: 'Source: Open-Meteo + GDACS · 14 min ago',
    severity: 'warning',
  },
  nearestShelter: {
    badgeText: 'NEAREST SHELTER',
    name: 'Community Hall',
    distance: '1.2 km',
    capacity: '42% full',
    actionText: 'View directions',
  },
  report: {
    badgeText: 'REPORT',
    title: 'Report an incident',
    subtitle: 'Photo + location, takes 30s',
    actionText: 'Start report',
  },
  areaMap: {
    badgeText: 'YOUR AREA',
    location: 'Sector 12 · Kolkata',
    legend: [
      { label: 'You', color: '#3B82F6' },
      { label: 'Shelter', color: '#10B981' },
      { label: 'Hazard zone', color: '#EF4444' },
    ],
    markers: {
      user: { x: 42, y: 36, label: 'You' },
      shelter: { x: 73, y: 56, label: 'Community Hall' },
      hazard: { x: 50, y: 72, radius: 26, label: 'Flooded Sector' },
    },
  },
}
