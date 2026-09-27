import { describe, expect, it } from 'vitest'
import { CATEGORY_LABELS, KNOWLEDGE_ENTRIES, searchKnowledge } from './knowledge'

describe('巡天与载荷知识库', () => {
  it('提供独立分类与完整的核心概念', () => {
    expect(CATEGORY_LABELS.observation).toBe('巡天与载荷')
    const ids = KNOWLEDGE_ENTRIES
      .filter((entry) => entry.category === 'observation')
      .map((entry) => entry.id)
    expect(ids).toEqual(expect.arrayContaining([
      'boresight-fov-footprint',
      'exposure-integration-readout',
      'survey-modes',
      'visit-dither-revisit',
      'simulation-observation-boundary',
    ]))
  })

  it('可用中英文概念和资料来源检索', () => {
    expect(searchKnowledge('连续 扫描')[0]?.id).toBe('survey-modes')
    expect(searchKnowledge('boresight')[0]?.id).toBe('boresight-fov-footprint')
    expect(searchKnowledge('Gaia')[0]?.id).toBe('survey-modes')
  })
})
