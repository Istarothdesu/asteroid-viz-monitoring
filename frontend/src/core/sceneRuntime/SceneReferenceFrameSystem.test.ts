import * as THREE from 'three'
import { describe, expect, it } from 'vitest'
import { JD_J2000, TAU } from '@/utils/orbital/constants'
import { SceneReferenceFrameSystem } from './SceneReferenceFrameSystem'

function input() {
  return {
    frame: 'helio' as const,
    jd: JD_J2000 + 10.123,
    followSpin: false,
    companionSpinHours: 8,
    earthWorldPosition: new THREE.Vector3(),
    l1WorldPosition: null,
    replayActive: false,
    eventWorldPosition: new THREE.Vector3(7, 8, 9),
    companionWorldPosition: new THREE.Vector3(4, 5, 6),
  }
}

describe('SceneReferenceFrameSystem', () => {
  it('日心系保持惯性方向并以太阳为中心', () => {
    const frame = new SceneReferenceFrameSystem().update(input())
    expect(frame.center.toArray()).toEqual([0, 0, 0])
    expect(frame.rotationCos).toBe(1)
    expect(frame.rotationSin).toBe(0)
  })

  it('地心系使用当前历元地球位置并按恒星日旋转', () => {
    const system = new SceneReferenceFrameSystem()
    const state = { ...input(), frame: 'geo' as const, followSpin: true }
    const frame = system.update(state)
    const angle = (state.jd - JD_J2000) * TAU / 0.99727

    expect(state.earthWorldPosition.length()).toBeGreaterThan(0.9)
    expect(frame.center.toArray()).toEqual(state.earthWorldPosition.toArray())
    expect(frame.rotationCos).toBeCloseTo(Math.cos(angle))
    expect(frame.rotationSin).toBeCloseTo(Math.sin(angle))
  })

  it('L1 系优先使用任务提供的观测器位置', () => {
    const l1WorldPosition = new THREE.Vector3(1, 2, 3)
    const frame = new SceneReferenceFrameSystem().update({
      ...input(),
      frame: 'l1',
      l1WorldPosition,
    })
    expect(frame.center.toArray()).toEqual([1, 2, 3])
  })

  it('伴飞系在仿真与普通目标之间切换中心并使用目标自转周期', () => {
    const system = new SceneReferenceFrameSystem()
    const state = { ...input(), frame: 'comp' as const, followSpin: true }
    const normal = system.update(state)
    expect(normal.center.toArray()).toEqual([4, 5, 6])

    const replay = system.update({ ...state, replayActive: true })
    expect(replay.center.toArray()).toEqual([7, 8, 9])
    expect(replay.rotationCos).not.toBe(1)
  })
})
