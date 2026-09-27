import { describe, expect, it } from 'vitest'
import {
  isGroundMissionMode,
  isL1MissionMode,
  isSelectionCompatible,
  missionLayerMode,
  selectedStationIndex,
} from './viewPolicy'

describe('视图职责策略', () => {
  it('业务图层只由业务模式决定', () => {
    expect(missionLayerMode('overview')).toBeNull()
    expect(missionLayerMode('survey')).toBe('l1')
    expect(missionLayerMode('ground')).toBe('ground')
    expect(isL1MissionMode('survey')).toBe(true)
    expect(isGroundMissionMode('ground')).toBe(true)
  })

  it('监测站选择不能污染其他业务模块', () => {
    const station = { kind: 'station' as const, idx: 3 }
    expect(isSelectionCompatible('ground', station)).toBe(true)
    expect(isSelectionCompatible('overview', station)).toBe(false)
    expect(isSelectionCompatible('survey', station)).toBe(false)
    expect(selectedStationIndex('ground', station)).toBe(3)
    expect(selectedStationIndex('overview', station)).toBeNull()
  })

  it('通用天体和小行星允许跨参考系观察', () => {
    expect(isSelectionCompatible('ground', { kind: 'ast', idx: 1 })).toBe(true)
    expect(isSelectionCompatible('survey', { kind: 'planet', idx: 2 })).toBe(true)
    expect(isSelectionCompatible('overview', null)).toBe(true)
  })
})
