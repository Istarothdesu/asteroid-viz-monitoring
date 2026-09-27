import type { ReactNode } from 'react'

export interface StepFlowItem {
  title: string
  tag?: string
  description?: ReactNode
}

/** 纵向步骤流；输入数据与业务无关，可用于算法链路和任务流程。 */
export default function StepFlow({ steps }: { steps: StepFlowItem[] }) {
  return (
    <ol className="relative flex flex-col">
      {steps.map((step, index) => (
        <li key={`${index}:${step.title}`} className="relative flex gap-3 pb-4 last:pb-0">
          {index < steps.length - 1 && (
            <span className="absolute bottom-0 left-[13px] top-8 w-px bg-gradient-to-b from-sky-400/60 to-sky-400/5" />
          )}
          <span className="relative z-10 flex size-7 shrink-0 items-center justify-center rounded-full border border-sky-400/50 bg-[rgba(8,22,46,0.85)] text-[11px] font-bold text-sky-200 shadow-[0_0_10px_rgba(56,189,248,0.35)]">
            {index + 1}
          </span>
          <div className="flex min-w-0 flex-1 flex-col gap-1 pt-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[12px] font-bold text-sky-100/90">{step.title}</span>
              {step.tag && (
                <span className="whitespace-nowrap rounded-sm border border-cyan-400/25 bg-cyan-400/5 px-1.5 py-px text-[10px] text-cyan-300/85">
                  {step.tag}
                </span>
              )}
            </div>
            {step.description && (
              <div className="text-[11px] leading-relaxed text-sky-100/65">{step.description}</div>
            )}
          </div>
        </li>
      ))}
    </ol>
  )
}
