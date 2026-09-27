import * as THREE from 'three'
import { PLANETS } from '@/data/planets'
import { useDataStore } from '@/store/dataStore'
import { sampleEllipse } from '@/utils/orbital/ellipse'
import { planetPos, moonPosRel } from '@/utils/orbital/planets'
import { ephemEpoch } from '@/utils/orbital/ephemeris'
import { astPos } from '@/utils/orbital/asteroids'
import type { AsteroidElements } from '@/utils/orbital/asteroids'
import { JD_J2000, YEAR_S } from '@/utils/orbital/constants'
import { getL1MissionProvider } from '@/features/l1/missionProvider'
import type { SelectionTarget } from '@/types/scene'
import type { AsteroidCloud } from './AsteroidCloud'
import { SCENE_VISUALS } from './sceneLayers'

const tmpV = new THREE.Vector3()
const tmpA = new THREE.Vector3()
const tmpB = new THREE.Vector3()
const Y_AXIS = new THREE.Vector3(0, 1, 0)

/** 选中轨道上的公转方向箭头采样点 (偏近点角, 递增即公转前进方向) */
const ARROW_IDX = [45, 135, 225, 315]

/**
 * 轨道配色方案：
 * - 背景轨道（行星/月球/L1）统一亮青灰，低存在感，不再各行星异色；
 *   选用亮青灰而非暗蓝，是为了与日心系极坐标网格的深藏青（0x2a4a6e/0x14283f）
 *   在色相与明度上拉开，避免轨道线与网格线混为一体；
 * - 选中轨道保持橙色（与图例「选中/事件目标」、光圈、标签、箭头同系），
 *   与统一后的青灰背景轨道形成鲜明区分；
 * - 事件根数参考轨道使用低透明度虚线，名义传播轨道使用青绿色实线；
 *   两者可同时显示以暴露模型差异。
 */
const ORBIT_BASE_COLOR = SCENE_VISUALS.orbit.color
const ORBIT_BASE_OPACITY = SCENE_VISUALS.orbit.opacity

/** 缓存行: 局部采样 + 已写入 GPU 的变换状态 (见 syncLine) */
interface OrbitLine {
  line: THREE.Line
  /** 锚点空间局部采样 (361×3): 行星/选中/事件/L1 为日心焦点系, 月球为地心系 */
  local: Float32Array
  /** 局部重采样键: 行星为历元 T (毫世纪), L1 为 jd (天); -1 表示需重采样 */
  srcKey: number
  /** 局部重采样引用键: 选中/事件按根数对象身份判变 */
  srcRef: object | null
  /** 已写入 GPU 的 (tx,ty,tz,rc,rs) */
  tf: Float32Array
  tfValid: boolean
}

function makeOrbitLine(scene: THREE.Scene, color: number, opacity: number): THREE.Line {
  const g = new THREE.BufferGeometry()
  g.setAttribute('position',
    new THREE.BufferAttribute(new Float32Array(361 * 3), 3).setUsage(THREE.DynamicDrawUsage))
  const line = new THREE.Line(g,
    new THREE.LineBasicMaterial({ color, transparent: true, opacity }))
  line.frustumCulled = false
  scene.add(line)
  return line
}

function makeCacheLine(scene: THREE.Scene, color: number, opacity: number): OrbitLine {
  return {
    line: makeOrbitLine(scene, color, opacity),
    local: new Float32Array(361 * 3),
    srcKey: -1,
    srcRef: null,
    tf: new Float32Array(5),
    tfValid: false,
  }
}

/**
 * 同源周期采样 + 结构性闭合: 自 jd 起按周期 P 采 360 点, 第 360 点强制
 * 复制首点。真实星历轨迹并不严格周期 (月球交点每月退行 ~1.45°, 首尾差
 * 可达万公里; 行星周期常数误差也留千公里级缺口), 闭合必须显式施加。
 */
function sampleClosed(
  l: OrbitLine, jd: number, P: number,
  fn: (jd: number, out: THREE.Vector3) => void,
): void {
  const arr = l.local
  for (let k = 0; k < 360; k++) {
    fn(jd + (k / 360) * P, tmpV)
    arr[3*k] = tmpV.x; arr[3*k+1] = tmpV.y; arr[3*k+2] = tmpV.z
  }
  arr[1080] = arr[0]; arr[1081] = arr[1]; arr[1082] = arr[2]
  l.tfValid = false
}

export class OrbitRenderer {
  private readonly planetOrbits: OrbitLine[]
  private readonly l1Orbit: OrbitLine
  private readonly moonOrbit: OrbitLine
  private readonly selOrbit: OrbitLine
  private readonly eventOrbit: OrbitLine
  readonly pathLine: THREE.Line
  /** N 体推演弧线 (点数不定, 点集变更时重建缓冲; 变换由线对象平移/旋转承载) */
  readonly nbodyArc: THREE.Line
  /** 已写入缓冲的推演弧线点集引用 (身份判变) */
  private nbodySrc: Float32Array | null = null
  /** 选中轨道公转方向箭头 (锥体沿切线朝向) */
  private readonly selArrows: THREE.Mesh[]
  /** 箭头与选中轨道缓冲/取景距离联动, 两者都未变时跳过重算 */
  private lastArrowCam = 0
  /** 星迹锚点采样索引 (上一帧), 未变时跳过颜色缓冲刷新 */
  private selAnchorIdx = -1
  /** 小行星云引用: 云粒子选中时用其种子根数画选中轨道 */
  private cloud: AsteroidCloud | null = null

  setCloud(cloud: AsteroidCloud): void {
    this.cloud = cloud
  }

  constructor(scene: THREE.Scene) {
    this.planetOrbits = PLANETS.map(() =>
      makeCacheLine(scene, ORBIT_BASE_COLOR, ORBIT_BASE_OPACITY))
    this.l1Orbit = makeCacheLine(scene, ORBIT_BASE_COLOR, ORBIT_BASE_OPACITY + 0.1)
    this.moonOrbit = makeCacheLine(scene, ORBIT_BASE_COLOR, ORBIT_BASE_OPACITY)
    this.selOrbit = makeCacheLine(scene, SCENE_VISUALS.selected.color, 1.0)
    /* 选中轨道高亮: 加法混合让线条经 Bloom 泛光, 与普通轨道线明显拉开层次 */
    ;(this.selOrbit.line.material as THREE.LineBasicMaterial).blending = THREE.AdditiveBlending
    ;(this.selOrbit.line.material as THREE.LineBasicMaterial).depthWrite = false
    /* 星迹渐隐 (闭合轨道 + 沿轨渐变): 逐顶点灰度权重经加法混合实现"近天体亮、
       远端渐隐", 保留闭合几何的同时强调当前位置; 权重每帧按锚点刷新 */
    this.selOrbit.line.geometry.setAttribute('color',
      new THREE.BufferAttribute(new Float32Array(361 * 3).fill(1), 3)
        .setUsage(THREE.DynamicDrawUsage))
    ;(this.selOrbit.line.material as THREE.LineBasicMaterial).vertexColors = true
    this.eventOrbit = makeCacheLine(scene, SCENE_VISUALS.eventReference.color, SCENE_VISUALS.eventReference.opacity)
    const referenceMaterial = this.eventOrbit.line.material
    if (Array.isArray(referenceMaterial)) referenceMaterial.forEach(material => material.dispose())
    else referenceMaterial.dispose()
    this.eventOrbit.line.material = new THREE.LineDashedMaterial({
      color: SCENE_VISUALS.eventReference.color,
      transparent: true,
      opacity: SCENE_VISUALS.eventReference.opacity,
      dashSize: 0.018,
      gapSize: 0.012,
      depthWrite: false,
    })
    this.pathLine = makeOrbitLine(scene, 0xff8a50, 0.9)
    this.pathLine.visible = false
    /* N 体推演弧线: 醒目青绿, 与根数参考虚线/路径线橙/选中轨道橙拉开色相;
       初始空几何, 点集到达时按实际点数重建缓冲 */
    this.nbodyArc = new THREE.Line(
      new THREE.BufferGeometry(),
      new THREE.LineBasicMaterial({
        color: SCENE_VISUALS.eventTrajectory.color,
        transparent: true,
        opacity: 0.95,
      }),
    )
    this.nbodyArc.frustumCulled = false
    this.nbodyArc.visible = false
    scene.add(this.nbodyArc)
    const coneGeo = new THREE.ConeGeometry(0.35, 1, 12)
    this.selArrows = ARROW_IDX.map(() => {
      const m = new THREE.Mesh(coneGeo,
        new THREE.MeshBasicMaterial({
          color: SCENE_VISUALS.selected.color, transparent: true, opacity: 0.95,
          blending: THREE.AdditiveBlending, depthWrite: false,
        }))
      m.visible = false
      m.frustumCulled = false
      scene.add(m)
      return m
    })
  }

  /**
   * 把缓存行写入 GPU 缓冲: buf = R(rotate) · (local + anchor - center)。
   * 平移与帧旋均未变时整行跳过 (暂停 + 日心系 + 未跟随自转 = 轨道层零开销)。
   * 返回本帧是否实际重写 (箭头等下游依赖据此决定是否重算)。
   */
  private _syncLine(
    l: OrbitLine,
    tx: number, ty: number, tz: number,
    rc: number, rs: number,
  ): boolean {
    const tf = l.tf
    if (l.tfValid && tf[0] === tx && tf[1] === ty && tf[2] === tz
      && tf[3] === rc && tf[4] === rs) return false
    const loc = l.local
    const buf = l.line.geometry.attributes.position.array as Float32Array
    for (let k = 0; k <= 360; k++) {
      const lx = loc[3*k], ly = loc[3*k+1]
      const qx = lx + tx, qy = ly + ty
      buf[3*k] = qx * rc + qy * rs
      buf[3*k+1] = -qx * rs + qy * rc
      buf[3*k+2] = loc[3*k+2] + tz
    }
    l.line.geometry.attributes.position.needsUpdate = true
    tf[0] = tx; tf[1] = ty; tf[2] = tz; tf[3] = rc; tf[4] = rs
    l.tfValid = true
    return true
  }

  /**
   * 星迹渐隐 (闭合轨道 + 单侧尾迹): 亮端在天体当前位置, 尾迹沿运动方向之后
   * (过去路径) 高斯衰减到 FLOOR 底限; 前进侧仅存暗环。既保留闭合几何与
   * 分析所需的完整轨道, 又以"尾迹→天体→前方"一眼读出运行轨迹与方向。
   * 锚点未变 (暂停) 时跳过颜色缓冲刷新。
   */
  private _updateSelTrail(anchor: number): void {
    if (anchor === this.selAnchorIdx) return
    this.selAnchorIdx = anchor
    const attr = this.selOrbit.line.geometry.attributes.color as THREE.BufferAttribute
    const col = attr.array as Float32Array
    const FLOOR = 0.22, SIG = 45
    for (let k = 0; k <= 360; k++) {
      /* 缓冲按偏近点角递增=公转前进方向, 故 b=(anchor-k+360)%360 即 k 落后
         天体的角距 ("过去"的远近); b=0 在天体处最亮, 沿尾迹向后衰减 */
      const b = (anchor - k + 360) % 360
      const w = FLOOR + (1 - FLOOR) * Math.exp(-(b / SIG) * (b / SIG))
      col[3*k] = w; col[3*k+1] = w; col[3*k+2] = w
    }
    attr.needsUpdate = true
  }

  /** 锚点索引: 选中天体世界位反解回日心焦点局部系 (world = R·(local-center)),
      取 selOrbit.local 中最近采样点 */
  private _trailAnchor(
    w: THREE.Vector3, cx: number, cy: number, cz: number, rc: number, rs: number,
  ): number {
    const lx = (w.x * rc - w.y * rs) + cx
    const ly = (w.x * rs + w.y * rc) + cy
    const lz = w.z + cz
    const loc = this.selOrbit.local
    let best = 0, bestD = Infinity
    for (let k = 0; k <= 360; k++) {
      const dx = loc[3*k] - lx, dy = loc[3*k+1] - ly, dz = loc[3*k+2] - lz
      const d2 = dx*dx + dy*dy + dz*dz
      if (d2 < bestD) { bestD = d2; best = k }
    }
    return best
  }

  update(
    jd: number,
    center: THREE.Vector3,
    frameRotC: number, frameRotS: number,
    showOrbits: boolean,
    selected: SelectionTarget | null,
    earthW: THREE.Vector3,
    replayActive: boolean,
    replayEl: { a: number; e: number; i: number; O: number; w: number } | null,
    showEventReferenceOrbit: boolean,
    showEventTrajectory: boolean,
    camDist: number,
    selWorld: THREE.Vector3 | null,
    /** N 体推演弧线点集 (xyz 平铺, AU 日心黄道; null = 无弧线) */
    nbodyPositions: Float32Array | null,
  ): void {
    const show = showOrbits
    /* 事件专题只保留地球基准轨道与事件目标轨道，行星/月球/L1 背景轨道会掩盖 B 平面几何。 */
    const eventFocus = replayActive
    const T = (jd - JD_J2000) / 36525
    /* 行星根数漂移重采样阈值: 0.001 cy ≈ 36.5 天, 漂移量远小于一个像素。
       eph 项: 星历异步到位后位置源切换, 仅凭 jd/T 的旧键会让轨道线
       停留在回退源几何上 (月球轨道面可偏差上百度), 代次变即强制重采 */
    const eph = ephemEpoch() * 1e8
    const pKey = Math.round(T * 1000) + eph
    const cx = center.x, cy = center.y, cz = center.z
    const tx = -cx, ty = -cy, tz = -cz

    for (let i = 0; i < 8; i++) {
      const l = this.planetOrbits[i]
      const planetVisible = show && (!eventFocus || i === 2)
      l.line.visible = planetVisible
      if (!planetVisible) { l.tfValid = false; continue }
      if (l.srcKey !== pKey) {
        const pl = PLANETS[i]
        /* 轨道线与天体模型同源: planetPos 优先 SPICE 星历、回退长期根数。
           自当前 jd 采一个恒星周期, 保证模型恒在线上且闭合 */
        sampleClosed(l, jd, YEAR_S * Math.pow(pl.a0, 1.5),
          (t, o) => planetPos(pl, t, o))
        l.srcKey = pKey
      }
      this._syncLine(l, tx, ty, tz, frameRotC, frameRotS)
    }

    const selAst = selected && selected.kind === 'ast'
    const selCloud = selected && selected.kind === 'cloud'
    const seed = selCloud ? this.cloud?.getSeed(selected!.idx) : undefined
    const selVisible = show && !eventFocus && (selAst || !!seed)
    this.selOrbit.line.visible = selVisible
    /* 与模型同源重采样键: 根数换或每 30 天重采 (星历与根数椭圆随时间发散),
       星历代次并入键 (eph) 保证源切换即重采 */
    const selKey = Math.round(jd / 30) + eph
    let selWritten = false
    if (selVisible && selAst) {
      const el = useDataStore.getState().asteroids[selected!.idx]
      if (this.selOrbit.srcRef !== el || this.selOrbit.srcKey !== selKey) {
        /* astPos 星历优先: 自当前 jd 采一个恒星周期保证模型恒在线上且闭合 */
        sampleClosed(this.selOrbit, jd, YEAR_S * Math.pow(el.a, 1.5),
          (t, o) => astPos(el, t, o))
        this.selOrbit.srcRef = el
        this.selOrbit.srcKey = selKey
      }
      selWritten = this._syncLine(this.selOrbit, tx, ty, tz, frameRotC, frameRotS)
      this._updateSelArrows(camDist, selWritten)
    } else if (selVisible && seed) {
      /* 云粒子选中轨道: 用种子六根数 (与粒子逐帧传播同源) */
      if (this.selOrbit.srcRef !== seed || this.selOrbit.srcKey !== selKey) {
        const sel: AsteroidElements = {
          a: seed.a, e: seed.e, i: seed.i, O: seed.om, w: seed.w,
          M0: seed.m0, des: seed.des,
        }
        sampleClosed(this.selOrbit, jd, YEAR_S * Math.pow(seed.a, 1.5),
          (t, o) => astPos(sel, t, o))
        this.selOrbit.srcRef = seed
        this.selOrbit.srcKey = selKey
      }
      selWritten = this._syncLine(this.selOrbit, tx, ty, tz, frameRotC, frameRotS)
      this._updateSelArrows(camDist, selWritten)
    } else {
      for (const m of this.selArrows) m.visible = false
      /* 箭头隐藏期间 lastArrowCam 失效, 复显时必须强制重算 (否则保距跳过) */
      this.lastArrowCam = 0
      this.selAnchorIdx = -1
    }
    /* 星迹渐隐: 以天体当前位置为锚点亮起、沿闭合环向两侧渐隐 (保留闭合几何) */
    if (selVisible && selWorld) {
      this._updateSelTrail(
        this._trailAnchor(selWorld, cx, cy, cz, frameRotC, frameRotS))
    }

    const l1Orbit = show && !eventFocus
      ? getL1MissionProvider().sampleReferenceOrbit(jd, 360)
      : null
    this.l1Orbit.line.visible = !!l1Orbit
    if (l1Orbit) {
      // 轨道形状与来源由数据端口提供；渲染器只做中心平移和观察帧旋转。
      const attribute = this.l1Orbit.line.geometry.getAttribute('position') as THREE.BufferAttribute
      for (let k = 0; k < l1Orbit.length; k++) {
        const p = l1Orbit[k]
        const x = p.x - cx, y = p.y - cy
        attribute.setXYZ(k, x * frameRotC + y * frameRotS, -x * frameRotS + y * frameRotC, p.z - cz)
      }
      attribute.needsUpdate = true
    }

    // Moon orbit (局部几何 = 地心偏移, 只随锚点 earthW/center/帧旋转变换)
    this.moonOrbit.line.visible = show && !eventFocus
    if (show && !eventFocus) {
      /* 与模型同源逐日重采样: 月球轨道面节点以 19.35°/yr 退行, J2000 冻结
         椭圆到当前年代节点已偏数百度, 模型会明显脱离轨道线平面;
         eph 并入键: 星历异步到位前后回退根数与 SPICE 的轨道面相差上百度,
         不强制重采则旧线长期滞留 (暂停/低速播放时 jd 键不变) */
      const mKey = Math.round(jd) + eph
      if (this.moonOrbit.srcKey !== mKey) {
        sampleClosed(this.moonOrbit, jd, 27.321661, moonPosRel)
        this.moonOrbit.srcKey = mKey
      }
      this._syncLine(
        this.moonOrbit,
        earthW.x - cx, earthW.y - cy, earthW.z - cz,
        frameRotC, frameRotS,
      )
    } else {
      this.moonOrbit.tfValid = false
    }

    // Event orbit (各坐标系均绘制: 地心系下以地球为中心平移, 供观察接近几何;
    // 此前对 geo 帧隐藏是撞击仿真特写的保守处理, 现交由图层开关控制)
    const evVisible = showEventReferenceOrbit && replayActive
    this.eventOrbit.line.visible = evVisible
    if (evVisible && replayEl) {
      /* replayEl/previewEl 对象随仿真开始或重新拟合而更换, 身份未变即根数未变 */
      let resampled = false
      if (this.eventOrbit.srcRef !== (replayEl as object)) {
        sampleEllipse(
          this.eventOrbit.local,
          replayEl.a, replayEl.e, replayEl.i, replayEl.O, replayEl.w,
        )
        this.eventOrbit.srcRef = replayEl as object
        this.eventOrbit.tfValid = false
        resampled = true
      }
      this._syncLine(this.eventOrbit, tx, ty, tz, frameRotC, frameRotS)
      if (resampled) this.eventOrbit.line.computeLineDistances()
    } else {
      this.eventOrbit.tfValid = false
    }

    /* N 体推演弧线 (各坐标系均绘制, 可见性与事件轨道同口径 = 图层开关控制):
       点集为日心黄道坐标, 与 _syncLine 的 world = R(帧旋)·(local - center) 同变换,
       但点集只随推演结果变更 —— 用线对象的平移/旋转承载该变换
       (position = R·(-center), rotation.z = -thF), 免逐帧重写整条缓冲 */
    const nbodyOn = showEventTrajectory && !!nbodyPositions
    this.nbodyArc.visible = nbodyOn
    if (nbodyOn) {
      if (this.nbodySrc !== nbodyPositions) {
        this.nbodySrc = nbodyPositions
        const g = new THREE.BufferGeometry()
        g.setAttribute('position', new THREE.BufferAttribute(nbodyPositions!, 3))
        this.nbodyArc.geometry.dispose()
        this.nbodyArc.geometry = g
      }
      this.nbodyArc.rotation.z = -Math.atan2(frameRotS, frameRotC)
      this.nbodyArc.position.set(
        -cx * frameRotC - cy * frameRotS,
        cx * frameRotS - cy * frameRotC,
        -cz,
      )
    } else {
      this.nbodySrc = null
    }
  }

  /** 释放自身持有的轨道线/箭头几何与材质 (场景级 traverse 回收之外的显式兜底) */
  dispose(): void {
    const lines = [
      ...this.planetOrbits.map((l) => l.line),
      this.l1Orbit.line, this.moonOrbit.line, this.selOrbit.line, this.eventOrbit.line,
      this.pathLine, this.nbodyArc,
    ]
    for (const line of lines) {
      line.geometry.dispose()
      ;(line.material as THREE.Material).dispose()
    }
    this.selArrows[0]?.geometry.dispose()
    for (const m of this.selArrows) (m.material as THREE.Material).dispose()
  }

  /**
   * 公转方向箭头: 直接取轨道线缓冲的相邻采样点求切向 (缓冲按偏近点角
   * 递增写入, 即公转前进方向), 锥体尺寸按轨道最远点半径自适应;
   * 非日心系下轨道缓冲仍是日心大椭圆 (平移而来), 按轨道尺度算出的箭头会远大于取景,
   * 故再按相机取景距离封顶 (约视距 3%), 放大后箭头保持合适的屏幕大小。
   * 缓冲未重写且取景距离未变 (±0.1%) 时结果不变, 跳过重算。
   */
  private _updateSelArrows(camDist: number, bufWritten: boolean): void {
    if (!bufWritten && Math.abs(camDist - this.lastArrowCam) <= this.lastArrowCam * 0.001) return
    this.lastArrowCam = camDist
    const arr = this.selOrbit.line.geometry.attributes.position.array as Float32Array
    let maxR2 = 0
    for (let k = 0; k <= 360; k += 12) {
      const r2 = arr[3 * k] ** 2 + arr[3 * k + 1] ** 2 + arr[3 * k + 2] ** 2
      if (r2 > maxR2) maxR2 = r2
    }
    const s = Math.min(Math.sqrt(maxR2) * 0.022, camDist * 0.03)
    for (let j = 0; j < this.selArrows.length; j++) {
      const k = ARROW_IDX[j]
      tmpA.set(arr[3 * k], arr[3 * k + 1], arr[3 * k + 2])
      tmpB.set(arr[3 * (k + 1)], arr[3 * (k + 1) + 1], arr[3 * (k + 1) + 2])
      tmpB.sub(tmpA).normalize()
      const m = this.selArrows[j]
      m.position.copy(tmpA)
      m.quaternion.setFromUnitVectors(Y_AXIS, tmpB)
      m.scale.setScalar(s)
      m.visible = true
    }
  }
}
