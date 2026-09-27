import * as THREE from 'three'
import { outputColor } from '../rendering/materials'
import type { FrameType } from '@/types/scene'
import type { EarthAtmosphereState } from '../terrain/EarthSurfaceSystem'
import { D2R, TAU } from '@/utils/orbital/constants'
import { texUrl } from '../textureTier'
import { loadKtx2 } from '../textures'
import { withAniso } from '../utils'

interface ScalarUniform {
  value: number
}

export interface SceneEnvironmentFrame {
  frame: FrameType
  showGrid: boolean
  showAxes: boolean
  showSky: boolean
  cameraTarget: THREE.Vector3
  surfaceNear?: number
  earthAtmosphere?: EarthAtmosphereState
}

/** 星空背景、参考辅助线和视口尺寸的统一运行时。 */
export class SceneEnvironmentSystem {
  atmosphereOpacity = 1
  private readonly scene: THREE.Scene
  private readonly camera: THREE.PerspectiveCamera
  private readonly renderer: THREE.WebGLRenderer
  private readonly pixelScale: ScalarUniform
  private readonly starsMesh: THREE.Points
  private readonly skyMesh: THREE.Mesh
  private readonly gridHelper: THREE.PolarGridHelper
  private readonly axesHelper: THREE.AxesHelper
  private skyReady = false
  private disposed = false
  private readonly groundSkyOpacity = { value: 0 }
  private readonly daylight = { value: 0 }
  private readonly skyUp = { value: new THREE.Vector3(0, 0, 1) }
  private readonly sunDirection = { value: new THREE.Vector3(1, 0, 0) }
  private readonly spaceVisibility = { value: 1 }

  constructor(
    scene: THREE.Scene,
    camera: THREE.PerspectiveCamera,
    renderer: THREE.WebGLRenderer,
    pixelScale: ScalarUniform,
  ) {
    this.scene = scene
    this.camera = camera
    this.renderer = renderer
    this.pixelScale = pixelScale
    this.starsMesh = this.buildStars()
    this.skyMesh = this.buildSky()
    this.gridHelper = this.buildGrid()
    this.axesHelper = new THREE.AxesHelper(1)
    this.axesHelper.visible = false
    this.scene.add(this.axesHelper)

    window.addEventListener('resize', this.resize)
    this.resize()
  }

  applyFrame(frame: FrameType, showGrid: boolean, showAxes: boolean): void {
    this.gridHelper.visible = frame === 'helio' && showGrid
    this.axesHelper.visible = frame !== 'helio' && showAxes
    if (frame !== 'comp') this.axesHelper.scale.setScalar(0.002)
  }

  setCompAxisScale(scale: number): void {
    this.axesHelper.scale.setScalar(scale)
  }

  update(input: SceneEnvironmentFrame): void {
    this.gridHelper.visible = input.showGrid && input.frame === 'helio'
    this.axesHelper.visible = input.showAxes && input.frame !== 'helio'
    const atmosphere = input.earthAtmosphere
    const altitude = atmosphere?.altitude ?? Infinity
    // 沿用 demo 的高度过渡；天空与太空光晕重叠淡入淡出，不在壳层边界硬切。
    this.groundSkyOpacity.value = 1 - THREE.MathUtils.smoothstep(altitude, 12000, 110000)
    this.atmosphereOpacity = THREE.MathUtils.smoothstep(altitude, 60000, 120000)
    if (atmosphere) {
      this.skyUp.value.copy(atmosphere.up)
      this.sunDirection.value.copy(atmosphere.sunDirection)
      this.daylight.value = THREE.MathUtils.smoothstep(atmosphere.up.dot(atmosphere.sunDirection), -0.12, 0.12)
    }
    this.spaceVisibility.value = input.showSky ? 1 : 0
    this.skyMesh.visible = (input.showSky && this.skyReady) || this.groundSkyOpacity.value > 0
    const stars = this.starsMesh.material as THREE.PointsMaterial
    stars.opacity = 1 - this.groundSkyOpacity.value * this.daylight.value
    this.starsMesh.visible = input.showSky && stars.opacity > 0
    this.starsMesh.position.copy(this.camera.position)
    this.skyMesh.position.copy(this.camera.position)

    const cameraDistance = Math.max(
      this.camera.position.distanceTo(input.cameraTarget),
      1e-6,
    )
    const near = input.surfaceNear ?? Math.min(0.002, Math.max(1e-7, cameraDistance * 1e-5))
    const far = 3400
    if (near !== this.camera.near || far !== this.camera.far) {
      this.camera.near = near
      this.camera.far = far
      this.camera.updateProjectionMatrix()
    }
  }

  dispose(): void {
    this.disposed = true
    window.removeEventListener('resize', this.resize)
  }

  private readonly resize = (): void => {
    const canvas = this.renderer.domElement
    const width = canvas.clientWidth
    const height = canvas.clientHeight
    if (width === 0 || height === 0) return
    this.camera.aspect = width / height
    this.camera.updateProjectionMatrix()
    this.renderer.setSize(width, height, false)
    this.pixelScale.value = canvas.height / (2 * Math.tan(this.camera.fov * D2R / 2))
  }

  private buildStars(): THREE.Points {
    const count = 3500
    const positions = new Float32Array(count * 3)
    for (let i = 0; i < count; i++) {
      const theta = Math.random() * TAU
      const phi = Math.acos(2 * Math.random() - 1)
      const radius = 700 + Math.random() * 300
      positions[3 * i] = radius * Math.sin(phi) * Math.cos(theta)
      positions[3 * i + 1] = radius * Math.sin(phi) * Math.sin(theta)
      positions[3 * i + 2] = radius * Math.cos(phi)
    }
    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    const stars = new THREE.Points(
      geometry,
      new THREE.PointsMaterial({ color: 0xffffff, size: 0.4, sizeAttenuation: false, transparent: true, depthWrite: false }),
    )
    this.scene.add(stars)
    return stars
  }

  private buildSky(): THREE.Mesh {
    const material = new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false,
      uniforms: { map: { value: null }, ready: { value: false }, up: this.skyUp, sun: this.sunDirection,
        ground: this.groundSkyOpacity, daylight: this.daylight, spaceVisibility: this.spaceVisibility,
        horizon: { value: new THREE.Color(0x8cadc9) }, zenith: { value: new THREE.Color(0x11458f) }, tint: { value: new THREE.Color(0xaec8e2) } },
      vertexShader: `varying vec2 vUv; varying vec3 direction;
        void main(){vUv=uv;direction=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
      fragmentShader: `uniform sampler2D map; uniform bool ready;
        uniform vec3 up,sun,horizon,zenith,tint;uniform float ground,daylight,spaceVisibility;
        varying vec2 vUv;varying vec3 direction;
        void main(){vec3 d=normalize(direction);
          vec3 day=mix(horizon,zenith,pow(clamp(dot(d,up),0.,1.),.4));
          day+=vec3(.035,.025,.012)*pow(clamp(dot(d,sun),0.,1.),32.);
          vec3 space=ready?texture2D(map,vUv).rgb*tint*spaceVisibility:vec3(0.);
          vec3 night=vec3(.001,.003,.008)+space*.18;
          gl_FragColor=vec4(mix(space,mix(night,day,daylight),ground),1.);
          ${outputColor}
        }`,
    })
    const sky = new THREE.Mesh(new THREE.SphereGeometry(3200, 48, 24), material)
    sky.visible = false
    sky.renderOrder = -1
    sky.frustumCulled = false
    this.scene.add(sky)

    loadKtx2(texUrl('starmap_4k.jpg'), (texture) => {
      if (this.disposed) {
        texture.dispose()
        return
      }
      withAniso(texture)
      texture.colorSpace = THREE.SRGBColorSpace
      material.uniforms.map.value = texture
      material.uniforms.ready.value = true
      material.needsUpdate = true
      this.skyReady = true
    })
    return sky
  }

  private buildGrid(): THREE.PolarGridHelper {
    const grid = new THREE.PolarGridHelper(5.5, 16, 6, 64, 0x2a4a6e, 0x14283f)
    const material = grid.material as THREE.Material
    material.transparent = true
    material.opacity = 0.5
    material.depthWrite = false
    grid.rotation.x = -Math.PI / 2
    this.scene.add(grid)
    return grid
  }
}
