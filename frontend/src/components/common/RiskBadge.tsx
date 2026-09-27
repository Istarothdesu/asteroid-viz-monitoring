import { cn } from '@/lib/utils'
import { RISK_META, type RiskLevel } from '@/services/statsService'

/**
 * 风险等级徽章 (HUD 发光风): 高/中/低/正常四色。
 */
export default function RiskBadge({ level, className }: { level: RiskLevel; className?: string }) {
  const meta = RISK_META[level]
  return (
    <span
      className={cn('text-[10px] px-1.5 py-px rounded-sm whitespace-nowrap', className)}
      style={{
        color: meta.color,
        border: `1px solid ${meta.color}55`,
        background: `${meta.color}14`,
        textShadow: `0 0 6px ${meta.color}66`,
      }}
    >
      {meta.label}
    </span>
  )
}
