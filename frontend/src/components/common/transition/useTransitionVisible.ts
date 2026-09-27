import { useEffect, useState } from 'react'

export type TransPhase = 'enter' | 'leave' | null

/**
 * 显隐过渡状态机:
 * - visible=true  → 'enter' (播放入场动画)
 * - visible=false → 先 'leave' (保留 DOM 播退场动画), duration 后转 null (调用方卸载)
 */
export function useTransitionVisible(visible: boolean, duration = 300): TransPhase {
  const [phase, setPhase] = useState<TransPhase>(visible ? 'enter' : null)

  useEffect(() => {
    if (visible) {
      setPhase('enter')
      return
    }
    setPhase(p => (p ? 'leave' : null))
    const t = setTimeout(() => setPhase(null), duration)
    return () => clearTimeout(t)
  }, [visible, duration])

  return phase
}
