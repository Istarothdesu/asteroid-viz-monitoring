import * as THREE from 'three'
import { describe, expect, it } from 'vitest'
import { astPos } from '@/utils/orbital/asteroids'
import type { FitResult } from '@/utils/orbital/fitEncounter'
import type { EventRecord } from '@/types/scene'
import { EventTargetSystem } from './EventTargetSystem'

const replayOrbit: FitResult = {
  a: 1.2,
  e: 0.2,
  i: 5,
  O: 20,
  w: 40,
  M0: 10,
}

function event(id: string, diam = 100): EventRecord {
  return {
    id,
    name: id,
    type: 'flyby',
    dateUTC: '2026-01-01T00:00:00Z',
    diam,
    leadH: 48,
    el: replayOrbit,
    img: '',
    credit: '',
    news: '',
    desc: '',
  }
}

describe('EventTargetSystem', () => {
  it('优先采用风险产品中的带时标名义轨迹', () => {
    const system = new EventTargetSystem(new THREE.Scene(), new THREE.Texture())
    const target = system.resolve(11, {
      replayEvent: event('replay'),
      replayOrbit,
      previewEvent: null,
      previewOrbit: null,
      nominalTrajectory: {
        points: [
          { jd: 10, centerEclipticAu: [1, 2, 3] },
          { jd: 12, centerEclipticAu: [3, 4, 5] },
        ],
      },
    })

    expect(target.worldPosition.toArray()).toEqual([2, 3, 4])
    expect(target.replayActive).toBe(true)
    expect(target.record?.id).toBe('replay')
  })

  it('名义轨迹超出窗口时降级到拟合轨道', () => {
    const system = new EventTargetSystem(new THREE.Scene(), new THREE.Texture())
    const jd = 2460000
    const expected = new THREE.Vector3()
    astPos(replayOrbit, jd, expected)

    const target = system.resolve(jd, {
      replayEvent: null,
      replayOrbit: null,
      previewEvent: event('preview'),
      previewOrbit: replayOrbit,
      nominalTrajectory: {
        points: [
          { jd: 10, centerEclipticAu: [1, 2, 3] },
          { jd: 12, centerEclipticAu: [3, 4, 5] },
        ],
      },
    })

    expect(target.worldPosition.distanceTo(expected)).toBeLessThan(1e-12)
    expect(target.replayActive).toBe(false)
    expect(target.previewOrbit).toBe(replayOrbit)
  })

  it('撞击特效完成后隐藏仿真天体', () => {
    const system = new EventTargetSystem(new THREE.Scene(), new THREE.Texture())
    const target = system.resolve(11, {
      replayEvent: event('impact'),
      replayOrbit,
      previewEvent: null,
      previewOrbit: null,
      nominalTrajectory: {
        points: [
          { jd: 10, centerEclipticAu: [1, 2, 3] },
          { jd: 12, centerEclipticAu: [3, 4, 5] },
        ],
      },
    })
    const update = {
      target,
      center: new THREE.Vector3(),
      rotationCos: 1,
      rotationSin: 0,
      sizeScale: 1,
      cameraPosition: new THREE.Vector3(0, 0, 10),
      pixelScale: 600,
      impactFinished: false,
    }

    system.updateVisual(update)
    expect(system.mesh.visible).toBe(true)
    system.updateVisual({ ...update, impactFinished: true })
    expect(system.mesh.visible).toBe(false)
  })
})
