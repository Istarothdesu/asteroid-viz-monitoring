import { describe, expect, it } from 'vitest'
import { createEvent, sampleEvent, playbackRate } from './event.js'
import { VALIDATION_SCENARIOS, eventImpactConfig, terminalKind } from './scenarios'
import { toECEF } from '../terrain/geo.js'
import { craterDelta } from '../terrain/terrain-geometry.js'
import type { EventRecord } from '@/types/scene'

describe('事件仿真轨迹与终态边界', () => {
  it.each(VALIDATION_SCENARIOS)('$name 使用自身落点和速度，按同一时轴完成进入与落地', config => {
    const event = createEvent(config, 1600)
    const first = sampleEvent(event, 0), entry = sampleEvent(event, event.entryTime)
    const impact = sampleEvent(event, event.impactTime)
    expect(first.height).toBeCloseTo(1800000, 1)
    expect(first.speed).toBeCloseTo(config.speed * 1000, 1)
    expect(entry.height).toBeCloseTo(120000, 0)
    expect(impact.ecef.distanceTo(toECEF(config.lon, config.lat, 1600))).toBeLessThan(.001)
    expect(event.samples.every((s, i) => !i || s.t > event.samples[i - 1].t)).toBe(true)
    expect(event.duration).toBe(event.impactTime + 35)
  })

  it('回退到同一时刻得到同一位置，播放倍率不改变轨迹', () => {
    const event = createEvent(VALIDATION_SCENARIOS[0], 0), t = event.entryTime + 3
    const before = sampleEvent(event, t)
    sampleEvent(event, event.duration)
    expect(sampleEvent(event, t).ecef.equals(before.ecef)).toBe(true)
    expect(playbackRate(event, 0)).toBe(8)
    expect(playbackRate(event, t)).toBe(.45)
    expect(playbackRate(event, event.impactTime + 1)).toBe(1)
  })

  const record = { id: 'event', name: '验证', type: 'impact', diam: .03, impactLon: 0, impactLat: 0 } as EventRecord
  it('事件中的零经纬度有效，已有速度方向优先于演示默认值', () => {
    const config = eventImpactConfig({ ...record, entrySpeedKmS: 22, entryAngleDeg: 60, entryBearingDeg: 0 })!
    expect([config.lon, config.lat, config.speed, config.angle, config.bearing]).toEqual([0, 0, 22, 60, 0])
  })
  it('空爆、海面和缺失落点的事件不会被转换为陆地撞击', () => {
    expect(terminalKind({ ...record, burstAltKm: 8 })).toBe('airburst')
    expect(eventImpactConfig({ ...record, burstAltKm: 8 })).toBeNull()
    expect(eventImpactConfig({ ...record, impactMedium: 'ocean' })).toBeNull()
    expect(eventImpactConfig({ ...record, impactLat: undefined })).toBeNull()
    expect(eventImpactConfig({ ...record, type: 'flyby' })).toBeNull()
  })
  it('坑形只影响局部范围，退出或回退可通过进度归零恢复', () => {
    const crater = { radius: 550, depth: 150 }
    expect(craterDelta(0, crater)).toBe(-150)
    expect(craterDelta(800, crater)).toBeGreaterThan(0)
    expect(craterDelta(1000, crater)).toBe(0)
    expect(craterDelta(0, null)).toBe(0)
  })
})
