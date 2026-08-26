import { useState, useCallback } from 'react'
import {
  verifyIncidentTriage as apiVerifyIncidentTriage,
  adjustIncidentTriage as apiAdjustIncidentTriage,
  analyzeIncidentTriage as apiAnalyzeIncidentTriage,
} from '../../../services/api'

export const useIncidentTriage = ({ onRefetch = null, onStatusMessage = null } = {}) => {
  const [isVerifyingTriage, setIsVerifyingTriage] = useState(false)
  const [isAnalyzingTriage, setIsAnalyzingTriage] = useState(false)

  const verifyTriage = useCallback(
    async (incident, customData = null) => {
      if (!incident) return { success: false }
      setIsVerifyingTriage(true)
      const result = await apiVerifyIncidentTriage(
        incident.id,
        customData || { actor: 'Authority Dispatcher' }
      )
      setIsVerifyingTriage(false)

      if (result.success) {
        if (onStatusMessage) {
          onStatusMessage(`✓ AI Triage verified for #${incident.ticket_id || incident.id}`)
        }
        if (onRefetch) onRefetch(true)
      } else if (onStatusMessage) {
        onStatusMessage(`❌ ${result.error?.message || 'Verification failed'}`)
      }
      return result
    },
    [onRefetch, onStatusMessage]
  )

  const adjustTriage = useCallback(
    async (incident, adjustmentData) => {
      if (!incident) return { success: false }
      setIsVerifyingTriage(true)
      const result = await apiAdjustIncidentTriage(incident.id, {
        ...adjustmentData,
        actor: 'Authority Dispatcher',
      })
      setIsVerifyingTriage(false)

      if (result.success) {
        if (onStatusMessage) {
          onStatusMessage(
            `✓ AI Triage adjusted & verified for #${incident.ticket_id || incident.id}`
          )
        }
        if (onRefetch) onRefetch(true)
      } else if (onStatusMessage) {
        onStatusMessage(`❌ ${result.error?.message || 'Adjustment failed'}`)
      }
      return result
    },
    [onRefetch, onStatusMessage]
  )

  const reevaluateTriage = useCallback(
    async (incident) => {
      if (!incident) return { success: false }
      setIsAnalyzingTriage(true)
      const result = await apiAnalyzeIncidentTriage(incident.id)
      setIsAnalyzingTriage(false)

      if (result.success) {
        if (onStatusMessage) {
          onStatusMessage(`✓ Re-evaluated triage for #${incident.ticket_id || incident.id}`)
        }
        if (onRefetch) onRefetch(true)
      } else if (onStatusMessage) {
        onStatusMessage(`❌ ${result.error?.message || 'Triage analysis failed'}`)
      }
      return result
    },
    [onRefetch, onStatusMessage]
  )

  return {
    isVerifyingTriage,
    isAnalyzingTriage,
    verifyTriage,
    adjustTriage,
    reevaluateTriage,
  }
}
