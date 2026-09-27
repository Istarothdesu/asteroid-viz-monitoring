import type { CSSProperties, ReactNode } from 'react'
import { useTransitionVisible } from './useTransitionVisible'
import { cn } from '@/lib/utils'

export type SlideSide = 'left' | 'right' | 'bottom' | 'fade'

interface SlidePanelProps {
  /** 显隐状态; false 时先播退场动画再卸载 */
  visible: boolean
  side?: SlideSide
  duration?: number
  className?: string
  /** 透传给外层容器 (如 fixed 弹窗定位) */
  style?: CSSProperties
  children: ReactNode
}

/**
 * 通用滑动面板容器: 入场从对应侧滑入 + 淡入, 退场反向滑出 + 淡出。
 * 用于弹窗、可折叠面板等任意显隐场景。
 */
export default function SlidePanel({
  visible, side = 'left', duration = 300, className, style, children,
}: SlidePanelProps) {
  const phase = useTransitionVisible(visible, duration)
  if (phase === null) return null
  const cls = phase === 'enter' ? `anim-slide-${side}-enter` : `anim-slide-${side}-leave`
  return (
    <div className={cn(cls, className)} style={{ animationDuration: `${duration}ms`, ...style }}>
      {children}
    </div>
  )
}
