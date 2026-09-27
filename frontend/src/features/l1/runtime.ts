/** 科学状态入口：不依赖 Three/Zustand，渲染和任务服务共用。 */
import { ephemEpoch, ephemState } from '@/utils/orbital/ephemeris'
import type { L1Reference, ObserverState, Vector } from './types'

let reference: L1Reference | null = null
export function setL1Reference(value: L1Reference | null) { reference = value }
export function getL1Reference() { return reference }
export const vector = (x = 0, y = 0, z = 0): Vector => ({ x, y, z })
export const add = (a: Vector, b: Vector): Vector => vector(a.x + b.x, a.y + b.y, a.z + b.z)
export const scale = (a: Vector, k: number): Vector => vector(a.x * k, a.y * k, a.z * k)
export const dot = (a: Vector, b: Vector) => a.x * b.x + a.y * b.y + a.z * b.z
export const cross = (a: Vector, b: Vector): Vector => vector(a.y * b.z - a.z * b.y, a.z * b.x - a.x * b.z, a.x * b.y - a.y * b.x)
export const norm = (a: Vector) => Math.hypot(a.x, a.y, a.z)
export const unit = (a: Vector) => scale(a, 1 / norm(a))

/** 归一化三体状态，位置及速度用同一 Hermite 曲线；周期复用已通过后端验证。 */
export function synodicState(jdTdb: number, ref = reference): number[] | null {
  if (!ref) return null
  const o = ref.orbit, count = o.samples.length
  const phase = (((jdTdb - o.phaseEpochJdTdb) % o.periodDays) + o.periodDays) % o.periodDays
  const k = phase / o.periodDays * (count - 1), i = Math.floor(k), u = k - i
  const a = o.samples[i], b = o.samples[i + 1], h = o.periodNormalized / (count - 1)
  const result = Array<number>(6)
  for (let d = 0; d < 3; d++) {
    result[d] = (2*u**3 - 3*u*u + 1)*a[d] + (u**3 - 2*u*u + u)*h*a[d + 3]
      + (-2*u**3 + 3*u*u)*b[d] + (u**3 - u*u)*h*b[d + 3]
    result[d + 3] = ((6*u*u - 6*u)*a[d] + (-6*u*u + 6*u)*b[d]) / h
      + (3*u*u - 4*u + 1)*a[d + 3] + (3*u*u - 2*u)*b[d + 3]
  }
  return result
}

export function mapSynodicPosition(s: number[], earth: Vector, basis: [Vector, Vector, Vector], ref = reference!): Vector {
  const q = [s[0] - (1 - ref.orbit.massRatio), s[1], s[2]]
  // 主天体间距归一化为 1；按当前日地间距缩放，保证太阳→0、地球→earth。
  // 这是可视化/任务几何映射，不能因此宣称满足真实多体动力学。
  const lengthAu = norm(earth)
  return q.reduce((p, v, i) => add(p, scale(basis[i], v * lengthAu)), earth)
}

let cachedJd = NaN, cachedEpoch = -1
let cachedReference: L1Reference | null = null, cachedState: ObserverState | null = null

/** 同一时刻与同一输入代次返回同一快照；数据装载或切换会失效。 */
export function getL1ObserverState(jdTdb: number): ObserverState | null {
  const epoch = ephemEpoch()
  if (jdTdb === cachedJd && epoch === cachedEpoch && reference === cachedReference) return cachedState
  cachedJd = jdTdb; cachedEpoch = epoch; cachedReference = reference
  cachedState = calculateObserverState(jdTdb)
  return cachedState
}

function calculateObserverState(jdTdb: number): ObserverState | null {
  const ref = reference, s = synodicState(jdTdb)
  if (!ref || !s) return null
  const earth = vector(), earthV = vector()
  // 星历越界时不把简化地球根数当作高精度输入；明确不可用。
  if (!ephemState('earth', jdTdb, earth, earthV)) return null
  const u = unit(earth), r = norm(earth)
  const du = scale(add(earthV, scale(u, -dot(u, earthV))), 1 / r)
  const rawV = cross(vector(0, 0, 1), u), v = unit(rawV)
  const rawDv = cross(vector(0, 0, 1), du)
  const dv = scale(add(rawDv, scale(v, -dot(v, rawDv))), 1 / norm(rawV))
  const n = cross(u, v), dn = add(cross(du, v), cross(u, dv))
  const basis: [Vector, Vector, Vector] = [u, v, n], derivatives = [du, dv, dn]
  const position = mapSynodicPosition(s, earth, basis, ref)
  const q = [s[0] - (1 - ref.orbit.massRatio), s[1], s[2]]
  const dr = dot(u, earthV)
  let velocity = earthV
  for (let i = 0; i < 3; i++) {
    velocity = add(velocity, scale(basis[i], s[i + 3] * r * 86400 / ref.orbit.timeUnitSeconds + q[i] * dr))
    velocity = add(velocity, scale(derivatives[i], q[i] * r))
  }
  return { jdTdb, positionAu: position, velocityAuPerDay: velocity, earthPositionAu: earth,
    l1PointAu: add(earth, scale(u, (ref.orbit.l1SynodicX - (1 - ref.orbit.massRatio)) * r)),
    earthDistanceAu: norm(add(position, scale(earth, -1))), basis,
    source: 'CR3BP-following-map', earthSource: 'ephemeris', profileId: ref.profile.id }
}
