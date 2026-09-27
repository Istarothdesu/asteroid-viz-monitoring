import { describe, expect, it, vi } from 'vitest'
import type { Vector3 } from 'three'
import type { L1Reference, ObserverState } from '@/features/l1/types'
import type { AsteroidCloud } from '../AsteroidCloud'
import type { GroundSurveySystem } from '../GroundSurveySystem'
import type { SatelliteModel } from '../SatelliteModel'
import type { SurveySystem } from '../SurveySystem'
import { MissionLayerSystem } from './MissionLayerSystem'

const point = {} as Vector3

function createHarness(highlightCount = 0) {
  const colors = new Float32Array([0, 0, 0])
  const baseColors = new Float32Array([1, 1, 1])
  const survey = {
    coneAxis: point,
    coneRight: point,
    coneUp: point,
    setVisible: vi.fn(),
    configure: vi.fn(),
    setSphereR: vi.fn(),
    setSphereVisible: vi.fn(),
    setGratLabels: vi.fn(),
    setOccult: vi.fn(),
    setSunAvoid: vi.fn(),
    setAntiSunLimit: vi.fn(),
    setEarthAvoid: vi.fn(),
    setConeActive: vi.fn(),
    setConeVisible: vi.fn(),
    setFootprints: vi.fn(),
    update: vi.fn(),
    highlightGeometricSamples: vi.fn(() => highlightCount),
  } as unknown as SurveySystem
  const ground = {
    setOccult: vi.fn(),
    setSunAvoid: vi.fn(),
    setMoonAvoid: vi.fn(),
    setZodiacBand: vi.fn(),
    setGratLabels: vi.fn(),
    setSphereR: vi.fn(),
    update: vi.fn(),
  } as unknown as GroundSurveySystem
  const satellite = { setPointing: vi.fn() } as unknown as SatelliteModel
  const cloud = {
    baseCol: baseColors,
    getPositions: vi.fn(() => new Float32Array(3)),
    getColors: vi.fn(() => colors),
    getCount: vi.fn(() => 1),
    markColorsDirty: vi.fn(),
  } as unknown as AsteroidCloud
  const onCount = vi.fn()
  const system = new MissionLayerSystem({
    surveySystem: survey,
    groundSurveySystem: ground,
    satelliteModel: satellite,
    asteroidCloud: cloud,
    onGeometricSampleCount: onCount,
  })
  return { system, survey, ground, satellite, cloud, colors, baseColors, onCount }
}

const l1Layers = {
  sphereRadius: 0.2,
  showSphere: true,
  showGraticuleLabels: true,
  showOccultation: true,
  showSunAvoidance: false,
  showAntiSunLimit: true,
  showEarthAvoidance: false,
  showPlannedFootprints: true,
  showExposedFootprints: true,
}

describe('MissionLayerSystem', () => {
  it('将 L1 任务快照映射到渲染系统并发布几何样本数', () => {
    const h = createHarness(3)
    const reference = { profile: { instrument: {} } } as unknown as L1Reference
    const observer = {} as ObserverState

    h.system.updateL1({
      active: true,
      jd: 2460000,
      mission: { reference, observer, playback: null },
      layers: l1Layers,
      sunScenePosition: point,
      earthScenePosition: point,
      satelliteScenePosition: point,
    })

    expect(h.survey.setVisible).toHaveBeenCalledWith(true)
    expect(h.survey.setSphereR).toHaveBeenCalledWith(0.2)
    expect(h.survey.setAntiSunLimit).toHaveBeenCalledWith(true)
    expect(h.survey.setFootprints).toHaveBeenCalledWith(null, 2460000, true, true)
    expect(h.survey.update).toHaveBeenCalledWith(point, point, point, null)
    expect(h.onCount).toHaveBeenCalledWith(3)
  })

  it('退出 L1 模式时隐藏图层并恢复云粒子颜色', () => {
    const h = createHarness(2)
    const reference = { profile: { instrument: {} } } as unknown as L1Reference
    const observer = {} as ObserverState
    h.system.updateL1({
      active: true,
      jd: 2460000,
      mission: { reference, observer, playback: null },
      layers: l1Layers,
      sunScenePosition: point,
      earthScenePosition: point,
      satelliteScenePosition: point,
    })
    h.colors.fill(0)

    h.system.updateL1({
      active: false,
      jd: 2460001,
      mission: { reference: null, observer: null, playback: null },
      layers: l1Layers,
      sunScenePosition: point,
      earthScenePosition: point,
      satelliteScenePosition: point,
    })

    expect(h.survey.setVisible).toHaveBeenLastCalledWith(false)
    expect(h.colors).toEqual(h.baseColors)
    expect(h.onCount).toHaveBeenLastCalledWith(0)
  })

  it('仅在地面任务激活时更新地面天球', () => {
    const h = createHarness()
    const update = {
      active: false,
      layers: {
        sphereRadius: 0.3,
        showOccultation: true,
        showSunAvoidance: false,
        showMoonAvoidance: true,
        showZodiacBand: true,
        showGraticuleLabels: true,
      },
      sunScenePosition: point,
      earthScenePosition: point,
      moonScenePosition: point,
    }
    h.system.updateGround(update)
    expect(h.ground.update).not.toHaveBeenCalled()

    h.system.updateGround({ ...update, active: true })
    expect(h.ground.setSphereR).toHaveBeenCalledWith(0.3)
    expect(h.ground.update).toHaveBeenCalledWith(point, point, point)
  })
})
