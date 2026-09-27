import { JD_J2000, KGAUSS, D2R, R2D } from './constants'
import { ephemPos } from './ephemeris'
import { posFromElements } from './kepler'
import type { Vec3Like } from './kepler'

export interface AsteroidElements {
  a: number; e: number; i: number
  O: number; w: number; M0: number
  /** SBDB designation; 命中预烘焙星历 (asteroid_ephemeris) 时改用 Hermite 插值 */
  des?: string
}

export function meanMotionDeg(a: number): number {
  return KGAUSS / (a * Math.sqrt(a)) * R2D
}

export function astPos(el: AsteroidElements, jd: number, out: Vec3Like): Vec3Like {
  // 星历优先: 重点小行星 (PHA+命名清单) 有全摄动预烘焙表, 误差公里级;
  // 未命中/超窗口静默回退开普勒二体 (与行星 planetPos 同一降级模式)
  if (el.des && ephemPos(el.des, jd, out)) return out
  const M = (el.M0 + meanMotionDeg(el.a) * (jd - JD_J2000)) * D2R
  return posFromElements(el.a, el.e, el.i, el.O, el.w, M, out)
}
