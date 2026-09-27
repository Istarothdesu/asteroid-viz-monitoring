import * as THREE from 'three'
import { D2R, R_EARTH_AU } from '@/utils/orbital/constants'
import { makeOccultZone, makeEquatorialGraticule, makeEclipticCircle, makeZodiacBand, makeGraticuleMarks, OccultZone } from './surveyGeometry'
import { SPHERE_R_DEFAULT } from './SurveySystem'

const R_SUN_AU = 695700 / 149597870.7
const GSUN_CAP_ANG = Math.asin(R_SUN_AU)               // solar radius as seen from Earth surface
const GMOON_CAP_ANG = Math.asin(1737.4 / 384400)       // lunar radius as seen from Earth surface
const GSUN_AVOID_ANG = 45 * D2R
const GMOON_AVOID_ANG = 45 * D2R

// Local sphere geometry radius = 1 (world radius = gSphereGroup.scale × groundRoot.scale)
const LOCAL_R = 1

export class GroundSurveySystem {
  readonly gSphereGroup: THREE.Group
  // Marks for label overlay
  readonly sunCapMark = new THREE.Object3D()
  readonly moonCapMark = new THREE.Object3D()
  readonly sunAvoidMark = new THREE.Object3D()
  readonly moonAvoidMark = new THREE.Object3D()
  /** 赤道网格坐标标注锚点 (赤经每 2h + 赤纬 ±30°/±60°), 投影为屏幕标签 */
  readonly gratMarks: { raMarks: THREE.Object3D[]; decMarks: THREE.Object3D[] }

  private readonly groundRoot: THREE.Group
  private _gSphereR = SPHERE_R_DEFAULT
  private readonly occultGroup: THREE.Group
  private readonly sunAvoidGroup: THREE.Group
  private readonly moonAvoidGroup: THREE.Group
  private readonly sunOcc: OccultZone
  private readonly moonOcc: OccultZone
  private readonly zodiacBand: THREE.Mesh
  private readonly gratMarksGroup: THREE.Group
  private readonly sunAvoid: OccultZone
  private readonly moonAvoid: OccultZone
  private readonly _tA = new THREE.Vector3()
  private readonly _tB = new THREE.Vector3()

  constructor(groundRoot: THREE.Group) {
    this.groundRoot = groundRoot

    this.gSphereGroup = new THREE.Group()
    groundRoot.add(this.gSphereGroup)

    // Celestial sphere: 天球仪式赤道坐标网格 + 黄道大圆 (地心赤道系不随地球自转)
    this.gSphereGroup.add(makeEquatorialGraticule(LOCAL_R))
    this.gSphereGroup.add(makeEclipticCircle(LOCAL_R))

    // Zodiac band (黄纬 ±15° 小行星密集区, 图层开关控制)
    this.zodiacBand = makeZodiacBand(LOCAL_R)
    this.zodiacBand.visible = false
    this.gSphereGroup.add(this.zodiacBand)

    // Graticule coordinate label marks (赤经/赤纬刻度, 图层开关控制)
    const marks = makeGraticuleMarks(LOCAL_R)
    this.gratMarksGroup = marks.group
    this.gratMarks = { raMarks: marks.raMarks, decMarks: marks.decMarks }
    this.gratMarksGroup.visible = false
    this.gSphereGroup.add(this.gratMarksGroup)

    // Sun + moon occlusion caps
    this.occultGroup = new THREE.Group()
    this.gSphereGroup.add(this.occultGroup)
    this.sunOcc = makeOccultZone(0xff4444, GSUN_CAP_ANG, 0.65, 0.15, LOCAL_R)
    this.moonOcc = makeOccultZone(0xbbbbff, GMOON_CAP_ANG, 0.65, 0.15, LOCAL_R)
    this.occultGroup.add(this.sunOcc, this.moonOcc, this.sunCapMark, this.moonCapMark)

    // Sun avoidance zone
    this.sunAvoidGroup = new THREE.Group()
    this.sunAvoidGroup.visible = false
    this.gSphereGroup.add(this.sunAvoidGroup)
    this.sunAvoid = makeOccultZone(0xee3333, GSUN_AVOID_ANG, 0.22, 0.10, LOCAL_R)
    this.sunAvoidGroup.add(this.sunAvoid, this.sunAvoidMark)

    // Moon avoidance zone
    this.moonAvoidGroup = new THREE.Group()
    this.moonAvoidGroup.visible = false
    this.gSphereGroup.add(this.moonAvoidGroup)
    this.moonAvoid = makeOccultZone(0x9999ee, GMOON_AVOID_ANG, 0.22, 0.10, LOCAL_R)
    this.moonAvoidGroup.add(this.moonAvoid, this.moonAvoidMark)
  }

  setOccult(v: boolean): void { this.occultGroup.visible = v }
  setSunAvoid(v: boolean): void { this.sunAvoidGroup.visible = v }
  setMoonAvoid(v: boolean): void { this.moonAvoidGroup.visible = v }
  setZodiacBand(v: boolean): void { this.zodiacBand.visible = v }
  setGratLabels(v: boolean): void { this.gratMarksGroup.visible = v }

  // Set the desired world radius of the ground celestial sphere (AU)
  setSphereR(r: number): void { this._gSphereR = r }

  // Call every frame when ground mode is active
  update(
    sunScenePos: THREE.Vector3,
    earthScenePos: THREE.Vector3,
    moonScenePos: THREE.Vector3,
  ): void {
    // Keep sphere world radius = _gSphereR regardless of groundRoot.scale changes
    const groundScale = this.groundRoot.scale.x
    if (groundScale > 0) {
      this.gSphereGroup.scale.setScalar(this._gSphereR / groundScale)
    }

    const sunFromEarth = this._tA.copy(sunScenePos).sub(earthScenePos).normalize()
    const moonFromEarth = this._tB.copy(moonScenePos).sub(earthScenePos).normalize()

    if (this.occultGroup.visible) {
      this.sunOcc.setDir(sunFromEarth)
      this.sunCapMark.position.copy(sunFromEarth)   // unit vector, radius=1 local
      this.moonOcc.setDir(moonFromEarth)
      this.moonCapMark.position.copy(moonFromEarth)
    }
    if (this.sunAvoidGroup.visible) {
      this.sunAvoid.setDir(sunFromEarth)
      this.sunAvoidMark.position.copy(sunFromEarth).multiplyScalar(0.72)
    }
    if (this.moonAvoidGroup.visible) {
      this.moonAvoid.setDir(moonFromEarth)
      this.moonAvoidMark.position.copy(moonFromEarth).multiplyScalar(0.72)
    }
  }
}

// Re-export default sphere R for convenience
export const GROUND_SPHERE_R_DEFAULT = SPHERE_R_DEFAULT
export { R_EARTH_AU }
