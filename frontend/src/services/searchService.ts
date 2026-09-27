/* ============================================================================
 * searchService.ts — 全局检索统一入口
 *
 * 汇聚五类实体 (命名小行星 / 地面监测站 / 风险事件 / 观测任务 / L1 任务)
 * 为统一 SearchHit, 关键字大小写不敏感包含匹配 (中英文/编号均可)。
 * 按供数方式分两条口径:
 *  · searchLocal —— 小行星/监测站/观测任务/L1 任务, 取自治 store 当前快照,
 *    纯推导不含网络请求 (观测任务经 getAllObsTasks 按仿真日缓存);
 *  · searchEvents —— 风险事件, 三源目录已在服务端归一, 关键字检索下推后端,
 *    故为异步 (调用方需防抖与竞态守卫)。
 * ========================================================================== */

import { useDataStore } from '@/store/dataStore'
import { useSimStore } from '@/store/simStore'
import { getGroundStationProvider } from '@/features/ground/stationProvider'
import { STATION_SPECS } from '@/data/stationSpecs'
import { fetchEventDetail, fetchEvents } from '@/api/client'
import { SEVERITY_META, CATEGORY_META, fmtEventDate } from './eventCenter'
import { getAllObsTasks, OBS_TYPE_ZH, type TaskPriority } from './obsTaskService'
import { getL1Tasks, taskStatus } from './l1MissionService'
import { formatL1Time } from '@/features/l1/store'
import { jdToDate, fmtJD } from '@/utils/orbital/time'

export type SearchKind = 'asteroid' | 'station' | 'event' | 'obsTask' | 'l1Task'

/** 分组呈现顺序 (与检索结果列表的类别排列一致) */
export const SEARCH_KIND_ORDER: SearchKind[] = [
  'asteroid', 'station', 'event', 'obsTask', 'l1Task',
]

export const SEARCH_KIND_META: Record<SearchKind, { label: string }> = {
  asteroid: { label: '小行星' },
  station: { label: '监测站' },
  event: { label: '风险事件' },
  obsTask: { label: '观测任务' },
  l1Task: { label: 'L1 计划访问' },
}

export interface SearchHit {
  kind: SearchKind
  /** 组内唯一键 (渲染 key) */
  key: string
  title: string
  subtitle: string
  /** 路由路径 */
  to: string
  /** 观测任务经导航 state 携带任务对象 (专题页现有消费口径) */
  state?: { task: unknown }
}

const match = (q: string, ...fields: (string | undefined)[]) =>
  fields.some((f) => f && f.toLowerCase().includes(q))

/** 每类结果上限 (防列表过长, 事件源可达数百条) */
const PER_KIND = 6

/**
 * 本地源检索: 小行星 → 监测站 → 观测任务 → L1 任务 (不含风险事件)。
 * 事件类目由 searchEvents 异步补齐, 呈现顺序按 SEARCH_KIND_ORDER 归位。
 */
export function searchLocal(query: string): SearchHit[] {
  const q = query.trim().toLowerCase()
  if (!q) return []
  const hits: SearchHit[] = []

  /* 小行星: 中文名 / 英文名 / 分类 */
  const asteroids = useDataStore.getState().asteroids
  asteroids.forEach((a, i) => {
    if (match(q, a.name, a.en, a.cls)) {
      hits.push({
        kind: 'asteroid', key: `ast-${i}`,
        title: `${a.name} ${a.en}`, subtitle: a.cls,
        to: `/asteroid/${i}`,
      })
    }
  })

  /* 地面监测站: 名称 / 国别 / 类型 */
  getGroundStationProvider().getStations().forEach((st, i) => {
    if (match(q, st.name, st.country, st.type)) {
      hits.push({
        kind: 'station', key: `st-${i}`,
        title: st.name, subtitle: `${st.country} · ${st.type}`,
        to: `/station/${i}`,
      })
    }
  })

  const nowJd = useSimStore.getState().jd

  /* 观测任务: 设施 / 目标 / 编号 (任务对象随导航 state 传递) */
  const obsTasks = getAllObsTasks(nowJd)
  let obsCount = 0
  for (const t of obsTasks) {
    const target = t.params.find(([k]) => k === '目标')?.[1]
    if (match(q, t.facility, t.id, target, OBS_TYPE_ZH[t.type])) {
      hits.push({
        kind: 'obsTask', key: `obs-${t.id}`,
        title: target ? `${t.facility} → ${target}` : t.facility,
        subtitle: `${OBS_TYPE_ZH[t.type]} · ${t.id}`,
        to: `/obs-task/${t.id}`,
        state: { task: t },
      })
      if (++obsCount >= PER_KIND) break
    }
  }

  /* L1 星任务: 名称 / 编号 (详情页按路由参数自行再生成, 无需携带对象) */
  const l1Tasks = getL1Tasks(nowJd)
  let l1Count = 0
  for (const t of l1Tasks) {
    if (match(q, t.name, t.id)) {
      hits.push({
        kind: 'l1Task', key: `l1-${t.id}`,
        title: t.name, subtitle: t.id,
        to: `/situation/l1/task/${t.id}`,
      })
      if (++l1Count >= PER_KIND) break
    }
  }

  return hits
}

/**
 * 风险事件检索: 目录 (内置经典 / JPL CAD / 用户推演) 已在服务端归一,
 * 关键字匹配 (名称 / 风险目标) 与条数上限一并下推, 前端不再持有全量。
 * 时序分类基准取仿真时钟, 与事件中心列表同口径。
 */
export async function searchEvents(
  query: string,
  signal?: AbortSignal,
): Promise<SearchHit[]> {
  const q = query.trim()
  if (!q) return []
  const page = await fetchEvents({
    q, size: PER_KIND, nowJd: useSimStore.getState().jd, signal,
  })
  return page.data.map((ev) => ({
    kind: 'event' as const,
    key: `ev-${ev.key}`,
    title: ev.name,
    subtitle: `${SEVERITY_META[ev.severity].label} · ${jdToDate(ev.jdEnc).toISOString().slice(0, 10)}`,
    to: `/events/${ev.key}`,
  }))
}

/* ---------------------------- 命中项详情解析 ---------------------------- */

/** 命中项详情 (检索页右列渲染): 键值对行 + 专题跳转目标 */
export interface SearchDetail {
  kind: SearchKind
  key: string
  title: string
  subtitle?: string
  rows: [string, string][]
  desc?: string
  /** 专题页路由 */
  to: string
  /** 观测任务经导航 state 携带任务对象 */
  state?: { task: unknown }
}

const PRIORITY_ZH: Record<TaskPriority, string> = {
  urgent: '紧急', high: '高', medium: '中', low: '低',
}

/** 监测站规格字段 → 展示名 (与 StationSpec 字段一一对应) */
const SPEC_LABEL: [keyof import('@/data/stationSpecs').StationSpec, string][] = [
  ['operator', '运营机构'], ['network', '网络归属'], ['elevationM', '台址海拔'],
  ['aperture', '主镜口径'], ['fov', '视场'], ['limitMag', '极限星等'],
  ['detector', '探测器'], ['band', '工作波段'], ['exposure', '曝光策略'],
  ['surveyRate', '巡天速度'], ['role', '任务角色'],
]

/**
 * 按命中键解析详情 (键格式: ast-<idx> / st-<idx> / ev-<路由键> /
 * obs-<任务id> / l1-<任务id>); 与 searchLocal/searchEvents 产出的 hit.key 同源,
 * 浏览器回退后由路由参数重新解析, 无需缓存选中对象。
 * 事件类目需向服务端现取详情, 故整体为异步 (其余类目仍为本地推导)。
 */
export async function resolveHit(
  hitKey: string,
  signal?: AbortSignal,
): Promise<SearchDetail | null> {
  const sep = hitKey.indexOf('-')
  if (sep < 1) return null
  const prefix = hitKey.slice(0, sep)
  const id = hitKey.slice(sep + 1)
  const nowJd = useSimStore.getState().jd

  if (prefix === 'ast') {
    const idx = Number(id)
    const a = useDataStore.getState().asteroids[idx]
    if (!a) return null
    return {
      kind: 'asteroid', key: hitKey,
      title: `${a.name} ${a.en}`, subtitle: a.cls,
      rows: [
        ['分类', a.cls],
        ['直径', a.diam >= 1 ? `${a.diam.toFixed(1)} km` : `${(a.diam * 1000).toFixed(0)} m`],
        ['半长轴 a', `${a.a.toFixed(3)} AU`],
        ['离心率 e', a.e.toFixed(3)],
        ['轨道倾角 i', `${a.i.toFixed(2)}°`],
        ...(a.spinH != null ? [['自转周期', `${a.spinH.toFixed(1)} h`] as [string, string]] : []),
      ],
      desc: '进入专题页可查看危险评估、与地球轨道关系及前后 20 年接近事件扫描。',
      to: `/asteroid/${idx}`,
    }
  }

  if (prefix === 'st') {
    const idx = Number(id)
    const st = getGroundStationProvider().getStations()[idx]
    if (!st) return null
    const spec = STATION_SPECS[st.name]
    const rows: [string, string][] = [
      ['国别', st.country], ['类型', st.type],
      ['纬度', `${st.lat.toFixed(2)}°`], ['经度', `${st.lon.toFixed(2)}°`],
    ]
    if (spec) {
      for (const [k, label] of SPEC_LABEL) {
        const v = spec[k]
        if (v == null) continue
        rows.push([label, k === 'elevationM' ? `${v} m` : String(v)])
      }
    }
    return {
      kind: 'station', key: hitKey,
      title: st.name, subtitle: `${st.country} · ${st.type}`,
      rows, desc: st.desc,
      to: `/station/${idx}`,
    }
  }

  if (prefix === 'ev') {
    /* id 形如 r-apophis / c-1001 / s-<uuid>, 本身就是事件路由键 */
    const ev = await fetchEventDetail(id, nowJd, signal)
    if (!ev) return null
    const rows: [string, string][] = [
      ['风险目标', ev.target],
      ['类型', ev.type === 'impact' ? '撞击' : '飞掠接近'],
      ['发生时刻', fmtEventDate(ev.dateUTC)],
      ['风险等级', SEVERITY_META[ev.severity].label],
      ['时序分类', CATEGORY_META[ev.category].label],
      ['直径', ev.diam >= 1 ? `${ev.diam.toFixed(2)} km` : `${(ev.diam * 1000).toFixed(0)} m`],
    ]
    if (ev.type === 'flyby' && ev.missKm != null) {
      rows.push(['最近距离', `${(ev.missKm / 384400).toFixed(2)} 个月球距离`])
    }
    if (ev.type === 'impact' && ev.energyMt != null) {
      rows.push(['撞击能量', `${ev.energyMt.toFixed(2)} Mt TNT`])
    }
    return {
      kind: 'event', key: hitKey,
      title: ev.name, subtitle: `${SEVERITY_META[ev.severity].label} · ${jdToDate(ev.jdEnc).toISOString().slice(0, 10)}`,
      rows, desc: '进入专题页可查看风险窗口倒计时、轨道拟合与仿真推演。',
      to: `/events/${id}`,
    }
  }

  if (prefix === 'obs') {
    const t = getAllObsTasks(nowJd).find((x) => x.id === id)
    if (!t) return null
    const target = t.params.find(([k]) => k === '目标')?.[1]
    const rows: [string, string][] = [
      ['执行设施', t.facility],
      ['任务类型', OBS_TYPE_ZH[t.type]],
      ['优先级', PRIORITY_ZH[t.priority]],
      ['窗口开始', fmtJD(t.windowStart)],
      ['窗口结束', fmtJD(t.windowEnd)],
      ...t.params,
    ]
    return {
      kind: 'obsTask', key: hitKey,
      title: target ? `${t.facility} → ${target}` : t.facility,
      subtitle: `${OBS_TYPE_ZH[t.type]} · ${t.id}`,
      rows, desc: t.purpose,
      to: `/obs-task/${t.id}`, state: { task: t },
    }
  }

  if (prefix === 'l1') {
    const t = getL1Tasks(nowJd).find((x) => x.id === id)
    if (!t) return null
    const st = taskStatus(t, nowJd)
    const rows: [string, string][] = [
      ['当前状态', st === 'planned' ? '未来时段' : st === 'executing' ? '时段内' : '时段已过去'],
      ['数据性质', '观测计划回放，非真实执行反馈'],
      ['窗口开始', formatL1Time(t.start)],
      ['窗口结束', formatL1Time(t.end)],
      ...t.params,
    ]
    return {
      kind: 'l1Task', key: hitKey,
      title: t.name, subtitle: t.id,
      rows, desc: t.purpose,
      to: `/situation/l1/task/${t.id}`,
    }
  }

  return null
}
