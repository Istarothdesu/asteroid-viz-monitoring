import { describe, expect, it } from 'vitest'
import type { EventDetail } from '@/services/eventCenter'
import { buildEventRiskConclusion } from './eventRiskConclusion'

const flyby: EventDetail = {
  key: 'c-test',
  source: 'cad',
  name: '测试飞掠',
  target: 'TEST',
  type: 'flyby',
  dateUTC: '2026-10-18T12:43:00',
  jdEnc: 2461332,
  diam: 0.12,
  missKm: 192200,
  vRelKms: 12.5,
  leadH: 48,
  severity: 'medium',
  category: 'current',
  record: null,
}

describe('事件风险结论', () => {
  it('飞掠结论使用月球距离和相对速度', () => {
    const conclusion = buildEventRiskConclusion(flyby, null, flyby.jdEnc - 1)
    expect(conclusion.text).toContain('0.50 个月球距离')
    expect(conclusion.text).toContain('12.5 km/s')
    expect(conclusion.advice).toContain('跳转事件时刻')
  })

  it('根据参考时刻区分未来事件和历史事件', () => {
    const conclusion = buildEventRiskConclusion(flyby, null, flyby.jdEnc + 1)
    expect(conclusion.advice).toContain('该事件已发生')
  })

  it('撞击结论显示能量和撞击方式', () => {
    const impact: EventDetail = {
      ...flyby,
      type: 'impact',
      energyMt: 2.5,
      missKm: undefined,
    }
    const conclusion = buildEventRiskConclusion(impact, null, impact.jdEnc)
    expect(conclusion.tags).toContain('撞击事件')
    expect(conclusion.tags).toContain('地表撞击')
    expect(conclusion.text).toContain('2.50 Mt')
  })
})
