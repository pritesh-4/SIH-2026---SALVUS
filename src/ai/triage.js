const CRITICAL_KEYWORDS = [
  'trapped',
  'unconscious',
  'not breathing',
  'severe bleeding',
  'collapsed',
  'critical',
]

const HIGH_KEYWORDS = ['injured', 'fire', 'flood', 'drowning', 'evacuate', 'medical emergency']

export function triageIncident(message) {
  const text = message.toLowerCase()

  const isCritical = CRITICAL_KEYWORDS.some((keyword) => text.includes(keyword))

  const isHigh = HIGH_KEYWORDS.some((keyword) => text.includes(keyword))

  let severity = 'LOW'
  let confidence = 0.7

  if (isCritical) {
    severity = 'CRITICAL'
    confidence = 0.95
  } else if (isHigh) {
    severity = 'HIGH'
    confidence = 0.85
  }

  let hazardType = 'GENERAL EMERGENCY'
  let requiredCapability = 'GENERAL RESPONSE'

  if (text.includes('flood') || text.includes('water')) {
    hazardType = 'FLOOD'
    requiredCapability = 'HIGH-WATER RESCUE'
  } else if (text.includes('fire') || text.includes('smoke')) {
    hazardType = 'FIRE'
    requiredCapability = 'FIRE RESPONSE'
  } else if (text.includes('earthquake')) {
    hazardType = 'EARTHQUAKE'
    requiredCapability = 'URBAN SEARCH & RESCUE'
  } else if (
    text.includes('blocked road') ||
    text.includes('road blocked') ||
    text.includes('fallen tree')
  ) {
    hazardType = 'ROAD BLOCKAGE'
    requiredCapability = 'CLEARANCE TEAM'
  }

  const priorityScore = severity === 'CRITICAL' ? 9.5 : severity === 'HIGH' ? 7.5 : 4.0

  return {
    hazardType,
    severityClassification: severity,
    aiConfidence: `${Math.round(confidence * 100)}%`,
    priorityScore: `${priorityScore} / 10.0`,
    requiredCapability,
  }
}
