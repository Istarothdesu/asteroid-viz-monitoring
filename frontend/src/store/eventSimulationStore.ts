import { create } from 'zustand'
import type { EventRecord } from '@/types/scene'
import { PLANETS } from '@/data/planets'
import { planetPos } from '@/utils/orbital/planets'
import { fitEncounter } from '@/utils/orbital/fitEncounter'
import type { FitResult } from '@/utils/orbital/fitEncounter'
import { gmstRad } from '@/utils/orbital/time'
import { AU_KM, D2R, OBLIQ, R_EARTH_AU } from '@/utils/orbital/constants'
import { useSimStore } from './simStore'
import { useFrameStore } from './frameStore'
import { useCameraStore } from './cameraStore'
import { useSelectionStore } from './selectionStore'
import { useUIStore } from './uiStore'

import { eventImpactConfig, terminalKind, VALIDATION_SCENARIOS } from '@/core/eventSimulation/scenarios'
import type { ImpactConfig, ImpactEvent, SimulationView } from '@/core/eventSimulation/types'

type SimulationPhase = 'idle' | 'approach' | 'impact' | 'aftermath'

// Minimal Vec3 matching fitEncounter's Vec3Full contract (keeps this store Three.js-free)
class V3 {
  x = 0; y = 0; z = 0
  constructor(x = 0, y = 0, z = 0) { this.x = x; this.y = y; this.z = z }
  set(x: number, y: number, z: number) { this.x = x; this.y = y; this.z = z; return this }
  length() { return Math.hypot(this.x, this.y, this.z) }
  distanceToSquared(v: V3) {
    const dx = this.x - v.x, dy = this.y - v.y, dz = this.z - v.z
    return dx * dx + dy * dy + dz * dz
  }
  sub(v: V3) { this.x -= v.x; this.y -= v.y; this.z -= v.z; return this }
  normalize() {
    const l = this.length() || 1
    this.x /= l; this.y /= l; this.z /= l
    return this
  }
  dot(v: V3) { return this.x * v.x + this.y * v.y + this.z * v.z }
  copy(v: V3) { this.x = v.x; this.y = v.y; this.z = v.z; return this }
}

interface EventSimulationState {
  config: ImpactConfig | null
  session: ImpactEvent | null
  view: SimulationView
  automaticRate: boolean
  preparation: 'loading' | 'ready' | 'unsupported' | 'error'
  message: string
  restoreCamera: boolean
  selectScenario: (id: string) => void
  setView: (view: SimulationView) => void
  setAutomaticRate: (automatic: boolean) => void
  activeEvent: EventRecord | null
  phase: SimulationPhase
  drawerOpen: boolean
  /** 拟合后的事件轨道 (含 M0), 仿真期间驱动事件天体位置 */
  el: FitResult | null
  /** 遭遇/撞击时刻 (儒略日) */
  jdEnc: number
  /** 仿真时间轴终点 */
  endJD: number
  /** 事件专题页预览: 拟合后的目标天体轨道 (不进仿真状态机, 仅绘制天体+轨道) */
  previewRec: EventRecord | null
  previewEl: FitResult | null
  previewJdEnc: number

  startSimulation: (event: EventRecord) => void
  stopSimulation: (restoreCamera?: boolean) => void
  /** 专题页进入时拟合并展示目标轨道 (与 startSimulation 共享拟合缓存, 之后点「开始仿真」免重算) */
  previewEvent: (event: EventRecord) => Promise<void>
  clearPreview: () => void
  setPhase: (phase: SimulationPhase) => void
  setDrawerOpen: (open: boolean) => void
}

/** 拟合事件轨道: 以遭遇时刻地心位置(飞掠含偏移)为目标反解 M0 等根数 */
function buildEncounterSession(event: EventRecord): { el: FitResult; jdEnc: number; endJD: number } | null {
  let jdEnc = Date.parse(event.dateUTC) / 86400000 + 2440587.5
  const earth = new V3()
  planetPos(PLANETS[2], jdEnc, earth)
  const target = new V3(earth.x, earth.y, earth.z)
  if (event.type === 'flyby') {
    const miss = (event.missKm ?? 100000) / AU_KM
    let d: V3
    if (event.offsetDir) {
      d = new V3(...event.offsetDir).normalize()
    } else {
      /* CAD/推演事件无预设偏移方向: 取日心到地球径向 × 黄道法向 (即地球公转切向)
         作为脱靶方向 —— 根数不含平近点角无法推真实相对速度, 任意确定的垂直方向即可;
         若不偏移, 拟合目标=地心, 轨道直穿地球 (飞掠视觉上变撞击) */
      d = new V3(-earth.y, earth.x, 0)
      if (d.length() < 1e-12) d.set(1, 0, 0)
      d.normalize()
    }
    target.x += d.x * miss; target.y += d.y * miss; target.z += d.z * miss
  }
  let prefDir: V3 | undefined, prefCenter: V3 | undefined
  if (event.type === 'impact' && event.impactLat !== undefined) {
    /* 真实落点方向 (纬度/经度 + GMST -> 日心惯性系), 用于从多个拟合解中选出落点正确的轨道。
       赤道系 = 黄道系绕春分点轴(+X) 旋 +ε, 故赤道系向量转黄道系用 R_x(-ε);
       与 PlanetSystem 地球姿态 qOblQ = R_x(-ε) 保持同一约定 (此前两处同错、
       自洽抵消, 但北极指向黄经 270° 导致四季反转) */
    const la = event.impactLat * D2R, lo = (event.impactLon ?? 0) * D2R + gmstRad(jdEnc)
    const ce = Math.cos(OBLIQ), se = Math.sin(OBLIQ)
    const vx = Math.cos(la) * Math.cos(lo), vy = Math.cos(la) * Math.sin(lo), vz = Math.sin(la)
    prefDir = new V3(vx, vy * ce + vz * se, -vy * se + vz * ce)
    prefCenter = new V3()
    planetPos(PLANETS[2], jdEnc - 0.01, prefCenter)
    /* 拟合目标 = 地表落点 (而非地心): 旧实现以地心为目标, 落点由候选轨道的
       接近方向决定且 prefDir 权重 (1e-6) 形同虚设, 落点随机偏离可达 90°+;
       改为天体在遭遇时刻精确穿过设定落点, 落点误差归零 (脚本验证 0.0 km) */
    target.x += prefDir.x * R_EARTH_AU
    target.y += prefDir.y * R_EARTH_AU
    target.z += prefDir.z * R_EARTH_AU
  }
  const el = fitEncounter(event.el, jdEnc, target, () => new V3(), prefDir, prefCenter)
  if (!el) return null
  const endJD = jdEnc + (event.type === 'impact' ? 0.03 : 0.12)   // 撞击后约40分钟即收尾
  return { el, jdEnc, endJD }
}

/* 预览拟合的竞态令牌: 专题页快速切换事件时, 只采纳最后一次请求的结果 */
let previewToken = 0
let restore: (() => void) | null = null
let savedJd = 0
export function captureTopicTime(jd: number) { savedJd = jd }

function saveTopicState() {
  if (restore) return
  const { jd, playing, playRate, jdMin, jdMax, timelineScaleDays, timelineCenterJd } = useSimStore.getState()
  savedJd = jd
  const { frame } = useFrameStore.getState()
  const { mode } = useUIStore.getState()
  const { selected } = useSelectionStore.getState()
  const { followRequest } = useCameraStore.getState()
  restore = () => {
    useSimStore.setState({ jd: savedJd, playing, playRate, jdMin, jdMax, timelineScaleDays, timelineCenterJd })
    useFrameStore.getState().setFrame(frame)
    useUIStore.getState().setMode(mode)
    useSelectionStore.getState().setSelected(selected)
    useCameraStore.getState().setFollowRequest(followRequest)
  }
}

export const useEventSimulationStore = create<EventSimulationState>((set, get) => ({
  config: null, session: null, view: 'auto', automaticRate: true,
  preparation: 'unsupported', message: '',
  restoreCamera: true,
  setView: view => set({ view }),
  setAutomaticRate: automaticRate => set({ automaticRate }),
  selectScenario: id => {
    const event = get().activeEvent
    if (!event) return
    if (id === 'event' && event.type === 'flyby') { get().startSimulation(event); return }
    const config = id === 'event' ? eventImpactConfig(event) : VALIDATION_SCENARIOS.find(s => s.id === id) ?? null
    useSimStore.getState().setPlaying(false)
    set({ config: config ? { ...config } : null, session: null, view: 'auto', automaticRate: true,
      jdEnc: Date.parse(config?.dateUTC ?? event.dateUTC) / 86400000 + 2440587.5,
      preparation: config ? 'loading' : 'unsupported',
      message: config ? '正在准备落点与地面观测点的影像、高程…' :
        terminalKind(event) === 'airburst' ? '此事件为空爆，空爆终态尚未接入。可切换陆地撞击演示验证完整流程。' :
        terminalKind(event) === 'ocean' ? '此事件为海面撞击，海面与海啸终态尚未接入。' :
        '此事件缺少地表落点。可切换陆地撞击演示。' })
  },
  activeEvent: null,
  phase: 'idle',
  drawerOpen: false,
  el: null,
  jdEnc: 0,
  endJD: 0,
  previewRec: null,
  previewEl: null,
  previewJdEnc: 0,

  startSimulation: (event) => {
    saveTopicState()
    useSimStore.getState().setPlaying(false)
    useCameraStore.getState().setFollowRequest(false)
    useUIStore.getState().setMode('overview')
    useFrameStore.getState().setFrame('geo')
    set({ activeEvent: event, el: null, phase: 'approach', drawerOpen: false,
      jdEnc: Date.parse(event.dateUTC) / 86400000 + 2440587.5 })
    useSelectionStore.getState().setSelected(null)
    if (event.type === 'flyby') {
      const session = get().previewRec?.id === event.id && get().previewEl
        ? { el: get().previewEl!, jdEnc: get().previewJdEnc, endJD: get().previewJdEnc + .12 }
        : buildEncounterSession(event)
      if (!session) { set({ preparation: 'error', message: '事件轨道无法拟合。' }); return }
      set({ ...session, config: null, session: null, preparation: 'ready', view: 'space', message: '飞掠轨迹采用事件拟合轨道。' })
      const sim = useSimStore.getState(), start = session.jdEnc - event.leadH / 24
      sim.setSimulationRange(start, session.endJD); sim.setJD(start); sim.setPlayRate(600); sim.setPlaying(true)
    } else get().selectScenario('event')
  },

  stopSimulation: (restoreCamera = true) => {
    set({ activeEvent: null, el: null, config: null, session: null, phase: 'idle', jdEnc: 0, endJD: 0, restoreCamera })
    restore?.(); restore = null
  },

  previewEvent: async (event) => {
    if (get().previewRec?.id === event.id && get().previewEl) return   // 缓存命中
    const token = ++previewToken
    const ui = useUIStore.getState()
    ui.showLoading('正在拟合事件轨道…', event.name)
    await new Promise(r => setTimeout(r, 50))
    let el: FitResult | null = null, jdEnc = 0
    try {
      const s = buildEncounterSession(event)
      if (s) { el = s.el; jdEnc = s.jdEnc }
    } finally {
      ui.hideLoading()
    }
    if (token !== previewToken) return   // 期间已切换其他事件, 丢弃过期结果
    set({ previewRec: event, previewEl: el, previewJdEnc: jdEnc })
  },

  clearPreview: () => {
    previewToken++
    set({ previewRec: null, previewEl: null, previewJdEnc: 0 })
  },

  setPhase: (phase) => set({ phase }),
  setDrawerOpen: (drawerOpen) => set({ drawerOpen }),
}))
