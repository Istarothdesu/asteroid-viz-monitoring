import * as THREE from 'three'
import { PLANETS } from '@/data/planets'
import { FRAME_INFO } from '@/store/frameStore'
import type { FrameType } from '@/types/scene'
import { AU_KM } from '@/utils/orbital/constants'
import { planetPos } from '@/utils/orbital/planets'
import type { RiskRenderer } from '../RiskRenderer'
import type {
  BPlaneScenePayload,
  EncounterDensityScenePayload,
  UncertaintyTubeScenePayload,
} from '../sceneProducts/types'
import type { SceneCameraRig } from './SceneCameraRig'

export interface EventRiskLayers {
  showBPlane: boolean
  showEncounterDensity: boolean
  showUncertaintyTube: boolean
}

interface EventRiskSystemOptions {
  renderer: RiskRenderer
  cameraRig: SceneCameraRig
  onFocus: () => void
}

interface EventRiskUpdate {
  allowFocus?: boolean
  bPlane: BPlaneScenePayload | null
  uncertaintyTube: UncertaintyTubeScenePayload | null
  encounterDensity: EncounterDensityScenePayload | null
  focusRevision: number
  frame: FrameType
  center: THREE.Vector3
  rotationCos: number
  rotationSin: number
  layers: EventRiskLayers
}

/** 事件风险产品到 Three.js 风险图层、专用相机取景之间的协调器。 */
export class EventRiskSystem {
  private readonly renderer: RiskRenderer
  private readonly cameraRig: SceneCameraRig
  private readonly onFocus: () => void
  private readonly encounterEarth = new THREE.Vector3()
  private readonly focusTarget = new THREE.Vector3()
  private readonly focusNormal = new THREE.Vector3()
  private readonly focusTilt = new THREE.Vector3()
  private readonly focusXi = new THREE.Vector3()
  private lastFocusRevision = 0

  constructor(options: EventRiskSystemOptions) {
    this.renderer = options.renderer
    this.cameraRig = options.cameraRig
    this.onFocus = options.onFocus
  }

  update(update: EventRiskUpdate): void {
    if (update.bPlane) {
      planetPos(PLANETS[2], update.bPlane.closestJd, this.encounterEarth)
    }
    const renderCenter = update.frame === 'geo' ? this.encounterEarth : update.center
    this.renderer.update(
      update.bPlane,
      update.uncertaintyTube,
      update.encounterDensity,
      this.encounterEarth,
      renderCenter,
      update.rotationCos,
      update.rotationSin,
      update.layers.showBPlane,
      update.layers.showEncounterDensity,
      update.layers.showUncertaintyTube,
    )

    if (update.focusRevision === this.lastFocusRevision) return
    this.lastFocusRevision = update.focusRevision
    if (!update.bPlane || update.allowFocus === false) return
    this.focusBPlane(update, update.bPlane)
  }

  private focusBPlane(update: EventRiskUpdate, bPlane: BPlaneScenePayload): void {
    const { encounterDensity, rotationCos, rotationSin } = update
    const renderCenter = update.frame === 'geo' ? this.encounterEarth : update.center
    this.focusTarget.copy(this.encounterEarth).sub(renderCenter)
    this.rotateSceneVector(this.focusTarget, rotationCos, rotationSin, false)

    if (encounterDensity) {
      this.rotateAxis(bPlane.xiAxisEcliptic, this.focusXi, rotationCos, rotationSin)
      this.rotateAxis(bPlane.zetaAxisEcliptic, this.focusTilt, rotationCos, rotationSin)
      // 同时容纳有效撞击截面与协方差密度峰，避免默认视角只盯住 B 向量终点。
      this.focusTarget
        .addScaledVector(this.focusXi, bPlane.xiKm / AU_KM * 0.45)
        .addScaledVector(this.focusTilt, bPlane.zetaKm / AU_KM * 0.45)
    }

    this.rotateAxis(
      bPlane.incomingDirectionEcliptic,
      this.focusNormal,
      rotationCos,
      rotationSin,
    )
    this.rotateAxis(
      bPlane.zetaAxisEcliptic,
      this.focusTilt,
      rotationCos,
      rotationSin,
    )
    const direction = this.focusNormal.addScaledVector(this.focusTilt, 0.38).normalize()
    const distance = encounterDensity
      ? Math.max(this.renderer.densityViewHalfAu(encounterDensity) * 5, 7e-5)
      : Math.max(this.renderer.viewHalfAu(bPlane) * 4.8, 0.003)

    this.onFocus()
    this.cameraRig.focus(
      this.focusTarget,
      direction,
      distance,
      Math.min(FRAME_INFO.geo.minDist, distance * 0.05),
      Math.max(FRAME_INFO.geo.maxDist, distance * 4),
    )
  }

  private rotateAxis(
    values: [number, number, number],
    output: THREE.Vector3,
    rotationCos: number,
    rotationSin: number,
  ): void {
    output.set(...values)
    this.rotateSceneVector(output, rotationCos, rotationSin, true)
  }

  private rotateSceneVector(
    vector: THREE.Vector3,
    rotationCos: number,
    rotationSin: number,
    normalize: boolean,
  ): void {
    const x = vector.x
    const y = vector.y
    vector.set(
      x * rotationCos + y * rotationSin,
      -x * rotationSin + y * rotationCos,
      vector.z,
    )
    if (normalize) vector.normalize()
  }
}
