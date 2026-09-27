import { describe, expect, it, vi } from 'vitest'
import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { EarthSurfaceSystem } from './EarthSurfaceSystem'
import { METERS_PER_AU, EARTH_REFERENCE_RADIUS } from './coordinates'
import { toECEF } from './geo.js'

function fixture() {
  const camera = new THREE.PerspectiveCamera(45, 1, 1e-9, 3400)
  camera.up.set(0, 0, 1)
  camera.position.copy(toECEF(116, 40, 100000)).divideScalar(METERS_PER_AU)
  camera.lookAt(0, 0, 0)
  camera.updateMatrixWorld()
  const controls = {
    target: new THREE.Vector3(), minDistance: 4.5e-5, maxPolarAngle: Math.PI, rotateSpeed: 1,
    _quat: new THREE.Quaternion(), _quatInverse: new THREE.Quaternion(),
    update: () => { camera.lookAt(controls.target); camera.updateMatrixWorld() },
  }
  const system = new EarthSurfaceSystem(new THREE.Scene(), {
    domElement: { clientHeight: 720 },
  } as THREE.WebGLRenderer, camera, controls as unknown as OrbitControls, vi.fn())
  // 本测试只验证坐标/相机和回收策略，瓦片网络不进入单元测试。
  const terrain = {
    group: new THREE.Group(), height: () => ({ height: 2100 }),
    update: vi.fn(), reset: vi.fn(), dispose: vi.fn(), setOpaque: vi.fn(),
    stats: { cached: 20, visible: 4, maxLevel: 14, loading: 0, failures: 0 },
  }
  Object.assign(system, { terrain })
  const earth = new THREE.Mesh()
  earth.scale.setScalar(EARTH_REFERENCE_RADIUS / METERS_PER_AU)
  const rotation = new THREE.Quaternion()
  const sun = new THREE.Vector3(1, 0, 0)
  return { camera, controls, system, earth, rotation, sun, terrain }
}

describe('主场景地表浏览', () => {
  it('缩小天体显示倍数后，仍能跨过原来的天文缩放下限接近地表', () => {
    const f = fixture()
    f.earth.scale.multiplyScalar(0.2)
    f.camera.position.copy(toECEF(116, 40, 5000000)).multiplyScalar(0.2 / METERS_PER_AU)
    f.controls.update()
    f.system.syncEarth(f.earth, f.rotation, f.sun, true)
    f.system.update(2000)
    expect(f.system.groundNavigation).toBe(false)
    expect(f.controls.minDistance).toBeLessThan(0.00001)
  })
  it('从现有相机接入地表；地球平移、自转后经纬度与离地高度保持不变', () => {
    const f = fixture()
    f.system.syncEarth(f.earth, f.rotation, f.sun, true)
    f.system.update(2000)
    expect(f.system.groundNavigation).toBe(true)
    const before = { ...f.system.status! }
    f.earth.position.set(1.2, -0.5, 0.1)
    f.rotation.setFromAxisAngle(new THREE.Vector3(0, 0, 1), 1.1)
    f.system.syncEarth(f.earth, f.rotation, f.sun, true)
    f.controls.update()
    f.system.update(2100)
    expect(f.system.status!.lon).toBeCloseTo(before.lon, 5)
    expect(f.system.status!.lat).toBeCloseTo(before.lat, 5)
    expect(f.system.status!.clearance).toBeCloseTo(before.clearance, 1)
    expect(f.terrain.update).toHaveBeenCalledTimes(2)
  })
  it('以已加载高程阻止穿地，并使用米级近裁剪面', () => {
    const f = fixture()
    f.camera.position.copy(toECEF(116, 40, 2200)).divideScalar(METERS_PER_AU)
    f.system.syncEarth(f.earth, f.rotation, f.sun, true)
    f.system.update(2000)
    f.camera.position.copy(toECEF(116, 40, 100)).divideScalar(METERS_PER_AU)
    f.system.update(2100)
    expect(f.system.status!.clearance).toBeCloseTo(30, 4)
    expect(f.system.near! * METERS_PER_AU).toBeCloseTo(1.5, 4)
  })
  it.each([
    ['逐步拉远', [2000000, 2800000, 4000000]],
    ['快速拉远', [8000000]],
  ] as const)('%s退出地表后，仍绕地心和原参考系的轴旋转', (_, heights) => {
    const f = fixture()
    // 使用真实控制器验证旋转行为；地球不在原点时也应围绕当前地心。
    f.earth.position.set(0.8, -0.3, 0.1)
    f.camera.position.add(f.earth.position)
    const controls = new OrbitControls(f.camera)
    controls.target.copy(f.earth.position)
    controls.update()
    f.camera.updateMatrixWorld()
    Object.assign(f.system, { controls })
    const originalUp = f.camera.up.clone()
    f.system.syncEarth(f.earth, f.rotation, f.sun, true)
    f.system.update(2000)
    expect(f.system.groundNavigation).toBe(true)

    for (const height of heights) {
      f.camera.position.copy(toECEF(116, 40, height)).divideScalar(METERS_PER_AU).add(f.earth.position)
      f.system.syncEarth(f.earth, f.rotation, f.sun, true)
      controls.update()
      f.system.update(2100)
    }
    expect(f.system.groundNavigation).toBe(false)
    expect(controls.target.distanceTo(f.earth.position)).toBeLessThan(1e-12)
    expect(f.camera.up.distanceTo(originalUp)).toBeLessThan(1e-12)
    const before = f.camera.position.clone().sub(f.earth.position)
    controls.rotateLeft(0.2)
    const expected = before.applyAxisAngle(originalUp, -0.2).add(f.earth.position)
    expect(f.camera.position.distanceTo(expected)).toBeLessThan(1e-12)
  })
  it('拉远时停止调度，等待回看窗口后释放瓦片，保留主场景', () => {
    const f = fixture()
    f.system.syncEarth(f.earth, f.rotation, f.sun, true)
    f.system.update(2000)
    f.camera.position.set(0, 0, 0.1)
    f.controls.update()
    f.system.update(2100)
    expect(f.system.groundNavigation).toBe(false)
    expect(f.system.status).toBeNull()
    expect(f.terrain.reset).not.toHaveBeenCalled()
    f.system.update(12000)
    expect(f.terrain.reset).toHaveBeenCalledOnce()
    expect(f.terrain.group.visible).toBe(false)
  })
})
