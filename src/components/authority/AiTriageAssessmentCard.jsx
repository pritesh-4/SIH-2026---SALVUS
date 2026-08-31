import { useState } from 'react'
import {
  RefreshCw,
  Edit3,
  CheckCircle2,
  AlertTriangle,
  FileText,
  Sparkles,
  ShieldCheck,
  HelpCircle,
} from 'lucide-react'
import { Card } from '../ui/Card'
import { Badge } from '../ui/Badge'
import { Button } from '../ui/Button'

/**
 * Incident Decision Intelligence Assessment Card (Hardened Decision Support)
 *
 * Enforces SALVUS Life-Safety Invariants:
 * - Clear Provider Provenance: PRIMARY AI, FALLBACK AI, or RULE-BASED TRIAGE
 * - Separation of REPORTED FACTS from AI INFERENCE
 * - Honest qualitative confidence (High / Moderate / Low)
 * - Prominent uncertainty and limitation flags
 * - AI decision support only (Human operator maintains exclusive dispatch authority)
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

  if (!incident) return null

  const aiState = isAnalyzing
    ? 'ANALYZING'
    : incident.ai_state || (incident.ai_triage ? 'AVAILABLE' : 'WAITING')
  const triage = incident.ai_triage
  const hasAssessment = Boolean(triage)

  // Calibrate honest qualitative confidence
  const rawConf =
    typeof triage?.confidence === 'number'
      ? triage.confidence
      : typeof triage?.confidence === 'string' && triage.confidence.includes('%')
        ? parseFloat(triage.confidence) / 100
        : null

  let confidenceTier = { label: 'Uncalibrated', variant: 'neutral', desc: 'Awaiting evaluation' }
  if (rawConf !== null) {
    if (rawConf >= 0.8) {
      confidenceTier = {
        label: 'High Confidence',
        variant: 'safe',
        desc: 'Ground keywords & distress signals strongly corroborate assessment',
      }
    } else if (rawConf >= 0.6) {
      confidenceTier = {
        label: 'Moderate Confidence',
        variant: 'info',
        desc: 'Partial context provided; field verification advised',
      }
    } else {
      confidenceTier = {
        label: 'Low / Needs Review',
        variant: 'warning',
        desc: 'Sparse report or ambiguous signals; operator review required',
      }
    }
  }

  // Provenance Label
  const sourceLabel =
    triage?.source_label ||
    (triage?.provider?.includes('gemini')
      ? 'AI TRIAGE — PRIMARY'
      : triage?.provider?.includes('groq')
        ? 'AI TRIAGE — FALLBACK'
        : 'RULE-BASED TRIAGE')

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
      <Card padding="md" className="space-y-3 border-salvus-info/30 bg-salvus-info-bg/10">
        <div className="flex items-center justify-between border-b border-salvus-border pb-2">
          <div className="flex items-center gap-2">
            <RefreshCw className="w-3.5 h-3.5 animate-spin text-salvus-info" />
            <span className="text-xs font-bold text-salvus-text-primary uppercase tracking-wider">
              Evaluating Decision Intelligence
            </span>
          </div>
          <Badge variant="info" size="sm">
            Processing
          </Badge>
        </div>
        <p className="text-xs text-salvus-text-secondary leading-relaxed">
          Extracting grounded reported conditions, spatial risk factors, and recommended
          capability...
        </p>
      </Card>
    )
  }

  const hazardLabel = triage?.hazard_type || triage?.hazardType || incident.type || 'Incident'
  const severityFit =
    triage?.severity || triage?.recommended_severity || incident.severity || 'MEDIUM'
  const requiredUnit = (
    triage?.recommended_capability ||
    triage?.recommendedUnit ||
    triage?.recommendedCapability ||
    'Rescue Unit'
  ).replace('_', ' ')
  const reasoningText =
    triage?.priority_reasoning || triage?.priorityReasoning || triage?.summary || null

  const reportedConditions = triage?.reported_conditions ||
    triage?.key_signals || [
      incident.description ? 'Distress call submitted' : 'Standard field report',
    ]

  const uncertaintyFlags = triage?.uncertainty_flags || []

  return (
    <Card padding="sm" className="space-y-3 shadow-2xs border-salvus-border">
      {/* Header & Provenance */}
      <div className="flex items-center justify-between border-b border-salvus-border pb-2">
        <div className="flex items-center gap-2 min-w-0">
          <Badge
            variant={
              sourceLabel.includes('PRIMARY')
                ? 'info'
                : sourceLabel.includes('FALLBACK')
                  ? 'warning'
                  : 'neutral'
            }
            size="sm"
            isMono={true}
          >
            {sourceLabel}
          </Badge>
          <span className="text-[11px] text-salvus-text-muted hidden sm:inline truncate">
            Decision Support
          </span>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          {isVerified ? (
            <Badge variant="safe" size="sm">
              ✓ Verified by Authority
            </Badge>
          ) : isAdjusted ? (
            <Badge variant="warning" size="sm">
              Adjusted by Authority
            </Badge>
          ) : (
            <Badge variant={confidenceTier.variant} size="sm" title={confidenceTier.desc}>
              {confidenceTier.label}
            </Badge>
          )}
        </div>
      </div>

      {/* Main Assessment Grid */}
      <div className="grid grid-cols-3 gap-2 bg-salvus-muted/30 p-2.5 rounded-xl border border-salvus-border text-xs">
        <div>
          <span className="text-[10px] text-salvus-text-muted uppercase block font-semibold">
            Classification
          </span>
          <strong className="text-salvus-text-primary truncate block mt-0.5 font-medium">
            {hazardLabel}
          </strong>
        </div>

        <div>
          <span className="text-[10px] text-salvus-text-muted uppercase block font-semibold">
            Urgency / Severity
          </span>
          <strong
            className={`truncate block mt-0.5 font-bold font-mono ${
              severityFit === 'CRITICAL'
                ? 'text-salvus-critical'
                : severityFit === 'HIGH'
                  ? 'text-salvus-warning'
                  : 'text-salvus-info'
            }`}
          >
            {severityFit}
          </strong>
        </div>

        <div>
          <span className="text-[10px] text-salvus-text-muted uppercase block font-semibold">
            Recommended Unit
          </span>
          <strong className="text-salvus-info truncate block mt-0.5 font-medium">
            {requiredUnit}
          </strong>
        </div>
      </div>

      {/* Facts vs Inference: Reported Conditions (Facts) */}
      <div className="bg-salvus-surface p-2.5 rounded-xl border border-salvus-border space-y-1.5">
        <div className="flex items-center justify-between text-[10px] font-bold text-salvus-text-muted uppercase tracking-wider">
          <span className="flex items-center gap-1.5">
            <FileText className="h-3 w-3 text-salvus-text-secondary" />
            <span>Reported Conditions (Grounded Facts)</span>
          </span>
          <span className="text-[10px] text-salvus-safe font-mono lowercase">
            verified from report
          </span>
        </div>
        <ul className="space-y-1 text-xs text-salvus-text-primary">
          {reportedConditions.map((cond, idx) => (
            <li key={idx} className="flex items-start gap-1.5 leading-tight">
              <span className="text-salvus-info font-bold shrink-0">•</span>
              <span className="font-medium">{cond}</span>
            </li>
          ))}
        </ul>
      </div>

      {/* AI Inference & Reasoning */}
      {reasoningText && (
        <div className="bg-salvus-muted/20 p-2.5 rounded-xl border border-salvus-border space-y-1 text-xs">
          <div className="flex items-center gap-1.5 text-[10px] font-bold text-salvus-text-muted uppercase tracking-wider">
            <Sparkles className="h-3 w-3 text-salvus-info" />
            <span>AI Inference & Priority Justification</span>
          </div>
          <p className="text-salvus-text-secondary leading-relaxed font-medium">{reasoningText}</p>
        </div>
      )}

      {/* Multimodal Imagery Estimate Hint (If present) */}
      {triage?.image_assessment_hint && (
        <div className="p-2 bg-salvus-warning-bg/20 rounded-lg border border-salvus-warning-border/50 text-[11px] text-salvus-warning-text flex items-start gap-1.5">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
          <span>{triage.image_assessment_hint}</span>
        </div>
      )}

      {/* Uncertainties & Limitations (Honest Disclosure) */}
      {uncertaintyFlags.length > 0 && (
        <div className="p-2.5 bg-salvus-muted/40 rounded-xl border border-salvus-border space-y-1 text-xs">
          <div className="flex items-center gap-1 text-[10px] font-bold text-salvus-text-muted uppercase tracking-wider">
            <HelpCircle className="h-3 w-3 text-salvus-text-muted" />
            <span>Uncertainties & Operational Caveats</span>
          </div>
          <ul className="space-y-0.5 text-[11px] text-salvus-text-secondary">
            {uncertaintyFlags.map((flag, i) => (
              <li key={i} className="flex items-start gap-1">
                <span className="text-salvus-warning font-bold">⚠</span>
                <span>{flag}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Non-Autonomous Safety Boundary Note */}
      <div className="text-[10px] text-salvus-text-muted flex items-center gap-1.5 px-1 font-mono">
        <ShieldCheck className="h-3 w-3 text-salvus-safe shrink-0" />
        <span>AI assists understanding. Dispatch authority remains 100% human-verified.</span>
      </div>

      {/* Operator Override Form */}
      {isAdjusting ? (
        <form
          onSubmit={handleAdjustSubmit}
          className="p-3 bg-salvus-muted/40 rounded-xl border border-salvus-border space-y-3 text-xs animate-fadeIn"
        >
          <div className="font-bold text-salvus-text-primary">Adjust Incident Assessment</div>

          <div className="grid grid-cols-3 gap-2">
            <div>
              <label className="text-[10px] text-salvus-text-muted uppercase block mb-1 font-semibold">
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
              <label className="text-[10px] text-salvus-text-muted uppercase block mb-1 font-semibold">
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
              <label className="text-[10px] text-salvus-text-muted uppercase block mb-1 font-semibold">
                Required Unit
              </label>
              <select
                value={adjustedCapability}
                onChange={(e) => setAdjustedCapability(e.target.value)}
                className="w-full bg-salvus-surface border border-salvus-border rounded-lg p-1.5 text-xs text-salvus-text-primary"
              >
                <option value="FLOOD_BOAT">Flood Rescue Boat</option>
                <option value="AMBULANCE">Advanced Ambulance</option>
                <option value="STRETCHER_TEAM">Stretcher Trauma Team</option>
                <option value="HAZMAT">Hazmat / Grid Isolation</option>
                <option value="DEBRIS_CLEAR">Debris & Extrication</option>
              </select>
            </div>
          </div>

          <div>
            <label className="text-[10px] text-salvus-text-muted uppercase block mb-1 font-semibold">
              Operator Justification Notes
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
              className="text-xs text-salvus-text-secondary hover:text-salvus-text-primary"
            >
              Adjust
            </Button>

            <Button
              variant="quiet"
              size="sm"
              onClick={onReevaluate}
              leftIcon={<RefreshCw className="h-3 w-3" />}
              className="text-xs text-salvus-text-secondary hover:text-salvus-text-primary"
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
