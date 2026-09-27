import * as THREE from 'three'
import { describe, expect, it, vi } from 'vitest'
import { PLANETS } from '@/data/planets'
import type { AsteroidRecord } from '@/types/asteroid'
import type { AsteroidCloud } from '../AsteroidCloud'
import type { EarthSystem } from '../EarthSystem'
import type { PickingSystem } from '../PickingSystem'
import type { PlanetSystem } from '../PlanetSystem'
import type { SatelliteModel } from '../SatelliteModel'
import type { EventTargetSystem } from './EventTargetSystem'
import type { NamedAsteroidSystem } from './NamedAsteroidSystem'
import type { SceneCameraRig } from './SceneCameraRig'
import { SceneSelectionSystem } from './SceneSelectionSystem'

const asteroid: AsteroidRecord = {
  name: 'Test',
  en: 'Test',
  a: 1,
  e: 0.1,
  i: 1,
  O: 1,
  w: 1,
  M0: 1,
  diam: 10,
  cls: '近地小行星',
}

function createHarness() {
  const scene = new THREE.Scene()
  const camera = new THREE.PerspectiveCamera(45, 1, 1e-6, 100)
  camera.position.set(0, 0, 10)
  const planetSystem = {
    sunMesh: new THREE.Mesh(),
    moonMesh: new THREE.Mesh(),
    planetMeshes: PLANETS.map(() => new THREE.Mesh()),
  } as unknown as PlanetSystem
  const asteroidMesh = new THREE.Mesh(new THREE.SphereGeometry(1))
  asteroidMesh.position.set(1, 0, 0)
  const namedAsteroids = {
    meshes: [asteroidMesh],
    getMesh: vi.fn(() => asteroidMesh),
  } as unknown as NamedAsteroidSystem
  const eventMesh = new THREE.Mesh()
  const eventTarget = { mesh: eventMesh } as unknown as EventTargetSystem
  const groundRoot = new THREE.Group()
  groundRoot.visible = true
  const stationVisible = new THREE.Group()
  const stationHidden = new THREE.Group()
  stationHidden.visible = false
  const earthSystem = {
    groundRoot,
    stationObjects: [
      { grp: stationVisible },
      { grp: stationHidden },
    ],
  } as unknown as EarthSystem
  const satelliteModel = { satGroup: new THREE.Group() } as unknown as SatelliteModel
  const positions = new Float32Array([1, 2, 3])
  const asteroidCloud = {
    getPositions: vi.fn(() => positions),
  } as unknown as AsteroidCloud
  const pickingSystem = { setTargets: vi.fn() } as unknown as PickingSystem
  const cameraRig = {
    updateFollow: vi.fn(() => false),
    updateZoom: vi.fn(),
    startZoom: vi.fn(),
  } as unknown as SceneCameraRig
  const onFollowRequested = vi.fn()
  const onFollowLost = vi.fn()
  const system = new SceneSelectionSystem({
    scene,
    camera,
    canvas: { clientHeight: 1000 } as HTMLCanvasElement,
    cameraRig,
    pickingSystem,
    planetSystem,
    satelliteModel,
    earthSystem,
    namedAsteroids,
    asteroidCloud,
    eventTarget,
    onFollowRequested,
    onFollowLost,
  })
  return {
    system,
    pickingSystem,
    cameraRig,
    eventMesh,
    stationVisible,
    onFollowRequested,
    onFollowLost,
  }
}

const context = {
  asteroids: [asteroid],
  sizeScale: 1,
  eventDiameterKm: 100,
}

describe('SceneSelectionSystem', () => {
  it('复用拾取数组并只加入当前可见的动态目标', () => {
    const h = createHarness()
    h.eventMesh.visible = true
    h.system.refreshPickingTargets()
    const firstTargets = vi.mocked(h.pickingSystem.setTargets).mock.calls[0][0]
    const firstKinds = firstTargets.map((target) => target.kind)
    expect(firstKinds).toContain('station')
    expect(firstKinds).toContain('event')

    h.stationVisible.visible = false
    h.eventMesh.visible = false
    h.system.refreshPickingTargets()
    const secondTargets = vi.mocked(h.pickingSystem.setTargets).mock.calls[1][0]
    expect(secondTargets).toBe(firstTargets)
    expect(secondTargets.map((target) => target.kind)).not.toContain('station')
    expect(secondTargets.map((target) => target.kind)).not.toContain('event')
  })

  it('云粒子代理与当前云缓冲保持同帧位置', () => {
    const h = createHarness()
    const visual = h.system.updateVisual(
      { kind: 'cloud', idx: 0 },
      1000,
      true,
      600,
      context,
    )
    expect(h.system.cloudProxy.visible).toBe(true)
    expect(h.system.cloudProxy.position.toArray()).toEqual([1, 2, 3])
    expect(visual.selectedWorld).toBe(h.system.cloudProxy.position)
  })

  it('集中处理跟随丢失和近距观察请求', () => {
    const h = createHarness()
    vi.mocked(h.cameraRig.updateFollow).mockReturnValueOnce(true)
    h.system.updateCameraTracking({ kind: 'ast', idx: 0 }, true, 1000)
    expect(h.onFollowLost).toHaveBeenCalledOnce()

    h.system.zoomTo({ kind: 'ast', idx: 0 }, context)
    expect(h.onFollowRequested).toHaveBeenCalledOnce()
    expect(h.cameraRig.startZoom).toHaveBeenCalledOnce()
  })
})
