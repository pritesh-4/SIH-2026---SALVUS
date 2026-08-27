import { Card } from '../../ui/Card'
import { Badge } from '../../ui/Badge'

/**
 * High-Clarity Emergency Instruction Steps
 * Answers Question 3: "What should I do right now?"
 */
export const EmergencyInstructionCard = ({ instructions = [] }) => {
  return (
    <Card padding="md" className="transition-all">
      <div className="flex items-center justify-between gap-2 mb-3">
        <h3 className="text-sm font-bold text-salvus-text-primary uppercase tracking-wider">
          Safety Guidance
        </h3>
        <Badge variant="safe" dot={true}>
          Verified Steps
        </Badge>
      </div>

      <div className="space-y-2.5">
        {instructions.map((inst) => (
          <div
            key={inst.id}
            className="bg-salvus-muted/40 border border-salvus-border rounded-xl p-3.5 flex items-start gap-3 transition-colors"
          >
            <span className="h-6 w-6 rounded-full bg-salvus-info-bg border border-salvus-info-border text-salvus-info font-bold text-xs flex items-center justify-center shrink-0 mt-0.5">
              {inst.id}
            </span>
            <div>
              <h4 className="text-xs sm:text-sm font-bold text-salvus-text-primary">
                {inst.title}
              </h4>
              <p className="text-xs text-salvus-text-secondary mt-0.5 leading-relaxed">
                {inst.text}
              </p>
            </div>
          </div>
        ))}
      </div>
    </Card>
  )
}
