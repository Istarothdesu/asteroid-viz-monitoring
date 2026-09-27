import { afterEach, describe, expect, it } from 'vitest'
import {
  getL1MissionProvider,
  getL1MissionSnapshot,
  resetL1MissionProvider,
  setL1MissionProvider,
  type L1MissionProvider,
} from './missionProvider'

describe('L1 任务数据端口', () => {
  afterEach(resetL1MissionProvider)

  it('以同一个 provider 生成单帧快照', () => {
    const provider: L1MissionProvider = {
      id: 'external-test',
      getReference: () => null,
      getObserverState: () => null,
      getObservationPlan: () => null,
      getObservationPlayback: () => null,
      getPlanError: () => 'test',
      sampleReferenceOrbit: () => [{ x: 1, y: 2, z: 3 }],
    }
    setL1MissionProvider(provider)

    expect(getL1MissionSnapshot(2460000.5)).toEqual({
      providerId: 'external-test',
      jdTdb: 2460000.5,
      reference: null,
      observer: null,
      playback: null,
    })
    expect(getL1MissionProvider().sampleReferenceOrbit(2460000.5, 1)).toEqual([
      { x: 1, y: 2, z: 3 },
    ])
  })

  it('可恢复本地模拟 provider', () => {
    const localId = getL1MissionProvider().id
    setL1MissionProvider({
      id: 'temporary',
      getReference: () => null,
      getObserverState: () => null,
      getObservationPlan: () => null,
      getObservationPlayback: () => null,
      getPlanError: () => '',
      sampleReferenceOrbit: () => null,
    })
    resetL1MissionProvider()
    expect(getL1MissionProvider().id).toBe(localId)
  })
})
