import { useId } from 'react'
import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

/** 尖顶六边形顶点（viewBox 40x44） */
const HEX_OUTER = '20 1.5, 37 11, 37 33, 20 42.5, 3 33, 3 11'
const HEX_INNER = '20 5.5, 33.6 13, 33.6 31, 20 38.5, 6.4 31, 6.4 13'

export interface HexActionButtonProps {
  icon?: ReactNode
  label?: string
  active?: boolean
  /** 红色预警系按钮 */
  danger?: boolean
  disabled?: boolean
  /** 右上角红色角标 (0 也显示, undefined 不显示; >99 显示 99+) */
  badge?: number
  title?: string
  className?: string
  onClick?: () => void
}

/**
 * 六边形操作按钮原子组件: 图标(可选) + 文字(可选) 垂直结构。
 * - active: 六边形内渐变填充 + 高亮描边与光晕
 * - danger: 整体红色系 (预警类)
 * - disabled: 置灰且拦截点击
 */
export default function HexActionButton({
  icon,
  label,
  active = false,
  danger = false,
  disabled = false,
  badge,
  title,
  className,
  onClick,
}: HexActionButtonProps) {
  const gid = useId().replace(/:/g, '')
  const stroke = danger
    ? active ? '#f87171' : 'rgba(248,113,113,0.5)'
    : active ? '#7dd3fc' : 'rgba(59,130,246,0.4)'
  const glow = danger
    ? active ? 'drop-shadow(0 0 7px rgba(248,113,113,0.9))' : 'none'
    : active ? 'drop-shadow(0 0 7px rgba(125,211,252,0.85))' : 'none'

  const badgeText = badge != null && badge > 99 ? '99+' : badge

  return (
    <button
      type="button"
      title={title}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        'relative flex flex-col items-center gap-1 px-1.5 py-0.5 group outline-none',
        disabled && 'opacity-40 cursor-not-allowed',
        className,
      )}
    >
      <span className="relative w-10 h-[44px]">
        <svg viewBox="0 0 40 44" className="w-full h-full transition-all" style={{ filter: glow }}>
          <defs>
            <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
              {danger ? (
                <>
                  <stop offset="0%" stopColor="rgba(248,113,113,0.55)" />
                  <stop offset="100%" stopColor="rgba(127,29,29,0.28)" />
                </>
              ) : (
                <>
                  <stop offset="0%" stopColor="rgba(125,211,252,0.5)" />
                  <stop offset="100%" stopColor="rgba(12,74,150,0.22)" />
                </>
              )}
            </linearGradient>
          </defs>
          <polygon
            points={HEX_OUTER}
            fill={active ? `url(#${gid})` : 'rgba(8,22,46,0.55)'}
            stroke={stroke}
            strokeWidth={active ? 1.8 : 1.1}
          />
          <polygon points={HEX_INNER} fill="none" stroke={stroke} strokeWidth="0.5" opacity="0.45" />
        </svg>
        {icon != null && (
          <span
            className={cn(
              'absolute inset-0 flex items-center justify-center transition-colors duration-300',
              danger
                ? active ? 'text-red-200' : 'text-red-400/95'
                : active ? 'text-sky-50' : 'text-sky-300/85 group-hover:text-sky-200',
            )}
          >
            {icon}
          </span>
        )}
      </span>

      {label != null && (
        <span
          className={cn(
            'text-[12px] tracking-wider whitespace-nowrap transition-all duration-300',
            danger
              ? active ? 'text-red-300' : 'text-red-400/85'
              : active ? 'text-sky-100 glow-text' : 'text-sky-300/80 group-hover:text-sky-100',
          )}
        >
          {label}
        </span>
      )}

      {badge != null && (
        <span className="absolute top-0 right-0.5 min-w-[15px] h-[15px] px-0.5 rounded-full bg-red-500 text-[9px] text-white flex items-center justify-center shadow-[0_0_8px_rgba(239,68,68,0.9)] animate-pulse-glow">
          {badgeText}
        </span>
      )}
    </button>
  )
}
