import type { Vector3 } from 'three'
import type { NominalTrajectoryScenePayload } from '@/core/sceneProducts/types'

/** 在带时标的名义轨迹上作线性采样；观察窗外返回 false。 */
export function sampleNominalTrajectory(
  trajectory: NominalTrajectoryScenePayload | null,
  jd: number,
  out: Vector3,
): boolean {
  const points = trajectory?.points
  if (!points || points.length < 2 || jd < points[0].jd || jd > points[points.length - 1].jd) {
    return false
  }

  let low = 1
  let high = points.length - 1
  while (low < high) {
    const middle = (low + high) >> 1
    if (points[middle].jd < jd) low = middle + 1
    else high = middle
  }
  const left = points[low - 1]
  const right = points[low]
  const ratio = (jd - left.jd) / (right.jd - left.jd || 1)
  out.set(
    left.centerEclipticAu[0] + (right.centerEclipticAu[0] - left.centerEclipticAu[0]) * ratio,
    left.centerEclipticAu[1] + (right.centerEclipticAu[1] - left.centerEclipticAu[1]) * ratio,
    left.centerEclipticAu[2] + (right.centerEclipticAu[2] - left.centerEclipticAu[2]) * ratio,
  )
  return true
}
