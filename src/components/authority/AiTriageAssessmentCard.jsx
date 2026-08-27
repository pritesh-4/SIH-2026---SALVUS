import { useState } from 'react'
import { RefreshCw, Edit3, CheckCircle2, ChevronDown, ChevronUp } from 'lucide-react'
import { Card } from '../ui/Card'
import { Badge } from '../ui/Badge'
import { Button } from '../ui/Button'

/**
 * Command Decision Intelligence Assessment Card
 * Part 18: Factual AI decision support, subordinate to operator action.
 */
export const AiTriageAssessmentCard = ({
  incident,
  onVerify,
  onAdjust,
  onReevaluate,
  isVerifying = false,
  isAnalyzing = false,
}) => {
  const [isAdjusting, setIsAdjusting] = useState(false)
  const [adjustedSeverity, setAdjustedSeverity] = useState(incident?.severity || 'HIGH')
  const [adjustedType, setAdjustedType] = useState(incident?.type || 'flood')
  const [adjustedCapability, setAdjustedCapability] = useState(
    incident?.ai_triage?.recommended_capability || 'FLOOD_BOAT'
  )
  const [reviewerNotes, setReviewerNotes] = useState('')
  const [showFactors, setShowFactors] = useState(false)

  if (!incident) return null

  const aiState = isAnalyzing
    ? 'ANALYZING'
    : incident.ai_state || (incident.ai_triage ? 'AVAILABLE' : 'WAITING')
  const triage = incident.ai_triage
  const hasAssessment = Boolean(triage)

  const confidence = typeof triage?.confidence === 'number' ? triage.confidence : 0.88
  const confidencePct = Math.round(confidence * 100)
  const isVerified = [
    'VERIFIED',
    'ASSIGNED',
    'EN_ROUTE',
    'NEARBY',
    'ON_SCENE',
    'RESOLVED',
  ].includes(incident.status)
  const isAdjusted = triage?.review_status === 'ADJUSTED'

  const handleAdjustSubmit = (e) => {
    e.preventDefault()
    onAdjust?.({
      adjusted_severity: adjustedSeverity,
      adjusted_type: adjustedType,
      adjusted_capability: adjustedCapability,
      reviewer_notes: reviewerNotes || 'Operator adjustment',
    })
    setIsAdjusting(false)
  }

  // Analyzing state
  if (aiState === 'ANALYZING' || (aiState === 'PROCESSING' && !hasAssessment)) {
    return (
      <Card padding="md" className="space-y-3">
        <div className="flex items-center justify-between border-b border-salvus-border pb-2">
          <div className="flex items-center gap-2">
            <RefreshCw className="w-3.5 h-3.5 animate-spin text-salvus-info" />
            <span className="text-xs font-bold text-salvus-text-primary uppercase tracking-wider">
              Assessing Incident
            </span>
          </div>
          <Badge variant="info" size="sm">
            Processing
          </Badge>
        </div>
        <p className="text-xs text-salvus-text-secondary">
          Analyzing reported hazard, hydro-models, and spatial priority factors...
        </p>
      </Card>
    )
  }

  return (
    <Card padding="sm" className="space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-salvus-border pb-2">
        <div className="flex items-center gap-2">
          <Badge variant="neutral" dot={true}>
            COMMAND ASSESSMENT
          </Badge>
        </div>

        <div className="flex items-center gap-1.5">
          {isVerified ? (
            <Badge variant="safe" size="sm">
              Verified
            </Badge>
          ) : isAdjusted ? (
            <Badge variant="warning" size="sm">
              Adjusted
            </Badge>
          ) : (
            <Badge variant="info" size="sm">
              {confidencePct}% Match
            </Badge>
          )}
        </div>
      </div>

      {/* Main Assessment Grid */}
      <div className="grid grid-cols-3 gap-2 bg-salvus-muted/30 p-2.5 rounded-xl border border-salvus-border text-xs">
        <div>
          <span className="text-[10px] text-salvus-text-muted uppercase block">Classification</span>
          <strong className="text-salvus-text-primary truncate block mt-0.5">
            {triage?.hazard_type || incident.type || 'Flash Flood'}
          </strong>
        </div>

        <div>
          <span className="text-[10px] text-salvus-text-muted uppercase block">Severity Fit</span>
          <strong className="text-salvus-critical truncate block mt-0.5">
            {triage?.recommended_severity || incident.severity || 'HIGH'}
          </strong>
        </div>

        <div>
          <span className="text-[10px] text-salvus-text-muted uppercase block">Required Unit</span>
          <strong className="text-salvus-info truncate block mt-0.5">
            {triage?.recommended_capability || 'ZODIAC_BOAT'}
          </strong>
        </div>
      </div>

      {/* Rationale & Explainability */}
      {triage?.summary && (
        <div className="text-xs text-salvus-text-secondary leading-relaxed bg-salvus-muted/20 p-2.5 rounded-lg border border-salvus-border">
          {triage.summary}
        </div>
      )}

      {/* Explainable factors */}
      <div>
        <button
          type="button"
          onClick={() => setShowFactors(!showFactors)}
          className="text-xs text-salvus-info hover:underline flex items-center gap-1 cursor-pointer"
        >
          {showFactors ? (
            <ChevronUp className="h-3.5 w-3.5" />
          ) : (
            <ChevronDown className="h-3.5 w-3.5" />
          )}
          <span>{showFactors ? 'Hide Assessment Factors' : 'View Assessment Factors'}</span>
        </button>

        {showFactors && (
          <div className="mt-2 p-2 bg-salvus-muted/40 rounded-lg border border-salvus-border space-y-1 text-xs text-salvus-text-secondary">
            {triage?.risk_factors?.map((rf, i) => (
              <div key={i} className="flex items-start gap-1.5">
                <span className="text-salvus-critical font-bold">•</span>
                <span>{rf}</span>
              </div>
            ))}
            {!triage?.risk_factors?.length && (
              <p className="text-salvus-text-muted">No high-risk environmental factors flagged.</p>
            )}
          </div>
        )}
      </div>

      {/* Operator Override Form */}
      {isAdjusting ? (
        <form
          onSubmit={handleAdjustSubmit}
          className="p-3 bg-salvus-muted/40 rounded-xl border border-salvus-border space-y-3 text-xs"
        >
          <div className="font-bold text-salvus-text-primary">Adjust Incident Assessment</div>

          <div className="grid grid-cols-3 gap-2">
            <div>
              <label className="text-[10px] text-salvus-text-muted uppercase block mb-1">
                Type
              </label>
              <select
                value={adjustedType}
                onChange={(e) => setAdjustedType(e.target.value)}
                className="w-full bg-salvus-surface border border-salvus-border rounded-lg p-1.5 text-xs text-salvus-text-primary"
              >
                <option value="flood">Flood</option>
                <option value="hazard">Hazard</option>
                <option value="power_line">Power Line</option>
                <option value="structural">Structural</option>
                <option value="medical">Medical</option>
                <option value="fire">Fire</option>
              </select>
            </div>

            <div>
              <label className="text-[10px] text-salvus-text-muted uppercase block mb-1">
                Severity
              </label>
              <select
                value={adjustedSeverity}
                onChange={(e) => setAdjustedSeverity(e.target.value)}
                className="w-full bg-salvus-surface border border-salvus-border rounded-lg p-1.5 text-xs text-salvus-text-primary"
              >
                <option value="CRITICAL">Critical</option>
                <option value="HIGH">High</option>
                <option value="MEDIUM">Medium</option>
                <option value="LOW">Low</option>
              </select>
            </div>

            <div>
              <label className="text-[10px] text-salvus-text-muted uppercase block mb-1">
                Required Unit
              </label>
              <select
                value={adjustedCapability}
                onChange={(e) => setAdjustedCapability(e.target.value)}
                className="w-full bg-salvus-surface border border-salvus-border rounded-lg p-1.5 text-xs text-salvus-text-primary"
              >
                <option value="FLOOD_BOAT">Rescue Boat</option>
                <option value="AMBULANCE">Ambulance</option>
                <option value="EVAC_BUS">Evac Bus</option>
                <option value="DRONE_RECON">Drone Recon</option>
              </select>
            </div>
          </div>

          <div>
            <label className="text-[10px] text-salvus-text-muted uppercase block mb-1">
              Operator Notes
            </label>
            <input
              type="text"
              value={reviewerNotes}
              onChange={(e) => setReviewerNotes(e.target.value)}
              placeholder="Reason for adjustment..."
              className="w-full bg-salvus-surface border border-salvus-border rounded-lg p-1.5 text-xs text-salvus-text-primary"
            />
          </div>

          <div className="flex justify-end gap-2 pt-1">
            <Button variant="quiet" size="sm" onClick={() => setIsAdjusting(false)}>
              Cancel
            </Button>
            <Button variant="primary" size="sm" type="submit">
              Save Adjustment
            </Button>
          </div>
        </form>
      ) : (
        /* Action buttons */
        <div className="flex items-center justify-between gap-2 pt-1 border-t border-salvus-border">
          <div className="flex items-center gap-1.5">
            <Button
              variant="quiet"
              size="sm"
              onClick={() => setIsAdjusting(true)}
              leftIcon={<Edit3 className="h-3 w-3" />}
              className="text-xs"
            >
              Adjust
            </Button>

            <Button
              variant="quiet"
              size="sm"
              onClick={onReevaluate}
              leftIcon={<RefreshCw className="h-3 w-3" />}
              className="text-xs"
            >
              Re-evaluate
            </Button>
          </div>

          {!isVerified && onVerify && (
            <Button
              variant="safe"
              size="sm"
              loading={isVerifying}
              onClick={() => onVerify()}
              leftIcon={<CheckCircle2 className="h-3 w-3" />}
              className="text-xs font-semibold"
            >
              Verify Assessment
            </Button>
          )}
        </div>
      )}
    </Card>
  )
}

export default AiTriageAssessmentCard
