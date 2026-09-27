import * as THREE from 'three'
import { astPos } from '@/utils/orbital/asteroids'
import type { FitResult } from '@/utils/orbital/fitEncounter'
import type { EventRecord } from '@/types/scene'
import type { NominalTrajectoryScenePayload } from '../sceneProducts/types'
import { createDotTexture, displayRadius, glowSprite, markerScale } from '../utils'
import { sampleNominalTrajectory } from './trajectory'

export interface EventTargetInput {
  replayEvent: EventRecord | null
  replayOrbit: FitResult | null
  previewEvent: EventRecord | null
  previewOrbit: FitResult | null
  nominalTrajectory: NominalTrajectoryScenePayload | null
}

export interface ResolvedEventTarget {
  replayActive: boolean
  replayOrbit: FitResult | null
  previewOrbit: FitResult | null
  record: EventRecord | null
  worldPosition: THREE.Vector3
}

interface EventTargetVisualUpdate {
  target: ResolvedEventTarget
  center: THREE.Vector3
  rotationCos: number
  rotationSin: number
  sizeScale: number
  cameraPosition: THREE.Vector3
  pixelScale: number
  impactFinished: boolean
}

/** 事件天体的位置解析、场景几何与远景标记。 */
export class EventTargetSystem {
  readonly mesh: THREE.Mesh
  readonly worldPosition = new THREE.Vector3()

  private readonly glow: THREE.Sprite
  private readonly state: ResolvedEventTarget = {
    replayActive: false,
    replayOrbit: null,
    previewOrbit: null,
    record: null,
    worldPosition: this.worldPosition,
  }

  constructor(scene: THREE.Scene, dotTexture: THREE.Texture = createDotTexture()) {
    this.mesh = new THREE.Mesh(
      new THREE.IcosahedronGeometry(1, 0),
      new THREE.MeshPhongMaterial({
        color: 0xcc6633,
        emissive: 0x662200,
        shininess: 3,
        polygonOffset: true,
        polygonOffsetFactor: -2,
        polygonOffsetUnits: -2,
      }),
    )
    this.mesh.visible = false
    scene.add(this.mesh)

    this.glow = glowSprite(dotTexture, 0xff6b45, 0.9)
    this.glow.visible = false
    this.glow.renderOrder = 10
    scene.add(this.glow)
  }

  get material(): THREE.Material {
    return this.mesh.material as THREE.Material
  }

  /**
   * 优先使用风险计算发布的带时标名义轨迹，超出覆盖窗口后才降级到拟合轨道。
   * 返回复用对象，避免动画循环每帧产生临时分配。
   */
  resolve(jd: number, input: EventTargetInput): ResolvedEventTarget {
    const replayActive = !!input.replayEvent && !!input.replayOrbit
    const previewOrbit = replayActive ? null : input.previewOrbit
    const orbit = replayActive ? input.replayOrbit : previewOrbit

    const onNominalTrajectory = sampleNominalTrajectory(
      input.nominalTrajectory,
      jd,
      this.worldPosition,
    )
    if (!onNominalTrajectory && orbit) astPos(orbit, jd, this.worldPosition)

    this.state.replayActive = replayActive
    this.state.replayOrbit = replayActive ? input.replayOrbit : null
    this.state.previewOrbit = previewOrbit
    this.state.record = replayActive ? input.replayEvent : input.previewEvent
    return this.state
  }

  updateVisual(update: EventTargetVisualUpdate): void {
    const { target } = update
    const visible = !!target.record
      && (!!target.previewOrbit || (target.replayActive && !update.impactFinished))
    this.mesh.visible = visible
    if (!visible || !target.record) {
      this.glow.visible = false
      return
    }

    this.mesh.position.copy(target.worldPosition).sub(update.center)
    const x = this.mesh.position.x
    const y = this.mesh.position.y
    this.mesh.position.x = x * update.rotationCos + y * update.rotationSin
    this.mesh.position.y = -x * update.rotationSin + y * update.rotationCos
    const radius = displayRadius(target.record.diam / 2, update.sizeScale)
    this.mesh.scale.setScalar(radius)

    const distance = update.cameraPosition.distanceTo(this.mesh.position)
    const showGlow = (radius / distance) * update.pixelScale < 4
    this.glow.visible = showGlow
    if (showGlow) {
      this.glow.position.copy(this.mesh.position)
      this.glow.scale.setScalar(markerScale(radius, distance, 2.5, 0.007))
    }
  }
}
