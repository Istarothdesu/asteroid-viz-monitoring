export type FrameType = 'helio' | 'geo' | 'l1' | 'comp'

export type SelectionKind = 'sun' | 'planet' | 'moon' | 'sat' | 'ast' | 'station' | 'event' | 'cloud'

export interface SelectionTarget {
  kind: SelectionKind
  idx: number
}

export interface EventRecord {
  id: string
  name: string
  type: 'impact' | 'flyby'
  dateUTC: string
  diam: number
  leadH: number
  el: { a: number; e: number; i: number; O: number; w: number; des?: string }
  impactLat?: number
  impactLon?: number
  impactMedium?: 'land' | 'ocean'
  entrySpeedKmS?: number
  entryAngleDeg?: number
  entryBearingDeg?: number
  missKm?: number
  /** 撞击专属: 爆炸高度 km (0=地表), 冲击波范围 km², 能量 Mt TNT 当量 */
  burstAltKm?: number
  shockAreaKm2?: number
  energyMt?: number
  offsetDir?: [number, number, number]
  img: string
  credit: string
  news: string
  desc: string
}
