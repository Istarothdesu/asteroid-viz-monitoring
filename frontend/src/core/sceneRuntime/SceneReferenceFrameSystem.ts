import * as THREE from 'three'
import { PLANETS } from '@/data/planets'
import type { FrameType } from '@/types/scene'
import { JD_J2000, TAU } from '@/utils/orbital/constants'
import { planetPos } from '@/utils/orbital/planets'
import { spinTheta } from '@/utils/orbital/time'

interface VectorLike {
  x: number
  y: number
  z: number
}

export interface SceneReferenceFrameInput {
  frame: FrameType
  jd: number
  followSpin: boolean
  companionSpinHours: number
  earthWorldPosition: THREE.Vector3
  l1WorldPosition: VectorLike | null
  replayActive: boolean
  eventWorldPosition: THREE.Vector3
  companionWorldPosition: THREE.Vector3 | null
}

export interface SceneReferenceFrame {
  center: THREE.Vector3
  rotationCos: number
  rotationSin: number
}

/** 计算当前观察参考系的惯性系中心与绕 Z 轴旋转，不参与任何渲染。 */
export class SceneReferenceFrameSystem {
  private readonly center = new THREE.Vector3()

  update(input: SceneReferenceFrameInput): SceneReferenceFrame {
    const angle = this.rotationAngle(input)

    switch (input.frame) {
      case 'geo':
        this.refreshEarthPosition(input)
        this.center.copy(input.earthWorldPosition)
        break
      case 'l1':
        this.refreshEarthPosition(input)
        this.center.copy(input.l1WorldPosition ?? input.earthWorldPosition)
        break
      case 'comp':
        if (input.replayActive) this.center.copy(input.eventWorldPosition)
        else this.center.copy(input.companionWorldPosition ?? input.eventWorldPosition)
        break
      default:
        this.center.set(0, 0, 0)
    }

    return {
      center: this.center,
      rotationCos: Math.cos(angle),
      rotationSin: Math.sin(angle),
    }
  }

  private rotationAngle(input: SceneReferenceFrameInput): number {
    if (!input.followSpin) return 0
    if (input.frame === 'geo') return (input.jd - JD_J2000) * TAU / 0.99727
    if (input.frame === 'comp') return spinTheta(input.companionSpinHours, input.jd)
    return 0
  }

  private refreshEarthPosition(input: SceneReferenceFrameInput): void {
    /* PlanetSystem 的位置缓存在后续 update 中才刷新。地心/L1 参考系必须先用
       当前历元重算地球位置，避免高速播放时场景中心滞后一帧。 */
    planetPos(PLANETS[2], input.jd, input.earthWorldPosition)
  }
}
