import { beforeEach, describe, expect, it } from 'vitest'
import { useSceneProductStore } from './store'
import type { TrajectorySceneProduct } from './types'

function trajectory(contextId: string): TrajectorySceneProduct {
  return {
    productId: `${contextId}:trajectory`,
    contextId,
    kind: 'trajectory',
    sourceSystem: 'test',
    dataVersion: '1',
    algorithmVersion: 'test-v1',
    inputProductIds: [],
    referenceFrame: 'ECLIPJ2000',
    timeScale: 'TDB',
    temporalMode: 'sampled',
    anchorJd: 2460000.5,
    quality: 'exact',
    payload: {
      eventKey: 'c-test',
      positions: new Float32Array([1, 2, 3]),
      source: 'elements',
      closestKm: 1000,
      closestJd: 2460000.5,
      spanDays: 365,
      orbitSolutionId: '1',
      orbitSolutionMatch: true,
    },
  }
}

describe('场景产品注册表生命周期', () => {
  beforeEach(() => useSceneProductStore.getState().clear())

  it('拒绝旧 context 的延迟结果覆盖新事件', () => {
    const store = useSceneProductStore.getState()
    store.activate('old')
    store.activate('new')
    store.publish('old', 'trajectory', trajectory('old'))
    expect(useSceneProductStore.getState()).toMatchObject({
      contextId: 'new',
      products: { trajectory: null },
    })
  })

  it('只允许当前 context 清理自己的场景产品', () => {
    const store = useSceneProductStore.getState()
    store.activate('current')
    store.publish('current', 'trajectory', trajectory('current'))
    store.clear('stale')
    expect(useSceneProductStore.getState().products.trajectory).not.toBeNull()
    store.clear('current')
    expect(useSceneProductStore.getState()).toMatchObject({
      contextId: null,
      products: {
        trajectory: null,
        bPlane: null,
        uncertaintyTube: null,
        encounterDensity: null,
      },
    })
  })

  it('聚焦序号跨 context 单调递增', () => {
    const store = useSceneProductStore.getState()
    store.activate('first')
    store.requestBPlaneFocus('first')
    const first = useSceneProductStore.getState().focusRevision
    store.activate('second')
    store.requestBPlaneFocus('second')
    expect(useSceneProductStore.getState().focusRevision).toBe(first + 1)
  })
})
