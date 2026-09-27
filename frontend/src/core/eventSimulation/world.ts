import type * as THREE from 'three'
import type { EarthSurfaceSystem } from '../terrain/EarthSurfaceSystem'

/** demo 的米制局部世界适配到主场景；不持有 renderer 或控制器的所有权。 */
export interface SimulationWorld {
  scene: THREE.Group
  renderer: THREE.WebGLRenderer
  origin: THREE.Vector3
  camera: THREE.PerspectiveCamera
  controls: { target: THREE.Vector3; update(): void }
  ambient: THREE.AmbientLight
  terrain: {
    height: EarthSurfaceSystem['sampleHeight']
    setCraterProgress: EarthSurfaceSystem['setCraterProgress']
  }
  positionAt(lon: number, lat: number, height: number): THREE.Vector3
  setCamera(position: THREE.Vector3, target: THREE.Vector3, up: THREE.Vector3, fov: number): void
}
