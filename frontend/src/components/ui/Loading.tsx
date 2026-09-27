import { useEffect, useState } from 'react'
import { cn } from '@/lib/utils'
import Panel, { HudCorners } from './Panel'

/**
 * Loading 组件族 (HUD 风格, 天文项目意象: 雷达扫描 + 轨道环绕)。
 * 动画全部 CSS 驱动, 不占 JS 帧。
 */

interface LoadingSpinnerProps {
  size?: number
  className?: string
}

/** 加载动画核心: 雷达扫描盘 + 环绕轨道亮点 + 中心天体, 可内嵌于按钮/面板 */
export function LoadingSpinner({ size = 84, className }: LoadingSpinnerProps) {
  return (
    <div className={cn('relative shrink-0', className)} style={{ width: size, height: size }}>
      {/* 雷达扫描扇面 */}
      <div
        className="absolute inset-0 rounded-full"
        style={{
          background:
            'conic-gradient(from 0deg, rgba(56,189,248,0) 0deg, rgba(56,189,248,0.05) 240deg, rgba(125,211,252,0.4) 340deg, transparent 360deg)',
          animation: 'radar-sweep 2.4s linear infinite',
        }}
      />
      {/* 外圈刻度环 */}
      <div className="absolute inset-0 rounded-full border border-sky-400/20" />
      {/* 轨道环 */}
      <div className="absolute inset-[16%] rounded-full border border-dashed border-sky-400/35" />
      {/* 环绕扫描亮点 (轨道监测意象) */}
      <div className="absolute inset-[16%]" style={{ animation: 'orbit-spin 1.8s linear infinite' }}>
        <span className="absolute left-1/2 top-0 -translate-x-1/2 -translate-y-1/2 w-1.5 h-1.5 rounded-full bg-sky-200 shadow-[0_0_8px_#7dd3fc,0_0_16px_rgba(56,189,248,0.7)]" />
      </div>
      {/* 中心天体 */}
      <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-2.5 h-2.5 rounded-full bg-sky-300 shadow-[0_0_10px_#38bdf8,0_0_24px_rgba(56,189,248,0.6)] animate-pulse-glow" />
    </div>
  )
}

interface LoadingOverlayProps {
  visible: boolean
  /** 主文案, 如 "正在同步轨道数据…" */
  text?: string
  /** 副文案 */
  subText?: string
  /** 延迟显示毫秒数, 避免快操作闪烁 (默认 300) */
  delay?: number
  /** 是否全屏 (false 时填满父容器, 父容器需 relative) */
  fullscreen?: boolean
  /** 不透明深底: 3D 场景初始化等场景需要完全遮住底下未就绪的画面 */
  opaque?: boolean
}

/**
 * 加载遮罩: 半透明深空底 + HUD 中心卡片 (雷达动画 + 状态文案)。
 * 拦截 pointer-events 防误操作; visible=false 时立即淡出卸载。
 */
export function LoadingOverlay({
  visible,
  text = '正在加载…',
  subText,
  delay = 300,
  fullscreen = true,
  opaque = false,
}: LoadingOverlayProps) {
  /* 超过阈值才显示, 避免短暂加载闪烁 (不透明模式无延迟期: 过渡期透明会露出底下画面) */
  const [show, setShow] = useState(opaque)
  useEffect(() => {
    if (!visible) {
      setShow(false)
      return
    }
    if (opaque) {
      setShow(true)
      return
    }
    const t = setTimeout(() => setShow(true), delay)
    return () => clearTimeout(t)
  }, [visible, delay, opaque])

  if (!visible) return null
  return (
    <div
      className={cn(
        'z-50 flex items-center justify-center',
        opaque ? 'bg-[#030712]' : 'bg-[rgba(3,7,18,0.55)] backdrop-blur-[2px]',
        'transition-opacity duration-300',
        fullscreen ? 'fixed inset-0' : 'absolute inset-0',
        show ? 'opacity-100' : 'opacity-0',
      )}
    >
      <div className="hud-panel relative rounded-sm px-10 py-7 flex flex-col items-center gap-4">
        <HudCorners />
        <LoadingSpinner size={84} />
        <div className="text-[13px] tracking-[3px] text-sky-100 glow-text animate-pulse-glow">
          {text}
        </div>
        {subText && <div className="text-[11px] text-sky-400/80 tracking-wider">{subText}</div>}
      </div>
    </div>
  )
}

/** 面板内骨架占位: 细条状微光流动, 用于数据未到齐的统计面板 */
export function PanelLoading({ rows = 4, className }: { rows?: number; className?: string }) {
  return (
    <div className={cn('flex flex-col gap-2.5 p-1', className)}>
      {Array.from({ length: rows }, (_, i) => (
        <div
          key={i}
          className="loading-skeleton h-4"
          style={{ width: `${88 - (i % 3) * 18}%`, animationDelay: `${i * 0.12}s` }}
        />
      ))}
    </div>
  )
}

/** Panel 形态的加载占位 (带标题壳) */
export function PanelLoadingShell({ title }: { title: string }) {
  return (
    <Panel title={title}>
      <PanelLoading />
    </Panel>
  )
}
