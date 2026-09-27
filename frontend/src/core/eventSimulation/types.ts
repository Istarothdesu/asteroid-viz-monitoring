import type { Vector3 } from 'three'
import type { frameAt } from '../terrain/geo.js'

export type SimulationView = 'auto' | 'space' | 'follow' | 'ground' | 'overview' | 'free'
export type TerminalKind = 'land' | 'airburst' | 'ocean' | 'flyby'
export interface ImpactConfig {
  id: string
  name: string
  dateUTC?: string // 验证场景的独立时刻；实际事件沿用记录时刻
  lon: number
  lat: number
  diameter: number // m
  speed: number // km/s
  angle: number // 与当地水平面的夹角，°
  bearing: number // 从正北顺时针，°
  craterRadius: number // m，视觉示意参数
  craterDepth: number // m，视觉示意参数
  observerDistance: number // m
  seed: number
}
export interface TrajectorySample {
  t: number
  ecef: Vector3 // WGS84 地固坐标，m
  speed: number // m/s
  height: number // 椭球高，m
  lon: number
  lat: number
}
/** 轨迹供应器与终态效果分离；后续求解器仍可提交同口径的时序采样。 */
export interface ImpactEvent {
  config: ImpactConfig
  frame: ReturnType<typeof frameAt>
  incoming: Vector3
  horizontal: Vector3
  samples: TrajectorySample[]
  groundHeight: number
  entryTime: number
  impactTime: number
  duration: number
  observer: { lon: number; lat: number }
  crater: { lon: number; lat: number; radius: number; depth: number }
}
