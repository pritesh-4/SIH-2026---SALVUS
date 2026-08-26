import { useState } from 'react'
import {
  Sparkles,
  ShieldCheck,
  AlertTriangle,
  RefreshCw,
  Edit3,
  CheckCircle2,
  Cpu,
  Info,
  ChevronDown,
  ChevronUp,
  Clock,
  AlertCircle,
} from 'lucide-react'

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

  const confidence = typeof triage?.confidence === 'number' ? triage.confidence : 0.88
  const confidencePct = Math.round(confidence * 100)
  const isLowConfidence =
    confidence < 0.75 || (triage?.uncertainty_flags && triage.uncertainty_flags.length > 0)
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
    if (onAdjust) {
      onAdjust({
        adjusted_severity: adjustedSeverity,
        adjusted_type: adjustedType,
        adjusted_capability: adjustedCapability,
        reviewer_notes: reviewerNotes || 'Operator manual adjustment',
      })
    }
    setIsAdjusting(false)
  }

  const getSeverityBadgeColor = (sev) => {
    switch (sev) {
      case 'CRITICAL':
        return 'bg-red-500/20 text-red-400 border-red-500/40'
      case 'HIGH':
        return 'bg-orange-500/20 text-orange-400 border-orange-500/40'
      case 'MEDIUM':
        return 'bg-amber-500/20 text-amber-400 border-amber-500/40'
      default:
        return 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40'
    }
  }

  // ---------------------------------------------------------------------------
  // STATE 1: ANALYZING (Processing in background without blocking UI)
  // ---------------------------------------------------------------------------
  if (aiState === 'ANALYZING' || (aiState === 'PROCESSING' && !hasAssessment)) {
    return (
      <div
        className="bg-slate-900/95 border border-cyan-500/30 rounded-xl p-4 shadow-xl backdrop-blur-md relative overflow-hidden transition-all duration-300"
        id="ai-triage-assessment-card"
      >
        <div className="absolute top-0 right-0 w-48 h-24 bg-cyan-500/10 blur-3xl pointer-events-none" />
        <div className="flex items-center justify-between gap-2 border-b border-slate-800 pb-3 mb-3">
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-lg bg-cyan-500/20 text-cyan-400 border border-cyan-500/40 animate-pulse">
              <RefreshCw className="w-4 h-4 animate-spin text-cyan-400" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold uppercase tracking-wider text-cyan-300">
                  AI Incident Triage
                </span>
                <span className="text-[9px] px-1.5 py-0.2 rounded bg-cyan-950 text-cyan-400 border border-cyan-700/50 font-mono">
                  ANALYZING
                </span>
              </div>
              <p className="text-[11px] text-slate-400">
                Evaluating unstructured distress signals in background...
              </p>
            </div>
          </div>
          <span className="text-[10px] font-mono text-cyan-400/80 animate-pulse">
            Gemini &rarr; Groq &rarr; Rules
          </span>
        </div>

        <div className="bg-slate-950/70 p-3 rounded-lg border border-cyan-900/40 flex items-center gap-3">
          <div className="relative flex h-3 w-3 shrink-0">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-3 w-3 bg-cyan-500"></span>
          </div>
          <div className="space-y-0.5 text-xs text-slate-300">
            <p className="font-semibold text-cyan-200">
              Extracting emergency hazard signals &amp; matching capability...
            </p>
            <p className="text-[10px] text-slate-400 font-mono">
              Non-blocking asynchronous task active · Tactical map &amp; dispatch remain operational
            </p>
          </div>
        </div>
      </div>
    )
  }

  // ---------------------------------------------------------------------------
  // STATE 2: WAITING / NOT_STARTED (Incident created, triage queued)
  // ---------------------------------------------------------------------------
  if (!hasAssessment && (aiState === 'WAITING' || aiState === 'NOT_STARTED')) {
    return (
      <div
        className="bg-slate-900/95 border border-slate-800 rounded-xl p-4 shadow-xl backdrop-blur-md relative overflow-hidden transition-all duration-300"
        id="ai-triage-assessment-card"
      >
        <div className="flex items-center justify-between gap-2 border-b border-slate-800 pb-3 mb-3">
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-lg bg-slate-800 text-slate-400 border border-slate-700">
              <Clock className="w-4 h-4 text-slate-400" />
            </div>
            <div>
              <span className="text-xs font-bold uppercase tracking-wider text-slate-300 block">
                AI Incident Triage Queued
              </span>
              <p className="text-[11px] text-slate-400">
                Awaiting asynchronous decision-support triage
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onReevaluate}
            disabled={isAnalyzing}
            className="px-3 py-1 bg-cyan-600 hover:bg-cyan-500 text-white rounded text-xs font-bold font-mono uppercase shadow transition-colors cursor-pointer disabled:opacity-50"
          >
            {isAnalyzing ? 'Analyzing...' : '▶ Analyze Now'}
          </button>
        </div>

        <div className="bg-slate-950/60 p-2.5 rounded-lg border border-slate-800 text-xs text-slate-400">
          Distress report persisted immediately. Trigger on-demand AI triage or perform manual
          authority assessment.
        </div>
      </div>
    )
  }

  // ---------------------------------------------------------------------------
  // STATE 3: FAILED (All providers failed gracefully, manual triage active)
  // ---------------------------------------------------------------------------
  if (aiState === 'FAILED' && !hasAssessment) {
    return (
      <div
        className="bg-slate-900/95 border border-rose-500/30 rounded-xl p-4 shadow-xl backdrop-blur-md relative overflow-hidden transition-all duration-300"
        id="ai-triage-assessment-card"
      >
        <div className="flex items-center justify-between gap-2 border-b border-slate-800 pb-3 mb-3">
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-lg bg-rose-500/10 text-rose-400 border border-rose-500/30">
              <AlertCircle className="w-4 h-4 text-rose-400" />
            </div>
            <div>
              <span className="text-xs font-bold uppercase tracking-wider text-rose-300 block">
                AI Assessment Unavailable
              </span>
              <p className="text-[11px] text-slate-400">
                Manual triage remains active · Emergency incident unaffected
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onReevaluate}
            disabled={isAnalyzing}
            className="flex items-center gap-1 px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-mono transition-colors cursor-pointer"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Retry AI</span>
          </button>
        </div>

        <div className="bg-slate-950/80 p-2.5 rounded-lg border border-rose-900/40 text-xs text-slate-300 space-y-1">
          <p className="text-rose-300/90 font-medium">
            AI triage providers temporarily unavailable. Operator manual triage enabled.
          </p>
          <p className="text-[10px] text-slate-400 font-mono">
            Incident is queued and dispatch candidates can be allocated manually.
          </p>
        </div>
      </div>
    )
  }

  // ---------------------------------------------------------------------------
  // STATE 4: AVAILABLE (Structured AI Decision Support Card)
  // ---------------------------------------------------------------------------
  return (
    <div
      className="bg-slate-900/95 border border-cyan-500/30 rounded-xl p-4 shadow-xl backdrop-blur-md relative overflow-hidden transition-all duration-300"
      id="ai-triage-assessment-card"
    >
      {/* Background ambient gradient glow */}
      <div className="absolute top-0 right-0 w-64 h-32 bg-cyan-500/5 blur-3xl pointer-events-none" />

      {/* Header Bar */}
      <div className="flex items-center justify-between gap-2 border-b border-slate-800 pb-3 mb-3">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-lg bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
            <Sparkles className="w-4 h-4 animate-pulse" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold uppercase tracking-wider text-cyan-300">
                AI Incident Triage Assessment
              </span>
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-400 border border-slate-700 font-mono">
                {triage.provider || 'gemini-2.0-flash'}
              </span>
            </div>
            <p className="text-[11px] text-slate-400">
              Safety-critical decision support · Human verification required
            </p>
          </div>
        </div>

        {/* Verification Status Badge */}
        {isVerified ? (
          <div className="flex items-center gap-1 text-xs font-medium px-2.5 py-1 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
            <span>{isAdjusted ? 'OPERATOR ADJUSTED &amp; VERIFIED' : 'OPERATOR VERIFIED'}</span>
          </div>
        ) : (
          <div className="flex items-center gap-1 text-xs font-medium px-2.5 py-1 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30 animate-pulse">
            <ShieldCheck className="w-3.5 h-3.5 text-amber-400" />
            <span>AWAITING VERIFICATION</span>
          </div>
        )}
      </div>

      {/* Structured Metrics Bar */}
      <div className="grid grid-cols-3 gap-2 mb-3">
        {/* Hazard Classification */}
        <div className="bg-slate-950/60 p-2.5 rounded-lg border border-slate-800/80">
          <div className="text-[10px] uppercase font-semibold text-slate-400 mb-1">Hazard Type</div>
          <div
            className="text-xs font-bold text-slate-200 truncate"
            title={triage.hazard_type || incident.type}
          >
            {triage.hazard_type || `${incident.type.toUpperCase()} HAZARD`}
          </div>
        </div>

        {/* Severity Classification */}
        <div className="bg-slate-950/60 p-2.5 rounded-lg border border-slate-800/80">
          <div className="text-[10px] uppercase font-semibold text-slate-400 mb-1">
            Severity Rating
          </div>
          <div className="flex items-center gap-1.5">
            <span
              className={`text-xs px-2 py-0.5 rounded border font-bold uppercase ${getSeverityBadgeColor(
                incident.severity
              )}`}
            >
              {incident.severity}
            </span>
            <span className="text-[10px] text-slate-400 font-mono">
              Tier {triage.severity_level || (incident.severity === 'CRITICAL' ? 4 : 3)}/5
            </span>
          </div>
        </div>

        {/* Confidence Meter */}
        <div className="bg-slate-950/60 p-2.5 rounded-lg border border-slate-800/80">
          <div className="text-[10px] uppercase font-semibold text-slate-400 mb-1">
            Model Confidence
          </div>
          <div className="flex items-center gap-1.5">
            <div className="flex-1 bg-slate-800 h-2 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-500 ${
                  isLowConfidence ? 'bg-amber-400' : 'bg-cyan-400'
                }`}
                style={{ width: `${confidencePct}%` }}
              />
            </div>
            <span
              className={`text-xs font-bold font-mono ${
                isLowConfidence ? 'text-amber-400' : 'text-cyan-400'
              }`}
            >
              {confidencePct}%
            </span>
          </div>
        </div>
      </div>

      {/* Low Confidence or Uncertainty Alert (NEEDS REVIEW) */}
      {isLowConfidence && (
        <div className="mb-3 p-2.5 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-200 text-xs flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
          <div className="space-y-1 flex-1">
            <div className="font-semibold text-amber-300 flex items-center justify-between">
              <span>NEEDS REVIEW — Low Model Confidence (&lt;75%)</span>
              <span className="text-[9px] font-mono px-1.5 py-0.2 rounded bg-amber-950 text-amber-400 border border-amber-700">
                UNVERIFIED CERTAINTY
              </span>
            </div>
            {triage.uncertainty_flags && triage.uncertainty_flags.length > 0 ? (
              <ul className="list-disc list-inside text-[11px] text-amber-300/80 space-y-0.5">
                {triage.uncertainty_flags.map((flag, idx) => (
                  <li key={idx}>{flag}</li>
                ))}
              </ul>
            ) : (
              <p className="text-[11px] text-amber-300/80">
                Distress report is brief or lacks field depth. Human operator verification required
                prior to dispatch.
              </p>
            )}
          </div>
        </div>
      )}

      {/* Grounded Priority Reasoning */}
      <div className="mb-3 p-2.5 rounded-lg bg-slate-950/80 border border-slate-800">
        <div className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-300 mb-1">
          <Cpu className="w-3.5 h-3.5 text-cyan-400" />
          <span>Grounded Priority Reasoning</span>
        </div>
        <p className="text-xs text-slate-300 leading-relaxed italic">
          &quot;
          {triage.priority_reasoning ||
            'Evaluated based on reported affected persons and risk factor indicators.'}
          &quot;
        </p>
      </div>

      {/* Key Signals Evidence & Required Capability */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-2 mb-3">
        {/* Key Signals Evidence */}
        <div className="bg-slate-950/60 p-2.5 rounded-lg border border-slate-800/80">
          <div className="text-[10px] uppercase font-semibold text-slate-400 mb-1.5 flex items-center gap-1">
            <Info className="w-3 h-3 text-cyan-400" />
            <span>Extracted Key Signals</span>
          </div>
          <div className="flex flex-wrap gap-1">
            {(triage.key_signals && triage.key_signals.length > 0
              ? triage.key_signals
              : [incident.is_sos ? 'SOS Distress Beacon Active' : 'Field report submitted']
            ).map((signal, idx) => (
              <span
                key={idx}
                className="text-[11px] px-2 py-0.5 rounded bg-cyan-950/60 text-cyan-300 border border-cyan-800/50"
              >
                {signal}
              </span>
            ))}
          </div>
        </div>

        {/* Recommended Unit Capability */}
        <div className="bg-slate-950/60 p-2.5 rounded-lg border border-slate-800/80">
          <div className="text-[10px] uppercase font-semibold text-slate-400 mb-1.5 flex items-center gap-1">
            <ShieldCheck className="w-3 h-3 text-emerald-400" />
            <span>Recommended Capability</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-emerald-300 bg-emerald-950/60 px-2 py-1 rounded border border-emerald-800/50">
              {triage.recommended_capability || 'FLOOD_BOAT'}
            </span>
            <span className="text-[10px] text-slate-400">
              {triage.recommended_capability === 'FLOOD_BOAT'
                ? 'Rescue Boat Required'
                : triage.recommended_capability === 'AMBULANCE'
                  ? 'Medical ALS Required'
                  : 'Specialized Response'}
            </span>
          </div>
        </div>
      </div>

      {/* Multimodal Image Damage Intelligence (if imagery present) */}
      {(triage.image_assessment_hint ||
        triage.damage_type ||
        triage.hazard_detected ||
        triage.water_depth_estimate) && (
        <div className="mb-3 p-3 rounded-lg bg-cyan-950/40 border border-cyan-700/50 text-xs space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5 font-bold text-cyan-300">
              <Sparkles className="w-3.5 h-3.5 text-cyan-400" />
              <span>Multimodal Visual Damage Assessment</span>
            </div>
            <span className="text-[9px] font-mono px-2 py-0.5 rounded bg-amber-950/80 text-amber-300 border border-amber-600/60 font-bold">
              AI ESTIMATE — UNVERIFIED
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-1 text-[11px]">
            {triage.damage_type && (
              <div className="bg-slate-950/80 p-2 rounded border border-slate-800">
                <span className="text-[10px] text-slate-400 block uppercase font-semibold">
                  Damage Type
                </span>
                <span className="text-slate-200 font-medium">{triage.damage_type}</span>
              </div>
            )}
            {triage.hazard_detected && (
              <div className="bg-slate-950/80 p-2 rounded border border-slate-800">
                <span className="text-[10px] text-slate-400 block uppercase font-semibold">
                  Hazard Detected
                </span>
                <span className="text-amber-300 font-medium">{triage.hazard_detected}</span>
              </div>
            )}
            {triage.water_depth_estimate && (
              <div className="bg-slate-950/80 p-2 rounded border border-slate-800">
                <span className="text-[10px] text-slate-400 block uppercase font-semibold">
                  Water Depth Est.
                </span>
                <span className="text-cyan-300 font-medium font-mono">
                  {triage.water_depth_estimate}
                </span>
              </div>
            )}
          </div>

          {triage.image_assessment_hint && (
            <p className="text-[11px] text-slate-300 italic pt-1">
              &quot;{triage.image_assessment_hint.replace(/^AI ESTIMATE — UNVERIFIED:\s*/i, '')}
              &quot;
            </p>
          )}
        </div>
      )}

      {/* Inline Operator Adjustment Drawer */}
      {isAdjusting && (
        <form
          onSubmit={handleAdjustSubmit}
          className="mb-3 p-3 rounded-lg bg-slate-950 border border-amber-500/40 space-y-3"
          id="operator-triage-adjustment-form"
        >
          <div className="text-xs font-bold text-amber-300 flex items-center gap-1">
            <Edit3 className="w-3.5 h-3.5" />
            <span>Operator Override &amp; Adjustment</span>
          </div>

          <div className="grid grid-cols-3 gap-2">
            <div>
              <label className="text-[10px] uppercase font-semibold text-slate-400 block mb-1">
                Severity
              </label>
              <select
                value={adjustedSeverity}
                onChange={(e) => setAdjustedSeverity(e.target.value)}
                className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1 text-xs text-slate-200 focus:outline-none focus:border-amber-500"
              >
                <option value="CRITICAL">CRITICAL</option>
                <option value="HIGH">HIGH</option>
                <option value="MEDIUM">MEDIUM</option>
                <option value="LOW">LOW</option>
              </select>
            </div>

            <div>
              <label className="text-[10px] uppercase font-semibold text-slate-400 block mb-1">
                Incident Type
              </label>
              <select
                value={adjustedType}
                onChange={(e) => setAdjustedType(e.target.value)}
                className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1 text-xs text-slate-200 focus:outline-none focus:border-amber-500"
              >
                <option value="flood">Flood</option>
                <option value="medical">Medical</option>
                <option value="fire">Fire</option>
                <option value="power_line">Power Line</option>
                <option value="structural">Structural</option>
                <option value="hazard">Hazard</option>
                <option value="other">Other</option>
              </select>
            </div>

            <div>
              <label className="text-[10px] uppercase font-semibold text-slate-400 block mb-1">
                Capability
              </label>
              <select
                value={adjustedCapability}
                onChange={(e) => setAdjustedCapability(e.target.value)}
                className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1 text-xs text-slate-200 focus:outline-none focus:border-amber-500"
              >
                <option value="FLOOD_BOAT">FLOOD_BOAT</option>
                <option value="AMBULANCE">AMBULANCE</option>
                <option value="STRETCHER_TEAM">STRETCHER_TEAM</option>
                <option value="HAZMAT">HAZMAT</option>
                <option value="DEBRIS_CLEAR">DEBRIS_CLEAR</option>
              </select>
            </div>
          </div>

          <div>
            <label className="text-[10px] uppercase font-semibold text-slate-400 block mb-1">
              Operator Justification / Notes
            </label>
            <input
              type="text"
              value={reviewerNotes}
              onChange={(e) => setReviewerNotes(e.target.value)}
              placeholder="e.g. Ground patrol confirmed 1.2m depth, updated to flood boat"
              className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1 text-xs text-slate-200 focus:outline-none focus:border-amber-500"
            />
          </div>

          <div className="flex items-center justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={() => setIsAdjusting(false)}
              className="px-2.5 py-1 text-xs text-slate-400 hover:text-slate-200"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isVerifying}
              className="px-3 py-1 bg-amber-600 hover:bg-amber-500 text-white rounded text-xs font-semibold shadow flex items-center gap-1.5 transition-colors disabled:opacity-50"
            >
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>Confirm &amp; Verify Override</span>
            </button>
          </div>
        </form>
      )}

      {/* Operator Action Bar */}
      <div className="flex items-center justify-between gap-2 pt-2 border-t border-slate-800">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onReevaluate}
            disabled={isAnalyzing || isVerifying}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium border border-slate-700 transition-colors disabled:opacity-50"
            title="Re-run AI decision support evaluation"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isAnalyzing ? 'animate-spin' : ''}`} />
            <span>{isAnalyzing ? 'Analyzing...' : 'Re-Evaluate'}</span>
          </button>

          {!isVerified && (
            <button
              type="button"
              onClick={() => setIsAdjusting(!isAdjusting)}
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 text-xs font-medium border border-amber-500/30 transition-colors"
            >
              <Edit3 className="w-3.5 h-3.5" />
              <span>{isAdjusting ? 'Hide Adjustments' : 'Adjust / Override'}</span>
              {isAdjusting ? (
                <ChevronUp className="w-3 h-3" />
              ) : (
                <ChevronDown className="w-3 h-3" />
              )}
            </button>
          )}
        </div>

        {!isVerified && (
          <button
            type="button"
            onClick={() => onVerify && onVerify()}
            disabled={isVerifying}
            className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white text-xs font-bold shadow-lg shadow-cyan-900/30 transition-all active:scale-95 disabled:opacity-50 cursor-pointer"
            id="btn-verify-ai-triage"
          >
            <CheckCircle2 className="w-4 h-4" />
            <span>{isVerifying ? 'Verifying...' : 'Accept & Verify Assessment'}</span>
          </button>
        )}
      </div>
    </div>
  )
}

export default AiTriageAssessmentCard
