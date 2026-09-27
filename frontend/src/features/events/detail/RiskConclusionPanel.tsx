import Panel from '@/components/ui/Panel'
import { SEVERITY_META, type EventDetail } from '@/services/eventCenter'
import type { EventRiskConclusion } from './eventRiskConclusion'

export default function RiskConclusionPanel({
  event,
  conclusion,
}: {
  event: EventDetail
  conclusion: EventRiskConclusion
}) {
  const severity = SEVERITY_META[event.severity]

  return (
    <Panel
      title="风险分析结论"
      extra={(
        <span className="text-[12px] glow-text" style={{ color: severity.color }}>
          {severity.label}
        </span>
      )}
    >
      <div className="flex flex-col gap-2 px-1 pb-1">
        <div className="text-[10px] leading-relaxed text-sky-200/90">
          {conclusion.text}
        </div>
        <div className="flex flex-wrap gap-1">
          {conclusion.tags.filter(Boolean).map((tag) => (
            <span
              key={tag}
              className="rounded-sm border px-1.5 py-px text-[9px]"
              style={{
                color: severity.color,
                borderColor: `${severity.color}44`,
                background: `${severity.color}12`,
              }}
            >
              {tag}
            </span>
          ))}
        </div>
        <div className="border-t border-sky-400/15 pt-1.5 text-[10px] leading-relaxed text-sky-300/80">
          <span style={{ color: severity.color }}>◆ </span>
          {conclusion.advice}
        </div>
      </div>
    </Panel>
  )
}
