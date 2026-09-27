import * as THREE from 'three'
import { terrainMaterial } from '../rendering/materials'
import type { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import type { GlobeTerrain } from './terrain.js'
import { A, fromECEF, toECEF, upAt } from './geo.js'
import { EARTH_REFERENCE_RADIUS, METERS_PER_AU, intersectEarth } from './coordinates'

export interface EarthSurfaceStatus {
  lon: number
  lat: number
  altitude: number
  clearance: number
  loading: number
  level: number
  cached: number
  error: boolean
}

export interface EarthAtmosphereState {
  altitude: number
  up: THREE.Vector3
  sunDirection: THREE.Vector3
}

/** 主场景中的地球表面：只增加地球子图层，不创建 renderer、画布或独立时钟。 */
export class EarthSurfaceSystem {
  groundNavigation = false
  status: EarthSurfaceStatus | null = null
  near: number | undefined
  readonly atmosphere: EarthAtmosphereState = {
    altitude: Infinity, up: new THREE.Vector3(0, 0, 1), sunDirection: new THREE.Vector3(1, 0, 0),
  }

  private terrain: GlobeTerrain | null = null
  private loading = false
  private disposed = false
  private loadError = false
  private enabled = true
  private wanted = false
  private lastWanted = 0
  private navigationResumeAt = 0
  private readonly position = new THREE.Vector3()
  private readonly rotation = new THREE.Quaternion()
  private readonly inverseRotation = new THREE.Quaternion()
  private scale = 1 / METERS_PER_AU
  private initialized = false
  private simulationFocus: { lon: number; lat: number; level?: number }[] = []
  private readonly localCamera = new THREE.PerspectiveCamera()
  private readonly sunDirection = { value: new THREE.Vector3(1, 0, 0) }
  private readonly surfaceOpacity = { value: 0 }
  private fireLight: THREE.PointLight | null = null
  private readonly flash = { firePosition: { value: new THREE.Vector3() }, fireIntensity: { value: 0 }, metresPerScene: { value: METERS_PER_AU } }
  private saved: { minDistance: number; maxPolarAngle: number; rotateSpeed: number; up: THREE.Vector3 } | null = null
  private scene: THREE.Scene
  private renderer: THREE.WebGLRenderer
  private camera: THREE.PerspectiveCamera
  private controls: OrbitControls
  private resetFollowing: () => void

  constructor(
    scene: THREE.Scene,
    renderer: THREE.WebGLRenderer,
    camera: THREE.PerspectiveCamera,
    controls: OrbitControls,
    resetFollowing: () => void,
  ) {
    this.scene = scene; this.renderer = renderer; this.camera = camera
    this.controls = controls; this.resetFollowing = resetFollowing
  }

  /** 先同步地球自转和参考系变换，再消费控制器输入，近景相机随地表运动。 */
  syncEarth(earth: THREE.Mesh, rotation: THREE.Quaternion, sun: THREE.Vector3, enabled: boolean): void {
    const nextScale = earth.scale.x / EARTH_REFERENCE_RADIUS
    if (this.initialized && this.groundNavigation) {
      const camera = this.toLocal(this.camera.position)
      const target = this.toLocal(this.controls.target)
      this.position.copy(earth.position)
      this.rotation.copy(rotation)
      this.inverseRotation.copy(rotation).invert()
      this.scale = nextScale
      this.camera.position.copy(this.toScene(camera))
      this.controls.target.copy(this.toScene(target))
      this.setUp(target)
    } else {
      this.position.copy(earth.position)
      this.rotation.copy(rotation)
      this.inverseRotation.copy(rotation).invert()
      this.scale = nextScale
    }
    this.initialized = true
    this.enabled = enabled
    this.sunDirection.value.copy(sun).sub(earth.position).normalize()
    if (this.terrain) {
      this.terrain.group.position.copy(this.position)
      this.terrain.group.quaternion.copy(rotation)
      this.terrain.group.scale.setScalar(this.scale)
    }
  }

  update(now: number, manualNavigation = true): void {
    this.flash.metresPerScene.value = 1 / this.scale
    this.flash.fireIntensity.value = this.fireLight ? this.fireLight.intensity / (this.scale * this.scale) : 0
    if (this.fireLight) this.fireLight.getWorldPosition(this.flash.firePosition.value).applyMatrix4(this.camera.matrixWorldInverse)
    let camera = this.toLocal(this.camera.position)
    let geo = fromECEF(camera)
    const distance = camera.length()
    const pixelRadius = A / Math.max(A, distance)
      * this.renderer.domElement.clientHeight / (2 * Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2)))
    const frustum = new THREE.Frustum().setFromProjectionMatrix(
      new THREE.Matrix4().multiplyMatrices(this.camera.projectionMatrix, this.camera.matrixWorldInverse),
      this.camera.coordinateSystem, this.camera.reversedDepth,
    )
    const inView = frustum.intersectsSphere(new THREE.Sphere(this.position, (A + 10000) * this.scale))
    // 屏幕投影触发加载，与事件、路由、固定落点无关。回退阈值略低，防止边缘反复启停。
    this.wanted = this.enabled && inView && pixelRadius > (this.wanted ? 80 : 120)
    this.surfaceOpacity.value = THREE.MathUtils.smoothstep(pixelRadius, 120, 380)
    if (this.wanted && !this.groundNavigation
      && this.controls.target.distanceTo(this.position) < A * this.scale * 0.25) {
      // 显示倍数可以小于 1，固定的天文机位下限不能挡住缩小后的地球。
      this.controls.minDistance = Math.min(this.controls.minDistance, (A + 100000) * this.scale)
    }
    if (this.wanted || this.simulationFocus.length) {
      this.lastWanted = now
      if (!this.terrain && !this.loading && !this.loadError) void this.loadTerrain()
    }

    if (!this.enabled || geo.height > 3000000) this.resetNavigation(true)
    if (manualNavigation && this.enabled && geo.height < this.height(geo.lon, geo.lat) + 30) {
      camera = toECEF(geo.lon, geo.lat, this.height(geo.lon, geo.lat) + 30)
      this.camera.position.copy(this.toScene(camera))
      geo = fromECEF(camera)
    }
    if (manualNavigation && this.enabled && !this.groundNavigation && now >= this.navigationResumeAt && geo.height < 1500000) {
      const direction = this.camera.getWorldDirection(new THREE.Vector3()).applyQuaternion(this.inverseRotation)
      const hit = intersectEarth(camera, direction)
      if (hit) this.enterSurface(hit)
    }
    if (this.groundNavigation) {
      const targetGeo = fromECEF(this.toLocal(this.controls.target))
      const targetHeight = this.height(targetGeo.lon, targetGeo.lat)
      const target = toECEF(targetGeo.lon, targetGeo.lat, targetHeight)
      const returnToGlobe = THREE.MathUtils.smoothstep(geo.height, 1500000, 3000000)
      this.controls.target.copy(this.toScene(target.clone().multiplyScalar(1 - returnToGlobe)))
      this.setUp(target)
      if (returnToGlobe && this.saved) {
        this.camera.up.lerp(this.saved.up, returnToGlobe).normalize()
        this.syncUp()
      }
      // 同一份高程采样用于绘制与碰撞，瓦片细化后抬升相机以免被山体吞没。
      const ground = this.height(geo.lon, geo.lat)
      if (geo.height < ground + 30) {
        camera = toECEF(geo.lon, geo.lat, ground + 30)
        this.camera.position.copy(this.toScene(camera))
        geo = fromECEF(camera)
      }
      this.controls.minDistance = 30 * this.scale
      this.controls.update()
    }

    // 天空取最终相机位置，不依赖瓦片就绪、地形开关或相机是否正对地球。
    geo = fromECEF(this.toLocal(this.camera.position))
    this.atmosphere.altitude = geo.height
    upAt(geo.lon, geo.lat, this.atmosphere.up).applyQuaternion(this.rotation)
    this.atmosphere.sunDirection.copy(this.sunDirection.value)

    const clearance = Math.max(1, geo.height - this.height(geo.lon, geo.lat))
    this.near = geo.height < 3000000
      ? Math.max(0.5, Math.min(clearance * 0.05, 10000)) * this.scale : undefined
    if (this.terrain) {
      // 完成地球底球到瓦片的淡入后进入不透明队列，建立地形深度后再叠加火焰/烟尘。
      this.terrain.setOpaque(this.surfaceOpacity.value >= .999)
      this.terrain.group.visible = this.wanted
      if (this.wanted || this.simulationFocus.length) {
        // 这台米制相机只用于瓦片选择，不提交渲染；画面始终由主相机生成。
        this.localCamera.position.copy(this.toLocal(this.camera.position))
        this.localCamera.quaternion.copy(this.inverseRotation).multiply(this.camera.quaternion)
        this.localCamera.fov = this.camera.fov
        this.localCamera.aspect = this.camera.aspect
        this.localCamera.near = Math.max(0.5, clearance * 0.05)
        this.localCamera.far = Math.max(50000000, distance * 2)
        this.localCamera.coordinateSystem = this.camera.coordinateSystem
        // 瓦片选择相机不提交渲染，使用自己的常规投影矩阵。
        this.localCamera.updateProjectionMatrix()
        this.terrain.update(this.localCamera, now)
      } else if (now - this.lastWanted > 8000 && this.terrain.stats.cached) {
        this.terrain.reset()
      }
    }
    const stats = this.terrain?.stats
    this.status = this.wanted ? {
      lon: geo.lon, lat: geo.lat, altitude: geo.height, clearance,
      loading: stats?.loading ?? (this.loading ? 1 : 0),
      level: stats?.maxLevel ?? 0, cached: stats?.cached ?? 0,
      error: this.loadError || !!stats?.failures,
    } : null
  }

  height(lon: number, lat: number): number {
    return this.terrain?.height(lon, lat)?.height ?? 0
  }

  sampleHeight(lon: number, lat: number, minLevel = 0) {
    return this.terrain?.height(lon, lat, minLevel) ?? null
  }

  prefetch(points: { lon: number; lat: number; level?: number }[]): void {
    this.simulationFocus = points
    this.terrain?.prefetch(points)
    if (points.length && !this.terrain && !this.loading) void this.loadTerrain()
  }

  setCrater(crater: { lon: number; lat: number; radius: number; depth: number } | null): void {
    this.terrain?.setCrater(crater)
  }

  setCraterProgress(value: number): void { this.terrain?.setCraterProgress(value) }
  setFireLight(light: THREE.PointLight | null): void { this.fireLight = light }

  private async loadTerrain(): Promise<void> {
    this.loading = true
    try {
      const { GlobeTerrain } = await import('./terrain.js')
      if (this.disposed) return
      this.terrain = new GlobeTerrain(this.renderer, map => {
        map.anisotropy = Math.min(8, this.renderer.capabilities.getMaxAnisotropy())
        const material = terrainMaterial(map, this.sunDirection, this.surfaceOpacity, this.flash)
        return material
      })
      this.terrain.group.position.copy(this.position)
      this.terrain.group.quaternion.copy(this.rotation)
      this.terrain.group.scale.setScalar(this.scale)
      this.terrain.prefetch(this.simulationFocus)
      this.scene.add(this.terrain.group)
    } catch (error) {
      this.loadError = true
      console.error('[地球地形]', error)
    } finally {
      this.loading = false
    }
  }

  private enterSurface(target: THREE.Vector3): void {
    this.saved = {
      minDistance: this.controls.minDistance, maxPolarAngle: this.controls.maxPolarAngle,
      rotateSpeed: this.controls.rotateSpeed, up: this.camera.up.clone(),
    }
    this.groundNavigation = true
    this.controls.target.copy(this.toScene(target))
    this.controls.minDistance = 30 * this.scale
    this.controls.maxPolarAngle = Math.PI * 0.495
    this.controls.rotateSpeed = 0.45
    this.setUp(target)
    this.controls.update()
  }

  resetNavigation(preserveView = false): void {
    if (!preserveView) this.navigationResumeAt = performance.now() + 1500
    if (!this.saved) return
    // 自动退出只保留相机位置，必须完整归还地心和原参考系的旋转轴。
    // 滚轮可能一帧跨过过渡区，不能依赖上一帧的渐变恰好到达终点。
    if (preserveView) this.controls.target.copy(this.position)
    this.controls.minDistance = preserveView
      ? Math.min(this.saved.minDistance, this.camera.position.distanceTo(this.controls.target) * 0.9)
      : this.saved.minDistance
    this.controls.maxPolarAngle = this.saved.maxPolarAngle
    this.controls.rotateSpeed = this.saved.rotateSpeed
    this.camera.up.copy(this.saved.up)
    this.syncUp()
    if (preserveView) {
      this.camera.lookAt(this.controls.target)
      this.camera.updateMatrixWorld()
    }
    this.saved = null
    this.groundNavigation = false
    this.resetFollowing()
  }

  captureNavigation(): () => void {
    const saved = this.saved, active = this.groundNavigation
    return () => { this.saved = saved; this.groundNavigation = active }
  }

  private setUp(target: THREE.Vector3): void {
    const { lon, lat } = fromECEF(target)
    this.camera.up.copy(upAt(lon, lat).applyQuaternion(this.rotation))
    this.syncUp()
  }

  private syncUp(): void {
    const controls = this.controls as unknown as { _quat: THREE.Quaternion; _quatInverse: THREE.Quaternion }
    controls._quat.setFromUnitVectors(this.camera.up, new THREE.Vector3(0, 1, 0))
    controls._quatInverse.copy(controls._quat).invert()
  }

  private toLocal(point: THREE.Vector3): THREE.Vector3 {
    return point.clone().sub(this.position).applyQuaternion(this.inverseRotation).divideScalar(this.scale)
  }

  private toScene(point: THREE.Vector3): THREE.Vector3 {
    return point.clone().multiplyScalar(this.scale).applyQuaternion(this.rotation).add(this.position)
  }

  dispose(): void {
    this.disposed = true
    this.terrain?.dispose()
  }
}
