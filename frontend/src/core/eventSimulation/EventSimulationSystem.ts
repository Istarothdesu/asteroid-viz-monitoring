import * as THREE from 'three'
import type { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { useEventSimulationStore } from '@/store/eventSimulationStore'
import { useSimStore } from '@/store/simStore'
import { createEvent } from './event.js'
import { EventCamera } from './camera.js'
import { EventEffects } from './effects.js'
import type { ImpactConfig, ImpactEvent } from './types'
import type { SimulationWorld } from './world'
import { EarthSurfaceSystem } from '../terrain/EarthSurfaceSystem'
import { toECEF } from '../terrain/geo.js'
import { EARTH_REFERENCE_RADIUS } from '../terrain/coordinates'

export class EventSimulationSystem {
  private root = new THREE.Group()
  private proxyCamera = new THREE.PerspectiveCamera()
  private proxyTarget = new THREE.Vector3()
  private ambient = new THREE.AmbientLight(0xc1d5ec, 1.2)
  private origin = new THREE.Vector3()
  private config: ImpactConfig | null = null
  private event: ImpactEvent | null = null
  private effects: EventEffects | null = null
  private director: EventCamera | null = null
  private preparingSince = 0
  private wasActive = false
  private restorePending = false
  private restoreNavigation: (() => void) | null = null
  private saved: { position: THREE.Vector3; target: THREE.Vector3; up: THREE.Vector3; fov: number;
    minDistance: number; maxDistance: number; maxPolarAngle: number; rotateSpeed: number } | null = null
  private preparationEvent: ImpactEvent | null = null
  private scene: THREE.Scene
  private camera: THREE.PerspectiveCamera
  private controls: OrbitControls
  private surface: EarthSurfaceSystem
  private world: SimulationWorld

  constructor(scene: THREE.Scene, renderer: THREE.WebGLRenderer,
    camera: THREE.PerspectiveCamera, controls: OrbitControls,
    surface: EarthSurfaceSystem) {
    this.scene = scene; this.camera = camera; this.controls = controls; this.surface = surface
    this.root.name = 'event-simulation'
    this.world = {
      scene: this.root, renderer, origin: this.origin, camera: this.proxyCamera,
      controls: { target: this.proxyTarget, update() {} }, ambient: this.ambient,
      terrain: { height: (...args) => surface.sampleHeight(...args), setCraterProgress: value => surface.setCraterProgress(value) },
      positionAt: (lon, lat, height) => toECEF(lon, lat, height).sub(this.origin),
      setCamera: (position, target, up, fov) => {
        camera.position.copy(this.root.localToWorld(position.clone()))
        controls.target.copy(this.root.localToWorld(target.clone()))
        camera.up.copy(up).applyQuaternion(this.root.quaternion).normalize()
        camera.fov = fov; camera.updateProjectionMatrix()
        camera.lookAt(controls.target); camera.updateMatrixWorld()
        this.syncControlUp()
      },
    }
    controls.addEventListener('start', this.onInteraction)
  }

  private onInteraction = () => {
    if (useEventSimulationStore.getState().activeEvent && this.event) {
      useEventSimulationStore.getState().setView('free')
    }
  }

  /** 在切换参考系之前保存原机位，结束时等参考系恢复后再归还机位。 */
  syncSession(now: number): void {
    const state = useEventSimulationStore.getState(), active = !!state.activeEvent
    if (active && !this.wasActive) {
      this.restoreNavigation = this.surface.captureNavigation()
      this.saved = { position: this.camera.position.clone(), target: this.controls.target.clone(),
        up: this.camera.up.clone(), fov: this.camera.fov, minDistance: this.controls.minDistance,
        maxDistance: this.controls.maxDistance, maxPolarAngle: this.controls.maxPolarAngle,
        rotateSpeed: this.controls.rotateSpeed }
      this.surface.resetNavigation()
    }
    if (!active && this.wasActive) {
      this.clearEffects(); this.restorePending = state.restoreCamera
      if (!state.restoreCamera) {
        this.surface.resetNavigation()
        // 跨页面由目的地决定机位，但仍须归还仿真借用的镜头与交互参数。
        if (this.saved) {
          const s = this.saved
          this.camera.fov = s.fov; this.camera.updateProjectionMatrix()
          this.controls.minDistance = s.minDistance; this.controls.maxDistance = s.maxDistance
          this.controls.maxPolarAngle = s.maxPolarAngle; this.controls.rotateSpeed = s.rotateSpeed
        }
        this.saved = null; this.restoreNavigation = null
      }
    }
    this.wasActive = active
    if (active && state.config !== this.config) {
      this.clearEffects(); this.config = state.config
      if (this.config) {
        const rough = this.preparationEvent = createEvent(this.config, 0)
        this.surface.prefetch([{ ...this.config, level: 14 }, { ...rough.observer, level: 14 }])
        this.preparingSince = now
      }
    }
  }

  update(jd: number, now: number, earth: THREE.Mesh, earthRotation: THREE.Quaternion): void {
    if (this.restorePending) {
      this.restorePending = false
      this.surface.resetNavigation()
      if (this.saved) {
        const s = this.saved
        this.camera.position.copy(s.position); this.camera.up.copy(s.up); this.camera.fov = s.fov
        this.camera.updateProjectionMatrix(); this.controls.target.copy(s.target)
        this.controls.minDistance = s.minDistance; this.controls.maxDistance = s.maxDistance
        this.controls.maxPolarAngle = s.maxPolarAngle; this.controls.rotateSpeed = s.rotateSpeed
        this.syncControlUp(); this.camera.lookAt(s.target); this.camera.updateMatrixWorld()
      }
      this.saved = null
      this.restoreNavigation?.(); this.restoreNavigation = null
    }
    if (!this.config) return
    const scale = earth.scale.x / EARTH_REFERENCE_RADIUS
    if (!this.event) {
      const height = this.surface.sampleHeight(this.config.lon, this.config.lat, 13)
      const location = this.preparationEvent!.observer
      const observer = this.surface.sampleHeight(location.lon, location.lat, 13)
      if (!height || !observer) {
        if (now - this.preparingSince > 30000 && useEventSimulationStore.getState().preparation !== 'error') {
          useEventSimulationStore.setState({ preparation: 'error', message: '落点高程或影像仍未就绪，请检查地形服务后重试。' })
        }
        return
      }
      const rough = createEvent(this.config, height.height)
      this.event = rough; this.origin.copy(rough.frame.origin)
      this.scene.add(this.root); this.scene.add(this.ambient)
      this.surface.setCrater(rough.crater)
      this.effects = new EventEffects(this.world, rough)
      this.surface.setFireLight(this.effects.fireLight)
      this.director = new EventCamera(this.world, rough)
      // 连同隐藏尾焰预编译，避免首播进入大气时才临时编译材质。
      this.world.renderer.compile(this.scene, this.camera)
      this.controls.minDistance = 2 * scale
      this.controls.maxPolarAngle = Math.PI
      this.controls.rotateSpeed = .45
      const store = useEventSimulationStore.getState(), sim = useSimStore.getState()
      const start = store.jdEnc - rough.impactTime / 86400
      sim.setSimulationRange(start, start + rough.duration / 86400)
      sim.setJD(start); sim.setPlayRate(8); sim.setPlaying(true)
      useEventSimulationStore.setState({ session: rough, endJD: start + rough.duration / 86400,
        preparation: 'ready', message: '参数化演示轨迹与视觉效果；不代表大气解算或灾害预测结果。' })
      jd = start
    }
    this.root.position.copy(this.origin).multiplyScalar(scale).applyQuaternion(earthRotation).add(earth.position)
    this.root.quaternion.copy(earthRotation); this.root.scale.setScalar(scale); this.root.updateMatrixWorld(true)
    this.proxyCamera.position.copy(this.root.worldToLocal(this.camera.position.clone()))
    this.proxyCamera.up.copy(this.camera.up).applyQuaternion(earthRotation.clone().invert())
    this.proxyCamera.fov = this.camera.fov
    this.proxyTarget.copy(this.root.worldToLocal(this.controls.target.clone()))
    const state = useEventSimulationStore.getState()
    const t = Math.max(0, Math.min(this.event.duration, (jd - state.jdEnc) * 86400 + this.event.impactTime))
    if (this.director!.mode !== state.view) {
      if (state.view !== 'free') this.surface.resetNavigation()
      this.director!.setMode(state.view)
    }
    if (state.view !== 'free') this.director!.update(t, now)
    this.proxyCamera.position.copy(this.root.worldToLocal(this.camera.position.clone()))
    this.proxyCamera.fov = this.camera.fov
    this.effects!.update(t)
    // 光强按距离平方换算；PointLight.distance 不随父 Group 缩放。
    this.effects!.fireLight.intensity *= scale * scale
    this.effects!.fireLight.distance = 16000 * scale
    const phase = t < this.event.impactTime ? 'approach' : t < this.event.impactTime + 5 ? 'impact' : 'aftermath'
    if (state.phase !== phase) state.setPhase(phase)
  }

  get ownsCamera() { return !!this.event && useEventSimulationStore.getState().view !== 'free' }

  private syncControlUp() {
    const controls = this.controls as unknown as { _quat: THREE.Quaternion; _quatInverse: THREE.Quaternion }
    controls._quat.setFromUnitVectors(this.camera.up, new THREE.Vector3(0, 1, 0))
    controls._quatInverse.copy(controls._quat).invert()
  }

  private clearEffects() {
    this.effects?.dispose(); this.effects = null; this.director = null; this.event = null; this.config = null
    this.preparationEvent = null
    this.surface.setCrater(null); this.surface.prefetch([])
    this.surface.setFireLight(null)
    this.root.removeFromParent(); this.ambient.removeFromParent()
  }

  dispose() { this.clearEffects(); this.controls.removeEventListener('start', this.onInteraction) }
}
