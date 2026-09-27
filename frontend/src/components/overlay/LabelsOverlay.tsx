import { useEffect, useRef } from 'react'
import { sceneRef } from '@/core/SceneManager'
import { useLayerStore } from '@/store/layerStore'

interface LabelMeta {
  el: HTMLDivElement
  label: string
  tf: string
  shown: boolean
  /** 最近一次可见的帧号: 低于当前帧号即在当帧不可见, 补一次隐藏 */
  frame: number
}

export default function LabelsOverlay() {
  const containerRef = useRef<HTMLDivElement>(null)
  const rafRef = useRef(0)

  // Subscribe once; rAF loop reads from store each frame to avoid effect re-runs
  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const elementCache = new Map<string, LabelMeta>()
    let frameNo = 0
    let visCached: boolean | null = null

    const getOrCreate = (key: string, small: boolean): LabelMeta => {
      let meta = elementCache.get(key)
      if (!meta) {
        const el = document.createElement('div')
        // sel-ast / sel-cloud: 选中目标标签, 橙色高亮样式区分于常规标签
        el.className = 'lbl' + (small ? ' small' : '') + (key === 'sel-ast' || key === 'sel-cloud' ? ' sel' : '')
        container.appendChild(el)
        meta = { el, label: '', tf: '', shown: false, frame: 0 }
        elementCache.set(key, meta)
      }
      return meta
    }

    const update = () => {
      rafRef.current = requestAnimationFrame(update)
      if (document.hidden) return
      const sm = sceneRef.current
      const show = useLayerStore.getState().showLabels
      const visible = !!(sm && show)

      if (visible !== visCached) {
        container.style.visibility = visible ? 'visible' : 'hidden'
        visCached = visible
      }
      if (!sm || !show) return

      const w = window.innerWidth
      const h = window.innerHeight
      const bounds = container.getBoundingClientRect()
      const positions = sm.getLabelPositions(w, h)
      frameNo++

      for (const { key, label, x, y, visible: on } of positions) {
        if (!on || x < bounds.left || x > bounds.right || y < bounds.top || y > bounds.bottom) continue
        const small = key !== 'sun' && key !== 'planet-2' && key !== 'planet-4'
        const meta = getOrCreate(key, small)
        meta.frame = frameNo
        /* DOM 写入去重: 内容/位移未变不触碰 (暂停时零写入) */
        if (meta.label !== label) {
          meta.el.textContent = label
          meta.label = label
        }
        const tf = `translate(${x-bounds.left}px,${y-bounds.top}px) translate(-50%,-170%)`
        if (meta.tf !== tf) {
          meta.el.style.transform = tf
          meta.tf = tf
        }
        if (!meta.shown) {
          meta.el.style.display = 'block'
          meta.shown = true
        }
      }

      // 只补隐藏"上一帧可见、当帧不可见"的标签, 不再整表 display='none'
      elementCache.forEach(meta => {
        if (meta.frame !== frameNo && meta.shown) {
          meta.el.style.display = 'none'
          meta.shown = false
        }
      })
    }

    rafRef.current = requestAnimationFrame(update)
    return () => {
      cancelAnimationFrame(rafRef.current)
      container.innerHTML = ''
      elementCache.clear()
    }
  }, [])

  return (
    <div
      ref={containerRef}
      style={{
        position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 5, overflow: 'hidden',
      }}
    />
  )
}
