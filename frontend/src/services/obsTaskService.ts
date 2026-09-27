/* ============================================================================
 * obsTaskService.ts — 观测任务生成 (主动观测专题)
 *
 * 按真实行星防御流程建模: 观测任务 = 特定设施对特定目标在可观测窗口内的
 * 一次观测安排。任务不依赖后端, 由目标六根数按轨道几何实时推演生成:
 *
 *  · L1 仿真星: 使用共享参考状态与配置，生成几何候选窗口，非执行安排;
 *  · 地面站: 对标 Spaceguard 中央节点 Priority List 方案 — 夜间 + 高度角
 *    ≥30° (大气质量 <2) + 离日 ≥30° 的测站生成天体测量跟踪任务;
 *  · 行星雷达 (金石): 对标 Goldstone 短弧跟踪 — 仅地心距离 <0.35 AU 时成像。
 * ========================================================================== */

import { PLANETS } from '@/data/planets'
import { getGroundStationProvider } from '@/features/ground/stationProvider'
import { useDataStore } from '@/store/dataStore'
import { AU_KM, R_EARTH_AU } from '@/utils/orbital/constants'
import { getL1MissionProvider } from '@/features/l1/missionProvider'
import { ephemEpoch } from '@/utils/orbital/ephemeris'
import { gmstRad } from '@/utils/orbital/time'
import { planetPos } from '@/utils/orbital/planets'
import { astPos } from '@/utils/orbital/asteroids'
import type { AsteroidElements } from '@/utils/orbital/asteroids'
import type { Vec3Like } from '@/utils/orbital/kepler'
import type { GroundStation } from '@/types/asteroid'

const EARTH = PLANETS[2]
const D2R = Math.PI / 180

/* ---------------------------- 任务数据模型 ---------------------------- */

export type TaskType =
  | 'characterization' // 物理特性表征 (L1 红外双波段, 对标 NEO Surveyor)
  | 'followup'         // 天体测量跟踪 (地面, 精化轨道)
  | 'radar'            // 雷达成像 (轨道与形态)

export type TaskPriority = 'urgent' | 'high' | 'medium' | 'low'

export interface ObsTask {
  id: string
  /** 执行设施: 'L1 巡天星' 或地面站编号名 */
  facility: string
  /** facility='L1 巡天星' 时为 null */
  stationIdx: number | null
  type: TaskType
  priority: TaskPriority
  /** 可观测窗口 (JD) */
  windowStart: number
  windowEnd: number
  /** 设施观测参数 (波段/滤光片/几何约束), 供展示 */
  params: [string, string][]
  /** 一句话任务目的 */
  purpose: string
}

/* ---------------------------- 几何工具 ---------------------------- */

function v3(): Vec3Like {
  return { x: 0, y: 0, z: 0, set(x, y, z) { this.x = x; this.y = y; this.z = z } }
}

const _pe = v3(), _pa = v3()

/** 地球日心位置 (AU) */
function earthPos(jd: number): { x: number; y: number; z: number } {
  planetPos(EARTH, jd, _pe)
  return { x: _pe.x, y: _pe.y, z: _pe.z }
}

/** 仿真卫星视角的太阳伸长角；没有参考状态时返回 NaN。 */
export function sunElongationAtL1(el: AsteroidElements, jd: number): number {
  const state = getL1MissionProvider().getObserverState(jd)
  if (!state) return NaN
  const s = state.positionAu
  astPos(el, jd, _pa)
  const dx = _pa.x - s.x, dy = _pa.y - s.y, dz = _pa.z - s.z
  const d1 = Math.hypot(dx, dy, dz)
  const d2 = Math.hypot(s.x, s.y, s.z)
  const cos = (-(dx * s.x + dy * s.y + dz * s.z)) / (d1 * d2)
  return Math.acos(Math.min(1, Math.max(-1, cos))) / D2R
}

/**
 * 地面站可见性: 太阳低于天文晨昏线 (-12°) + 目标高度角 ≥30° (大气质量<2)
 * + 目标离日角 ≥30°。位置均为地心黄道系, 地固系经 GMST 旋转得到。
 */
function groundVisible(el: AsteroidElements, st: GroundStation, jd: number): boolean {
  const e = earthPos(jd)
  astPos(el, jd, _pa)
  const gmst = gmstRad(jd)
  const cg = Math.cos(gmst), sg = Math.sin(gmst)
  const phi = st.lat * D2R
  const sp = Math.sin(phi), cp = Math.cos(phi)
  const lam = st.lon * D2R

  const altOf = (gx: number, gy: number, gz: number): number => {
    // 地心矢量 -> 地固系 (绕黄道轴旋转 -GMST)
    const rx = cg * gx + sg * gy
    const ry = -sg * gx + cg * gy
    // 测站地固坐标 (地表, 地球半径尺度)
    const ox = cp * Math.cos(lam) * R_EARTH_AU
    const oy = cp * Math.sin(lam) * R_EARTH_AU
    const oz = sp * R_EARTH_AU
    // 站心矢量 -> 东北天 (ENU)
    const sl = Math.sin(lam), cl = Math.cos(lam)
    const eE = -sl * (rx - ox) + cl * (ry - oy)
    const eN = -sp * cl * (rx - ox) - sp * sl * (ry - oy) + cp * (gz - oz)
    const eU = cp * cl * (rx - ox) + cp * sl * (ry - oy) + sp * (gz - oz)
    const d = Math.hypot(eE, eN, eU)
    return Math.asin(Math.min(1, Math.max(-1, eU / d))) / D2R
  }

  const altT = altOf(_pa.x - e.x, _pa.y - e.y, _pa.z - e.z)
  const altS = altOf(-e.x, -e.y, -e.z)
  if (altT < 30 || altS > -12) return false
  // 离日角 (地心视角)
  const gx = _pa.x - e.x, gy = _pa.y - e.y, gz = _pa.z - e.z
  const dt = Math.hypot(gx, gy, gz)
  const ds = Math.hypot(e.x, e.y, e.z)
  const cos = -(gx * e.x + gy * e.y + gz * e.z) / (dt * ds)
  const sep = Math.acos(Math.min(1, Math.max(-1, cos))) / D2R
  return sep >= 30
}

/** 连续可见片段合并为窗口 */
interface Win { start: number; end: number; minDist: number }
function mergeWins(segs: { jd: number; ok: boolean; dist: number }[], dt: number): Win[] {
  const wins: Win[] = []
  let cur: Win | null = null
  for (const s of segs) {
    if (s.ok) {
      if (cur && s.jd - cur.end <= dt * 1.5) {
        cur.end = s.jd
        cur.minDist = Math.min(cur.minDist, s.dist)
      } else {
        cur = { start: s.jd, end: s.jd, minDist: s.dist }
        wins.push(cur)
      }
    }
  }
  return wins.filter((w) => w.end - w.start >= dt)
}

/* ---------------------------- 任务生成 ---------------------------- */

const TYPE_ZH: Record<TaskType, string> = {
  characterization: '物理特性表征',
  followup: '天体测量跟踪',
  radar: '雷达成像',
}
export const OBS_TYPE_ZH = TYPE_ZH

/**
 * 为指定目标生成未来观测任务清单 (L1 前瞻 45 天 / 地面前瞻 21 天)。
 * 窗口由轨道几何推演, 任务编号按设施+窗口起点确定性生成, 无随机。
 */
export function generateObsTasks(
  el: AsteroidElements,
  baseJd: number,
  opts: { des: string; pha: boolean },
): ObsTask[] {
  const tasks: ObsTask[] = []
  const H = 1 / 24
  const stations = getGroundStationProvider().getStations()

  /* 地面站: 天体测量跟踪 / 雷达 */
  const ground: ObsTask[] = []
  for (let si = 0; si < stations.length; si++) {
    const st = stations[si]
    const segs: { jd: number; ok: boolean; dist: number }[] = []
    for (let jd = baseJd; jd <= baseJd + 21; jd += H) {
      const e = earthPos(jd)
      astPos(el, jd, _pa)
      const dist = Math.hypot(_pa.x - e.x, _pa.y - e.y, _pa.z - e.z)
      segs.push({ jd, ok: groundVisible(el, st, jd), dist })
    }
    for (const w of mergeWins(segs, H)) {
      const radar = st.type === '行星雷达'
      if (radar && w.minDist >= 0.35) continue // 雷达可成像距离上限
      const durH = Math.round((w.end - w.start) * 24)
      const nights = Math.max(1, Math.ceil((w.end - w.start) / 1))
      ground.push({
        id: `OBS-G-${si}-${Math.round(w.start * 10)}`,
        facility: st.name,
        stationIdx: si,
        type: radar ? 'radar' : 'followup',
        priority: opts.pha ? 'high' : w.minDist < 0.3 ? 'medium' : 'low',
        windowStart: w.start,
        windowEnd: w.end,
        params: [
          ['波段', radar ? 'X/S 双波段' : 'V 波段'],
          ['高度角下限', '30°'],
          [radar ? '可成像距离' : '窗口时长', radar
            ? `≤ ${Math.round(w.minDist * 14959.8)} 万km`
            : `${durH} 小时 / ${nights} 夜`],
        ],
        purpose: radar
          ? '雷达成像: 精化轨道并获取形状与自转状态'
          : '天体测量: 延长观测弧段, 收敛轨道不确定度',
      })
    }
  }
  // 按优先级与窗口时长取前 8 条, 避免列表过长
  const prioRank: Record<TaskPriority, number> = { urgent: 0, high: 1, medium: 2, low: 3 }
  ground.sort(
    (a, b) =>
      prioRank[a.priority] - prioRank[b.priority] ||
      (b.windowEnd - b.windowStart) - (a.windowEnd - a.windowStart),
  )
  tasks.push(...ground.slice(0, 8))

  const profile = getL1MissionProvider().getReference()?.profile
  /* 中心线太阳伸长角几何粗筛，不当作已排入执行计划。 */
  const l1Segs: { jd: number; ok: boolean; dist: number }[] = []
  for (let jd = baseJd; jd <= baseJd + 45; jd += 0.25) {
    const eps = sunElongationAtL1(el, jd)
    const e = earthPos(jd)
    astPos(el, jd, _pa)
    const dist = Math.hypot(_pa.x - e.x, _pa.y - e.y, _pa.z - e.z)
    l1Segs.push({ jd, ok: !!profile && eps >= profile.instrument.sunAvoidanceDeg
      && eps <= profile.instrument.maxSunElongationDeg, dist })
  }
  for (const w of mergeWins(l1Segs, 0.25)) {
    tasks.push({
      id: `OBS-L1-${Math.round(w.start * 10)}`,
      facility: 'L1 巡天星',
      stationIdx: null,
      type: 'characterization',
      priority: opts.pha ? 'high' : 'medium',
      windowStart: w.start,
      windowEnd: w.end,
      params: [
        ['配置', profile!.id],
        ['视场', `${profile!.instrument.fovWidthDeg}° × ${profile!.instrument.fovHeightDeg}°`],
        ['太阳伸长角约束', `${profile!.instrument.sunAvoidanceDeg}° – ${profile!.instrument.maxSunElongationDeg}°`],
        ['执行状态', '几何候选窗口，尚未安排曝光'],
      ],
      purpose: 'L1 仿真参考配置下的表征候选窗口（几何粗筛，非探测结果）',
    })
  }

  tasks.sort((a, b) => prioRank[a.priority] - prioRank[b.priority] || a.windowStart - b.windowStart)
  return tasks
}

/**
 * 单站任务生成 (监测站专题页): 对指定地面站遍历候选目标推演未来 21 天观测窗口。
 * 与 generateObsTasks 地面部分同口径 (夜间 + 高度角 ≥30° + 离日 ≥30°),
 * 雷达站额外受 0.35 AU 成像距离约束。
 */
export function generateStationTasks(
  stationIdx: number,
  targets: { el: AsteroidElements; des: string }[],
  baseJd: number,
  limit = 12,
): ObsTask[] {
  const st = getGroundStationProvider().getStations()[stationIdx]
  if (!st) return []
  const radar = st.type === '行星雷达'
  const H = 1 / 24
  const tasks: ObsTask[] = []

  for (const t of targets) {
    const segs: { jd: number; ok: boolean; dist: number }[] = []
    for (let jd = baseJd; jd <= baseJd + 21; jd += H) {
      const e = earthPos(jd)
      astPos(t.el, jd, _pa)
      const dist = Math.hypot(_pa.x - e.x, _pa.y - e.y, _pa.z - e.z)
      segs.push({ jd, ok: groundVisible(t.el, st, jd), dist })
    }
    for (const w of mergeWins(segs, H)) {
      if (radar && w.minDist >= 0.35) continue
      const durH = Math.round((w.end - w.start) * 24)
      const nights = Math.max(1, Math.ceil((w.end - w.start) / 1))
      tasks.push({
        id: `OBS-S${stationIdx}-${t.des}-${Math.round(w.start * 10)}`,
        facility: st.name,
        stationIdx,
        type: radar ? 'radar' : 'followup',
        priority: w.minDist < 0.1 ? 'urgent' : w.minDist < 0.3 ? 'high' : 'medium',
        windowStart: w.start,
        windowEnd: w.end,
        params: [
          ['目标', t.des],
          ['波段', radar ? 'X/S 双波段' : 'V 波段'],
          ['高度角下限', '30°'],
          [radar ? '最近距离' : '窗口时长', radar
            ? `${Math.round(w.minDist * AU_KM / 1000) / 10} 万km`
            : `${durH} 小时 / ${nights} 夜`],
        ],
        purpose: radar
          ? '雷达成像: 精化轨道并获取形状与自转状态'
          : '天体测量: 延长观测弧段, 收敛轨道不确定度',
      })
    }
  }

  const prioRank: Record<TaskPriority, number> = { urgent: 0, high: 1, medium: 2, low: 3 }
  tasks.sort(
    (a, b) =>
      prioRank[a.priority] - prioRank[b.priority] ||
      a.windowStart - b.windowStart,
  )
  return tasks.slice(0, limit)
}

/** 单时刻可见性判定 (导出供监测站专题页实时扫描当前可观测目标) */
export const stationTargetVisible = (
  el: AsteroidElements,
  st: GroundStation,
  jd: number,
): boolean => groundVisible(el, st, jd)

/* 全局检索用: 全部命名目标 × 全部设施的观测任务清单 (按仿真日缓存,
   与监测站/小行星专题页同一推演口径) */
let _allTasksDay = -Infinity
let _allTasks: ObsTask[] = []
let _allTasksSource: object | null = null
let _allTasksReference: object | null = null
let _allTasksEphem = -1

/** 获取全部观测任务 (命名目标 × 地面站 + L1, 按日缓存); 供全局检索 */
export function getAllObsTasks(baseJd: number): ObsTask[] {
  const day = Math.floor(baseJd)
  const asteroids = useDataStore.getState().asteroids
  const reference = getL1MissionProvider().getReference()
  const epoch = ephemEpoch()
  if (day === _allTasksDay && asteroids === _allTasksSource && reference === _allTasksReference
    && epoch === _allTasksEphem) return _allTasks
  _allTasksDay = day
  _allTasksSource = asteroids; _allTasksReference = reference; _allTasksEphem = epoch
  const tasks: ObsTask[] = []
  for (const a of asteroids) {
    const el: AsteroidElements = a
    const ts = generateObsTasks(el, baseJd, { des: a.name, pha: false })
    /* generateObsTasks 地面任务不带目标参数 (目标隐含在调用上下文);
       全局检索需可匹配目标名, 此处统一补上 */
    for (const t of ts) {
      if (!t.params.some(([k]) => k === '目标')) {
        t.params.unshift(['目标', a.name])
      }
      tasks.push(t)
    }
  }
  _allTasks = tasks
  return _allTasks
}
