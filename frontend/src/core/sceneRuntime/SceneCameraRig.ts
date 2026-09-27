import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { FRAME_INFO } from '@/store/frameStore'
import type { FrameType } from '@/types/scene'
import { D2R } from '@/utils/orbital/constants'

type Controls = InstanceType<typeof OrbitControls>

interface ZoomAnimation {
  key: string
  t0: number
  duration: number
  startDistance: number
  endDistance: number
}

const Y_AXIS = new THREE.Vector3(0, 1, 0)

/** OrbitControls 之上的相机状态机，不包含业务目标解析。 */
export class SceneCameraRig {
  private readonly camera: THREE.PerspectiveCamera
  private readonly controls: Controls
  private readonly followCurrent = new THREE.Vector3()
  private readonly followPrevious = new THREE.Vector3()
  private readonly zoomDirection = new THREE.Vector3()
  private wasFollowing = false
  private zoomAnimation: ZoomAnimation | null = null

  constructor(camera: THREE.PerspectiveCamera, controls: Controls) {
    this.camera = camera
    this.controls = controls
  }

  cancelZoom(): void {
    this.zoomAnimation = null
  }

  resetFollowing(): void {
    this.wasFollowing = false
  }

  setFrame(frame: FrameType): void {
    const info = FRAME_INFO[frame]
    this.cancelZoom()
    this.resetFollowing()
    this.camera.up.set(...info.up)
    this.syncControlsUp()
    this.controls.target.set(0, 0, 0)
    if (frame !== 'comp') {
      this.camera.position.set(...info.cam)
      this.controls.minDistance = info.minDist
      this.controls.maxDistance = info.maxDist
    }
    this.controls.update()
  }

  resetCompCamera(radius: number): void {
    const info = FRAME_INFO.comp
    const distance = Math.max(Math.hypot(...info.cam), radius * 3.2)
    this.camera.position.set(...info.cam).normalize().multiplyScalar(distance)
    this.controls.target.set(0, 0, 0)
    this.controls.minDistance = Math.max(info.minDist, radius * 1.2)
    this.controls.maxDistance = info.maxDist
    this.controls.update()
  }

  recenter(): void {
    this.cancelZoom()
    this.resetFollowing()
    this.controls.target.set(0, 0, 0)
    this.controls.update()
  }

  focus(
    target: THREE.Vector3,
    direction: THREE.Vector3,
    distance: number,
    minDistance: number,
    maxDistance: number,
  ): void {
    this.cancelZoom()
    this.resetFollowing()
    this.controls.target.copy(target)
    this.camera.position.copy(target).addScaledVector(direction, distance)
    this.controls.minDistance = minDistance
    this.controls.maxDistance = maxDistance
    this.controls.update()
  }

  frameMovingTarget(
    target: THREE.Vector3,
    distance: number,
    minDistance: number,
  ): void {
    const direction = this.followCurrent.copy(this.camera.position).sub(this.controls.target)
    if (direction.lengthSq() < 1e-12) direction.set(0, -6, 14)
    direction.normalize()
    this.controls.target.copy(target)
    this.camera.position.copy(target).addScaledVector(direction, distance)
    this.controls.minDistance = minDistance
    this.controls.update()
    this.resetFollowing()
  }

  updateFollow(mesh: THREE.Object3D | null, following: boolean): boolean {
    if (!following || !mesh || !mesh.visible) {
      const lostTarget = this.wasFollowing
      this.wasFollowing = false
      return lostTarget
    }

    mesh.getWorldPosition(this.followCurrent)
    if (!this.wasFollowing) {
      this.controls.target.copy(this.followCurrent)
    } else {
      this.followCurrent.sub(this.followPrevious)
      this.camera.position.add(this.followCurrent)
      mesh.getWorldPosition(this.controls.target)
    }
    mesh.getWorldPosition(this.followPrevious)
    this.wasFollowing = true
    return false
  }

  startZoom(key: string, mesh: THREE.Object3D, effectiveRadius: number): void {
    mesh.getWorldPosition(this.controls.target)
    this.followPrevious.copy(this.controls.target)
    this.wasFollowing = true

    const direction = this.zoomDirection.copy(this.camera.position).sub(this.controls.target)
    let startDistance = direction.length()
    if (startDistance < 1e-12) {
      direction.copy(this.camera.up).negate()
      startDistance = effectiveRadius * 20
    }
    direction.divideScalar(startDistance)
    this.camera.position.copy(this.controls.target).addScaledVector(direction, startDistance)
    this.zoomAnimation = {
      key,
      t0: performance.now(),
      duration: 1200,
      startDistance,
      endDistance: this.framingDistance(effectiveRadius),
    }
  }

  updateZoom(now: number, selectedKey: string | null, following: boolean): void {
    const animation = this.zoomAnimation
    if (!animation) return
    if (!following || selectedKey !== animation.key) {
      this.zoomAnimation = null
      return
    }

    const progress = Math.min(1, (now - animation.t0) / animation.duration)
    const eased = 1 - (1 - progress) ** 3
    const direction = this.zoomDirection.copy(this.camera.position).sub(this.controls.target)
    const distance = direction.length() || 1e-9
    const nextDistance = animation.startDistance
      + (animation.endDistance - animation.startDistance) * eased
    this.camera.position.copy(this.controls.target)
      .addScaledVector(direction.divideScalar(distance), nextDistance)
    if (progress >= 1) this.zoomAnimation = null
  }

  private syncControlsUp(): void {
    const controls = this.controls as unknown as {
      _quat: THREE.Quaternion
      _quatInverse: THREE.Quaternion
    }
    controls._quat.setFromUnitVectors(this.camera.up, Y_AXIS)
    controls._quatInverse.copy(controls._quat).invert()
  }

  private framingDistance(effectiveRadius: number): number {
    const distance = effectiveRadius / (0.42 * Math.tan((this.camera.fov * D2R) / 2))
    return Math.min(
      this.controls.maxDistance,
      Math.max(this.controls.minDistance, distance),
    )
  }
}
