export const citizenHomeData = {
  user: {
    greeting: 'Good morning, Aditi',
    headline: "You're currently safe",
  },
  systemStatus: {
    isLive: true,
    label: 'Live update',
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
    badgeText: 'Current status · Safe',
    title: 'No active threats in your immediate area',
    subtitle: 'Monitored via local sector reports and weather models · Updated 2m ago',
  },
  emergency: {
    badgeText: 'Emergency assistance',
    title: 'Need urgent emergency help?',
    description:
      'Transmits an instant distress beacon with your precise location to disaster coordinators.',
    buttonText: 'Send SOS Request',
  },
  activeAlert: {
    badgeText: 'Active weather advisory · Heavy rain',
    title: 'Flash Flood Watch in Sector 12',
    description:
      'Localized water accumulation is possible in low-lying sectors. Stay on elevated ground if water begins rising.',
    source: 'Verified by Meteorological Dept & GDACS · 14 min ago',
    severity: 'warning',
  },
  nearestShelter: {
    badgeText: 'Simulation Demo Shelter',
    name: 'Salt Lake Stadium Assembly Hub (Demo)',
    distance: 'Approx. 350 m',
    capacity: '420 beds available',
    amenities: 'Emergency Medical Triage · Clean Water Tanker',
    actionText: 'Get Safe Route',
    provenance: 'SEEDED_DEMO',
  },
  report: {
    badgeText: 'Community report',
    title: 'Report a local hazard',
    subtitle: 'Submit a photo and location in 30 seconds to help your community.',
    actionText: 'Report hazard',
  },
  areaMap: {
    badgeText: 'Local area overview',
    location: 'Sector 12 · Salt Lake, Kolkata',
    legend: [
      { label: 'Your location', color: '#3B82F6' },
      { label: 'Safe shelter', color: '#10B981' },
      { label: 'Hazard zone', color: '#EF4444' },
    ],
    markers: {
      user: { x: 42, y: 36, label: 'You' },
      shelter: { x: 73, y: 56, label: 'Community Hall' },
      hazard: { x: 50, y: 72, radius: 26, label: 'Flooded Underpass' },
    },
  },
}
