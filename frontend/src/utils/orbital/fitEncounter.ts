import { JD_J2000, KGAUSS, D2R, R2D } from './constants'
import { normAng, posFromElements } from './kepler'
import type { Vec3Like } from './kepler'

export interface FitElements {
  a: number; e: number; i: number; O: number; w: number
  /** SBDB designation; 命中预烘焙星历时 astPos 用星历位置, 拟合结果仅供画轨道线 */
  des?: string
}

export interface FitResult extends FitElements {
  M0: number
}

interface Vec3Full extends Vec3Like {
  length(): number
  distanceToSquared(v: Vec3Full): number
  sub(v: Vec3Full): Vec3Full
  normalize(): Vec3Full
  dot(v: Vec3Full): number
  copy(v: Vec3Full): Vec3Full
}

// THREE.Vector3-compatible factory — passed in so this module stays Three.js-free
export type Vec3Factory = () => Vec3Full

export function fitEncounter(
  el: FitElements,
  jdEnc: number,
  target: Vec3Full,
  makeVec3: Vec3Factory,
  prefDir?: Vec3Full,
  prefCenter?: Vec3Full,
): FitResult | null {
  const R = target.length()
  const p = el.a * (1 - el.e * el.e)
  const c = (p - R) / (el.e * R)
  if (Math.abs(c) > 1) return null

  const si = Math.sin(el.i * D2R)
  const ti = Math.tan(el.i * D2R)
  const ci = Math.cos(el.i * D2R)
  if (Math.abs(si) < 1e-6) return null

  const alpha = Math.atan2(target.y, target.x)
  const txy   = Math.hypot(target.x, target.y)
  let sVal = -target.z / (ti * txy)
  if (Math.abs(sVal) > 1) {
    if (Math.abs(sVal) > 1 + 1e-6) return null
    sVal = Math.max(-1, Math.min(1, sVal))
  }

  const n   = KGAUSS / (el.a * Math.sqrt(el.a))
  const tmp = makeVec3()
  let best: { d: number; el: FitResult } | null = null

  for (const sgnNu of [1, -1] as const) {
    const nu   = sgnNu * Math.acos(c)
    const E    = 2 * Math.atan2(
      Math.sqrt(1 - el.e) * Math.sin(nu / 2),
      Math.sqrt(1 + el.e) * Math.cos(nu / 2),
    )
    const Menc  = E - el.e * Math.sin(E)
    const asinV = Math.asin(sVal)

    for (const Om of [alpha + asinV, alpha + Math.PI - asinV]) {
      const cO = Math.cos(Om), sO = Math.sin(Om)
      const qx  = cO * target.x + sO * target.y
      const qy1 = -sO * target.x + cO * target.y
      const qy  = ci * qy1 + si * target.z
      const u   = Math.atan2(qy, qx)
      const wNew = u - nu
      const M0   = (Menc - n * (jdEnc - JD_J2000)) * R2D

      const el2: FitResult = {
        a: el.a, e: el.e, i: el.i,
        O: normAng(Om * R2D),
        w: normAng(wNew * R2D),
        M0: normAng(M0),
        des: el.des,
      }

      posFromElements(el2.a, el2.e, el2.i, el2.O, el2.w, Menc, tmp)
      let score = tmp.distanceToSquared(target)

      if (prefDir) {
        posFromElements(el2.a, el2.e, el2.i, el2.O, el2.w, Menc - n * 0.01, tmp)
        tmp.sub(prefCenter ?? target).normalize()
        score -= Math.max(0, tmp.dot(prefDir)) * 1e-6
      }

      if (!best || score < best.d) best = { d: score, el: el2 }
    }
  }

  return best ? best.el : null
}
