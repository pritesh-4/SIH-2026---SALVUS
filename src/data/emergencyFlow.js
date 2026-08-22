export const emergencyFlowData = {
  incident: {
    id: 'INC-8492',
    category: 'Water Rescue / Localized Flood',
    severity: 'CRITICAL',
    timestamp: 'Just now',
    userLocation: {
      address: 'Sector 12, Salt Lake, Kolkata',
      coordinates: '22.5726° N, 88.3639° E',
      accuracy: '±6m',
      status: 'BROADCASTING',
    },
  },
  responder: {
    unitName: 'NDRF Unit 4 — Alpha Team',
    teamLead: 'Capt. A. Roy',
    vehicle: 'Zodiac Rescue Boat',
    etaMinutes: 4,
    distance: '650 m',
    contactNumber: '112',
    badge: 'FLOOD SPECIALIST',
  },
  states: {
    CONFIRMING: {
      key: 'CONFIRMING',
      title: 'Confirm Emergency SOS',
      subtitle:
        'This will dispatch immediate local emergency responders with your live GPS location.',
    },
    SOS_ACTIVE: {
      key: 'SOS_ACTIVE',
      phaseLabel: 'BEACON BROADCASTING',
      title: 'Emergency Beacon Active',
      description: 'Your SOS signal and live coordinates have been transmitted to Salvus Command.',
      badgeColor: 'rose',
      progressStep: 1,
    },
    TRIAGING: {
      key: 'TRIAGING',
      phaseLabel: 'AI TRIAGE & VERIFICATION',
      title: 'Matching Response Unit',
      description:
        'AI triage is allocating the closest high-water rescue team with active boat capability.',
      badgeColor: 'amber',
      progressStep: 2,
    },
    ASSIGNED: {
      key: 'ASSIGNED',
      phaseLabel: 'RESPONDER ASSIGNED',
      title: 'NDRF Unit 4 Assigned',
      description:
        'Alpha Rescue Team has accepted your incident ticket and is prepping deployment.',
      badgeColor: 'blue',
      progressStep: 3,
    },
    EN_ROUTE: {
      key: 'EN_ROUTE',
      phaseLabel: 'RESPONDER EN ROUTE',
      title: 'Rescue Team Is En Route',
      description: 'Zodiac Rescue Boat is navigating toward Sector 12. Keep your line open.',
      badgeColor: 'sky',
      progressStep: 4,
    },
    ON_SCENE: {
      key: 'ON_SCENE',
      phaseLabel: 'ON SCENE',
      title: 'Responders In Your Vicinity',
      description: 'Unit 4 is on your street. Look for orange floodlights and wave to signal.',
      badgeColor: 'emerald',
      progressStep: 5,
    },
    RESOLVED: {
      key: 'RESOLVED',
      phaseLabel: 'RESCUE COMPLETE',
      title: 'Incident Safely Resolved',
      description: 'You have been safely accounted for by NDRF Unit 4. Safety protocol complete.',
      badgeColor: 'emerald',
      progressStep: 6,
    },
    CANCELLED: {
      key: 'CANCELLED',
      phaseLabel: 'CANCELLED',
      title: 'Emergency Request Cancelled',
      description:
        'Your SOS beacon was deactivated. Salvus Command has been notified of the cancel.',
      badgeColor: 'slate',
      progressStep: 0,
    },
  },
  timelineSteps: [
    {
      id: 'SOS_ACTIVE',
      label: 'SOS Beacon Activated',
      description: 'Transmitted GPS telemetry',
      stepNumber: 1,
    },
    {
      id: 'TRIAGING',
      label: 'AI Triage & Triage Score',
      description: 'Classified: Water Rescue / Critical',
      stepNumber: 2,
    },
    {
      id: 'ASSIGNED',
      label: 'Responder Assigned',
      description: 'NDRF Unit 4 assigned',
      stepNumber: 3,
    },
    {
      id: 'EN_ROUTE',
      label: 'En Route (ETA 4 min)',
      description: 'Zodiac Boat tracking to Sector 12',
      stepNumber: 4,
    },
    {
      id: 'ON_SCENE',
      label: 'On Scene',
      description: 'Responders arrived at location',
      stepNumber: 5,
    },
    {
      id: 'RESOLVED',
      label: 'Safe Resolution',
      description: 'Citizen evacuation confirmed',
      stepNumber: 6,
    },
  ],
  instructions: [
    {
      id: 1,
      title: 'Stay in Place on High Ground',
      text: 'Do not attempt to walk through submerged electrical lines or rapid water.',
    },
    {
      id: 2,
      title: 'Conserve Phone Battery',
      text: 'Keep screen brightness low. The app will pulse audio alerts when responders are within 100m.',
    },
    {
      id: 3,
      title: 'Make Yourself Visible',
      text: 'Wave a bright cloth, whistle, or flash your phone torch upwards when you hear boats.',
    },
  ],
}
