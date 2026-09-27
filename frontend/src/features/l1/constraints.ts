import { D2R, R_EARTH_AU } from '@/utils/orbital/constants'

/** 地球遮挡取视半径；规避区在真实视半径外叠加计划声明的仿真余量。 */
export function earthApparentRadius(distanceAu: number): number {
  return Math.asin(Math.min(1, R_EARTH_AU / distanceAu))
}

export function earthAvoidanceRadius(distanceAu: number, marginDeg: number): number {
  return earthApparentRadius(distanceAu) + marginDeg * D2R
}
