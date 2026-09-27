import { useEffect, useRef } from 'react'
import { SceneManager } from '@/core/SceneManager'

export function useSceneInit(canvasRef: React.RefObject<HTMLCanvasElement | null>) {
  const managerRef = useRef<SceneManager | null>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    let manager: SceneManager | null = null
    let cancelled = false

    // StrictMode 同步挂载、卸载、重挂载时，只为最终保留的挂载创建 WebGL 上下文。
    const raf = requestAnimationFrame(() => {
      if (cancelled || managerRef.current) return
      manager = new SceneManager()
      managerRef.current = manager
      manager.init(canvas).catch(err => {
        console.error('[SceneManager] init failed:', err)
      })
      /* 开发环境调试句柄: 控制台可直接检查运行时几何 (不进生产构建) */
      if (import.meta.env.DEV) Object.assign(window, { __scene: manager })
    })

    return () => {
      cancelled = true
      cancelAnimationFrame(raf)
      manager?.dispose()
      managerRef.current = null
    }
  }, [canvasRef])

  return managerRef
}
