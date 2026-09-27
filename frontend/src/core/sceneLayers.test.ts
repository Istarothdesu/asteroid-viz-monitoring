import { describe, expect, it, vi } from 'vitest'
import { commonSceneLayerSection, overviewSceneLayerSection } from './sceneLayers'
import { eventSceneLayerSection } from '@/features/event-analysis/sceneLayers'
import { l1SceneLayerSections } from '@/features/l1/sceneLayers'
import { groundSceneLayerSections } from '@/features/ground/sceneLayers'

describe('scene layer manifests', () => {
  it('keeps overview semantics separate from base display controls', () => {
    expect(overviewSceneLayerSection().items.map(item => item.id)).toEqual([
      'asteroid', 'warning', 'selected', 'risk-boundary',
    ])
    expect(commonSceneLayerSection('overview').defaultOpen).toBe(false)
  })

  it('exposes independent event trajectory and risk layer controls', () => {
    const section = eventSceneLayerSection({
      referenceOrbit: false,
      trajectory: null,
      bPlane: null,
      uncertaintyTube: null,
      encounterDensity: null,
      propagationState: 'loading',
      uncertaintyState: 'idle',
    })
    const byId = Object.fromEntries(section.items.map(item => [item.id, item]))
    expect(byId['event-trajectory'].availability).toBe('loading')
    expect(byId['event-trajectory'].visibilityKey).toBe('showEventTrajectory')
    expect(byId['event-reference'].visibilityKey).toBe('showEventReferenceOrbit')
    expect(byId['encounter-density'].visibilityKey).toBe('showEncounterDensity')
  })

  it('groups mission constraints separately from primary mission layers', () => {
    const l1 = l1SceneLayerSections(12, {
      fovWidthDeg: 6, fovHeightDeg: 4, sunAvoidanceDeg: 45,
      maxSunElongationDeg: 125, earthAvoidanceMarginDeg: 5,
    }, {
      plannedVisible: true,
      exposedVisible: false,
      togglePlanned: vi.fn(),
      toggleExposed: vi.fn(),
    })
    const ground = groundSceneLayerSections()
    expect(l1.map(section => section.id)).toEqual(['l1-survey', 'l1-constraints'])
    expect(ground.map(section => section.id)).toEqual(['ground-survey', 'ground-constraints'])
    expect(l1[1].defaultOpen).toBe(false)
    expect(ground[1].defaultOpen).toBe(false)
    expect(l1[1].items.map(item => item.id)).toEqual([
      'sun-occult', 'sun-avoid', 'anti-sun-limit', 'earth-avoid',
    ])
    expect(l1[1].items[3].detail).toContain('视半径＋5° · 仿真')
    expect(l1[1].items[2].label).toBe('太阳伸长角上限')
    expect(l1[1].items[2].detail).toBe('>125° · NEO Surveyor 参考')
  })
})
