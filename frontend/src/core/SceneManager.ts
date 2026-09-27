import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { gmstRad } from '@/utils/orbital/time'
import { AU_KM } from '@/utils/orbital/constants'
import { displayRadius } from './utils'
import { initKtx2 } from './textures'
import { PlanetSystem } from './PlanetSystem'
import { AsteroidCloud } from './AsteroidCloud'
import { OrbitRenderer } from './OrbitRenderer'
import { EarthSystem } from './EarthSystem'
import { SatelliteModel } from './SatelliteModel'
import { PickingSystem } from './PickingSystem'
import { SurveySystem } from './SurveySystem'
import { GroundSurveySystem } from './GroundSurveySystem'
import { EventSimulationSystem } from './eventSimulation/EventSimulationSystem'
import { playbackRate } from './eventSimulation/event.js'
import { captureTopicTime, useEventSimulationStore } from '@/store/eventSimulationStore'
import { RiskRenderer } from './RiskRenderer'
import { EventRiskSystem } from './sceneRuntime/EventRiskSystem'
import {
  EventTargetSystem,
  type ResolvedEventTarget,
} from './sceneRuntime/EventTargetSystem'
import { MissionLayerSystem } from './sceneRuntime/MissionLayerSystem'
import { NamedAsteroidSystem } from './sceneRuntime/NamedAsteroidSystem'
import { SceneCameraRig } from './sceneRuntime/SceneCameraRig'
import { SceneEnvironmentSystem } from './sceneRuntime/SceneEnvironmentSystem'
import { SceneReferenceFrameSystem } from './sceneRuntime/SceneReferenceFrameSystem'
import {
  SceneRuntimeState,
  type SceneRuntimeFrame,
} from './sceneRuntime/SceneRuntimeState'
import { SceneSelectionSystem } from './sceneRuntime/SceneSelectionSystem'
import {
  SceneLabelSystem,
  type SceneLabelPosition,
} from './sceneRuntime/SceneLabelSystem'
import { SimulationClock } from './sceneRuntime/SimulationClock'
import { CleanupRegistry, disposeObjectTree } from './sceneRuntime/objectUtils'
import { ScenePostProcessing } from './rendering/ScenePostProcessing'
import { EarthSurfaceSystem } from './terrain/EarthSurfaceSystem'
import type { FrameType } from '@/types/scene'
import type { FitResult } from '@/utils/orbital/fitEncounter'

/* 坐标系元数据 (标准机位 / 环绕轴 / 缩放限幅 / 世界中心天体) 统一取自
   frameStore.FRAME_INFO —— "默认机位"只有一个权威定义 */

// Module-level ref so LabelsOverlay can access the active scene
export const sceneRef = { current: null as SceneManager | null }

interface SceneFrameContext {
  now: number
  dt: number
  jd: number
  state: SceneRuntimeFrame
  frame: FrameType
  resolvedEvent: ResolvedEventTarget
  replayActive: boolean
  replayOrbit: FitResult | null
  previewOrbit: FitResult | null
  earthWorldPosition: THREE.Vector3
  center: THREE.Vector3
  rotationCos: number
  rotationSin: number
}

export class SceneManager {
  private renderer!: THREE.WebGLRenderer
  private scene!: THREE.Scene
  private camera!: THREE.PerspectiveCamera
  private controls!: InstanceType<typeof OrbitControls>
  private cameraRig!: SceneCameraRig

  private planetSys!: PlanetSystem
  private asteroidCloud!: AsteroidCloud
  private orbitRenderer!: OrbitRenderer
  private riskRenderer!: RiskRenderer
  private eventRisk!: EventRiskSystem
  private namedAsteroids!: NamedAsteroidSystem
  private eventTarget!: EventTargetSystem
  private selectionSystem!: SceneSelectionSystem
  private labelSystem!: SceneLabelSystem
  private missionLayers!: MissionLayerSystem
  private environment!: SceneEnvironmentSystem
  private earthSys!: EarthSystem
  private earthSurface!: EarthSurfaceSystem
  private satelliteModel!: SatelliteModel
  private picking!: PickingSystem
  private surveySys!: SurveySystem
  private groundSurvey!: GroundSurveySystem

  private readonly uPxScale = { value: 600 }
  private readonly referenceFrame = new SceneReferenceFrameSystem()
  private readonly runtimeState = new SceneRuntimeState()
  private readonly cleanup = new CleanupRegistry()

  private eventSimulation!: EventSimulationSystem
  private post!: ScenePostProcessing

  private _disposed = false
  /** WebGL 渲染器是否已创建。 */
  private _initDone = false
  /** 首帧已实际提交渲染: SceneCanvas 遮罩以此为准收尾, 避免遮罩先行消失后露出未就绪画面 */
  firstFrameDone = false
  private animId = 0
  private last = 0
  private needsRefresh = true
  // liveJd: plain JS object updated every frame — zero React overhead.
  // React components poll via setInterval(250ms) using useLiveJd(), completely decoupled from rAF.
  // Zustand jd is only written on pause or external seek — no React scheduler interference.
  private readonly simulationClock = new SimulationClock()
  readonly liveJd = this.simulationClock.liveJd

  private _lastCompIdx = 0
  private _lastPreviewEl: FitResult | null = null
  private wasSimulating = false

  async init(canvas: HTMLCanvasElement): Promise<void> {
    if (!this._initializeRenderer(canvas)) return
    initKtx2(this.renderer)
    this._initializeScene(canvas)
    this._initializeSystems(canvas)
    this.post = new ScenePostProcessing(this.renderer, this.scene, this.camera)
    this.cleanup.add(() => this.post.dispose())
    this._bindInteractions()

    this._setFrame('helio')
    this.last = performance.now()
    this.animId = requestAnimationFrame(this._animate)
  }

  private _initializeRenderer(canvas: HTMLCanvasElement): boolean {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance', reversedDepthBuffer: true })
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2))
    this.renderer.setClearColor(0x000000, 1)
    this.renderer.outputColorSpace = THREE.SRGBColorSpace
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping
    this.renderer.toneMappingExposure = 1.8
    // 主场景是 AU 制，log(1 + 深度) 不适合近地小数；反向深度配合动态裁剪面。
    // WebGLRenderer 在 CPU 计算 modelViewMatrix，保留近地坐标精度。
    this._initDone = true
    if (this._disposed) { this.renderer.dispose(); return false }
    return true
  }

  private _initializeScene(canvas: HTMLCanvasElement): void {
    sceneRef.current = this
    this.scene = new THREE.Scene()
    /* 显式黑背景兜底: 天空盒贴图异步加载期间无物体覆盖的区域不再依赖清屏色, 白屏双重保险 */
    this.scene.background = new THREE.Color(0x000000)
    this.camera = new THREE.PerspectiveCamera(45, canvas.clientWidth / canvas.clientHeight, 1e-6, 2000)
    this.camera.position.set(0, -6, 14)

    this.controls = new OrbitControls(this.camera, canvas)
    this.controls.enableDamping = true
    this.controls.dampingFactor = 0.06
    this.controls.minDistance = 0.02
    this.controls.maxDistance = 1500
    this.cameraRig = new SceneCameraRig(this.camera, this.controls)
    this.cleanup.add(() => this.controls.dispose())
    /* 用户手动交互 (拖拽/滚轮) 立即中断近距观测推近, 交还控制权 */
    this.controls.addEventListener('start', () => this.cameraRig.cancelZoom())

    this.environment = new SceneEnvironmentSystem(
      this.scene,
      this.camera,
      this.renderer,
      this.uPxScale,
    )
    this.cleanup.add(() => this.environment.dispose())
  }

  private _initializeSystems(canvas: HTMLCanvasElement): void {
    this.planetSys = new PlanetSystem(this.scene)
    this.earthSurface = new EarthSurfaceSystem(this.scene, this.renderer, this.camera, this.controls,
      () => this.cameraRig.resetFollowing())
    this.cleanup.add(() => this.earthSurface.dispose())
    this.asteroidCloud = new AsteroidCloud(this.scene, this.uPxScale)
    this.orbitRenderer = new OrbitRenderer(this.scene)
    this.cleanup.add(() => this.orbitRenderer.dispose())
    this.riskRenderer = new RiskRenderer(this.scene)
    this.cleanup.add(() => this.riskRenderer.dispose())
    this.eventRisk = new EventRiskSystem({
      renderer: this.riskRenderer,
      cameraRig: this.cameraRig,
      onFocus: () => {
        this.runtimeState.setFollowRequested(false)
        this.needsRefresh = true
      },
    })
    this.earthSys = new EarthSystem(this.scene)
    this.satelliteModel = new SatelliteModel(this.scene)
    // Survey systems — must come after satGroup and groundRoot are created
    this.surveySys = new SurveySystem(this.satelliteModel.satGroup)
    this.groundSurvey = new GroundSurveySystem(this.earthSys.groundRoot)
    this.missionLayers = new MissionLayerSystem({
      surveySystem: this.surveySys,
      groundSurveySystem: this.groundSurvey,
      satelliteModel: this.satelliteModel,
      asteroidCloud: this.asteroidCloud,
      onGeometricSampleCount: (count) => {
        this.runtimeState.setSurveyGeometricCount(count)
      },
    })
    this.namedAsteroids = new NamedAsteroidSystem(
      this.scene,
      this.runtimeState.initialAsteroids,
    )
    /* 后端真实数据 (MPCORB 云带抽样) 到达时重建小行星云;
       命名小行星列表长度不变、索引稳定, 每帧从 store 现读即可 */
    this.cleanup.add(
      this.runtimeState.subscribeCloudSeeds((seeds) => this.asteroidCloud.rebuild(seeds)),
    )
    this.eventTarget = new EventTargetSystem(this.scene)
    this.picking = new PickingSystem(this.camera, canvas)
    this.cleanup.add(() => this.picking.dispose())
    this.selectionSystem = new SceneSelectionSystem({
      scene: this.scene,
      camera: this.camera,
      canvas,
      cameraRig: this.cameraRig,
      pickingSystem: this.picking,
      planetSystem: this.planetSys,
      satelliteModel: this.satelliteModel,
      earthSystem: this.earthSys,
      namedAsteroids: this.namedAsteroids,
      asteroidCloud: this.asteroidCloud,
      eventTarget: this.eventTarget,
      onFollowRequested: () => {
        this.runtimeState.setFollowRequested(true)
      },
      onFollowLost: () => this.runtimeState.setFollowRequested(false),
    })
    this.labelSystem = new SceneLabelSystem({
      camera: this.camera,
      planetSystem: this.planetSys,
      satelliteModel: this.satelliteModel,
      surveySystem: this.surveySys,
      groundSurveySystem: this.groundSurvey,
      earthSystem: this.earthSys,
      riskRenderer: this.riskRenderer,
      namedAsteroids: this.namedAsteroids,
      asteroidCloud: this.asteroidCloud,
      cloudSelectionProxy: this.selectionSystem.cloudProxy,
      eventMesh: this.eventTarget.mesh,
    })
    this.eventSimulation = new EventSimulationSystem(this.scene, this.renderer, this.camera, this.controls, this.earthSurface)
    this.cleanup.add(() => this.eventSimulation.dispose())
  }

  private _bindInteractions(): void {
    this.picking.onSelect = (target) => {
      if (!useEventSimulationStore.getState().activeEvent) this.runtimeState.applyPickedTarget(target)
    }
    // Ctrl/Meta+点击: 拾取小行星云最近粒子 (主动观测入口)
    this.picking.onPickCloud = (x, y, w, h) =>
      this.asteroidCloud.pick(x, y, w, h, this.camera)
    this.orbitRenderer.setCloud(this.asteroidCloud)
  }

  private _setFrame(f: FrameType): void {
    this.earthSurface?.resetNavigation()
    /* 不在此处解除跟随: 本方法由动画循环在换帧的下一帧执行, 若在这里清
       followRequest, 会吞掉调用方 (路由意图 / 伴飞切换) 同步写入的跟随请求 ——
       表现为从地心系页面进入小行星专题时自动聚焦跟随失效。
       "换帧即解除跟随"改由显式动作承担: FrameSwitcher 点击 / requestReset /
       requestRecenter / 仿真开始 / 用户点「停止跟随」 */
    this.cameraRig.setFrame(f)
    if (f === 'comp') {
      // 伴飞系: 相机距离随目标尺寸自适应, 避免进入天体内部
      this._resetCompCamera()
    }
    const layers = this.runtimeState.frameLayerVisibility()
    this.environment.applyFrame(f, layers.showGrid, layers.showAxes)
    this.needsRefresh = true
  }

  // 当前伴飞中心天体的显示半径 (与渲染循环中的缩放规则一致: 真实半径×尺寸倍数)
  private _compCenterRadius(): number {
    const companion = this.runtimeState.companionDisplay()
    return Math.max(companion.diameterKm / 2 / AU_KM * companion.sizeScale, 1e-6)
  }

  // 伴飞目标切换时相机复位 (不改变坐标系本身)
  private _resetCompCamera(): void {
    const r = this._compCenterRadius()
    this.cameraRig.resetCompCamera(r)
    this.environment.setCompAxisScale(Math.max(2e-4, r * 0.8))
    this.needsRefresh = true
  }

  /* 视角回中 (相机层动作, 由 cameraStore.recenterTick 触发):
     只把注视点拉回世界中心 —— 所有天体位置每帧都减去 CENTER, 故任意坐标系下
     (0,0,0) 恒为"中心天体", 回中在四系下语义一致 (日心系=回到绕太阳旋转)。
     相机位置/距离/方位全部保留, 不丢用户已调好的取景 */
  private _recenter(): void {
    this.earthSurface.resetNavigation()
    this.cameraRig.recenter()
    this.needsRefresh = true
  }

  /* 事件专题预览取景: 相机移到目标天体上骑乘 (保持当前视线方向) 并开启跟随,
     取景距离以飞掠脱靶距离为准 (间隙可入画), 撞击按地球半径倍数;
     同步放宽缩近下限允许近距观察 —— 日心全景视距下飞掠间隙亚像素,
     天体看似静止粘在地球旁, 只有骑乘近景才能看到接近/飞掠过程与真实间隙 */
  private _framePreviewTarget(): void {
    this.earthSurface.resetNavigation()
    const preview = this.runtimeState.previewCamera()
    const rec = preview.record
    if (!rec || !preview.orbit) return
    const rE = displayRadius(6371, preview.sizeScale)
    const missAU = (rec.missKm ?? 0) / AU_KM
    const dist = rec.type === 'flyby'
      ? Math.min(Math.max(missAU * 5, rE * 10), 0.06)
      : Math.min(rE * 12, 0.06)
    this.cameraRig.frameMovingTarget(
      this.eventTarget.worldPosition,
      dist,
      Math.max(rE * 1.5, 1e-6),
    )
    /* 开启跟随: 后续每帧骑乘目标天体平移, 保持视线方向/取景距离不变 */
    this.runtimeState.setFollowRequested(true)
  }

  private _animate = (timestamp: number): void => {
    if (this._disposed) return
    this.animId = requestAnimationFrame(this._animate)
    const now = timestamp
    const dt = Math.min((now - this.last) / 1000, 0.1)
    this.last = now

    const frame = this._prepareFrame(now, dt)
    this._updateCelestialScene(frame)
    this._updateOperationalLayers(frame)
    this._updateInteraction(frame)

    if (useEventSimulationStore.getState().config) this.renderer.render(this.scene, this.camera)
    else this.post.render()
    this.firstFrameDone = true
    this.needsRefresh = false
  }

  /** 读取一次业务快照并解析当前参考系，后续阶段共享同一帧上下文。 */
  private _prepareFrame(now: number, dt: number): SceneFrameContext {
    const simulating = !!useEventSimulationStore.getState().activeEvent
    if (simulating !== this.wasSimulating) {
      if (simulating) captureTopicTime(this.liveJd.value)
      this.cameraRig.cancelZoom(); this.cameraRig.resetFollowing()
      this.wasSimulating = simulating
    }
    this.eventSimulation.syncSession(now)
    const sim = this.runtimeState.simulation()
    const simulation = useEventSimulationStore.getState()
    // 普通态势沿用原曝光；陆地撞击使用 demo 曝光，保留火焰的颜色层次。
    this.renderer.toneMappingExposure = simulation.config ? 1.1 : 1.8
    const event = simulation.session
    const t = event ? (this.liveJd.value - simulation.jdEnc) * 86400 + event.impactTime : 0
    const rate = event && simulation.automaticRate ? playbackRate(event, t) : sim.playRate
    const jd = this.simulationClock.tick({ ...sim, playRate: rate }, dt)
    if (this.simulationClock.reachedBoundary) this.runtimeState.pause()
    if (this.simulationClock.justPaused) this.runtimeState.commitJd(jd)

    const state = this.runtimeState.readFrame(jd)
    const {
      frameState,
      replay,
      camera: cam,
      asteroids,
      eventScene,
      l1Mission,
    } = state
    const frame = frameState.frame

    if (frame !== this._lastFrame) {
      this._setFrame(frame)
      this._lastFrame = frame
    }

    /* 相机层动作 (cameraStore tick): 完整复位 / 仅注视点回中。
       置于换帧同步之后 —— 同帧内两者都触发时以复位结果为准 (二者等价) */
    if (cam.resetTick !== this._lastResetTick) {
      this._lastResetTick = cam.resetTick
      this._setFrame(frame)
    }
    if (cam.recenterTick !== this._lastRecenterTick) {
      this._lastRecenterTick = cam.recenterTick
      this._recenter()
    }

    if (frame === 'comp' && frameState.compIdx !== this._lastCompIdx) this._resetCompCamera()
    this._lastCompIdx = frameState.compIdx

    const resolvedEvent = this.eventTarget.resolve(jd, {
      replayEvent: replay.activeEvent,
      replayOrbit: replay.el,
      previewEvent: replay.activeEvent ? null : replay.previewRec,
      previewOrbit: replay.activeEvent ? null : replay.previewEl,
      nominalTrajectory: replay.activeEvent ? null : eventScene.products.uncertaintyTube?.payload.nominalTrajectory ?? null,
    })
    const replayEl = resolvedEvent.replayOrbit
    const replayOn = resolvedEvent.replayActive
    const previewEl = resolvedEvent.previewOrbit

    if (!replay.activeEvent && previewEl !== this._lastPreviewEl) {
      if (previewEl && frame === 'helio') {
        this.cameraRig.cancelZoom()
        this._framePreviewTarget()
      } else if (!previewEl && frame === 'helio') {
        this.controls.minDistance = this.runtimeState.frameInfo('helio').minDist
      }
      this._lastPreviewEl = previewEl
    }

    const earthW = this.planetSys.planetWorldPos[2]
    const observer = l1Mission.observer
    const companionWorldPosition = frame === 'comp' && !replayOn
      ? this.namedAsteroids.computeWorldPosition(
          frameState.compIdx,
          asteroids[frameState.compIdx],
          jd,
        )
      : null
    const frameTransform = this.referenceFrame.update({
      frame,
      jd,
      followSpin: frameState.followSpin,
      companionSpinHours: asteroids[frameState.compIdx].spinH ?? 6,
      earthWorldPosition: earthW,
      l1WorldPosition: observer?.positionAu ?? null,
      replayActive: replayOn,
      eventWorldPosition: this.eventTarget.worldPosition,
      companionWorldPosition,
    })
    const { center, rotationCos, rotationSin } = frameTransform

    return {
      now,
      dt,
      jd,
      state,
      frame,
      resolvedEvent,
      replayActive: replayOn,
      replayOrbit: replayEl,
      previewOrbit: previewEl,
      earthWorldPosition: earthW,
      center,
      rotationCos,
      rotationSin,
    }
  }

  /** 行星、卫星、小行星、事件目标及轨道等基础天体层。 */
  private _updateCelestialScene(context: SceneFrameContext): void {
    const {
      now,
      jd,
      state,
      frame,
      resolvedEvent,
      replayActive,
      replayOrbit,
      previewOrbit,
      earthWorldPosition,
      center,
      rotationCos,
      rotationSin,
    } = context
    const { layers, frameState, selection, replay, asteroids, eventScene, l1Mission } = state
    const observer = l1Mission.observer

    this.planetSys.update(jd, center, rotationCos, rotationSin, gmstRad(jd), layers.sizeScale, this.camera.position, this.uPxScale.value)
    this.satelliteModel.update(
      observer, center, rotationCos, rotationSin, frame,
    )

    const nearSimulation = !!replay.activeEvent && this.earthSurface.atmosphere.altitude < 3000000
    this.namedAsteroids.meshes.forEach(mesh => { mesh.visible = !nearSimulation })
    if (!nearSimulation) this.namedAsteroids.update(
      asteroids,
      jd,
      center,
      rotationCos,
      rotationSin,
      frameState.followSpin,
      layers.sizeScale,
      this.camera.position,
      this.uPxScale.value,
    )

    this.eventTarget.updateVisual({
      target: resolvedEvent,
      center,
      rotationCos,
      rotationSin,
      sizeScale: layers.sizeScale,
      cameraPosition: this.camera.position,
      pixelScale: this.uPxScale.value,
      impactFinished: !!replay.config,
    })

    this.asteroidCloud.update(
      jd, center.x, center.y, center.z,
      rotationCos, rotationSin,
      layers.showBelt && !nearSimulation, state.sim.playing, this.needsRefresh,
    )

    const selectionContext = {
      asteroids,
      sizeScale: layers.sizeScale,
      eventDiameterKm: replay.activeEvent?.diam ?? replay.previewRec?.diam ?? 0.05,
    }
    const selectionVisual = this.selectionSystem.updateVisual(
      selection.selected,
      now,
      layers.showBelt,
      this.uPxScale.value,
      selectionContext,
    )

    this.orbitRenderer.update(
      jd, center, rotationCos, rotationSin,
      layers.showOrbits && !nearSimulation && !selectionVisual.hideOrbits,
      selection.selected,
      earthWorldPosition,
      replayActive || !!previewOrbit, replayActive ? replayOrbit : previewOrbit,
      layers.showEventReferenceOrbit && !selectionVisual.hideOrbits,
      layers.showEventTrajectory && !selectionVisual.hideOrbits,
      this.camera.position.distanceTo(this.controls.target),
      selectionVisual.selectedWorld,
      /* N 体推演弧线 (事件专题页): store 引用未变则 OrbitRenderer 内部跳过重建 */
      eventScene.products.trajectory?.payload.positions ?? null,
    )
  }

  /** 风险产品、地面监测和 L1 任务等业务图层。 */
  private _updateOperationalLayers(context: SceneFrameContext): void {
    const {
      jd,
      state,
      frame,
      earthWorldPosition,
      center,
      rotationCos,
      rotationSin,
    } = context
    const { layers, ui, eventScene, planLayers, l1Mission, stationIndex } = state

    this.eventRisk.update({
      allowFocus: !state.replay.activeEvent,
      bPlane: eventScene.products.bPlane?.payload ?? null,
      uncertaintyTube: eventScene.products.uncertaintyTube?.payload ?? null,
      encounterDensity: eventScene.products.encounterDensity?.payload ?? null,
      focusRevision: eventScene.focusRevision,
      frame,
      center,
      rotationCos,
      rotationSin,
      layers: {
        showBPlane: layers.showBPlane,
        showEncounterDensity: layers.showEncounterDensity,
        showUncertaintyTube: layers.showUncertaintyTube,
      },
    })

    this.earthSys.update(
      this.planetSys.getEarthMesh(),
      this.planetSys.earthQ,
      earthWorldPosition,
      state.groundMode,
      layers.showRiskBoundary,
      layers.showAllCones ?? false,
      layers.gSphereR,
      stationIndex,
    )

    this.earthSys.updateSweep(
      earthWorldPosition,
      jd,
      ui.coneSweep,
      state.sim.playing ? stationIndex : null,
    )

    this.missionLayers.updateL1({
      active: state.l1Mode,
      jd,
      mission: l1Mission,
      layers: {
        sphereRadius: layers.sphereR,
        showSphere: layers.showL1Sphere,
        showGraticuleLabels: layers.showL1GratLabels,
        showOccultation: layers.showOccult,
        showSunAvoidance: layers.showSunAvoid,
        showAntiSunLimit: layers.showAntiSunLimit,
        showEarthAvoidance: layers.showEarthAvoid,
        showPlannedFootprints: planLayers.showPlanned,
        showExposedFootprints: planLayers.showExposed,
      },
      sunScenePosition: this.planetSys.sunMesh.position,
      earthScenePosition: this.planetSys.planetMeshes[2].position,
      satelliteScenePosition: this.satelliteModel.satGroup.position,
    })
    this.missionLayers.updateGround({
      active: state.groundMode,
      layers: {
        sphereRadius: layers.gSphereR,
        showOccultation: layers.showGroundOccult,
        showSunAvoidance: layers.showGSunAvoid,
        showMoonAvoidance: layers.showMoonAvoid,
        showZodiacBand: layers.showZodiacBand,
        showGraticuleLabels: layers.showGratLabels,
      },
      sunScenePosition: this.planetSys.sunMesh.position,
      earthScenePosition: this.planetSys.planetMeshes[2].position,
      moonScenePosition: this.planetSys.moonMesh.position,
    })
  }

  /** 拾取目标、相机跟随、控制器和环境辅助层。 */
  private _updateInteraction(context: SceneFrameContext): void {
    const { now, state, frame } = context
    const { layers, selection } = state
    this.earthSurface.syncEarth(this.planetSys.getEarthMesh(), this.planetSys.earthQ,
      this.planetSys.sunMesh.position, layers.showTerrain)
    this.selectionSystem.refreshPickingTargets()
    if (!state.replay.activeEvent && !this.earthSurface.groundNavigation) {
      this.selectionSystem.updateCameraTracking(selection.selected, state.following, now)
    }

    if (!this.eventSimulation.ownsCamera) this.controls.update()
    this.eventSimulation.update(context.jd, now, this.planetSys.getEarthMesh(), this.planetSys.earthQ)
    this.earthSurface.update(now, !this.eventSimulation.ownsCamera)

    this.environment.update({
      frame,
      showGrid: layers.showGrid,
      showAxes: layers.showAxes,
      showSky: layers.showSky,
      cameraTarget: this.controls.target,
      surfaceNear: this.earthSurface.near,
      earthAtmosphere: this.earthSurface.atmosphere,
    })
    this.planetSys.setAtmosphereOpacity(this.environment.atmosphereOpacity)
  }

  private _lastFrame: FrameType = 'helio'
  /* 相机层动作 tick 的上一帧值 (cameraStore.requestReset / requestRecenter 驱动) */
  private _lastResetTick = 0
  private _lastRecenterTick = 0

  /* ---- 近距观测 (目标信息卡「近距离观测」按钮) ----
     沿当前视线方向把相机动画推近至取景距离, 保持用户视角不变、只收敛距离;
     同时自动开启聚焦跟随 —— 高速播放下目标每帧位移显著, 不跟随则推近途中
     即脱靶。取景距离按目标"有效观测半径"自适应 (约占画面高度 42%) */
  zoomToSelection(): void {
    this.earthSurface.resetNavigation()
    const zoom = this.runtimeState.zoomContext()
    this.selectionSystem.zoomTo(zoom.selected, {
      asteroids: zoom.asteroids,
      sizeScale: zoom.sizeScale,
      eventDiameterKm: zoom.eventDiameterKm,
    })
  }

  getLabelPositions(canvasWidth: number, canvasHeight: number): SceneLabelPosition[] {
    return this.labelSystem.getPositions(canvasWidth, canvasHeight)
  }

  // 监测站昼夜状态 (供信息面板展示)
  get terrainStatus() { return this.earthSurface?.status ?? null }

  getStationNight(idx: number): boolean {
    return this.earthSys?.stationObjects[idx]?.night ?? false
  }

  dispose(): void {
    if (this._disposed) return
    this._disposed = true
    cancelAnimationFrame(this.animId)
    sceneRef.current = null
    this.cleanup.dispose()
    if (this.scene) disposeObjectTree(this.scene)
    if (this._initDone) this.renderer?.dispose()
  }
}
