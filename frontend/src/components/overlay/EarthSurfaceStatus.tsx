import { useEffect, useState } from 'react'
import { sceneRef } from '@/core/SceneManager'
import type { EarthSurfaceStatus as SurfaceStatus } from '@/core/terrain/EarthSurfaceSystem'

/** 与已有仿真钟一样低频读取主循环状态，不让瓦片调度触发 React 每帧更新。 */
export default function EarthSurfaceStatus() {
  const [status, setStatus] = useState<SurfaceStatus | null>(null)
  useEffect(() => {
    const timer = setInterval(() => setStatus(sceneRef.current?.terrainStatus ?? null), 500)
    return () => clearInterval(timer)
  }, [])
  if (!status) return null
  return (
    <output className="text-[10px] leading-relaxed text-sky-200/85" aria-label="地表浏览状态"
      data-terrain-level={status.level} data-terrain-cached={status.cached}>
      地表浏览 · {status.lon.toFixed(3)}°, {status.lat.toFixed(3)}° · 离地 {(status.clearance / 1000).toFixed(2)} km
      <br />
      {status.error ? '部分地形待重试' : status.loading || !status.level ? '地形加载中' : '影像与高程已就绪'}
      {' · '}影像 / 高程 © Esri ArcGIS
      {Math.abs(status.lat) > 85.05 && ' · 极区使用全球底图'}
    </output>
  )
}
