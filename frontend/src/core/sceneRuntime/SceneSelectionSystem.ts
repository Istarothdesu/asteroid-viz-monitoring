import * as THREE from 'three'
import { MOON, PLANETS } from '@/data/planets'
import type { AsteroidRecord } from '@/types/asteroid'
import type { SelectionTarget } from '@/types/scene'
import type { AsteroidCloud } from '../AsteroidCloud'
import type { EarthSystem } from '../EarthSystem'
import type { EventTargetSystem } from './EventTargetSystem'
import type { NamedAsteroidSystem } from './NamedAsteroidSystem'
import type { PickTarget, PickingSystem } from '../PickingSystem'
import type { PlanetSystem } from '../PlanetSystem'
import type { SatelliteModel } from '../SatelliteModel'
import { displayRadius } from '../utils'
import { geometryWorldRadius } from './objectUtils'
import type { SceneCameraRig } from './SceneCameraRig'

const BODY_MODEL_PX = 6
const ORBIT_OFFSET_PX = 0.75
const CLOSEUP_SCREEN_PX = 16

export interface SelectionFrameContext {
  asteroids: AsteroidRecord[]
  sizeScale: number
  eventDiameterKm: number
}

export interface SelectionVisualState {
  hideOrbits: boolean
  selectedWorld: THREE.Vector3 | null
}

interface SceneSelectionSystemOptions {
  scene: THREE.Scene
  camera: THREE.PerspectiveCamera
  canvas: HTMLCanvasElement
  cameraRig: SceneCameraRig
  pickingSystem: PickingSystem
  planetSystem: PlanetSystem
  satelliteModel: SatelliteModel
  earthSystem: EarthSystem
  namedAsteroids: NamedAsteroidSystem
  asteroidCloud: AsteroidCloud
  eventTarget: EventTargetSystem
  onFollowRequested: () => void
  onFollowLost: () => void
}

/** 选择目标的几何解析、拾取集合、光圈和相机跟随协调器。 */
export class SceneSelectionSystem {
  readonly cloudProxy = new THREE.Object3D()

  private readonly camera: THREE.PerspectiveCamera
  private readonly canvas: HTMLCanvasElement
  private readonly cameraRig: SceneCameraRig
  private readonly pickingSystem: PickingSystem
  private readonly planetSystem: PlanetSystem
  private readonly satelliteModel: SatelliteModel
  private readonly earthSystem: EarthSystem
  private readonly namedAsteroids: NamedAsteroidSystem
  private readonly asteroidCloud: AsteroidCloud
  private readonly eventTarget: EventTargetSystem
  private readonly onFollowRequested: () => void
  private readonly onFollowLost: () => void
  private readonly ring: THREE.Mesh
  private readonly outerRing: THREE.Mesh
  private readonly pickTargets: PickTarget[]
  private readonly basePickTargetCount: number
  private readonly meshWorldPosition = new THREE.Vector3()

  constructor(options: SceneSelectionSystemOptions) {
    this.camera = options.camera
    this.canvas = options.canvas
    this.cameraRig = options.cameraRig
    this.pickingSystem = options.pickingSystem
    this.planetSystem = options.planetSystem
    this.satelliteModel = options.satelliteModel
    this.earthSystem = options.earthSystem
    this.namedAsteroids = options.namedAsteroids
    this.asteroidCloud = options.asteroidCloud
    this.eventTarget = options.eventTarget
    this.onFollowRequested = options.onFollowRequested
    this.onFollowLost = options.onFollowLost

    this.ring = this.createRing(1.3, 1.38, 0.9)
    this.outerRing = this.createRing(1.52, 1.58, 0.28)
    options.scene.add(this.ring, this.outerRing)

    this.pickTargets = [
      { kind: 'sun', idx: 0, mesh: this.planetSystem.sunMesh, minPx: 12 },
      ...PLANETS.map((_, index) => ({
        kind: 'planet' as const,
        idx: index,
        mesh: this.planetSystem.planetMeshes[index],
        minPx: 10,
      })),
      { kind: 'moon', idx: 0, mesh: this.planetSystem.moonMesh, minPx: 10 },
      { kind: 'sat', idx: 0, mesh: this.satelliteModel.satGroup, minPx: 12 },
      ...this.namedAsteroids.meshes.map((mesh, index) => ({
        kind: 'ast' as const,
        idx: index,
        mesh,
        minPx: 10,
      })),
    ]
    this.basePickTargetCount = this.pickTargets.length
  }

  updateVisual(
    selected: SelectionTarget | null,
    now: number,
    beltVisible: boolean,
    pixelScale: number,
    context: SelectionFrameContext,
  ): SelectionVisualState {
    this.syncCloudProxy(selected, beltVisible)
    const screenRadius = this.targetScreenRadius(selected, pixelScale, context)
    const hideOrbits = screenRadius > BODY_MODEL_PX
      || this.orbitOffsetPx(selected, pixelScale) > ORBIT_OFFSET_PX
    this.updateRing(selected, now, screenRadius > CLOSEUP_SCREEN_PX)

    const selectedWorld = selected?.kind === 'ast'
      ? (this.namedAsteroids.getMesh(selected.idx)?.position ?? null)
      : selected?.kind === 'cloud' ? this.cloudProxy.position : null
    return { hideOrbits, selectedWorld }
  }

  refreshPickingTargets(): void {
    this.pickTargets.length = this.basePickTargetCount
    if (this.earthSystem.groundRoot.visible) {
      this.earthSystem.stationObjects.forEach((station, index) => {
        if (station.grp.visible) {
          this.pickTargets.push({
            kind: 'station',
            idx: index,
            mesh: station.grp,
            minPx: 12,
          })
        }
      })
    }
    if (this.eventTarget.mesh.visible) {
      this.pickTargets.push({
        kind: 'event',
        idx: 0,
        mesh: this.eventTarget.mesh,
        minPx: 14,
      })
    }
    this.pickingSystem.setTargets(this.pickTargets)
  }

  updateCameraTracking(
    selected: SelectionTarget | null,
    following: boolean,
    now: number,
  ): void {
    const mesh = following ? this.resolveMesh(selected) : null
    if (this.cameraRig.updateFollow(mesh, following)) this.onFollowLost()
    this.cameraRig.updateZoom(
      now,
      selected ? `${selected.kind}:${selected.idx}` : null,
      following,
    )
  }

  zoomTo(selected: SelectionTarget | null, context: SelectionFrameContext): void {
    if (!selected) return
    const radius = this.targetViewRadius(selected, context)
    if (!(radius > 0)) return
    const mesh = this.resolveMesh(selected)
    if (!mesh?.visible) return
    this.onFollowRequested()
    this.cameraRig.startZoom(`${selected.kind}:${selected.idx}`, mesh, radius)
  }

  resolveMesh(target: SelectionTarget | null): THREE.Object3D | null {
    if (!target) return null
    switch (target.kind) {
      case 'sun': return this.planetSystem.sunMesh
      case 'planet': return this.planetSystem.planetMeshes[target.idx] ?? null
      case 'moon': return this.planetSystem.moonMesh
      case 'sat': return this.satelliteModel.satGroup
      case 'ast': return this.namedAsteroids.getMesh(target.idx) ?? null
      case 'event': return this.eventTarget.mesh
      case 'station': return this.earthSystem.stationObjects[target.idx]?.grp ?? null
      case 'cloud': return this.cloudProxy.visible ? this.cloudProxy : null
    }
  }

  private createRing(innerRadius: number, outerRadius: number, opacity: number): THREE.Mesh {
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(innerRadius, outerRadius, 48),
      new THREE.MeshBasicMaterial({
        color: 0xffb74d,
        transparent: true,
        opacity,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
        depthWrite: false,
      }),
    )
    ring.visible = false
    ring.renderOrder = 10
    return ring
  }

  private syncCloudProxy(selected: SelectionTarget | null, beltVisible: boolean): void {
    if (selected?.kind !== 'cloud') {
      this.cloudProxy.visible = false
      return
    }
    const positions = this.asteroidCloud.getPositions()
    this.cloudProxy.position.set(
      positions[3 * selected.idx],
      positions[3 * selected.idx + 1],
      positions[3 * selected.idx + 2],
    )
    this.cloudProxy.visible = beltVisible
  }

  private targetScreenRadius(
    selected: SelectionTarget | null,
    pixelScale: number,
    context: SelectionFrameContext,
  ): number {
    if (!selected) return 0
    const radius = this.targetViewRadius(selected, context)
    const mesh = this.resolveMesh(selected)
    if (!(radius > 0) || !mesh?.visible) return 0
    mesh.getWorldPosition(this.meshWorldPosition)
    const distance = this.camera.position.distanceTo(this.meshWorldPosition)
    return radius / Math.max(distance, 1e-12) * pixelScale
  }

  private orbitOffsetPx(selected: SelectionTarget | null, pixelScale: number): number {
    const mesh = this.resolveMesh(selected)
    if (!mesh?.visible) return 0
    mesh.getWorldPosition(this.meshWorldPosition)
    const quantizationError = this.meshWorldPosition.length() * 1.2e-7
    const distance = this.camera.position.distanceTo(this.meshWorldPosition)
    return quantizationError * pixelScale / Math.max(distance, 1e-12)
  }

  private updateRing(selected: SelectionTarget | null, now: number, closeUp: boolean): void {
    const mesh = selected?.kind === 'ast' ? this.namedAsteroids.getMesh(selected.idx)
      : selected?.kind === 'event' && this.eventTarget.mesh.visible ? this.eventTarget.mesh
      : selected?.kind === 'cloud' && this.cloudProxy.visible ? this.cloudProxy
      : null
    if (!mesh?.visible || closeUp) {
      this.ring.visible = false
      this.outerRing.visible = false
      return
    }

    const geometryRadius = selected?.kind === 'cloud' ? 0 : mesh.scale.x
    mesh.getWorldPosition(this.meshWorldPosition)
    const distance = this.camera.position.distanceTo(this.meshWorldPosition)
    const pixelToWorld = 2 * distance * Math.tan(THREE.MathUtils.degToRad(this.camera.fov) / 2)
      / this.canvas.clientHeight
    const base = Math.max(geometryRadius * 2.2, 30 * pixelToWorld / 2.76)
    const phase = now * 0.004
    const breathe = 1 + 0.09 * Math.sin(phase)

    this.placeRing(this.ring, this.meshWorldPosition, base * breathe, 0.72 + 0.18 * Math.sin(phase))
    this.placeRing(this.outerRing, this.meshWorldPosition, base * breathe, 0.2 + 0.08 * Math.sin(phase))
  }

  private placeRing(
    ring: THREE.Mesh,
    position: THREE.Vector3,
    scale: number,
    opacity: number,
  ): void {
    ring.visible = true
    ring.position.copy(position)
    ring.quaternion.copy(this.camera.quaternion)
    ring.scale.setScalar(scale)
    ;(ring.material as THREE.MeshBasicMaterial).opacity = opacity
  }

  private targetViewRadius(target: SelectionTarget, context: SelectionFrameContext): number {
    switch (target.kind) {
      case 'sun': return displayRadius(695700, context.sizeScale) * 3
      case 'planet': {
        const radius = displayRadius(PLANETS[target.idx].rKm, context.sizeScale)
        return target.idx === 5 ? radius * 2.2 : radius
      }
      case 'moon': return displayRadius(MOON.rKm, context.sizeScale)
      case 'ast': return displayRadius(
        context.asteroids[target.idx].diam / 2,
        context.sizeScale,
      )
      case 'event': return displayRadius(context.eventDiameterKm / 2, context.sizeScale)
      case 'station': return 0.025 * displayRadius(6371, context.sizeScale)
      case 'sat': return geometryWorldRadius(this.satelliteModel.satGroup)
      default: return 0
    }
  }
}
