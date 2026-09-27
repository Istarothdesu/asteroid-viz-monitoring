import * as THREE from 'three'
import type { SelectionTarget } from '@/types/scene'

const tmpV = new THREE.Vector3()

export interface PickTarget {
  kind: SelectionTarget['kind']
  idx: number
  mesh: THREE.Object3D
  minPx?: number
}

export class PickingSystem {
  private downX = 0
  private downY = 0
  onSelect: ((target: SelectionTarget | null) => void) | null = null
  /** Ctrl/Meta+点击时命中最近云粒子 (屏幕空间最近邻), 未命中返回 -1 */
  onPickCloud:
    | ((xPx: number, yPx: number, w: number, h: number) => number)
    | null = null
  private camera: THREE.PerspectiveCamera
  private canvas: HTMLCanvasElement

  constructor(camera: THREE.PerspectiveCamera, canvas: HTMLCanvasElement) {
    this.camera = camera
    this.canvas = canvas
    canvas.addEventListener('pointerdown', this._onDown)
    canvas.addEventListener('pointerup', this._onUp)
  }

  private _onDown = (e: PointerEvent) => {
    this.downX = e.clientX
    this.downY = e.clientY
  }

  private _onUp = (e: PointerEvent) => {
    if (Math.hypot(e.clientX - this.downX, e.clientY - this.downY) > 5) return

    const w = this.canvas.clientWidth, h = this.canvas.clientHeight

    /* Ctrl/Meta+点击: 拾取小行星云粒子 (主动观测入口), 优先级高于常规目标 */
    if ((e.ctrlKey || e.metaKey) && this.onPickCloud) {
      const k = this.onPickCloud(e.clientX, e.clientY, w, h)
      if (this.onSelect) this.onSelect(k >= 0 ? { kind: 'cloud', idx: k } : null)
      return
    }

    let best: SelectionTarget | null = null
    let bestD = 1e9

    const consider = (kind: SelectionTarget['kind'], idx: number, mesh: THREE.Object3D, minPx = 10) => {
      if (!mesh.visible) return
      mesh.getWorldPosition(tmpV).project(this.camera)
      if (tmpV.z > 1) return
      const sx = (tmpV.x * 0.5 + 0.5) * w
      const sy = (-tmpV.y * 0.5 + 0.5) * h
      const d = Math.hypot(sx - e.clientX, sy - e.clientY)
      if (d < minPx && d < bestD) { bestD = d; best = { kind, idx } }
    }

    for (const { kind, idx, mesh, minPx } of this._targets) {
      consider(kind, idx, mesh, minPx)
    }

    if (this.onSelect) this.onSelect(best)
  }

  private _targets: PickTarget[] = []

  setTargets(targets: PickTarget[]): void {
    this._targets = targets
  }

  dispose(): void {
    this.canvas.removeEventListener('pointerdown', this._onDown)
    this.canvas.removeEventListener('pointerup', this._onUp)
  }
}
