import * as THREE from 'three'
import type { ObserverState } from '@/features/l1/types'

export class SatelliteModel {
  readonly satGroup: THREE.Group
  readonly satModel: THREE.Group
  readonly satW = new THREE.Vector3()
  private scene: THREE.Scene

  constructor(scene: THREE.Scene) {
    this.scene = scene
    this.satGroup = new THREE.Group()
    this.satModel = this._buildModel()
    this.satGroup.add(this.satModel)
    this.scene.add(this.satGroup)
  }

  private _buildModel(): THREE.Group {
    const grp = new THREE.Group()

    // Main bus (body)
    grp.add(new THREE.Mesh(
      new THREE.BoxGeometry(1.6, 0.8, 0.8),
      new THREE.MeshPhongMaterial({ color: 0xd0d8e8 })
    ))

    // Solar panels (left/right)
    for (const sx of [-2.0, 2.0]) {
      const panel = new THREE.Mesh(
        new THREE.BoxGeometry(1.8, 0.05, 0.7),
        new THREE.MeshPhongMaterial({ color: 0x2244aa, emissive: 0x112233 })
      )
      panel.position.x = sx
      grp.add(panel)
    }

    // Telescope tube
    const tube = new THREE.Mesh(
      new THREE.CylinderGeometry(0.2, 0.2, 1.4, 12),
      new THREE.MeshPhongMaterial({ color: 0xffffff })
    )
    tube.rotation.z = Math.PI / 2
    tube.position.x = -1.1
    grp.add(tube)

    // Telescope aperture ring
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(0.18, 0.22, 16),
      new THREE.MeshBasicMaterial({ color: 0x888888, side: THREE.DoubleSide })
    )
    ring.position.x = -1.8
    ring.rotation.y = Math.PI / 2
    grp.add(ring)

    /* 深度偏置: L1 轨道线即卫星路径、直接穿过本体,
       统一向相机侧偏置表面深度, 避免重叠段 z-fighting 闪烁 */
    grp.traverse(o => {
      if ((o as THREE.Mesh).isMesh) {
        const m = (o as THREE.Mesh).material as THREE.Material
        m.polygonOffset = true
        m.polygonOffsetFactor = -2
        m.polygonOffsetUnits = -2
      }
    })

    return grp
  }

  update(
    observer: ObserverState | null,
    center: THREE.Vector3,
    frameRotC: number, frameRotS: number,
    frame: string,
  ): void {
    this.satGroup.visible = !!observer
    if (!observer) return
    this.satW.copy(observer.positionAu)

    const pos = this.satW.clone().sub(center)
    if (!(frameRotS === 0 && frameRotC === 1)) {
      const x = pos.x, y = pos.y
      pos.x = x * frameRotC + y * frameRotS
      pos.y = -x * frameRotS + y * frameRotC
    }
    this.satGroup.position.copy(pos)

    const ss = frame === 'helio' ? 1.2e-4 : (frame === 'l1' ? 8e-4 : 6e-6)
    this.satModel.scale.setScalar(ss)
    this.satModel.quaternion.identity()
  }

  /** 望远镜本地 -X 是光轴；天球网格所在父组不随载荷姿态旋转。 */
  setPointing(axis: THREE.Vector3, right: THREE.Vector3, up: THREE.Vector3): void {
    this.satModel.quaternion.setFromRotationMatrix(
      new THREE.Matrix4().makeBasis(axis.clone().negate(), right, up))
  }
}
