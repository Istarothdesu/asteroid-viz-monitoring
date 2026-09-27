import * as THREE from 'three'
import type { AsteroidRecord } from '@/types/asteroid'
import { astPos } from '@/utils/orbital/asteroids'
import { displayRadius, markerScale, glowSprite, createDotTexture } from '@/core/utils'
import { spinTheta } from '@/utils/orbital/time'

/** 命名小行星的几何、位置缓存和远景标记层。 */
export class NamedAsteroidSystem {
  readonly meshes: THREE.Mesh[] = []
  private readonly worldPositions: THREE.Vector3[]
  private readonly glows: THREE.Sprite[] = []

  constructor(scene: THREE.Scene, asteroids: AsteroidRecord[]) {
    this.worldPositions = asteroids.map(() => new THREE.Vector3())
    const geometry = new THREE.IcosahedronGeometry(1, 0)
    const dotTexture = createDotTexture()

    asteroids.forEach((asteroid) => {
      const nearEarth = asteroid.cls.includes('近地')
      const material = new THREE.MeshPhongMaterial({
        color: nearEarth ? 0xcc6655 : 0x8fb8c4,
        shininess: 3,
        polygonOffset: true,
        polygonOffsetFactor: -2,
        polygonOffsetUnits: -2,
      })
      const mesh = new THREE.Mesh(geometry, material)
      const glow = glowSprite(dotTexture, nearEarth ? 0xff7755 : 0x9fd0dd, 0.9)
      mesh.add(glow)
      scene.add(mesh)
      this.meshes.push(mesh)
      this.glows.push(glow)
    })
  }

  getMesh(index: number): THREE.Mesh | undefined {
    return this.meshes[index]
  }

  computeWorldPosition(index: number, asteroid: AsteroidRecord, jd: number): THREE.Vector3 {
    const position = this.worldPositions[index]
    astPos(asteroid, jd, position)
    return position
  }

  update(
    asteroids: AsteroidRecord[],
    jd: number,
    center: THREE.Vector3,
    rotationCos: number,
    rotationSin: number,
    followSpin: boolean,
    sizeScale: number,
    cameraPosition: THREE.Vector3,
    pixelScale: number,
  ): void {
    for (let index = 0; index < this.meshes.length; index++) {
      const asteroid = asteroids[index]
      const mesh = this.meshes[index]
      mesh.position.copy(this.computeWorldPosition(index, asteroid, jd)).sub(center)
      const x = mesh.position.x
      const y = mesh.position.y
      mesh.position.x = x * rotationCos + y * rotationSin
      mesh.position.y = -x * rotationSin + y * rotationCos

      const radius = displayRadius(asteroid.diam / 2, sizeScale)
      mesh.rotation.z = followSpin ? spinTheta(asteroid.spinH ?? 6, jd) : 0
      mesh.scale.setScalar(radius)

      if (radius > 0) {
        const distance = cameraPosition.distanceTo(mesh.position)
        const visible = (radius / distance) * pixelScale < 4
        const glow = this.glows[index]
        glow.visible = visible
        if (visible) glow.scale.setScalar(markerScale(radius, distance, 2, 0.0075) / radius)
      }
    }
  }
}
