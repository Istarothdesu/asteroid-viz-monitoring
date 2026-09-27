/* ============================================================================
 * nbody.ts — N 体推演弧线计算 (纯函数, 可单测)
 *
 * 配合 /api/propagate 返回的推演弧线 ([jd, x, y, z] 日心黄道 J2000, AU):
 *  · arcPositions          点集平铺为场景缓冲用的 xyz 连续 Float32Array;
 *  · scanClosestApproach   逐点取地球位置 (星历优先) 算地距, 求弧线上最近点。
 * ========================================================================== */

import { PLANETS } from '@/data/planets'
import { planetPos } from '@/utils/orbital/planets'
import { AU_KM } from '@/utils/orbital/constants'
import type { Vec3Like } from '@/utils/orbital/kepler'

/** 推演弧线点: [jd, x, y, z] (与 /api/propagate points 元素同形) */
export type ArcPoint = [number, number, number, number]

/** 弧线点集 → xyz 连续平铺 (场景单位 AU, 日心黄道坐标直接入缓冲, 无需变换) */
export function arcPositions(points: ArcPoint[]): Float32Array {
  const out = new Float32Array(points.length * 3)
  for (let i = 0; i < points.length; i++) {
    const p = points[i]
    out[3 * i] = p[1]
    out[3 * i + 1] = p[2]
    out[3 * i + 2] = p[3]
  }
  return out
}

export interface ArcClosest {
  /** 最近距离对应时刻 (儒略日) */
  jd: number
  /** 与地球的最近距离 (km) */
  distKm: number
}

/** 粗网格定位后用相邻三点的相对位置二次插值精化最近距离。 */
export function scanClosestApproach(points: ArcPoint[]): ArcClosest | null {
  if (points.length === 0) return null
  const ordered = [...points].sort((a, b) => a[0] - b[0])
  const earth: Vec3Like = {
    x: 0,
    y: 0,
    z: 0,
    set(x, y, z) {
      this.x = x
      this.y = y
      this.z = z
    },
  }
  let best: ArcClosest | null = null
  let bestIndex = 0
  for (let index = 0; index < ordered.length; index++) {
    const p = ordered[index]
    planetPos(PLANETS[2], p[0], earth)
    const dKm =
      Math.hypot(p[1] - earth.x, p[2] - earth.y, p[3] - earth.z) * AU_KM
    if (!best || dKm < best.distKm) {
      best = { jd: p[0], distKm: dKm }
      bestIndex = index
    }
  }
  if (bestIndex === 0 || bestIndex === ordered.length - 1) return best

  const samples = ordered.slice(bestIndex - 1, bestIndex + 2).map((point) => {
    planetPos(PLANETS[2], point[0], earth)
    return {
      jd: point[0],
      r: [point[1] - earth.x, point[2] - earth.y, point[3] - earth.z],
    }
  })
  const distance2 = (jd: number) => {
    let result = 0
    for (let axis = 0; axis < 3; axis++) {
      let value = 0
      for (let i = 0; i < 3; i++) {
        const j = (i + 1) % 3
        const k = (i + 2) % 3
        value += samples[i].r[axis]
          * (jd - samples[j].jd) * (jd - samples[k].jd)
          / ((samples[i].jd - samples[j].jd) * (samples[i].jd - samples[k].jd))
      }
      result += value * value
    }
    return result
  }
  let lo = samples[0].jd
  let hi = samples[2].jd
  const ratio = (Math.sqrt(5) - 1) / 2
  let left = hi - ratio * (hi - lo)
  let right = lo + ratio * (hi - lo)
  for (let i = 0; i < 48; i++) {
    if (distance2(left) <= distance2(right)) {
      hi = right
      right = left
      left = hi - ratio * (hi - lo)
    } else {
      lo = left
      left = right
      right = lo + ratio * (hi - lo)
    }
  }
  const jd = (lo + hi) / 2
  return { jd, distKm: Math.sqrt(distance2(jd)) * AU_KM }
}
