/* ============================================================================
 * encounter.ts — 小行星与地球轨道关系分析
 *
 * MOID (最小轨道交线距离)、轨道相对关系分类、前后接近事件数值扫描。
 * 均为纯几何/开普勒推演, 不依赖后端, 供小行星专题页展示。
 * ========================================================================== */

import { AU_KM } from './constants'
import { posFromElements } from './kepler'
import type { Vec3Like } from './kepler'
import { astPos } from './asteroids'
import type { AsteroidElements } from './asteroids'
import { planetPos } from './planets'
import type { PlanetDef } from '@/types/orbital'

function v3(): Vec3Like {
  return {
    x: 0, y: 0, z: 0,
    set(x, y, z) { this.x = x; this.y = y; this.z = z },
  }
}

/** 近日点 / 远日点距离 (AU) */
export function periAph(a: number, e: number): { q: number; Q: number } {
  return { q: a * (1 - e), Q: a * (1 + e) }
}

/**
 * MOID (Minimum Orbit Intersection Distance): 小行星轨道到地球轨道的最小距离。
 * 地球轨道近似为黄道面内半径 1 AU 的圆, 点 (x, y, z) 到该圆的几何距离为
 * sqrt((√(x²+y²) − 1)² + z²), 对小行星轨道均匀采样求最小值。
 */
export function moidToEarth(el: AsteroidElements, samples = 4320): number {
  const p = v3()
  let min = Infinity
  for (let k = 0; k < samples; k++) {
    const M = (k / samples) * 2 * Math.PI
    posFromElements(el.a, el.e, el.i, el.O, el.w, M, p)
    const d = Math.hypot(Math.hypot(p.x, p.y) - 1, p.z)
    if (d < min) min = d
  }
  return min
}

export interface EarthRelation {
  q: number
  Q: number
  /** 相对关系描述: 相交 / 内侧 / 外侧 */
  label: string
  /** 细分类型: 近地小行星按 q/Q 与地球轨道关系进一步分类 */
  kind: string
}

/** 由近日点/远日点与 1 AU 的关系判定轨道相对关系 */
export function classifyEarthRelation(a: number, e: number): EarthRelation {
  const { q, Q } = periAph(a, e)
  if (q < 1 && Q > 1) {
    const kind = q < 0.983 && a > 1 ? '阿波罗型 (Apollo)'
      : a < 1 ? '阿登型 (Aten)' : '阿莫尔型 (Amor)'
    return { q, Q, label: '轨道与地球轨道相交', kind }
  }
  if (Q <= 1) return { q, Q, label: '轨道完全位于地球轨道内侧', kind: '阿提拉型 (Atira)' }
  return { q, Q, label: '轨道完全位于地球轨道外侧', kind: '无地球交会' }
}

export interface Approach {
  /** 最近接近时刻 (JD) */
  jd: number
  /** 地心距离 (AU) */
  distAu: number
  /** 相对速度 (km/s) */
  relSpeedKms: number
}

/** 日心系下地-星距离 (AU) */
function earthAstDist(el: AsteroidElements, earth: PlanetDef, jd: number, pa: Vec3Like, pe: Vec3Like): number {
  astPos(el, jd, pa)
  planetPos(earth, jd, pe)
  return Math.hypot(pa.x - pe.x, pa.y - pe.y, pa.z - pe.z)
}

/** 黄金分割法在 [lo, hi] 内精化距离极小值 */
function refineMin(el: AsteroidElements, earth: PlanetDef, lo: number, hi: number): { jd: number; dist: number } {
  const pa = v3(), pe = v3()
  const phi = (Math.sqrt(5) - 1) / 2
  let a = lo, b = hi
  let c = b - phi * (b - a), d = a + phi * (b - a)
  let fc = earthAstDist(el, earth, c, pa, pe), fd = earthAstDist(el, earth, d, pa, pe)
  while (b - a > 1e-4) {
    if (fc < fd) { b = d; d = c; fd = fc; c = b - phi * (b - a); fc = earthAstDist(el, earth, c, pa, pe) }
    else { a = c; c = d; fc = fd; d = a + phi * (b - a); fd = earthAstDist(el, earth, d, pa, pe) }
  }
  const jd = (a + b) / 2
  return { jd, dist: Math.min(fc, fd) }
}

/** 极小值处的地-星相对速度 (km/s, 中心差分) */
export function relSpeed(el: AsteroidElements, earth: PlanetDef, jd: number): number {
  const dt = 0.5
  const pa = v3(), pe = v3()
  astPos(el, jd - dt, pa); planetPos(earth, jd - dt, pe)
  const rx1 = pa.x - pe.x, ry1 = pa.y - pe.y, rz1 = pa.z - pe.z
  astPos(el, jd + dt, pa); planetPos(earth, jd + dt, pe)
  const vx = (pa.x - pe.x - rx1) / (2 * dt)
  const vy = (pa.y - pe.y - ry1) / (2 * dt)
  const vz = (pa.z - pe.z - rz1) / (2 * dt)
  return Math.hypot(vx, vy, vz) * AU_KM / 86400
}

/**
 * 前后接近事件扫描: 在 [startJd − years, startJd + years] 区间内按天采样
 * 地-星距离, 捕获局部极小后用黄金分割法精化并计算相对速度,
 * 返回距离最近的前 topN 个 (含历史事件)。
 */
export function findApproaches(
  el: AsteroidElements,
  earth: PlanetDef,
  startJd: number,
  years = 20,
  topN = 3,
  /** 仅收录距离小于该阈值 (AU) 的接近事件 */
  maxDistAu = 0.5,
): Approach[] {
  const pa = v3(), pe = v3()
  const days = Math.round(years * 365.25)
  const candidates: number[] = []

  const lo = startJd - days
  let prev2 = earthAstDist(el, earth, lo - 1, pa, pe)
  let prev1 = earthAstDist(el, earth, lo, pa, pe)
  for (let d = 1; d <= 2 * days; d++) {
    const jd = lo + d
    const cur = earthAstDist(el, earth, jd, pa, pe)
    if (prev1 < prev2 && prev1 < cur && prev1 < maxDistAu) {
      candidates.push(lo + d - 1)
    }
    prev2 = prev1
    prev1 = cur
  }

  const out: Approach[] = candidates.map((jd0) => {
    const { jd, dist } = refineMin(el, earth, jd0 - 1, jd0 + 1)
    return { jd, distAu: dist, relSpeedKms: relSpeed(el, earth, jd) }
  })
  out.sort((x, y) => x.distAu - y.distAu)
  return out.slice(0, topN)
}
