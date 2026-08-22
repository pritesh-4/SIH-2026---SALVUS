export const citizenAlertsData = {
  summary: {
    activeCount: 4,
    criticalCount: 1,
    lastUpdated: '2 min ago',
    location: 'Salt Lake & Greater Kolkata',
  },
  filters: [
    { id: 'all', label: 'All Alerts', count: 4 },
    { id: 'critical', label: 'Critical', count: 1, color: 'rose' },
    { id: 'warning', label: 'Warnings', count: 1, color: 'amber' },
    { id: 'watch', label: 'Advisories', count: 2, color: 'sky' },
  ],
  alerts: [
    {
      id: 'alt-01',
      severity: 'CRITICAL',
      badgeColor: 'rose',
      title: 'Flash Flood Warning — Sector 5 & 12 Corridor',
      summary:
        'Rapid water accumulation in low-lying sectors. Immediate movement to elevated zones or shelters advised.',
      affectedArea: 'Sector 5, Sector 12, Salt Lake & Kestopur Canal Basin',
      distance: '1.4 km from you',
      timestamp: 'Updated 4 min ago',
      source: 'State Disaster Management Authority (SDMA) + GDACS Feed',
      status: 'ACTIVE WARNING',
      details:
        'Continuous monsoon downpour combined with high canal tides has caused rapid inundation in Salt Lake Sectors 5 and 12. Water levels on arterial connectors are between 0.8m and 1.3m.',
      actions: [
        'Do not attempt to drive through flooded roads.',
        'If water enters ground floor, move immediately to 1st floor or Community Relief Center.',
        'Keep mobile phone charged and turn on emergency low-power mode.',
        'Disconnect electrical mains if water nears switchboards.',
      ],
      nearestSafeHaven: {
        name: 'Community Relief Center (Sector 12)',
        distance: '1.2 km',
        routeStatus: 'Clear via Elevated Broadway',
      },
    },
    {
      id: 'alt-02',
      severity: 'WARNING',
      badgeColor: 'amber',
      title: 'Severe Thunderstorm & High-Tension Wire Hazard',
      summary:
        'Sustained wind gusts up to 65 km/h. Multiple tree falls and downed feeder cables reported in Bidhannagar.',
      affectedArea: 'Bidhannagar Blocks CA through CD',
      distance: '2.1 km from you',
      timestamp: '18 min ago',
      source: 'India Meteorological Dept (IMD) Local Radar',
      status: 'ACTIVE WATCH',
      details:
        'Gale-force squalls have dislodged tree branches onto distribution cables. West Bengal State Electricity Board crews have disconnected affected lines to isolate faults.',
      actions: [
        'Stay indoors and avoid standing near glass windows.',
        'Assume all fallen electrical cables are energized — maintain minimum 50m distance.',
        'Report sparkling cables directly via Salvus Incident Report tab.',
      ],
      nearestSafeHaven: {
        name: 'Bidhannagar High School Emergency Shelter',
        distance: '3.1 km',
        routeStatus: 'Caution advised near Block BD',
      },
    },
    {
      id: 'alt-03',
      severity: 'WATCH',
      badgeColor: 'sky',
      title: 'Heavy Rainfall Advisory (Next 6 Hours)',
      summary:
        'Meteorological projection expects 85mm to 110mm additional rainfall through midnight.',
      affectedArea: 'Kolkata Metropolitan Area & Eastern Suburbs',
      distance: 'Metro Wide',
      timestamp: '42 min ago',
      source: 'Open-Meteo Weather Model + IMD',
      status: 'ADVISORY',
      details:
        'A localized convective cloud system is hovering over the Hooghly basin. Drainage pumps at major canal sluice gates are operating at full capacity.',
      actions: [
        'Store drinking water and basic emergency supplies.',
        'Secure loose outdoor items on rooftops and balconies.',
        'Check in on elderly neighbors or vulnerable family members.',
      ],
      nearestSafeHaven: null,
    },
    {
      id: 'alt-04',
      severity: 'INFO',
      badgeColor: 'slate',
      title: 'Emergency Drinking Water Tanker Stationed at Community Hall',
      summary:
        'Purified drinking water tanker (5000L capacity) and oral rehydration packets deployed for public access.',
      affectedArea: 'Plot 42, Block CA, Sector 12',
      distance: '1.2 km from you',
      timestamp: '1 hr ago',
      source: 'Municipal Disaster Relief Support',
      status: 'SERVICE OPERATIONAL',
      details:
        'Kolkata Municipal Corporation in coordination with Salvus relief dispatch has stationed water supply points to prevent water-borne contamination.',
      actions: [
        'Bring clean containers for collection.',
        'Water purification chlorine tablets are being distributed free of cost at the desk.',
      ],
      nearestSafeHaven: {
        name: 'Community Relief Center (Sector 12)',
        distance: '1.2 km',
        routeStatus: 'Clear',
      },
    },
  ],
}
