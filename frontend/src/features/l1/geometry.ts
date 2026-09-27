import { cross, dot, norm, unit, vector } from './runtime'
import type { MissionProfile, Vector } from './types'

const RAD = Math.PI / 180
export function solarCoordinates(direction: Vector, sunDirection: Vector) {
  const d = unit(direction), sun = unit(sunDirection)
  let longitudeDeg = (Math.atan2(d.y, d.x) - Math.atan2(sun.y, sun.x)) / RAD
  longitudeDeg = ((longitudeDeg + 180) % 360 + 360) % 360 - 180
  return { longitudeDeg, latitudeDeg: Math.asin(d.z) / RAD,
    elongationDeg: Math.acos(Math.max(-1, Math.min(1, dot(d, sun)))) / RAD }
}

export function withinInstrumentZone(direction: Vector, sun: Vector, profile: MissionProfile) {
  const { elongationDeg } = solarCoordinates(direction, sun)
  return elongationDeg >= profile.instrument.sunAvoidanceDeg
    && elongationDeg <= profile.instrument.maxSunElongationDeg
}

/** 纯几何视场判定；不包含距离阈值/SNR，也不代表发现。 */
export function withinFov(direction: Vector, axis: Vector, right: Vector, up: Vector, tanHalfWidth: number, tanHalfHeight: number) {
  const z = dot(direction, axis)
  return z > 0 && Math.abs(dot(direction, right) / z) <= tanHalfWidth
    && Math.abs(dot(direction, up) / z) <= tanHalfHeight
}

export function pointingBasis(axis: Vector): [Vector, Vector] {
  const north = Math.abs(axis.z / norm(axis)) > .999 ? vector(0, 1, 0) : vector(0, 0, 1)
  const right = unit(cross(axis, north)), up = unit(cross(right, axis))
  return [right, up]
}
