import { useEffect, useRef, useState } from 'react'
import { sceneRef } from '@/core/SceneManager'
import { useSceneInit } from '@/hooks/useSceneInit'
import { LoadingOverlay } from '@/components/ui/Loading'

export default function SceneCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  useSceneInit(canvasRef)

  /* 遮罩持续到首帧实际提交渲染 (而非仅 init 完成): init 完成与首帧呈现之间,
     画布可能透出 WebGL 上下文初始底色; 不透明深底遮罩全程封住区域 */
  const [ready, setReady] = useState(() => !!sceneRef.current?.firstFrameDone)
  useEffect(() => {
    if (ready) return
    const t = setInterval(() => {
      if (sceneRef.current?.firstFrameDone) {
        setReady(true)
        clearInterval(t)
      }
    }, 120)
    return () => clearInterval(t)
  }, [ready])

  return (
    /* pointer-events 为继承属性: 上层容器设为 none 时此处必须显式 auto,
       否则 canvas 收不到鼠标事件, OrbitControls 失效 */
    <div className="absolute inset-0 pointer-events-auto">
      {/* 深色底兜底: canvas 默认透明, 白页底色会在 WebGL 首帧前透出,
         表现为刷新后 3D 区域白屏数秒; 底色与渲染器清屏色同为纯黑无缝衔接 */}
      <canvas
        ref={canvasRef}
        id="scene"
        style={{ width: '100%', height: '100%', display: 'block', background: '#000' }}
      />
      <LoadingOverlay
        visible={!ready}
        fullscreen={false}
        opaque
        text="正在初始化三维场景…"
        subText="WebGL 渲染器"
      />
    </div>
  )
}
