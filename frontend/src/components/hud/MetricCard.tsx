import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

interface MetricCardProps {
  label: string
  value: ReactNode
  icon?: ReactNode
  accent?: string
  compact?: boolean
  className?: string
  onClick?: () => void
}

/** 统一的 HUD 指标卡；只负责展示，不读取业务状态。 */
export default function MetricCard({
  label,
  value,
  icon,
  accent = '#38bdf8',
  compact = false,
  className,
  onClick,
}: MetricCardProps) {
  const Component = onClick ? 'button' : 'div'

  return (
    <Component
      {...(onClick ? { type: 'button' as const, onClick } : {})}
      className={cn(
        'relative overflow-hidden rounded-sm border border-sky-400/15 bg-gradient-to-b from-sky-500/[0.07] to-transparent text-left',
        compact
          ? 'grid grid-cols-[auto_1fr] items-center gap-x-2 px-2 py-1.5'
          : 'px-2.5 py-2',
        onClick && 'cursor-pointer hover:border-sky-300/55 hover:bg-sky-400/10',
        className,
      )}
    >
      <span
        aria-hidden="true"
        className="absolute bottom-1 left-0 top-1 w-[2px] rounded"
        style={{ background: accent, boxShadow: `0 0 6px ${accent}` }}
      />
      {icon && <span className="text-sky-400/65">{icon}</span>}
      <span
        className={cn(
          'font-bold tabular-nums',
          compact ? 'text-[18px]' : 'block text-[22px] leading-none',
        )}
        style={{ color: accent, textShadow: `0 0 12px ${accent}88` }}
      >
        {value}
      </span>
      <span
        className={cn(
          'text-sky-300/80',
          compact ? 'col-span-2 text-[9px]' : 'mt-1 block text-[11px]',
        )}
      >
        {label}
      </span>
    </Component>
  )
}
