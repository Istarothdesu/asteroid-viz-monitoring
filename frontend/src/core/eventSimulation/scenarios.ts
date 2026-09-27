import type { EventRecord } from '@/types/scene'
import type { ImpactConfig, TerminalKind } from './types'

export const VALIDATION_SCENARIOS: ImpactConfig[] = [
  { id: 'arizona', name: '亚利桑那陆地撞击演示', dateUTC: '2026-09-22T19:00:00Z', lon: -111.06, lat: 35.07, diameter: 50,
    speed: 18, angle: 42, bearing: 125, craterRadius: 550, craterDepth: 150, observerDistance: 6000, seed: 17 },
  { id: 'plateau', name: '高原陆地撞击演示', dateUTC: '2026-09-22T06:00:00Z', lon: 91.8, lat: 32.2, diameter: 35,
    speed: 16, angle: 55, bearing: 210, craterRadius: 350, craterDepth: 90, observerDistance: 4500, seed: 31 },
]

export function terminalKind(event: EventRecord): TerminalKind {
  if (event.type === 'flyby') return 'flyby'
  if ((event.burstAltKm ?? 0) > 0) return 'airburst'
  return event.impactMedium === 'ocean' ? 'ocean' : 'land'
}

export function eventImpactConfig(event: EventRecord): ImpactConfig | null {
  if (terminalKind(event) !== 'land' || event.impactLon == null || event.impactLat == null) return null
  // 缺少进入段解算时使用明确展示的演示假设，不能从日心根数杜撰进入方向。
  const diameter = event.diam * 1000
  return { id: event.id, name: event.name, lon: event.impactLon, lat: event.impactLat,
    diameter, speed: event.entrySpeedKmS ?? 18, angle: event.entryAngleDeg ?? 45,
    bearing: event.entryBearingDeg ?? 125, craterRadius: diameter * 11, craterDepth: diameter * 3,
    observerDistance: Math.max(4500, diameter * 120), seed: 17 }
}
