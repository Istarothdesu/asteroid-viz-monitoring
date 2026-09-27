import { describe, expect, it } from 'vitest'
import {
  buildSimEventRecord,
  canPreviewSimEvent,
  resolveImpactPhysics,
  simulationPreviewKey,
  toSimEventFormData,
  toSimEventInput,
  validateSimEvent,
} from './model'
import type { SimEventFormData } from './types'

const validFlyby: SimEventFormData = {
  name: '测试飞掠',
  desc: '用于验证转换口径',
  type: 'flyby',
  targetType: '石质小行星',
  diam: 120,
  dateUTC: '2026-10-18T12:43',
  el: { a: 1.2, e: 0.25, i: 3, O: 40, w: 15 },
  missKm: 120000,
  leadH: 8,
}

describe('模拟事件领域模型', () => {
  it('区分场景记录和持久化输入的直径单位', () => {
    expect(buildSimEventRecord('preview', validFlyby).diam).toBe(0.12)
    expect(toSimEventInput(validFlyby).diam).toBe(120)
  })

  it('持久化时间和 datetime-local 表单时间可以稳定往返', () => {
    const input = toSimEventInput(validFlyby)
    expect(input.dateUTC).toBe('2026-10-18T12:43:00Z')
    expect(toSimEventFormData(input).dateUTC).toBe(validFlyby.dateUTC)
  })

  it('飞掠事件不携带撞击专属物理量', () => {
    expect(resolveImpactPhysics(validFlyby)).toEqual({})
  })

  it('撞击事件补齐非负的能量与影响范围', () => {
    const impact = { ...validFlyby, type: 'impact' as const, energyMt: -1 }
    const physics = resolveImpactPhysics(impact)
    expect(physics.energyMt).toBe(0)
    expect(physics.burstAltKm).toBe(0)
    expect(physics.shockAreaKm2).toBeGreaterThanOrEqual(1)
  })

  it('预览仅要求几何有效，保存还要求事件名称', () => {
    const unnamed = { ...validFlyby, name: '' }
    expect(canPreviewSimEvent(unnamed)).toBe(true)
    expect(validateSimEvent(unnamed).name).toBe('事件名称必填')
  })

  it('描述文本不改变三维预览键', () => {
    expect(simulationPreviewKey({ ...validFlyby, desc: 'A' })).toBe(
      simulationPreviewKey({ ...validFlyby, desc: 'B' }),
    )
  })
})
