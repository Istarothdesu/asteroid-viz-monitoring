import * as THREE from 'three'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { SceneEnvironmentSystem } from './SceneEnvironmentSystem'

const mocks = vi.hoisted(() => ({
  loadKtx2: vi.fn(),
}))

vi.mock('../textures', () => ({ loadKtx2: mocks.loadKtx2 }))
vi.mock('../utils', () => ({ withAniso: vi.fn() }))

describe('SceneEnvironmentSystem', () => {
  beforeEach(() => {
    mocks.loadKtx2.mockReset()
  })

  it('统一管理参考辅助线、天空背景与动态裁剪面', () => {
    const addEventListener = vi.fn()
    const removeEventListener = vi.fn()
    vi.stubGlobal('window', { addEventListener, removeEventListener })

    const canvas = { clientWidth: 1600, clientHeight: 900, height: 900 }
    const renderer = {
      domElement: canvas,
      setSize: vi.fn((_width: number, height: number) => { canvas.height = height }),
    } as unknown as THREE.WebGLRenderer
    const scene = new THREE.Scene()
    const camera = new THREE.PerspectiveCamera(45, 1, 1e-6, 2000)
    camera.position.set(0, 0, 10)
    const pixelScale = { value: 0 }
    const system = new SceneEnvironmentSystem(scene, camera, renderer, pixelScale)

    const grid = scene.children.find((child) => child.type === 'PolarGridHelper')!
    const axes = scene.children.find((child) => child.type === 'AxesHelper')!
    const sky = scene.children.find((child) => child.type === 'Mesh') as THREE.Mesh
    const stars = scene.children.find((child) => child.type === 'Points')!

    system.applyFrame('helio', true, true)
    expect(grid.visible).toBe(true)
    expect(axes.visible).toBe(false)

    system.applyFrame('geo', true, true)
    expect(grid.visible).toBe(false)
    expect(axes.visible).toBe(true)
    expect(axes.scale.x).toBeCloseTo(0.002)

    system.update({
      frame: 'geo',
      showGrid: true,
      showAxes: true,
      showSky: true,
      cameraTarget: new THREE.Vector3(),
    })
    expect(sky.visible).toBe(false)
    expect(stars.visible).toBe(true)
    expect(camera.near).toBeCloseTo(1e-4)
    expect(camera.far).toBe(3400)
    expect(renderer.setSize).toHaveBeenCalledWith(1600, 900, false)
    expect(pixelScale.value).toBeGreaterThan(0)

    const onTextureReady = mocks.loadKtx2.mock.calls[0][1]
    onTextureReady(new THREE.Texture())
    system.update({
      frame: 'geo',
      showGrid: true,
      showAxes: true,
      showSky: true,
      cameraTarget: new THREE.Vector3(),
    })
    expect(sky.visible).toBe(true)

    const earthAtmosphere = {
      altitude: 200,
      up: new THREE.Vector3(0, 0, 1),
      sunDirection: new THREE.Vector3(0, 0, 1),
    }
    const nearEarth = {
      frame: 'geo' as const, showGrid: false, showAxes: false, showSky: true,
      cameraTarget: new THREE.Vector3(), earthAtmosphere,
    }
    // 白天地面用近地天空，关掉发光壳和星点；夜间仍能看到星点。
    system.update(nearEarth)
    expect(sky.visible).toBe(true)
    expect(stars.visible).toBe(false)
    expect(system.atmosphereOpacity).toBe(0)
    earthAtmosphere.sunDirection.negate()
    system.update(nearEarth)
    expect(stars.visible).toBe(true)
    expect(system.atmosphereOpacity).toBe(0)

    earthAtmosphere.sunDirection.negate()
    earthAtmosphere.altitude = 85000
    system.update(nearEarth)
    const starOpacity = (stars as THREE.Points<THREE.BufferGeometry, THREE.PointsMaterial>).material.opacity
    expect(starOpacity).toBeGreaterThan(0)
    expect(starOpacity).toBeLessThan(1)
    expect(system.atmosphereOpacity).toBeGreaterThan(0)
    expect(system.atmosphereOpacity).toBeLessThan(1)
    earthAtmosphere.altitude = 200000
    system.update(nearEarth)
    expect(stars.visible).toBe(true)
    expect(system.atmosphereOpacity).toBe(1)

    // 星空图层开关不应把地面的蓝天一并关掉。
    earthAtmosphere.altitude = 200
    system.update({ ...nearEarth, showSky: false })
    expect(sky.visible).toBe(true)
    expect(stars.visible).toBe(false)

    system.dispose()
    const lateTexture = new THREE.Texture()
    const lateDispose = vi.spyOn(lateTexture, 'dispose')
    onTextureReady(lateTexture)
    expect(lateDispose).toHaveBeenCalledOnce()
    expect(addEventListener).toHaveBeenCalledWith('resize', expect.any(Function))
    expect(removeEventListener).toHaveBeenCalledWith('resize', expect.any(Function))
    vi.unstubAllGlobals()
  })
})
