import * as THREE from 'three'
import { getGroundStationProvider } from '@/features/ground/stationProvider'
import type { GroundStation } from '@/types/asteroid'
import { AU_KM, D2R, OBLIQ, R_EARTH_AU, TAU } from '@/utils/orbital/constants'
import { toECEF } from './terrain/geo.js'
import { EARTH_REFERENCE_RADIUS } from './terrain/coordinates'

const X_AXIS  = new THREE.Vector3(1, 0, 0)
const Y_AXIS  = new THREE.Vector3(0, 1, 0)
const Z_AXIS  = new THREE.Vector3(0, 0, 1)
const tmpV    = new THREE.Vector3()

const GFOV_HX   = 2.5 * D2R  // telescope FOV half-angle (azimuth)
const GFOV_HY   = 1.8 * D2R  // telescope FOV half-angle (elevation)
const H_STATION = 1.001       // station height above Earth center in groundRoot local units
const RISK_BOUNDARY_KM = 7500000  // 短临预警边界半径: 750 万公里 (与旧项目一致)

interface StationObject {
  st: GroundStation
  grp: THREE.Group
  vFix: THREE.Vector3   // station direction in Earth body-fixed frame (unit vector)
  night: boolean
  cone: THREE.Group     // populated by _buildGroundCones()
}

export class EarthSystem {
  readonly groundRoot: THREE.Group        // follows Earth mesh position+scale
  readonly gSpinGroup: THREE.Group        // rotates with GMST quaternion
  readonly stationObjects: StationObject[]
  private readonly riskBoundary: THREE.Mesh
  private readonly qOblQ = new THREE.Quaternion().setFromAxisAngle(X_AXIS, -OBLIQ)
  private readonly nightQ = new THREE.Quaternion()
  private scene: THREE.Scene

  /* 短临预警边界圈 (黄道面测距环): 预警边界为各向同性距离阈值,
     黄道面是近地天体来向密集面, 环上刻度即测距意义 */
  private readonly _boundaryRings = new THREE.Group()

  // Shared cone geometries — rebuilt when gSphereR changes
  private _lastGSphereR = -1
  private _sideGeo?: THREE.BufferGeometry
  private _rimGeo?: THREE.BufferGeometry
  private _patchGeo?: THREE.BufferGeometry

  // --- 光锥扫掠痕迹 (观测任务详情页): 单站聚焦播放时在天球累积扫过区域 ---
  private static readonly SWEEP_MAX_STEPS = 4096
  private readonly _sweepPos = new Float32Array(EarthSystem.SWEEP_MAX_STEPS * 72)
  private readonly _sweepGeo = new THREE.BufferGeometry()
  private readonly _sweepMesh: THREE.Mesh
  private _sweepSteps = 0
  private _sweepIdx = -1
  private _sweepLastJd = Number.NaN
  private _sweepLastAppendJd = Number.NaN
  private _sweepLastWall = 0
  private _sweepPrev: THREE.Vector3[] | null = null

  // Shared cone materials (created once)
  private readonly _coneSideMat  = new THREE.MeshBasicMaterial({
    color: 0xef9f4f, transparent: true, opacity: 0.09,
    side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false,
  })
  private readonly _conePatchMat = new THREE.MeshBasicMaterial({
    color: 0xef9f4f, transparent: true, opacity: 0.16,
    side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false,
  })
  private readonly _coneRimMat   = new THREE.LineBasicMaterial({
    color: 0xffd69f, transparent: true, opacity: 0.9,
  })

  constructor(scene: THREE.Scene) {
    this.scene = scene
    this.groundRoot = new THREE.Group()
    this.gSpinGroup = new THREE.Group()
    this.groundRoot.add(this.gSpinGroup)
    this.scene.add(this.groundRoot)
    this.groundRoot.visible = false

    this.stationObjects = this._buildStations(getGroundStationProvider().getStations())
    this.riskBoundary   = this._buildRiskBoundary()

    // 扫掠痕迹: 预分配动态缓冲, 地心相对坐标 (不随地球自转, 贴在天球上)
    this._sweepGeo.setAttribute('position', new THREE.BufferAttribute(this._sweepPos, 3))
    this._sweepGeo.setDrawRange(0, 0)
    this._sweepMesh = new THREE.Mesh(this._sweepGeo, new THREE.MeshBasicMaterial({
      color: 0x6ee7b7, transparent: true, opacity: 0.10,
      side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false,
    }))
    this._sweepMesh.visible = false
    this._sweepMesh.frustumCulled = false
    this.scene.add(this._sweepMesh)
  }

  private _buildStations(stations: readonly GroundStation[]): StationObject[] {
    const objects: StationObject[] = []

    for (const st of stations) {
      const grp = new THREE.Group()

      // Station marker dot
      const dot = new THREE.Mesh(
        new THREE.SphereGeometry(0.025, 8, 8),
        new THREE.MeshBasicMaterial({ color: 0xffc266 })
      )
      grp.add(dot)

      // Empty cone group — populated by _buildGroundCones() when gSphereR is first known
      const cone = new THREE.Group()
      cone.visible = false
      grp.add(cone)

      // Body-fixed position vector (unit vector in geographic frame)
      const la = st.lat * D2R, lo = st.lon * D2R
      const vFix = new THREE.Vector3(
        Math.cos(la) * Math.cos(lo),
        Math.cos(la) * Math.sin(lo),
        Math.sin(la)
      )
      grp.position.copy(toECEF(st.lon, st.lat, (H_STATION - 1) * EARTH_REFERENCE_RADIUS))
        .divideScalar(EARTH_REFERENCE_RADIUS)
      // Local +Y = zenith — matches the hit() convention where (tx, 1, ty) has Y=zenith
      grp.quaternion.setFromUnitVectors(Y_AXIS, vFix)

      this.gSpinGroup.add(grp)
      objects.push({ st, grp, vFix, night: false, cone })
    }
    return objects
  }

  private _buildGroundCones(GS_R: number): void {
    // Dispose previous shared geometries
    this._sideGeo?.dispose()
    this._rimGeo?.dispose()
    this._patchGeo?.dispose()

    const H    = H_STATION
    const tanX = Math.tan(GFOV_HX)
    const tanY = Math.tan(GFOV_HY)
    const NE   = 12  // subdivisions per FOV rectangle edge

    // Intersect ray from station origin in direction (tx, 1, ty) with celestial sphere.
    // In station local space: +Y = zenith, Earth center at (0, -H, 0), sphere radius R.
    const hit = (tx: number, ty: number, R: number): THREE.Vector3 => {
      const d  = new THREE.Vector3(tx, 1, ty).normalize()
      const ad = -H * d.y
      const t  = -ad + Math.sqrt(Math.max(0, ad * ad + R * R - H * H))
      return d.multiplyScalar(t)
    }

    // FOV rectangular border (4 edges, NE segments each)
    const border: THREE.Vector3[] = []
    for (let k = 0; k <= NE; k++) border.push(hit(-tanX + 2*tanX*k/NE,  tanY, GS_R))
    for (let k = 1; k <= NE; k++) border.push(hit( tanX,  tanY - 2*tanY*k/NE, GS_R))
    for (let k = 1; k <= NE; k++) border.push(hit( tanX - 2*tanX*k/NE, -tanY, GS_R))
    for (let k = 1; k <  NE; k++) border.push(hit(-tanX, -tanY + 2*tanY*k/NE, GS_R))
    const NB = border.length

    // --- Side: triangle fan from apex (origin) to border ring ---
    const sidePos = new Float32Array(NB * 9)
    for (let k = 0; k < NB; k++) {
      const a = border[k], b = border[(k+1) % NB]
      sidePos[k*9+0] = 0;   sidePos[k*9+1] = 0;   sidePos[k*9+2] = 0
      sidePos[k*9+3] = a.x; sidePos[k*9+4] = a.y; sidePos[k*9+5] = a.z
      sidePos[k*9+6] = b.x; sidePos[k*9+7] = b.y; sidePos[k*9+8] = b.z
    }
    const sideGeo = new THREE.BufferGeometry()
    sideGeo.setAttribute('position', new THREE.BufferAttribute(sidePos, 3))

    // --- Rim: border outline on sphere surface (slightly elevated to avoid z-fight) ---
    const RP = GS_R * 1.005
    // Recover original (tx, ty) from border point: v = d*t, so v.x/v.y = tx, v.z/v.y = ty
    const rimPts = border.map(v => hit(v.x / v.y, v.z / v.y, RP))
    rimPts.push(rimPts[0].clone())  // close the loop
    const rimGeo = new THREE.BufferGeometry().setFromPoints(rimPts)

    // --- Patch: filled footprint grid on sphere surface ---
    const GX = 10, GY = 7
    const patchVerts = new Float32Array((GX+1)*(GY+1)*3)
    for (let j = 0; j <= GY; j++) {
      for (let i = 0; i <= GX; i++) {
        const v   = hit(-tanX + 2*tanX*i/GX, -tanY + 2*tanY*j/GY, RP)
        const idx = (j*(GX+1) + i)*3
        patchVerts[idx] = v.x; patchVerts[idx+1] = v.y; patchVerts[idx+2] = v.z
      }
    }
    const patchIdx: number[] = []
    for (let j = 0; j < GY; j++) {
      for (let i = 0; i < GX; i++) {
        const a = j*(GX+1)+i, b = a+1, c = a+GX+1, d = c+1
        patchIdx.push(a, b, c, b, d, c)
      }
    }
    const patchGeo = new THREE.BufferGeometry()
    patchGeo.setAttribute('position', new THREE.BufferAttribute(patchVerts, 3))
    patchGeo.setIndex(patchIdx)

    this._sideGeo  = sideGeo
    this._rimGeo   = rimGeo
    this._patchGeo = patchGeo

    // Repopulate each station's cone group with the new shared geometry
    for (const g of this.stationObjects) {
      g.cone.clear()
      g.cone.add(
        new THREE.Mesh(sideGeo, this._coneSideMat),
        new THREE.Line(rimGeo, this._coneRimMat),
        new THREE.Mesh(patchGeo, this._conePatchMat),
      )
    }
  }

  private _buildRiskBoundary(): THREE.Mesh {
    /* 短临预警风险边界 (与旧项目一致): 以地球为中心, 半径 750 万公里。
       边界是各向同性的距离阈值 (方向无关), 语义化绘制 = 测距口径:
       极淡半透明壳 (体量感) + 黄道面测距环 (内环虚线 250/500 万, 外环实线 750 万);
       不再用无意义的三角线框球 */
    const boundary = new THREE.Mesh(
      new THREE.SphereGeometry(1, 64, 32),
      new THREE.MeshBasicMaterial({
        color: 0xff8888, transparent: true, opacity: 0.03,
        side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending,
      }),
    )
    boundary.scale.setScalar(RISK_BOUNDARY_KM / AU_KM)

    /* 黄道面测距环 (局部半径按壳缩放反向补偿, 世界半径即真实测距):
       内环虚线 1/3 · 2/3 (交替段), 外环实线 750 万 */
    const R = RISK_BOUNDARY_KM / AU_KM
    const ring = (rAU: number, dash: boolean, opacity: number): THREE.Object3D => {
      const N = 128
      const pts: THREE.Vector3[] = []
      const push = (k: number) => {
        const t = (k / N) * TAU
        pts.push(new THREE.Vector3(rAU * Math.cos(t), rAU * Math.sin(t), 0))
      }
      if (dash) {
        for (let k = 0; k < N; k += 2) { push(k); push(k + 1) }   // 交替段 = 虚线
        return new THREE.LineSegments(
          new THREE.BufferGeometry().setFromPoints(pts),
          new THREE.LineBasicMaterial({ color: 0xff9999, transparent: true, opacity }),
        )
      }
      for (let k = 0; k <= N; k++) push(k)
      return new THREE.Line(
        new THREE.BufferGeometry().setFromPoints(pts),
        new THREE.LineBasicMaterial({ color: 0xff9999, transparent: true, opacity }),
      )
    }
    this._boundaryRings.add(
      ring(R / 3, true, 0.16),
      ring((R * 2) / 3, true, 0.16),
      ring(R, false, 0.42),
    )
    this._boundaryRings.scale.setScalar(1 / R)   // 补偿壳缩放, 环世界半径 = 真实测距
    boundary.add(this._boundaryRings)
    this.scene.add(boundary)
    boundary.visible = false
    return boundary
  }

  update(
    earthMesh: THREE.Mesh,
    earthQ: THREE.Quaternion,
    earthWorldPos: THREE.Vector3,
    showGroundRoot: boolean,
    showRiskBoundary: boolean,
    showAllCones: boolean,
    gSphereR: number,
    /* 单站聚焦: 选中某监测站时只显示该站 (标记+光锥), 其余隐藏; null=全部显示 */
    soloIdx: number | null = null,
  ): void {
    this.riskBoundary.position.copy(earthMesh.position)
    this.riskBoundary.visible = showRiskBoundary

    this.groundRoot.visible = showGroundRoot
    if (!showGroundRoot) return

    this.groundRoot.position.copy(earthMesh.position)
    this.groundRoot.scale.copy(earthMesh.scale)
    this.gSpinGroup.quaternion.copy(earthQ)

    // Rebuild cone geometry when celestial sphere radius changes
    const GS_R = gSphereR / R_EARTH_AU
    if (GS_R !== this._lastGSphereR) {
      this._lastGSphereR = GS_R
      this._buildGroundCones(GS_R)
      this.resetSweep()   // 天球半径变化后累积角点坐标失效
    }

    // Determine night/day for each station to decide cone visibility
    this.nightQ.copy(this.qOblQ).multiply(
      new THREE.Quaternion().setFromAxisAngle(Z_AXIS,
        Math.atan2(earthQ.z, earthQ.w) * 2)
    )
    const toSun = tmpV.copy(earthWorldPos).negate().normalize()

    for (let i = 0; i < this.stationObjects.length; i++) {
      const g = this.stationObjects[i]
      const stDir = g.vFix.clone().applyQuaternion(this.nightQ)
      g.night = stDir.dot(toSun) < 0
      const solo = soloIdx == null || soloIdx === i
      g.grp.visible = solo
      /* 聚焦站光锥强制显示 (不受昼夜/图层开关限制), 其余站沿用原策略 */
      g.cone.visible = solo && (soloIdx === i || showAllCones || g.night)
    }
  }

  /** 清空扫掠痕迹 (页面退出/站点切换/时间回拨时重置) */
  resetSweep(): void {
    this._sweepSteps = 0
    this._sweepIdx = -1
    this._sweepLastJd = Number.NaN
    this._sweepLastAppendJd = Number.NaN
    this._sweepPrev = null
    this._sweepGeo.setDrawRange(0, 0)
    this._sweepMesh.visible = false
  }

  /**
   * 光锥扫掠痕迹: 聚焦站光锥足迹在相邻帧间以四边形带连接, 累积出天球上
   * 被扫过的区域 (地心相对, 不随地球自转)。坐标经站点 grp 世界矩阵变换,
   * 与光锥几何同源 (hit 天球交点)。
   * enabled=false (页面退场) 重置清空; enabled=true 但 activeIdx=null
   * (暂停/非聚焦) 保留已累积痕迹仅停止增长。
   */
  updateSweep(
    earthWorldPos: THREE.Vector3,
    jd: number,
    enabled: boolean,
    activeIdx: number | null,
  ): void {
    const mesh = this._sweepMesh
    if (!enabled) {
      this.resetSweep()
      return
    }
    if (activeIdx == null || this._lastGSphereR <= 0) {
      mesh.visible = this._sweepSteps > 0
      if (mesh.visible) mesh.position.copy(earthWorldPos)
      return
    }

    if (activeIdx !== this._sweepIdx || jd < this._sweepLastJd) this.resetSweep()
    this._sweepIdx = activeIdx
    this._sweepLastJd = jd
    mesh.visible = true
    mesh.position.copy(earthWorldPos)

    /* 节流: 壁钟 ~30fps 且仿真时刻确有推进, 避免低速播放堆冗余三角形 */
    const wall = performance.now()
    if (jd === this._sweepLastAppendJd) return
    if (this._sweepPrev && wall - this._sweepLastWall < 33) return
    if (this._sweepSteps >= EarthSystem.SWEEP_MAX_STEPS) return

    const g = this.stationObjects[activeIdx]
    if (!g) return
    g.grp.updateWorldMatrix(true, false)

    /* 光锥足迹四角 (站心局部系 +Y 天顶, hit 投影到天球) → 世界系 → 地心相对 */
    const GS_R = this._lastGSphereR
    const tanX = Math.tan(GFOV_HX)
    const tanY = Math.tan(GFOV_HY)
    const SIGN: ReadonlyArray<readonly [number, number]> = [[-1, -1], [1, -1], [1, 1], [-1, 1]]
    const corners: THREE.Vector3[] = []
    for (const [sx, sy] of SIGN) {
      const d = new THREE.Vector3(sx * tanX, 1, sy * tanY).normalize()
      const ad = -H_STATION * d.y
      const t = -ad + Math.sqrt(Math.max(0, ad * ad + GS_R * GS_R - H_STATION * H_STATION))
      corners.push(d.multiplyScalar(t).applyMatrix4(g.grp.matrixWorld).sub(earthWorldPos))
    }

    const prev = this._sweepPrev
    if (prev) {
      const arr = this._sweepPos
      let o = this._sweepSteps * 72
      const tri = (a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3) => {
        arr[o++] = a.x; arr[o++] = a.y; arr[o++] = a.z
        arr[o++] = b.x; arr[o++] = b.y; arr[o++] = b.z
        arr[o++] = c.x; arr[o++] = c.y; arr[o++] = c.z
      }
      // 相邻两帧足迹边框间的 4 个四边形 (8 三角形), 即扫过带面
      for (let k = 0; k < 4; k++) {
        const k1 = (k + 1) % 4
        tri(prev[k], prev[k1], corners[k1])
        tri(prev[k], corners[k1], corners[k])
      }
      this._sweepSteps++
      ;(this._sweepGeo.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true
      this._sweepGeo.setDrawRange(0, this._sweepSteps * 24)
    }
    this._sweepPrev = corners
    this._sweepLastAppendJd = jd
    this._sweepLastWall = wall
  }
}
