/**
 * SALVUS AUTHORITATIVE STATE MACHINE & LIFECYCLE MODEL
 *
 * Centralized, single-source-of-truth definition for emergency incident,
 * responder, and assignment lifecycles across the entire Salvus frontend.
 * Mirrors backend app.services.state_machine.
 */

// ---------------------------------------------------------------------------
// 1. Canonical Status Enums & Vocabulary
// ---------------------------------------------------------------------------

export const INCIDENT_STATUS = Object.freeze({
  NEW: 'NEW',
  TRIAGE_PENDING: 'TRIAGE_PENDING',
  VERIFIED: 'VERIFIED',
  ASSIGNED: 'ASSIGNED',
  EN_ROUTE: 'EN_ROUTE',
  NEARBY: 'NEARBY',
  ON_SCENE: 'ON_SCENE',
  RESOLVED: 'RESOLVED',
  CANCELLED: 'CANCELLED',
})

export const EMERGENCY_STATE = Object.freeze({
  SOS_ACTIVE: 'SOS_ACTIVE',
  TRIAGING: 'TRIAGING',
  VERIFIED: 'VERIFIED',
  ASSIGNED: 'ASSIGNED',
  EN_ROUTE: 'EN_ROUTE',
  NEARBY: 'NEARBY',
  ON_SCENE: 'ON_SCENE',
  RESOLVED: 'RESOLVED',
  CANCELLED: 'CANCELLED',
})

export const RESPONDER_STATUS = Object.freeze({
  AVAILABLE: 'AVAILABLE',
  ASSIGNED: 'ASSIGNED',
  EN_ROUTE: 'EN_ROUTE',
  NEARBY: 'NEARBY',
  ON_SCENE: 'ON_SCENE',
  OFFLINE: 'OFFLINE',
})

export const ASSIGNMENT_STATUS = Object.freeze({
  PROPOSED: 'PROPOSED',
  ASSIGNED: 'ASSIGNED',
  EN_ROUTE: 'EN_ROUTE',
  NEARBY: 'NEARBY',
  ON_SCENE: 'ON_SCENE',
  COMPLETED: 'COMPLETED',
  CANCELLED: 'CANCELLED',
})

// ---------------------------------------------------------------------------
// 2. Canonical Status <-> UI State Mappings
// ---------------------------------------------------------------------------

export const STATUS_TO_STATE = Object.freeze({
  [INCIDENT_STATUS.NEW]: EMERGENCY_STATE.SOS_ACTIVE,
  [INCIDENT_STATUS.TRIAGE_PENDING]: EMERGENCY_STATE.TRIAGING,
  [INCIDENT_STATUS.VERIFIED]: EMERGENCY_STATE.VERIFIED,
  [INCIDENT_STATUS.ASSIGNED]: EMERGENCY_STATE.ASSIGNED,
  [INCIDENT_STATUS.EN_ROUTE]: EMERGENCY_STATE.EN_ROUTE,
  [INCIDENT_STATUS.NEARBY]: EMERGENCY_STATE.NEARBY,
  [INCIDENT_STATUS.ON_SCENE]: EMERGENCY_STATE.ON_SCENE,
  [INCIDENT_STATUS.RESOLVED]: EMERGENCY_STATE.RESOLVED,
  [INCIDENT_STATUS.CANCELLED]: EMERGENCY_STATE.CANCELLED,
})

export const STATE_TO_STATUS = Object.freeze({
  [EMERGENCY_STATE.SOS_ACTIVE]: INCIDENT_STATUS.NEW,
  [EMERGENCY_STATE.TRIAGING]: INCIDENT_STATUS.TRIAGE_PENDING,
  [EMERGENCY_STATE.VERIFIED]: INCIDENT_STATUS.VERIFIED,
  [EMERGENCY_STATE.ASSIGNED]: INCIDENT_STATUS.ASSIGNED,
  [EMERGENCY_STATE.EN_ROUTE]: INCIDENT_STATUS.EN_ROUTE,
  [EMERGENCY_STATE.NEARBY]: INCIDENT_STATUS.NEARBY,
  [EMERGENCY_STATE.ON_SCENE]: INCIDENT_STATUS.ON_SCENE,
  [EMERGENCY_STATE.RESOLVED]: INCIDENT_STATUS.RESOLVED,
  [EMERGENCY_STATE.CANCELLED]: INCIDENT_STATUS.CANCELLED,
})

// Linear forward progression order for active rescue journey
export const STATE_ORDER = Object.freeze([
  EMERGENCY_STATE.SOS_ACTIVE,
  EMERGENCY_STATE.TRIAGING,
  EMERGENCY_STATE.VERIFIED,
  EMERGENCY_STATE.ASSIGNED,
  EMERGENCY_STATE.EN_ROUTE,
  EMERGENCY_STATE.NEARBY,
  EMERGENCY_STATE.ON_SCENE,
  EMERGENCY_STATE.RESOLVED,
])

export const STATUS_ORDER = Object.freeze([
  INCIDENT_STATUS.NEW,
  INCIDENT_STATUS.TRIAGE_PENDING,
  INCIDENT_STATUS.VERIFIED,
  INCIDENT_STATUS.ASSIGNED,
  INCIDENT_STATUS.EN_ROUTE,
  INCIDENT_STATUS.NEARBY,
  INCIDENT_STATUS.ON_SCENE,
  INCIDENT_STATUS.RESOLVED,
])

// ---------------------------------------------------------------------------
// 3. Numeric Ranks for Event Ordering & Out-of-Order Protection
// ---------------------------------------------------------------------------

export const STATUS_RANKS = Object.freeze({
  [INCIDENT_STATUS.NEW]: 1,
  [INCIDENT_STATUS.TRIAGE_PENDING]: 2,
  [INCIDENT_STATUS.VERIFIED]: 3,
  [INCIDENT_STATUS.ASSIGNED]: 4,
  [INCIDENT_STATUS.EN_ROUTE]: 5,
  [INCIDENT_STATUS.NEARBY]: 6,
  [INCIDENT_STATUS.ON_SCENE]: 7,
  [INCIDENT_STATUS.RESOLVED]: 8,
  [INCIDENT_STATUS.CANCELLED]: 8,

  // UI State aliases
  [EMERGENCY_STATE.SOS_ACTIVE]: 1,
  [EMERGENCY_STATE.TRIAGING]: 2,
})

export const TERMINAL_STATUSES = Object.freeze(
  new Set([INCIDENT_STATUS.RESOLVED, INCIDENT_STATUS.CANCELLED])
)

export const TERMINAL_STATES = Object.freeze(
  new Set([EMERGENCY_STATE.RESOLVED, EMERGENCY_STATE.CANCELLED])
)

// ---------------------------------------------------------------------------
// 4. Explicit Transition Tables (Disallows impossible jumps)
// ---------------------------------------------------------------------------

export const ALLOWED_INCIDENT_TRANSITIONS = Object.freeze({
  [INCIDENT_STATUS.NEW]: Object.freeze([INCIDENT_STATUS.TRIAGE_PENDING, INCIDENT_STATUS.CANCELLED]),
  [INCIDENT_STATUS.TRIAGE_PENDING]: Object.freeze([
    INCIDENT_STATUS.VERIFIED,
    INCIDENT_STATUS.CANCELLED,
  ]),
  [INCIDENT_STATUS.VERIFIED]: Object.freeze([
    INCIDENT_STATUS.ASSIGNED,
    INCIDENT_STATUS.RESOLVED,
    INCIDENT_STATUS.CANCELLED,
  ]),
  [INCIDENT_STATUS.ASSIGNED]: Object.freeze([INCIDENT_STATUS.EN_ROUTE, INCIDENT_STATUS.CANCELLED]),
  [INCIDENT_STATUS.EN_ROUTE]: Object.freeze([
    INCIDENT_STATUS.NEARBY,
    INCIDENT_STATUS.ON_SCENE,
    INCIDENT_STATUS.CANCELLED,
  ]),
  [INCIDENT_STATUS.NEARBY]: Object.freeze([INCIDENT_STATUS.ON_SCENE, INCIDENT_STATUS.CANCELLED]),
  [INCIDENT_STATUS.ON_SCENE]: Object.freeze([INCIDENT_STATUS.RESOLVED, INCIDENT_STATUS.CANCELLED]),
  [INCIDENT_STATUS.RESOLVED]: Object.freeze([]),
  [INCIDENT_STATUS.CANCELLED]: Object.freeze([]),
})

export const ALLOWED_UI_STATE_TRANSITIONS = Object.freeze({
  [EMERGENCY_STATE.SOS_ACTIVE]: Object.freeze([
    EMERGENCY_STATE.TRIAGING,
    EMERGENCY_STATE.CANCELLED,
  ]),
  [EMERGENCY_STATE.TRIAGING]: Object.freeze([EMERGENCY_STATE.VERIFIED, EMERGENCY_STATE.CANCELLED]),
  [EMERGENCY_STATE.VERIFIED]: Object.freeze([
    EMERGENCY_STATE.ASSIGNED,
    EMERGENCY_STATE.RESOLVED,
    EMERGENCY_STATE.CANCELLED,
  ]),
  [EMERGENCY_STATE.ASSIGNED]: Object.freeze([EMERGENCY_STATE.EN_ROUTE, EMERGENCY_STATE.CANCELLED]),
  [EMERGENCY_STATE.EN_ROUTE]: Object.freeze([
    EMERGENCY_STATE.NEARBY,
    EMERGENCY_STATE.ON_SCENE,
    EMERGENCY_STATE.CANCELLED,
  ]),
  [EMERGENCY_STATE.NEARBY]: Object.freeze([EMERGENCY_STATE.ON_SCENE, EMERGENCY_STATE.CANCELLED]),
  [EMERGENCY_STATE.ON_SCENE]: Object.freeze([EMERGENCY_STATE.RESOLVED, EMERGENCY_STATE.CANCELLED]),
  [EMERGENCY_STATE.RESOLVED]: Object.freeze([]),
  [EMERGENCY_STATE.CANCELLED]: Object.freeze([]),
})

// ---------------------------------------------------------------------------
// 5. State Machine Validation & Inspection Helpers
// ---------------------------------------------------------------------------

/**
 * Normalize an input string to canonical UI state key.
 * e.g., 'NEW' -> 'SOS_ACTIVE', 'TRIAGE_PENDING' -> 'TRIAGING', 'SOS_ACTIVE' -> 'SOS_ACTIVE'
 */
export const normalizeToUiState = (stateOrStatus) => {
  if (!stateOrStatus || typeof stateOrStatus !== 'string') return null
  if (STATUS_TO_STATE[stateOrStatus]) {
    return STATUS_TO_STATE[stateOrStatus]
  }
  if (STATE_TO_STATUS[stateOrStatus]) {
    return stateOrStatus
  }
  return null
}

/**
 * Normalize an input string to canonical Backend status.
 * e.g., 'SOS_ACTIVE' -> 'NEW', 'TRIAGING' -> 'TRIAGE_PENDING', 'VERIFIED' -> 'VERIFIED'
 */
export const normalizeToBackendStatus = (stateOrStatus) => {
  if (!stateOrStatus || typeof stateOrStatus !== 'string') return null
  if (STATE_TO_STATUS[stateOrStatus]) {
    return STATE_TO_STATUS[stateOrStatus]
  }
  if (STATUS_TO_STATE[stateOrStatus]) {
    return stateOrStatus
  }
  return null
}

/**
 * Return whether a state or status is a terminal (end of lifecycle) state.
 */
export const isTerminalState = (stateOrStatus) => {
  if (!stateOrStatus) return false
  const uiState = normalizeToUiState(stateOrStatus)
  if (!uiState) return false
  return TERMINAL_STATES.has(uiState)
}

/**
 * Return numeric rank for status/state ordering.
 */
export const getStatusRank = (stateOrStatus) => {
  if (!stateOrStatus) return 0
  const uiState = normalizeToUiState(stateOrStatus)
  return uiState ? STATUS_RANKS[uiState] || 0 : 0
}

/**
 * Validate whether transitioning from current to target state/status is allowed.
 */
export const validateTransition = (current, target) => {
  if (!current || !target) return false

  const currentUiState = normalizeToUiState(current)
  const targetUiState = normalizeToUiState(target)

  if (!currentUiState || !targetUiState) {
    return false
  }

  // Disallow transition from terminal state
  if (isTerminalState(currentUiState)) {
    return false
  }

  const allowed = ALLOWED_UI_STATE_TRANSITIONS[currentUiState] || []
  return allowed.includes(targetUiState)
}

/**
 * Out-of-order packet protection.
 * Returns true if an incoming realtime status update should be accepted.
 */
export const shouldAcceptStatusUpdate = (currentStatusOrState, incomingStatusOrState) => {
  if (!incomingStatusOrState) return false
  if (!currentStatusOrState) return true

  const currentUi = normalizeToUiState(currentStatusOrState)
  const incomingUi = normalizeToUiState(incomingStatusOrState)

  // If already in terminal state, ignore non-terminal or backwards packets
  if (isTerminalState(currentUi)) {
    return false
  }

  // If incoming is CANCELLED or RESOLVED, always accept from any active state
  if (isTerminalState(incomingUi)) {
    return true
  }

  const currentRank = getStatusRank(currentUi)
  const incomingRank = getStatusRank(incomingUi)

  // Reject strictly out-of-order/stale packets
  return incomingRank >= currentRank
}

/**
 * Get next canonical state in linear active progression.
 */
export const getNextState = (currentState) => {
  const currentUi = normalizeToUiState(currentState)
  if (isTerminalState(currentUi)) return null

  const currentIdx = STATE_ORDER.indexOf(currentUi)
  if (currentIdx >= 0 && currentIdx < STATE_ORDER.length - 1) {
    const candidate = STATE_ORDER[currentIdx + 1]
    if (validateTransition(currentUi, candidate)) {
      return candidate
    }
  }
  return null
}

/**
 * Get previous state (for controlled demo/dev exploration).
 */
export const getPreviousState = (currentState) => {
  const currentUi = normalizeToUiState(currentState)
  if (isTerminalState(currentUi)) return null

  const currentIdx = STATE_ORDER.indexOf(currentUi)
  if (currentIdx > 0) {
    return STATE_ORDER[currentIdx - 1]
  }
  return null
}

/**
 * Get list of all currently valid next transitions from this state.
 */
export const getAllowedNextStates = (currentState) => {
  const currentUi = normalizeToUiState(currentState)
  return currentUi ? ALLOWED_UI_STATE_TRANSITIONS[currentUi] || [] : []
}

// ---------------------------------------------------------------------------
// 6. Timeline Derivation Engine (State + Events -> Authoritative Timeline UI)
// ---------------------------------------------------------------------------

const DEFAULT_TIMELINE_STEPS = Object.freeze([
  {
    id: 'SOS_ACTIVE',
    matchStatus: 'NEW',
    label: 'Emergency Request Sent',
    description: 'Location shared with emergency coordinators',
    stepNumber: 1,
  },
  {
    id: 'TRIAGING',
    matchStatus: 'TRIAGE_PENDING',
    label: 'Emergency Assessment',
    description: 'Assessing severity and watercraft requirements',
    stepNumber: 2,
  },
  {
    id: 'VERIFIED',
    matchStatus: 'VERIFIED',
    label: 'Dispatch Approved',
    description: 'Approved by Central Dispatch Coordinator',
    stepNumber: 3,
  },
  {
    id: 'ASSIGNED',
    matchStatus: 'ASSIGNED',
    label: 'Rescue Team Assigned',
    description: 'NDRF Unit 4 dispatched with Zodiac Boat',
    stepNumber: 4,
  },
  {
    id: 'EN_ROUTE',
    matchStatus: 'EN_ROUTE',
    label: 'Help is on the Way',
    description: 'Rescue boat navigating to your street (ETA ~4 mins)',
    stepNumber: 5,
  },
  {
    id: 'NEARBY',
    matchStatus: 'NEARBY',
    label: 'Rescue Team Nearby',
    description: 'Responders on your street (<100m)',
    stepNumber: 6,
  },
  {
    id: 'ON_SCENE',
    matchStatus: 'ON_SCENE',
    label: 'Help Has Arrived',
    description: 'Rescue crew at your reported location',
    stepNumber: 7,
  },
  {
    id: 'RESOLVED',
    matchStatus: 'RESOLVED',
    label: 'Safely Resolved',
    description: 'Safe evacuation complete',
    stepNumber: 8,
  },
])

/**
 * Pure function: derives the timeline view models from authoritative incident state and audit events.
 *
 * Formula:
 * Incident State + Incident Events = Timeline UI
 *
 * @param {string} currentState - Current UI state or backend status
 * @param {Array} events - List of incident_events from server
 * @param {string|null} incidentCreatedAt - ISO timestamp of incident creation
 * @param {Array|null} baseSteps - Optional base template steps
 * @returns {Array} List of computed timeline step objects
 */
export const deriveTimelineSteps = (
  currentState,
  events = [],
  incidentCreatedAt = null,
  baseSteps = DEFAULT_TIMELINE_STEPS
) => {
  const currentUiState = normalizeToUiState(currentState) || EMERGENCY_STATE.SOS_ACTIVE
  const currentRank = getStatusRank(currentUiState)
  const isCancelled = currentUiState === EMERGENCY_STATE.CANCELLED

  const safeEvents = Array.isArray(events) ? events : []

  return baseSteps.map((step) => {
    const stepState = step.id
    const stepRank = getStatusRank(stepState)

    // Find real timestamp from incident events if available
    let matchingTimestamp = null
    let eventDetail = null

    for (const evt of safeEvents) {
      if (
        (evt.event_type === 'CREATED' && step.id === 'SOS_ACTIVE') ||
        (evt.new_status && STATUS_TO_STATE[evt.new_status] === step.id) ||
        (evt.event_type === 'assignment.created' && step.id === 'ASSIGNED') ||
        (evt.event_type === 'TRIAGE_VERIFIED' && step.id === 'VERIFIED')
      ) {
        matchingTimestamp = evt.created_at
        if (evt.actor) {
          eventDetail = `Logged by ${evt.actor}`
        }
        break
      }
    }

    if (!matchingTimestamp && step.id === 'SOS_ACTIVE' && incidentCreatedAt) {
      matchingTimestamp = incidentCreatedAt
    }

    // Determine authoritative status of this step
    let stepStatus
    if (isCancelled) {
      stepStatus = matchingTimestamp ? 'completed' : 'cancelled'
    } else if (stepState === currentUiState) {
      stepStatus = 'current'
    } else if (stepRank < currentRank || matchingTimestamp) {
      stepStatus = 'completed'
    } else {
      stepStatus = 'upcoming'
    }

    // Format formatted time if event timestamp exists
    let formattedTime = null
    if (matchingTimestamp) {
      try {
        formattedTime = new Date(matchingTimestamp).toLocaleTimeString([], {
          hour: '2-digit',
          minute: '2-digit',
        })
      } catch {
        formattedTime = null
      }
    }

    return {
      ...step,
      status: stepStatus,
      timestamp: matchingTimestamp,
      formattedTime,
      eventDetail,
      description: formattedTime ? `${step.description} (${formattedTime})` : step.description,
    }
  })
}
