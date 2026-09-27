import * as THREE from 'three'
import { footprintRay } from '@/features/l1/attitude'
import type { Quaternion } from '@/features/l1/attitude'
import type { PreparedPlan } from '@/features/l1/observationPlan'

/** 只消费预计算的曝光足迹；不按渲染帧累积，倒退时间不会遗留未来覆盖。 */
export class SurveyFootprintRenderer {
  readonly group = new THREE.Group()
  private prepared: PreparedPlan | null = null
  private patches: { line: THREE.Line; fill: THREE.Mesh; firstValidEnd: number }[] = []
  private readonly radius: number
  constructor(radius: number) { this.radius = radius }
  private clear() {
    this.group.traverse(o => {
      const m = o as THREE.Mesh
      if (!m.geometry) return
      m.geometry.dispose()
      const materials = Array.isArray(m.material) ? m.material : [m.material]
      materials.forEach(material => material.dispose())
    })
    this.group.clear(); this.patches = []
  }
  update(prepared: PreparedPlan | null, jd: number, showPlanned: boolean, showExposed: boolean) {
    if (prepared !== this.prepared) {
      this.clear(); this.prepared = prepared
      if (prepared) {
        const unique = new Map<string, { q: Quaternion; firstValidEnd: number; valid: boolean }>()
        for (const e of prepared.exposures) for (const q of e.poses) {
          const key = q.map(v => v.toFixed(8)).join(',')
          const item = unique.get(key) ?? { q, firstValidEnd: Infinity, valid: false }
          if (e.check.valid) { item.firstValidEnd = Math.min(item.firstValidEnd, e.activity.end); item.valid = true }
          unique.set(key, item)
        }
        const i = prepared.plan.instrument, hx = Math.tan(i.fovWidthDeg*Math.PI/360), hy = Math.tan(i.fovHeightDeg*Math.PI/360)
        for (const { q, firstValidEnd, valid } of unique.values()) {
          const ray = (x: number, y: number) => new THREE.Vector3().copy(footprintRay(q, x, y)).multiplyScalar(this.radius*1.006)
          const edge: THREE.Vector3[] = []
          for (let k = 0; k <= 8; k++) edge.push(ray(-hx+2*hx*k/8, hy))
          for (let k = 1; k <= 8; k++) edge.push(ray(hx, hy-2*hy*k/8))
          for (let k = 1; k <= 8; k++) edge.push(ray(hx-2*hx*k/8, -hy))
          for (let k = 1; k <= 8; k++) edge.push(ray(-hx, -hy+2*hy*k/8))
          const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(edge),
            new THREE.LineBasicMaterial({ color: valid ? 0x74baff : 0xffba55, transparent: true, opacity: .55, depthWrite: false }))
          const points: number[] = [], indices: number[] = []
          for (let y = 0; y <= 4; y++) for (let x = 0; x <= 4; x++) points.push(...ray(-hx+hx*x/2, -hy+hy*y/2).toArray())
          for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) {
            const a = y*5+x; indices.push(a, a+1, a+5, a+1, a+6, a+5)
          }
          const geometry = new THREE.BufferGeometry()
          geometry.setAttribute('position', new THREE.Float32BufferAttribute(points, 3)); geometry.setIndex(indices)
          const fill = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ color: 0x66ffcc, transparent: true,
            opacity: .18, side: THREE.DoubleSide, depthWrite: false }))
          this.group.add(line, fill); this.patches.push({ line, fill, firstValidEnd })
        }
      }
    }
    for (const p of this.patches) {
      p.line.visible = showPlanned
      p.fill.visible = showExposed && p.firstValidEnd <= jd
    }
  }
}
