export const citizenProfileData = {
  identity: {
    fullName: 'Aditi Mukherjee',
    phone: '+91 98301 23456',
    email: 'aditi.m@salvus.local',
    registeredAddress: 'Flat 4B, Greenwood Apts, Sector 12, Salt Lake, Kolkata',
    bloodGroup: 'O+',
    avatarInitials: 'AM',
    emergencyId: 'SLV-CIT-7829',
    medicalInfo: {
      conditions: ['Mild Asthma (Carries Inhaler)'],
      allergies: ['Penicillin Allergy'],
      mobilityNote: 'Fully Mobile / Ambulatory',
    },
  },
  emergencyContacts: [
    {
      id: 'ec-1',
      name: 'Dr. Sourav Mukherjee',
      relationship: 'Father',
      phone: '+91 98300 11223',
      isPrimary: true,
      priority: 1,
      notifyOnSos: true,
    },
    {
      id: 'ec-2',
      name: 'Priya Das',
      relationship: 'Sister / Neighbor',
      phone: '+91 98311 44556',
      isPrimary: false,
      priority: 2,
      notifyOnSos: true,
    },
  ],
  privacyAndSettings: [
    {
      id: 'emergency_location',
      title: 'Emergency Location Sharing',
      description: 'Only activates GPS broadcast when you trigger SOS or submit an incident.',
      value: true,
      locked: true,
      badge: 'Privacy Protected',
    },
    {
      id: 'offline_cache',
      title: 'Offline Emergency Cache',
      description:
        'Stores local shelter locations and emergency contacts on device for zero-connectivity situations.',
      value: true,
    },
    {
      id: 'critical_push',
      title: 'Critical Threat Sirens',
      description: 'Override silent mode for imminent evacuation warnings in your sector.',
      value: true,
    },
    {
      id: 'battery_saver',
      title: 'Auto Low-Power Disaster Mode',
      description:
        'Reduces background animations and screen brightness when battery drops below 20%.',
      value: true,
    },
  ],
  appInfo: {
    version: 'Salvus Citizen v1.2.0-beta',
    build: 'Build 2026.08',
    encryptionStatus: 'End-to-End Encrypted Telemetry',
  },
}
