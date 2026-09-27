import * as THREE from 'three'
import { describe, expect, it, vi } from 'vitest'
import type { RiskRenderer } from '../RiskRenderer'
import type { BPlaneScenePayload } from '../sceneProducts/types'
import type { SceneCameraRig } from './SceneCameraRig'
import { EventRiskSystem } from './EventRiskSystem'

const bPlane: BPlaneScenePayload = {
  designation: 'TEST',
  requestedEncounterJd: 2460000,
  closestJd: 2460000,
  closestDistanceKm: 8000,
  xiKm: 1200,
  zetaKm: -800,
  bMagnitudeKm: 1442,
  vinfKms: 12,
  effectiveImpactRadiusKm: 7000,
  bVectorEclipticKm: [1200, -800, 0],
  incomingDirectionEcliptic: [0, 0, -1],
  xiAxisEcliptic: [1, 0, 0],
  zetaAxisEcliptic: [0, 1, 0],
  source: 'nominal-nbody',
  propagationSource: 'ephemeris',
  orbitSolutionId: '1',
  requestedOrbitSolutionId: '1',
  orbitSolutionMatch: true,
}

function createHarness() {
  const renderer = {
    update: vi.fn(),
    viewHalfAu: vi.fn(() => 0.01),
    densityViewHalfAu: vi.fn(() => 0.005),
  } as unknown as RiskRenderer
  const cameraRig = { focus: vi.fn() } as unknown as SceneCameraRig
  const onFocus = vi.fn()
  const system = new EventRiskSystem({ renderer, cameraRig, onFocus })
  return { system, renderer, cameraRig, onFocus }
}

const layers = {
  showBPlane: true,
  showEncounterDensity: true,
  showUncertaintyTube: true,
}

describe('EventRiskSystem', () => {
  it('把风险产品固定在遭遇时刻地球，并且同一请求只取景一次', () => {
    const h = createHarness()
    const center = new THREE.Vector3(4, 5, 6)
    const update = {
      bPlane,
      uncertaintyTube: null,
      encounterDensity: null,
      focusRevision: 1,
      frame: 'geo' as const,
      center,
      rotationCos: 1,
      rotationSin: 0,
      layers,
    }

    h.system.update(update)
    h.system.update(update)

    const firstRender = vi.mocked(h.renderer.update).mock.calls[0]
    expect(firstRender[3]).toBe(firstRender[4])
    expect(h.cameraRig.focus).toHaveBeenCalledTimes(1)
    expect(h.onFocus).toHaveBeenCalledTimes(1)
  })

  it('日心参考系使用当前场景中心，缺少 B 平面时不触发取景', () => {
    const h = createHarness()
    const center = new THREE.Vector3(4, 5, 6)
    h.system.update({
      bPlane,
      uncertaintyTube: null,
      encounterDensity: null,
      focusRevision: 0,
      frame: 'helio',
      center,
      rotationCos: 1,
      rotationSin: 0,
      layers,
    })
    expect(vi.mocked(h.renderer.update).mock.calls[0][4]).toBe(center)

    h.system.update({
      bPlane: null,
      uncertaintyTube: null,
      encounterDensity: null,
      focusRevision: 2,
      frame: 'helio',
      center,
      rotationCos: 1,
      rotationSin: 0,
      layers,
    })
    expect(h.cameraRig.focus).not.toHaveBeenCalled()
  })
})
