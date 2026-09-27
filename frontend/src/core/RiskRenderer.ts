import * as THREE from 'three'
import type {
  BPlaneScenePayload,
  EncounterDensityScenePayload,
  UncertaintyTubeScenePayload,
} from './sceneProducts/types'
import { AU_KM } from '@/utils/orbital/constants'
import { SCENE_VISUALS } from './sceneLayers'

/**
 * 名义 B 平面的场景表达。几何使用真实 AU/km 比例，并作为地球局部诊断面
 * 附着于当前地球原点；拖动事件时间轴不会让它在地心场景中漂移。
 */
export class RiskRenderer {
  private readonly group = new THREE.Group()
  private readonly tubeSurface: THREE.Mesh
  private readonly tube: THREE.LineSegments
  private readonly tubeCenterLine: THREE.Line
  private readonly plane: THREE.Mesh
  private readonly densityPlane: THREE.Mesh
  private readonly densityTexture: THREE.CanvasTexture
  private readonly frame: THREE.Line
  private readonly grid: THREE.LineSegments
  private readonly impactCircle: THREE.Line
  private readonly impactDisk: THREE.Mesh
  private readonly bVector: THREE.Line
  private readonly bArrow: THREE.ArrowHelper
  private readonly xiAxis: THREE.Line
  private readonly zetaAxis: THREE.Line
  private readonly uncertaintyOneSigma: THREE.Line
  private readonly uncertaintyEllipse: THREE.Line
  private readonly planeMark = new THREE.Object3D()
  private readonly bVectorMark = new THREE.Object3D()
  private readonly xiMark = new THREE.Object3D()
  private readonly zetaMark = new THREE.Object3D()
  private readonly impactMark = new THREE.Object3D()
  private readonly densityMark = new THREE.Object3D()
  private readonly _x = new THREE.Vector3()
  private readonly _y = new THREE.Vector3()
  private readonly _z = new THREE.Vector3()
  private readonly _basis = new THREE.Matrix4()
  private last: BPlaneScenePayload | null = null
  private lastDensity: EncounterDensityScenePayload | null = null
  private densityRenderable = false
  private tubeData: UncertaintyTubeScenePayload | null = null
  /** 管线顶点保留日心 float64；每帧仅做平移/坐标系旋转后写入 GPU float32。 */
  private tubeWorld: Float64Array | null = null
  private tubeSurfaceWorld: Float64Array | null = null
  private tubeCenterWorld: Float64Array | null = null

  constructor(scene: THREE.Scene) {
    this.tubeSurface = new THREE.Mesh(
      new THREE.BufferGeometry(),
      new THREE.MeshBasicMaterial({ color: SCENE_VISUALS.uncertaintyTube.color, transparent: true, opacity: 0.075, side: THREE.DoubleSide, depthTest: false, depthWrite: false }),
    )
    this.tubeSurface.visible = false
    this.tubeSurface.frustumCulled = false
    this.tubeSurface.renderOrder = 12
    scene.add(this.tubeSurface)
    this.tube = new THREE.LineSegments(
      new THREE.BufferGeometry(),
      new THREE.LineBasicMaterial({ color: SCENE_VISUALS.uncertaintyTube.color, transparent: true, opacity: 0.98, depthTest: false, depthWrite: false }),
    )
    this.tube.visible = false
    this.tube.frustumCulled = false
    this.tube.renderOrder = 14
    scene.add(this.tube)
    this.tubeCenterLine = new THREE.Line(
      new THREE.BufferGeometry(),
      new THREE.LineBasicMaterial({ color: 0xffc1ff, transparent: true, opacity: 1, depthTest: false, depthWrite: false }),
    )
    this.tubeCenterLine.visible = false
    this.tubeCenterLine.frustumCulled = false
    this.tubeCenterLine.renderOrder = 15
    scene.add(this.tubeCenterLine)
    this.plane = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 1),
      new THREE.MeshBasicMaterial({ color: SCENE_VISUALS.bPlane.color, transparent: true, opacity: 0.055, side: THREE.DoubleSide, depthWrite: false }),
    )
    const densityCanvas = document.createElement('canvas')
    this.densityTexture = new THREE.CanvasTexture(densityCanvas)
    this.densityTexture.colorSpace = THREE.SRGBColorSpace
    this.densityPlane = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 1),
      new THREE.MeshBasicMaterial({ map: this.densityTexture, transparent: true, side: THREE.DoubleSide, depthTest: false, depthWrite: false }),
    )
    this.densityPlane.visible = false
    this.frame = new THREE.Line(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ color: SCENE_VISUALS.bPlane.color, transparent: true, opacity: 0.95 }))
    this.grid = new THREE.LineSegments(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ color: 0x3d89bd, transparent: true, opacity: 0.32 }))
    this.impactCircle = new THREE.Line(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ color: SCENE_VISUALS.impactSection.color, transparent: true, opacity: 0.95 }))
    this.impactDisk = new THREE.Mesh(
      new THREE.CircleGeometry(1, 64),
      new THREE.MeshBasicMaterial({ color: SCENE_VISUALS.impactSection.color, transparent: true, opacity: 0.26, side: THREE.DoubleSide, depthTest: false, depthWrite: false }),
    )
    this.bVector = new THREE.Line(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ color: 0xffd166, transparent: true, opacity: 1 }))
    this.bArrow = new THREE.ArrowHelper(new THREE.Vector3(1, 0, 0), new THREE.Vector3(), 1, 0xffd166)
    this.xiAxis = new THREE.Line(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ color: 0x73d8ff, transparent: true, opacity: 0.8 }))
    this.zetaAxis = new THREE.Line(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ color: 0xb79cff, transparent: true, opacity: 0.8 }))
    this.uncertaintyOneSigma = new THREE.Line(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ color: 0x57edff, transparent: true, opacity: 0.95 }))
    this.uncertaintyEllipse = new THREE.Line(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ color: 0xd8a6ff, transparent: true, opacity: 0.95 }))
    this.group.add(
      this.plane, this.densityPlane, this.frame, this.grid, this.impactDisk, this.impactCircle, this.bVector, this.bArrow,
      this.xiAxis, this.zetaAxis, this.uncertaintyOneSigma, this.uncertaintyEllipse,
      this.planeMark, this.bVectorMark, this.xiMark, this.zetaMark, this.impactMark, this.densityMark,
    )
    this.group.visible = false
    this.group.frustumCulled = false
    this.plane.renderOrder = 10
    // 密度与有效撞击截面共面；将其置于圆盘之上，保证两者的重叠关系可读。
    this.densityPlane.renderOrder = 13.5
    ;[this.frame, this.grid, this.impactCircle, this.bVector, this.xiAxis, this.zetaAxis, this.uncertaintyOneSigma, this.uncertaintyEllipse].forEach((line) => {
      line.renderOrder = line === this.impactCircle ? 13 : 11
      const material = line.material as THREE.LineBasicMaterial
      material.depthTest = false
      material.depthWrite = false
    })
    this.bArrow.renderOrder = 12
    const arrowParts = [this.bArrow.line, this.bArrow.cone]
    arrowParts.forEach((part) => {
      part.renderOrder = 12
      const material = part.material as THREE.Material
      material.depthTest = false
      material.depthWrite = false
    })
    scene.add(this.group)
  }

  /** B 平面专用取景所需的半边长（AU），与实际渲染尺寸同源。 */
  viewHalfAu(bplane: BPlaneScenePayload): number {
    return Math.max(bplane.effectiveImpactRadiusKm * 4, bplane.bMagnitudeKm * 1.25) / AU_KM
  }

  /** 协方差热区局部取景的半边长（4σ，AU）。 */
  densityViewHalfAu(density: EncounterDensityScenePayload): number {
    const [[a, b], [, d]] = density.bPlaneCovarianceKm2
    const maxVariance = Math.max(0, (a + d + Math.hypot(a - d, 2 * b)) / 2)
    return Math.sqrt(maxVariance) * 4 / AU_KM
  }

  /** 供 DOM 标签层投影的局部锚点；标签不属于 WebGPU 几何，零额外纹理成本。 */
  labelPoints(): { key: string; label: string; object: THREE.Object3D }[] {
    if (!this.group.visible) return []
    const labels = this.planeMark.visible ? [
      { key: 'risk-bplane', label: 'B 平面', object: this.planeMark },
      { key: 'risk-bvector', label: 'B 向量', object: this.bVectorMark },
      { key: 'risk-xi', label: 'ξ 轴', object: this.xiMark },
      { key: 'risk-zeta', label: 'ζ 轴', object: this.zetaMark },
      { key: 'risk-impact', label: '有效撞击截面', object: this.impactMark },
    ] : []
    if (this.densityMark.visible) labels.push({ key: 'risk-density', label: 'B 平面遭遇密度', object: this.densityMark })
    return labels
  }

  update(
    bplane: BPlaneScenePayload | null,
    tube: UncertaintyTubeScenePayload | null,
    density: EncounterDensityScenePayload | null,
    earthWorld: THREE.Vector3,
    center: THREE.Vector3,
    rotC: number,
    rotS: number,
    enabled: boolean,
    densityEnabled: boolean,
    tubeEnabled: boolean,
  ): void {
    const visible = !!bplane && (enabled || densityEnabled)
    this.group.visible = visible
    this._updateTube(tube, bplane, center, rotC, rotS, tubeEnabled)
    if (!visible || !bplane) return
    this.group.position.copy(earthWorld).sub(center)
    const px = this.group.position.x
    const py = this.group.position.y
    this.group.position.set(px * rotC + py * rotS, -px * rotS + py * rotC, this.group.position.z)
    if (this.last !== bplane || this.lastDensity !== density) {
      this.last = bplane
      this.lastDensity = density
      this._rebuild(bplane, density, rotC, rotS)
    } else this._setBasis(bplane, rotC, rotS)
    this._setLayerVisibility(enabled, densityEnabled, bplane.bMagnitudeKm > 0)
  }

  private _setLayerVisibility(bPlaneEnabled: boolean, densityEnabled: boolean, hasBVector: boolean): void {
    ;[
      this.plane, this.frame, this.grid, this.impactCircle, this.impactDisk,
      this.bVector, this.xiAxis, this.zetaAxis,
      this.planeMark, this.bVectorMark, this.xiMark, this.zetaMark, this.impactMark,
    ].forEach(object => { object.visible = bPlaneEnabled })
    this.bArrow.visible = bPlaneEnabled && hasBVector
    const showDensity = densityEnabled && this.densityRenderable
    this.densityPlane.visible = showDensity
    this.uncertaintyOneSigma.visible = showDensity
    this.uncertaintyEllipse.visible = showDensity
    this.densityMark.visible = showDensity
  }

  /** 用 12 边线框连接相邻 3σ 椭圆截面，避免大面积透明网格遮挡近遇轨道。 */
  private _updateTube(
    tube: UncertaintyTubeScenePayload | null,
    bplane: BPlaneScenePayload | null,
    center: THREE.Vector3,
    rotC: number,
    rotS: number,
    enabled: boolean,
  ) {
    const visible = !!tube && enabled && tube.sections.length > 1
    this.tube.visible = visible
    this.tubeSurface.visible = visible
    this.tubeCenterLine.visible = visible
    if (!visible || !tube) return
    if (this.tubeData !== tube) {
      this.tubeData = tube
      /* 名义轨迹穿过有效撞击截面时，物理轨迹在最近点结束；继续绘制出射半管
         会产生“穿透地球后仍存在”的假象。仅有少数协方差样本命中时不裁名义管。 */
      const nominalHits = !!bplane && bplane.bMagnitudeKm <= bplane.effectiveImpactRadiusKm
      this._rebuildTube(tube, nominalHits ? bplane.closestJd : null)
    }
    this._writeWorldPositions(this.tubeWorld, this.tube.geometry, center, rotC, rotS)
    this._writeWorldPositions(this.tubeSurfaceWorld, this.tubeSurface.geometry, center, rotC, rotS)
    this._writeWorldPositions(this.tubeCenterWorld, this.tubeCenterLine.geometry, center, rotC, rotS)
  }

  private _writeWorldPositions(source: Float64Array | null, geometry: THREE.BufferGeometry, center: THREE.Vector3, rotC: number, rotS: number) {
    const position = geometry.getAttribute('position') as THREE.BufferAttribute | undefined
    if (!source || !position) return
    const out = position.array as Float32Array
    for (let i = 0; i < source.length; i += 3) {
      const x = source[i] - center.x
      const y = source[i + 1] - center.y
      out[i] = x * rotC + y * rotS
      out[i + 1] = -x * rotS + y * rotC
      out[i + 2] = source[i + 2] - center.z
    }
    position.needsUpdate = true
  }

  private _rebuildTube(tube: UncertaintyTubeScenePayload, clipAfterJd: number | null) {
    const sections = clipAfterJd == null
      ? tube.sections
      : tube.sections.filter((section) => section.jd <= clipAfterJd + 1e-9)
    if (sections.length < 2) return
    const ringSides = 12
    const vertices: number[] = []
    const surface: number[] = []
    const centerLine: number[] = []
    const point = (section: UncertaintyTubeScenePayload['sections'][number], index: number) => {
      const angle = index / ringSides * Math.PI * 2
      const a = Math.cos(angle) * section.radiusAAu
      const b = Math.sin(angle) * section.radiusBAu
      return [
        section.centerEclipticAu[0] + section.axisAEcliptic[0] * a + section.axisBEcliptic[0] * b,
        section.centerEclipticAu[1] + section.axisAEcliptic[1] * a + section.axisBEcliptic[1] * b,
        section.centerEclipticAu[2] + section.axisAEcliptic[2] * a + section.axisBEcliptic[2] * b,
      ]
    }
    const add = (p: number[]) => vertices.push(p[0], p[1], p[2])
    for (let sectionIndex = 0; sectionIndex < sections.length; sectionIndex++) {
      const section = sections[sectionIndex]
      centerLine.push(...section.centerEclipticAu)
      for (let side = 0; side < ringSides; side++) {
        add(point(section, side)); add(point(section, (side + 1) % ringSides))
        if (sectionIndex < sections.length - 1) {
          add(point(section, side)); add(point(sections[sectionIndex + 1], side))
          const p00 = point(section, side)
          const p01 = point(section, (side + 1) % ringSides)
          const p10 = point(sections[sectionIndex + 1], side)
          const p11 = point(sections[sectionIndex + 1], (side + 1) % ringSides)
          surface.push(...p00, ...p10, ...p11, ...p00, ...p11, ...p01)
        }
      }
    }
    this.tubeWorld = Float64Array.from(vertices)
    this.tubeSurfaceWorld = Float64Array.from(surface)
    this.tubeCenterWorld = Float64Array.from(centerLine)
    this.tube.geometry.dispose()
    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(vertices.length), 3).setUsage(THREE.DynamicDrawUsage))
    this.tube.geometry = geometry
    this.tubeSurface.geometry.dispose()
    const surfaceGeometry = new THREE.BufferGeometry()
    surfaceGeometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(surface.length), 3).setUsage(THREE.DynamicDrawUsage))
    this.tubeSurface.geometry = surfaceGeometry
    this.tubeCenterLine.geometry.dispose()
    const centerGeometry = new THREE.BufferGeometry()
    centerGeometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(centerLine.length), 3).setUsage(THREE.DynamicDrawUsage))
    this.tubeCenterLine.geometry = centerGeometry
  }

  private _toSceneAxis(values: [number, number, number], out: THREE.Vector3, rotC: number, rotS: number) {
    out.set(values[0] * rotC + values[1] * rotS, -values[0] * rotS + values[1] * rotC, values[2]).normalize()
  }

  private _setBasis(bplane: BPlaneScenePayload, rotC: number, rotS: number) {
    this._toSceneAxis(bplane.xiAxisEcliptic, this._x, rotC, rotS)
    this._toSceneAxis(bplane.zetaAxisEcliptic, this._y, rotC, rotS)
    this._toSceneAxis(bplane.incomingDirectionEcliptic, this._z, rotC, rotS)
    this._basis.makeBasis(this._x, this._y, this._z)
    this.group.setRotationFromMatrix(this._basis)
  }

  private _rebuild(bplane: BPlaneScenePayload, density: EncounterDensityScenePayload | null, rotC: number, rotS: number) {
    this._setBasis(bplane, rotC, rotS)
    const halfAu = this.viewHalfAu(bplane)
    this.plane.geometry.dispose()
    this.plane.geometry = new THREE.PlaneGeometry(halfAu * 2, halfAu * 2, 1, 1)
    this._replaceLine(this.frame, [
      new THREE.Vector3(-halfAu, -halfAu, 0), new THREE.Vector3(halfAu, -halfAu, 0),
      new THREE.Vector3(halfAu, halfAu, 0), new THREE.Vector3(-halfAu, halfAu, 0),
      new THREE.Vector3(-halfAu, -halfAu, 0),
    ])
    this._replaceLine(this.grid, this._grid(halfAu))
    const radius = bplane.effectiveImpactRadiusKm / AU_KM
    this.impactDisk.geometry.dispose()
    this.impactDisk.geometry = new THREE.CircleGeometry(radius, 64)
    const ring = Array.from({ length: 65 }, (_, i) => {
      const a = (i / 64) * Math.PI * 2
      return new THREE.Vector3(Math.cos(a) * radius, Math.sin(a) * radius, 0)
    })
    this.impactCircle.geometry.dispose()
    this.impactCircle.geometry = new THREE.BufferGeometry().setFromPoints(ring)
    const bx = bplane.xiKm / AU_KM
    const by = bplane.zetaKm / AU_KM
    const bLength = Math.hypot(bx, by)
    this._replaceLine(this.bVector, [new THREE.Vector3(), new THREE.Vector3(bx, by, 0)])
    this.bArrow.visible = bLength > 0
    if (bLength > 0) {
      /* 线段保留真实 B 向量长度；箭头头部只作方向提示。
         有协方差热区时再受 4σ 热区尺寸限制，避免在局部取景中遮挡密度峰值。 */
      const heatCap = density ? this.densityViewHalfAu(density) * 0.35 : Infinity
      const headLength = Math.min(halfAu * 0.024, bLength * 0.035, heatCap)
      const headWidth = headLength * 0.45
      this.bArrow.position.set(0, 0, 0)
      this.bArrow.setDirection(new THREE.Vector3(bx / bLength, by / bLength, 0))
      this.bArrow.setLength(bLength, headLength, headWidth)
    }
    this._replaceLine(this.xiAxis, [new THREE.Vector3(-halfAu, 0, 0), new THREE.Vector3(halfAu, 0, 0)])
    this._replaceLine(this.zetaAxis, [new THREE.Vector3(0, -halfAu, 0), new THREE.Vector3(0, halfAu, 0)])
    this._rebuildDensity(density)
    this._replaceLine(this.uncertaintyOneSigma, density ? this._ellipse(density, 1) : [])
    this._replaceLine(this.uncertaintyEllipse, density ? this._ellipse(density, 3) : [])
    /* 标签锚点留在中心 1/3，避免被专题页两侧信息栏裁掉。 */
    this.planeMark.position.set(-halfAu * 0.22, halfAu * 0.22, 0)
    this.bVectorMark.position.set(bx * 0.25, by * 0.25, 0)
    this.xiMark.position.set(halfAu * 0.28, -halfAu * 0.04, 0)
    this.zetaMark.position.set(-halfAu * 0.04, halfAu * 0.28, 0)
    this.impactMark.position.set(radius * 1.7, radius * 1.7, 0)
    this.densityMark.visible = !!density
    this.densityMark.position.set(bx, by, 0)
  }

  private _grid(halfAu: number): THREE.Vector3[] {
    const points: THREE.Vector3[] = []
    for (let i = -4; i <= 4; i++) {
      if (i === 0) continue
      const v = halfAu * i / 4
      points.push(new THREE.Vector3(v, -halfAu, 0), new THREE.Vector3(v, halfAu, 0))
      points.push(new THREE.Vector3(-halfAu, v, 0), new THREE.Vector3(halfAu, v, 0))
    }
    return points
  }

  /** B 平面局部协方差的等密度轮廓；它是遭遇不确定性廊道，不是地表撞击走廊。 */
  private _ellipse(density: EncounterDensityScenePayload, sigma: number): THREE.Vector3[] {
    const [[a, b], [, d]] = density.bPlaneCovarianceKm2
    const delta = Math.hypot(a - d, 2 * b)
    const major = Math.sqrt(Math.max(0, (a + d + delta) / 2)) * sigma / AU_KM
    const minor = Math.sqrt(Math.max(0, (a + d - delta) / 2)) * sigma / AU_KM
    const angle = 0.5 * Math.atan2(2 * b, a - d)
    const cx = density.nominalBPlane.xiKm / AU_KM
    const cy = density.nominalBPlane.zetaKm / AU_KM
    return Array.from({ length: 65 }, (_, i) => {
      const t = (i / 64) * Math.PI * 2
      const x = Math.cos(t) * major
      const y = Math.sin(t) * minor
      return new THREE.Vector3(cx + x * Math.cos(angle) - y * Math.sin(angle), cy + x * Math.sin(angle) + y * Math.cos(angle), 0)
    })
  }

  /**
   * B 平面二维高斯的相对密度热图。峰值为名义 B 向量落点；不读取 hitCount，
   * 因此无地球撞击样本时仍能如实展示遭遇不确定性。
   */
  private _rebuildDensity(density: EncounterDensityScenePayload | null): void {
    this.densityRenderable = !!density
    this.densityPlane.visible = this.densityRenderable
    if (!density) return
    const [[a, b], [, d]] = density.bPlaneCovarianceKm2
    const det = a * d - b * b
    if (!(a > 0 && d > 0 && det > 0)) {
      this.densityRenderable = false
      this.densityPlane.visible = false
      return
    }
    const halfXiKm = Math.sqrt(a) * 4
    const halfZetaKm = Math.sqrt(d) * 4
    const widthKm = halfXiKm * 2
    const heightKm = halfZetaKm * 2
    const resolution = 128
    const canvas = this.densityTexture.image as HTMLCanvasElement
    canvas.width = resolution
    canvas.height = resolution
    const context = canvas.getContext('2d')
    if (!context) {
      this.densityRenderable = false
      this.densityPlane.visible = false
      return
    }
    const image = context.createImageData(resolution, resolution)
    const invA = d / det
    const invB = -b / det
    const invD = a / det
    for (let iy = 0; iy < resolution; iy++) {
      const y = (0.5 - iy / (resolution - 1)) * heightKm
      for (let ix = 0; ix < resolution; ix++) {
        const x = (ix / (resolution - 1) - 0.5) * widthKm
        const mahalanobis = x * x * invA + 2 * x * y * invB + y * y * invD
        const density = Math.exp(-0.5 * mahalanobis)
        // 真实二维高斯的等密度关系保持不变；仅以 gamma 提亮低密度区域，
        // 防止横向 1σ 在深色 B 平面上退化成看不见的细线。
        const t = Math.pow(density, 0.34)
        const offset = (iy * resolution + ix) * 4
        image.data[offset] = Math.round(35 + 85 * t)
        image.data[offset + 1] = Math.round(105 + 140 * t)
        image.data[offset + 2] = Math.round(245 - 35 * t)
        image.data[offset + 3] = Math.round(24 + 216 * t)
      }
    }
    context.putImageData(image, 0, 0)
    this.densityTexture.needsUpdate = true
    this.densityPlane.geometry.dispose()
    this.densityPlane.geometry = new THREE.PlaneGeometry(widthKm / AU_KM, heightKm / AU_KM)
    this.densityPlane.position.set(
      density.nominalBPlane.xiKm / AU_KM,
      density.nominalBPlane.zetaKm / AU_KM,
      1e-8,
    )
  }

  private _replaceLine(line: THREE.Line, points: THREE.Vector3[]) {
    line.geometry.dispose()
    line.geometry = new THREE.BufferGeometry().setFromPoints(points)
  }

  dispose(): void {
    this.tube.geometry.dispose()
    this.tubeSurface.geometry.dispose()
    this.tubeCenterLine.geometry.dispose()
    this.plane.geometry.dispose()
    this.densityPlane.geometry.dispose()
    this.frame.geometry.dispose()
    this.grid.geometry.dispose()
    this.impactCircle.geometry.dispose()
    this.bVector.geometry.dispose()
    this.xiAxis.geometry.dispose()
    this.zetaAxis.geometry.dispose()
    this.uncertaintyOneSigma.geometry.dispose()
    this.uncertaintyEllipse.geometry.dispose()
    this.densityTexture.dispose()
    ;[this.tubeSurface.material, this.tube.material, this.tubeCenterLine.material, this.plane.material, this.densityPlane.material, this.frame.material, this.grid.material, this.impactDisk.material, this.impactCircle.material, this.bVector.material, this.bArrow.line.material, this.bArrow.cone.material, this.xiAxis.material, this.zetaAxis.material, this.uncertaintyOneSigma.material, this.uncertaintyEllipse.material].forEach((material) => {
      if (Array.isArray(material)) material.forEach((item) => item.dispose())
      else material.dispose()
    })
    this.tube.removeFromParent()
    this.tubeSurface.removeFromParent()
    this.tubeCenterLine.removeFromParent()
    this.group.removeFromParent()
  }
}
