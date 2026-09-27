/** 仪器局部 +X=视场右、+Y=上、-Z=光轴；四元数 xyzw 将仪器系旋转到 ECLIPJ2000。 */
import { add, cross, dot, scale, unit, vector } from './runtime'
import { pointingBasis } from './geometry'
import type { Vector } from './types'

export type Quaternion = [number, number, number, number]
export function normalizeQuaternion(q: Quaternion): Quaternion {
  const n = Math.hypot(...q)
  return q.map(v => v / n) as Quaternion
}
export function quaternionAngle(a: Quaternion, b: Quaternion) {
  return 2 * Math.acos(Math.min(1, Math.abs(a.reduce((v, x, k) => v + x * b[k], 0))))
}
export function interpolateQuaternion(a: Quaternion, b: Quaternion, t: number): Quaternion {
  let c = a.reduce((v, x, k) => v + x * b[k], 0)
  const sign = c < 0 ? -1 : 1
  c = Math.abs(c)
  if (c > .9995) return normalizeQuaternion(a.map((x, k) => x * (1-t) + sign * b[k] * t) as Quaternion)
  const angle = Math.acos(Math.min(1, c)), s = Math.sin(angle)
  return a.map((x, k) => (x * Math.sin((1-t)*angle) + sign * b[k] * Math.sin(t*angle)) / s) as Quaternion
}
export function rotateVector(q: Quaternion, v: Vector): Vector {
  const xyz = vector(q[0], q[1], q[2]), t = scale(cross(xyz, v), 2)
  return add(v, add(scale(t, q[3]), cross(xyz, t)))
}
export function attitudeAxes(q: Quaternion) {
  return { axis: rotateVector(q, vector(0, 0, -1)), right: rotateVector(q, vector(1, 0, 0)), up: rotateVector(q, vector(0, 1, 0)) }
}
/** 最小转动搬运视场基；用于保证绕极区转向的光轴沿大圆移动，而非被滚转插值带偏。 */
export function transportAttitude(q: Quaternion, direction: Vector): Quaternion {
  const a = attitudeAxes(q).axis, b = unit(direction), xyz = cross(a, b), w = 1+dot(a, b)
  const oppositeAxis = unit(cross(a, Math.abs(a.x) < .9 ? vector(1, 0, 0) : vector(0, 1, 0)))
  const r: Quaternion = w < 1e-10 ? [oppositeAxis.x, oppositeAxis.y, oppositeAxis.z, 0]
    : normalizeQuaternion([xyz.x, xyz.y, xyz.z, w])
  const [x, y, z, s] = r, [u, v, h, t] = q
  return normalizeQuaternion([s*u+x*t+y*h-z*v, s*v-x*h+y*t+z*u, s*h+x*v-y*u+z*t, s*t-x*u-y*v-z*h])
}
export function pointingQuaternion(direction: Vector): Quaternion {
  const axis = unit(direction), [right, up] = pointingBasis(axis), z = scale(axis, -1)
  const m00 = right.x, m01 = up.x, m02 = z.x
  const m10 = right.y, m11 = up.y, m12 = z.y
  const m20 = right.z, m21 = up.z, m22 = z.z
  const trace = m00 + m11 + m22
  let q: Quaternion
  if (trace > 0) {
    const s = 2 * Math.sqrt(trace + 1)
    q = [(m21-m12)/s, (m02-m20)/s, (m10-m01)/s, s/4]
  } else if (m00 > m11 && m00 > m22) {
    const s = 2 * Math.sqrt(1+m00-m11-m22)
    q = [s/4, (m01+m10)/s, (m02+m20)/s, (m21-m12)/s]
  } else if (m11 > m22) {
    const s = 2 * Math.sqrt(1+m11-m00-m22)
    q = [(m01+m10)/s, s/4, (m12+m21)/s, (m02-m20)/s]
  } else {
    const s = 2 * Math.sqrt(1+m22-m00-m11)
    q = [(m02+m20)/s, (m12+m21)/s, s/4, (m10-m01)/s]
  }
  return normalizeQuaternion(q)
}

/** 视场外接圆半径，用于保守包络检查，不把中心线通过当成整个视场通过。 */
export function footprintRadius(widthDeg: number, heightDeg: number) {
  return Math.atan(Math.hypot(Math.tan(widthDeg * Math.PI / 360), Math.tan(heightDeg * Math.PI / 360)))
}
export function footprintRay(q: Quaternion, x: number, y: number): Vector {
  return rotateVector(q, unit(vector(x, y, -1)))
}
export function separation(a: Vector, b: Vector) {
  return Math.acos(Math.max(-1, Math.min(1, dot(unit(a), unit(b)))))
}
