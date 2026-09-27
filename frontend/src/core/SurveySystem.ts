import * as THREE from 'three'
import { D2R, R_EARTH_AU, L1_DIST_AU } from '@/utils/orbital/constants'
import type { MissionProfile } from '@/features/l1/types'
import { withinFov } from '@/features/l1/geometry'
import { attitudeAxes } from '@/features/l1/attitude'
import type { Quaternion } from '@/features/l1/attitude'
import type { PreparedPlan } from '@/features/l1/observationPlan'
import { earthApparentRadius, earthAvoidanceRadius } from '@/features/l1/constraints'
import { SCENE_VISUALS } from './sceneLayers'
import { SurveyFootprintRenderer } from './SurveyFootprintRenderer'
import {
  makeOccultZone, makeEquatorialGraticule, makeEclipticCircle, makeFrustumCone,
  makeGraticuleMarks, OccultZone,
} from './surveyGeometry'

const R_SUN_AU = 695700 / 149597870.7   // solar radius in AU

export const SPHERE_R_DEFAULT = 0.1    // AU

const FOV_HX = 3.0 * D2R
const FOV_HY = 2.0 * D2R
const SUN_CAP_ANG = Math.asin(R_SUN_AU / 0.99)           // from L1, ~0.267°
const EARTH_CAP_ANG = Math.asin(R_EARTH_AU / L1_DIST_AU)  // ~0.24°
const SUN_AVOID_ANG = 45 * D2R

export class SurveySystem {
  readonly group: THREE.Group
  tanHX: number
  tanHY: number
  private profile: MissionProfile | null = null
  private instrument: MissionProfile['instrument'] | null = null
  private footprints = new SurveyFootprintRenderer(SPHERE_R_DEFAULT)
  // Cone state exposed for external detection
  readonly coneAxis = new THREE.Vector3(0, 0, -1)
  readonly coneRight = new THREE.Vector3(1, 0, 0)
  readonly coneUp = new THREE.Vector3(0, 1, 0)
  // Marks for label overlay (world-space Objects)
  readonly sunCapMark = new THREE.Object3D()
  readonly earthCapMark = new THREE.Object3D()
  readonly sunAvoidMark = new THREE.Object3D()
  readonly antiSunLimitMark = new THREE.Object3D()
  readonly earthAvoidMark = new THREE.Object3D()
  /** J2000 赤道坐标刻度锚点，由 DOM 标签层投影。 */
  readonly gratMarks: { raMarks: THREE.Object3D[]; decMarks: THREE.Object3D[] }

  private coneVisible = false
  private samplingActive = false
  private coneGroup: THREE.Group
  private readonly sphereGroup: THREE.Group
  private readonly gratMarksGroup: THREE.Group
  private readonly occultGroup: THREE.Group
  private readonly sunAvoidGroup: THREE.Group
  private readonly antiSunLimitGroup: THREE.Group
  private readonly earthAvoidGroup: THREE.Group
  private readonly sunOcc: OccultZone
  private readonly earthOcc: OccultZone
  private readonly sunAvoid: OccultZone
  private readonly antiSunLimit: OccultZone
  private readonly earthAvoid: OccultZone
  private readonly _basis = new THREE.Matrix4()
  private readonly _tA = new THREE.Vector3()
  private readonly _tB = new THREE.Vector3()

  constructor(satGroup: THREE.Group) {
    this.group = new THREE.Group()
    satGroup.add(this.group)
    this.group.add(this.footprints.group)

    // Observation cone (hidden until survey mode active)
    const cone = makeFrustumCone(FOV_HX, FOV_HY, SPHERE_R_DEFAULT)
    this.coneGroup = cone.group
    this.coneGroup.visible = false
    this.tanHX = cone.tanHX
    this.tanHY = cone.tanHY
    this.group.add(this.coneGroup)

    // 天球显示层与任务几何分组：关闭网格不能连带隐藏光锥、足迹或约束区。
    this.sphereGroup = new THREE.Group()
    this.sphereGroup.add(makeEquatorialGraticule(SPHERE_R_DEFAULT))
    this.sphereGroup.add(makeEclipticCircle(SPHERE_R_DEFAULT))
    const marks = makeGraticuleMarks(SPHERE_R_DEFAULT)
    this.gratMarksGroup = marks.group
    this.gratMarks = { raMarks: marks.raMarks, decMarks: marks.decMarks }
    this.sphereGroup.add(this.gratMarksGroup)
    this.group.add(this.sphereGroup)

    // Occlusion caps (sun + earth)
    this.occultGroup = new THREE.Group()
    this.group.add(this.occultGroup)
    this.sunOcc = makeOccultZone(0xff4444, SUN_CAP_ANG, 0.65, 0.15, SPHERE_R_DEFAULT)
    this.earthOcc = makeOccultZone(0xff9944, EARTH_CAP_ANG, 0.65, 0.15, SPHERE_R_DEFAULT)
    this.occultGroup.add(this.sunOcc, this.earthOcc, this.sunCapMark, this.earthCapMark)

    // Sun avoidance zone (45°)
    this.sunAvoidGroup = new THREE.Group()
    this.sunAvoidGroup.visible = false
    this.group.add(this.sunAvoidGroup)
    this.sunAvoid = makeOccultZone(SCENE_VISUALS.avoidance.color, SUN_AVOID_ANG, 0.22, 0.10, SPHERE_R_DEFAULT)
    this.sunAvoidGroup.add(this.sunAvoid, this.sunAvoidMark)

    // 最大太阳伸长角等价于反太阳方向周围的独立禁指向球冠。
    this.antiSunLimitGroup = new THREE.Group()
    this.antiSunLimitGroup.visible = false
    this.group.add(this.antiSunLimitGroup)
    this.antiSunLimit = makeOccultZone(SCENE_VISUALS.antiSunLimit.color, 55 * D2R, 0.18, 0.08, SPHERE_R_DEFAULT)
    this.antiSunLimitGroup.add(this.antiSunLimit, this.antiSunLimitMark)

    this.earthAvoidGroup = new THREE.Group()
    this.earthAvoidGroup.visible = false
    this.group.add(this.earthAvoidGroup)
    this.earthAvoid = makeOccultZone(SCENE_VISUALS.earthAvoidance.color, EARTH_CAP_ANG, 0.22, 0.10, SPHERE_R_DEFAULT)
    this.earthAvoidGroup.add(this.earthAvoid, this.earthAvoidMark)
  }

  setVisible(v: boolean): void { this.group.visible = v }

  configure(profile: MissionProfile, instrument = profile.instrument): void {
    if (profile === this.profile && instrument === this.instrument) return
    this.profile = profile
    this.instrument = instrument
    this.group.remove(this.coneGroup)
    this.coneGroup.traverse(obj => {
      const mesh = obj as THREE.Mesh
      if (!mesh.geometry) return
      mesh.geometry.dispose()
      const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
      materials.forEach(material => material.dispose())
    })
    const cone = makeFrustumCone(instrument.fovWidthDeg / 2 * D2R,
      instrument.fovHeightDeg / 2 * D2R, SPHERE_R_DEFAULT)
    this.coneGroup = cone.group
    this.tanHX = cone.tanHX; this.tanHY = cone.tanHY
    this.group.add(this.coneGroup)
    this.sunAvoid.setAngularRadius(instrument.sunAvoidanceDeg * D2R)
    this.antiSunLimit.setAngularRadius((180 - instrument.maxSunElongationDeg) * D2R)
  }

  getInstrument(): MissionProfile['instrument'] | null { return this.instrument }

  setConeActive(v: boolean): void {
    this.samplingActive = v
    this.setConeVisible(v)
  }

  /** 计划姿态的可视化与曝光采样分离：转向/稳定/等待阶段仍显示当前视场。 */
  setConeVisible(v: boolean): void {
    this.coneVisible = v
    if (!v) this.coneGroup.visible = false
  }

  // Scale the entire survey group to match the configured sphere radius
  setSphereR(r: number): void {
    this.group.scale.setScalar(r / SPHERE_R_DEFAULT)
  }

  setOccult(v: boolean): void { this.occultGroup.visible = v }
  setSunAvoid(v: boolean): void { this.sunAvoidGroup.visible = v }
  setAntiSunLimit(v: boolean): void { this.antiSunLimitGroup.visible = v }
  setEarthAvoid(v: boolean): void { this.earthAvoidGroup.visible = v }
  setSphereVisible(v: boolean): void { this.sphereGroup.visible = v }
  setGratLabels(v: boolean): void { this.gratMarksGroup.visible = v }
  setFootprints(prepared: PreparedPlan | null, jd: number, showPlanned: boolean, showExposed: boolean) {
    this.footprints.update(prepared, jd, showPlanned, showExposed)
  }

  // Call once per frame with scene-space positions (all direct children of scene).
  // 姿态由统一计划回放器提供；本类不生成策略或重新选择目标。
  update(
    sunScenePos: THREE.Vector3,
    earthScenePos: THREE.Vector3,
    satScenePos: THREE.Vector3,
    quaternion: Quaternion | null,
  ): void {
    this.sunOcc.setAngularRadius(Math.asin(Math.min(1, R_SUN_AU / sunScenePos.distanceTo(satScenePos))))
    const earthDistance = earthScenePos.distanceTo(satScenePos)
    const earthCap = earthApparentRadius(earthDistance)
    this.earthOcc.setAngularRadius(earthCap)
    this.earthAvoid.setAngularRadius(earthAvoidanceRadius(earthDistance, this.instrument?.earthAvoidanceMarginDeg ?? 0))
    const sunFromSat = this._tA.copy(sunScenePos).sub(satScenePos).normalize()
    const earthFromSat = this._tB.copy(earthScenePos).sub(satScenePos).normalize()

    if (this.occultGroup.visible) {
      this.sunOcc.setDir(sunFromSat)
      this.sunCapMark.position.copy(sunFromSat).multiplyScalar(SPHERE_R_DEFAULT * 1.01)
      this.earthOcc.setDir(earthFromSat)
      this.earthCapMark.position.copy(earthFromSat).multiplyScalar(SPHERE_R_DEFAULT * 1.01)
    }
    if (this.sunAvoidGroup.visible) {
      this.sunAvoid.setDir(sunFromSat)
      this.sunAvoidMark.position.copy(sunFromSat).multiplyScalar(SPHERE_R_DEFAULT * 0.72)
    }
    if (this.antiSunLimitGroup.visible) {
      this.antiSunLimit.setDir(sunFromSat.clone().negate())
      this.antiSunLimitMark.position.copy(sunFromSat).multiplyScalar(-SPHERE_R_DEFAULT * 0.72)
    }
    if (this.earthAvoidGroup.visible) {
      this.earthAvoid.setDir(earthFromSat)
      this.earthAvoidMark.position.copy(earthFromSat).multiplyScalar(SPHERE_R_DEFAULT * 0.72)
    }

    this.coneGroup.visible = this.coneVisible && !!quaternion
    if (!quaternion) return
    const { axis, right, up } = attitudeAxes(quaternion)
    this.coneAxis.copy(axis); this.coneRight.copy(right); this.coneUp.copy(up)

    // coneGroup initially points toward -Z; basis maps local-Z to -coneAxis
    this._basis.makeBasis(this.coneRight, this.coneUp, this._tA.copy(this.coneAxis).negate())
    this.coneGroup.quaternion.setFromRotationMatrix(this._basis)
  }

  // Reset cloud colors to baseCol, then mark detected asteroids yellow.
  // 返回视场内几何样本数量，不是探测/发现结果。
  // pos entries are relative to the satellite (= scene origin in L1 frame).
  highlightGeometricSamples(pos: Float32Array, col: Float32Array, baseCol: Float32Array, N: number): number {
    col.set(baseCol)
    if (!this.samplingActive || !this.coneGroup.visible) return 0
    const direction = { x: 0, y: 0, z: 0 }
    let count = 0

    for (let k = 0; k < N; k++) {
      const x = pos[3 * k], y = pos[3 * k + 1], z = pos[3 * k + 2]
      direction.x = x; direction.y = y; direction.z = z
      if (withinFov(direction, this.coneAxis, this.coneRight, this.coneUp, this.tanHX, this.tanHY)) {
        col[3 * k] = 1; col[3 * k + 1] = 0.95; col[3 * k + 2] = 0.3
        count++
      }
    }
    return count
  }
}
