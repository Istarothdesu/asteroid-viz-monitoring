import axios from 'axios'
import type { AsteroidRecord } from '@/types/asteroid'
import type { EventRecord } from '@/types/scene'
import type { L1Reference, TimeAxis } from '@/features/l1/types'

/**
 * 后端地址:
 * - 默认空串 = 同源相对路径 (/api/...)。生产部署时前端静态资源与 API 由同一
 *   个容器提供 (FastAPI 挂 StaticFiles), 因此镜像无需在构建期知道后端地址,
 *   内网换 IP/端口/域名都不用重新构建;
 * - 开发时 vite dev/preview 已把 /api 代理到 localhost:8000, 同样走相对路径;
 * - 仅当前后端确实分属不同源 (分开部署) 时, 才用 VITE_API_BASE 注入绝对地址。
 */
const API_BASE = import.meta.env.VITE_API_BASE ?? ''

const http = axios.create({ baseURL: API_BASE, timeout: 5000 })

export async function fetchL1Reference(): Promise<L1Reference> {
  return (await http.get('/api/l1/reference', { timeout: 20000 })).data
}

export async function fetchL1TimeAxis(startJdTdb: number): Promise<TimeAxis> {
  return (await http.get('/api/l1/time-axis', { params: { start_jd_tdb: startJdTdb } })).data
}

export async function convertL1Time(params: { utc_iso: string } | { jd_tdb: number }): Promise<{ jdTdb: number; utcIso: string }> {
  return (await http.get('/api/l1/time', { params })).data
}

/** CAD 真实接近事件 (后端 /api/events/close-approaches 序列化形状) */
export interface CadEvent {
  cdId: string
  orbitId: string | null
  des: string
  fullname: string
  dateIso: string
  jd: number
  distLd: number
  vRelKms: number | null
  h: number | null
  diamKm: number | null
}

/** 云带样本行: [a, e, i, Ω, ω, M0(J2000), H, 可读编号?] */
export type CloudRow = [
  number, number, number, number, number, number, number, string?,
]
export type CloudPop = 'main_belt' | 'neo' | 'hilda' | 'trojan' | 'kuiper'

export async function fetchAsteroids(): Promise<AsteroidRecord[]> {
  const { data } = await http.get('/api/asteroids')
  return data.data
}

export async function fetchCloudSeeds(): Promise<Partial<Record<CloudPop, CloudRow[]>>> {
  const { data } = await http.get('/api/cloud')
  return data.data
}

/** 预计算星历 (二进制, 行星 ~25MB + 重点小行星 ~36MB; 内网一次性拉取, 404 = 未烘焙, 调用方回退) */
export async function fetchEphemeris(): Promise<ArrayBuffer> {
  const { data } = await http.get('/api/ephemeris', {
    responseType: 'arraybuffer',
    timeout: 120000,
  })
  return data
}

/** 现取 SBDB 缓存天体 (点击 CAD 事件时用), 放宽超时 */
export async function fetchAsteroidByDes(des: string): Promise<AsteroidRecord> {
  const { data } = await http.get(`/api/asteroids/by-des/${encodeURIComponent(des)}`, {
    timeout: 20000,
  })
  return data
}

/* --------------------- 概率风险数据 (SBDB 协方差 + Sentry 官方汇总) --------------------- */

export interface RiskAssessmentSnapshot {
  assessmentId: string
  orbitSolutionId: string | null
  solutionEpochTdb: number | null
  covarianceEpochTdb: number
  labels: string[]
  matrix: number[][]
  /** 与协方差矩阵同解、同历元的参数中心值，供后续样本传播使用。 */
  elements: Record<string, number>
  sourceVersion: string | null
  updatedAt: string
}

export interface SentryRiskSummary {
  designation: string
  fullname: string | null
  sentryId: string | null
  impactProbability: number | null
  virtualImpactorCount: number | null
  palermoCum: number | null
  palermoMax: number | null
  torinoMax: number | null
  vinfKms: number | null
  impactRange: string | null
  lastObs: string | null
  sourceVersion: string | null
  updatedAt: string
}

export interface RiskAssessmentResult {
  designation: string
  assessment: RiskAssessmentSnapshot | null
  sentry: SentryRiskSummary | null
  requestedOrbitSolutionId: string | null
  orbitSolutionMatch: boolean
  availability: {
    uncertainty: boolean
    bPlane: boolean
    impactCorridor: boolean
  }
}

export interface ComputationMeta {
  sourceSystem: string
  algorithmVersion: string
  referenceFrame: 'ECLIPJ2000' | 'GEO_ECLIPTIC'
  timeScale: 'TDB'
  validRange?: [number, number]
  anchorJd?: number
  inputProductIds?: string[]
}

/** 风险端点始终返回降级状态；网络/服务错误才抛异常。 */
export async function fetchRiskAssessment(
  designation: string,
  orbitSolutionId?: string | null,
): Promise<RiskAssessmentResult> {
  const { data } = await http.get(`/api/risk/${encodeURIComponent(designation)}`, {
    params: orbitSolutionId ? { orbitSolutionId } : undefined,
  })
  return data
}

export interface NominalBPlane {
  meta: ComputationMeta
  designation: string
  requestedEncounterJd: number
  closestJd: number
  closestDistanceKm: number
  xiKm: number
  zetaKm: number
  bMagnitudeKm: number
  vinfKms: number
  effectiveImpactRadiusKm: number
  bVectorEclipticKm: [number, number, number]
  incomingDirectionEcliptic: [number, number, number]
  xiAxisEcliptic: [number, number, number]
  zetaAxisEcliptic: [number, number, number]
  source: 'nominal-nbody' | 'local-covariance-nbody'
  propagationSource: 'ephemeris' | 'elements' | 'covariance-elements'
  orbitSolutionId: string | null
  requestedOrbitSolutionId: string | null
  orbitSolutionMatch: boolean
}

/** 用户主动触发的名义 B 平面计算；没有协方差时仍可用于几何分析。 */
export async function fetchNominalBPlane(
  designation: string,
  encounterJd: number,
  orbitSolutionId?: string | null,
): Promise<NominalBPlane> {
  const { data } = await http.post('/api/risk/bplane', { designation, encounterJd, orbitSolutionId }, {
    timeout: 60000,
  })
  return data
}

/**
 * 本地协方差在 B 平面的线性投影。它只用于事件分析，不能替代 Sentry 的
 * 虚拟撞击体（VI）官方解算。
 */
export interface LocalBPlaneUncertainty {
  meta: ComputationMeta
  designation: string
  method: 'local-linear-nbody-sobol'
  sampleCount: number
  hitCount: number
  localImpactProbability: number
  bPlaneCovarianceKm2: [[number, number], [number, number]]
  uncertaintyTube: UncertaintyTube
  nominalTrajectory: NominalTrajectory
  nominalBPlane: NominalBPlane
  assessmentId: string
  covarianceEpochTdb: number
  requestedOrbitSolutionId: string | null
  orbitSolutionId: string | null
  orbitSolutionMatch: boolean
  ignoredLabels: string[]
}

export interface UncertaintyTubeSection {
  jd: number
  centerEclipticAu: [number, number, number]
  axisAEcliptic: [number, number, number]
  axisBEcliptic: [number, number, number]
  radiusAAu: number
  radiusBAu: number
}

export interface UncertaintyTube {
  confidenceSigma: number
  sections: UncertaintyTubeSection[]
}

/** 与协方差管同一中心状态传播得到的事件专题名义轨迹。 */
export interface NominalTrajectory {
  points: NominalTrajectoryPoint[]
}

export interface NominalTrajectoryPoint {
  jd: number
  centerEclipticAu: [number, number, number]
}

export async function fetchLocalBPlaneUncertainty(
  designation: string,
  encounterJd: number,
  sampleCount = 4096,
  orbitSolutionId?: string | null,
): Promise<LocalBPlaneUncertainty> {
  const { data } = await http.post('/api/risk/bplane-uncertainty', {
    designation, encounterJd, sampleCount, orbitSolutionId,
  }, { timeout: 120000 })
  return data
}

/* ============================================================================
 * 事件中心: 三源 (内置经典 / JPL CAD / 用户推演) 在服务端归一为一个目录,
 * 过滤·排序·分页·计数全部下推, 前端不再一次性拉全量。所有派生量
 * (危险等级 / 时序分类 / 直径估算) 以服务端为唯一口径。
 * ========================================================================== */

export type EventSeverity = 'critical' | 'high' | 'medium' | 'low'
export type EventSource = 'builtin' | 'cad' | 'sim'
/** 时序分类 (相对 reference JD): 未来一年 / 一年后 / 已发生 */
export type EventCategory = 'current' | 'upcoming' | 'past'
export type EventType = 'impact' | 'flyby'

/** 事件列表项 (GET /api/events 的 data 元素) */
export interface EventItem {
  /** 路由键: r-<内置id> / c-<cdId> / s-<推演id> */
  key: string
  source: EventSource
  name: string
  /** 风险目标 (天体名称/编号) */
  target: string
  type: EventType
  dateUTC: string
  jdEnc: number
  /** 直径 km (CAD 缺失时由 H 星等估算, diamEstimated=true) */
  diam: number
  diamEstimated?: boolean
  missKm?: number
  vRelKms?: number
  energyMt?: number
  leadH: number
  severity: EventSeverity
  category: EventCategory
  /** 简介摘要 (内置/推演事件带; CAD 事件由前端按真实参数生成) */
  desc?: string
  /** CAD 事件原始行 (详情页组装仿真记录用) */
  cad?: CadEvent
}

/** 事件详情: 列表项 + 可直接仿真的完整记录 (CAD 事件为 null, 需现查 SBDB 组装) */
export interface EventDetail extends EventItem {
  record: EventRecord | null
}

/** 页签角标计数: 全目录口径, 不随检索条件变化 */
export interface EventCounts {
  all: number
  current: number
  upcoming: number
  past: number
  sim: number
}

export interface EventMonthBucket {
  key: string
  label: string
  count: number
  dateFrom: string
  dateTo: string
}

export interface EventStats {
  total: number
  real: number
  simulated: number
  future365d: number
  highAttention: number
  bySeverity: Record<EventSeverity, number>
  byType: Record<EventType, number>
  bySource: Record<EventSource, number>
  byCategory: Record<EventCategory, number>
  monthly: EventMonthBucket[]
  highlights: {
    next: EventItem | null
    closest: EventItem | null
    largest: EventItem | null
  }
}

export interface EventPage {
  data: EventItem[]
  total: number
  /** 实际页码 (1 起); 越界时服务端已收敛到末页 */
  page: number
  size: number
  pages: number
  counts: EventCounts
  /** 当前筛选结果的分页前统计，与 data 使用同一 reference JD。 */
  stats: EventStats
  nowJd: number
}

/** 事件检索条件 (与后端 /api/events 查询串一一对应) */
export interface EventListParams {
  page?: number
  /** 每页条数; 0 = 只取页签计数 */
  size?: number
  /** 关键字: 事件名称 / 风险目标 */
  q?: string
  type?: EventType
  source?: EventSource
  severity?: EventSeverity
  category?: EventCategory
  /** 发生时刻起 (UTC yyyy-MM-dd, 含当天) */
  dateFrom?: string
  /** 发生时刻止 (UTC yyyy-MM-dd, 含当天) */
  dateTo?: string
  /** 时序分类与相对时间过滤的显式分析基准 JD。 */
  nowJd?: number
  signal?: AbortSignal
}

/** camelCase 参数 → snake_case 查询串; undefined/空串一律不传 (服务端用缺省值) */
function eventQuery(p: EventListParams) {
  return {
    ...(p.page != null && { page: p.page }),
    ...(p.size != null && { size: p.size }),
    ...(p.q && { q: p.q }),
    ...(p.type && { type: p.type }),
    ...(p.source && { source: p.source }),
    ...(p.severity && { severity: p.severity }),
    ...(p.category && { category: p.category }),
    ...(p.dateFrom && { date_from: p.dateFrom }),
    ...(p.dateTo && { date_to: p.dateTo }),
    ...(p.nowJd != null && { now_jd: p.nowJd }),
  }
}

export async function fetchEvents(p: EventListParams = {}): Promise<EventPage> {
  const { data } = await http.get('/api/events', {
    params: eventQuery(p),
    signal: p.signal,
  })
  return data
}

/** 只取页签计数 (顶栏角标等轻量消费方): size=0 不返回条目 */
export async function fetchEventCounts(nowJd?: number): Promise<EventCounts> {
  const page = await fetchEvents({ size: 0, nowJd })
  return page.counts
}

/** 单个事件详情 (专题页/检索右列); 键不存在返回 null (区别于网络/服务异常) */
export async function fetchEventDetail(
  key: string,
  nowJd?: number,
  signal?: AbortSignal,
): Promise<EventDetail | null> {
  try {
    const { data } = await http.get(`/api/events/${encodeURIComponent(key)}`, {
      params: { ...(nowJd != null && { now_jd: nowJd }) },
      signal,
    })
    return data
  } catch (e) {
    if (axios.isAxiosError(e) && e.response?.status === 404) return null
    throw e
  }
}

/** 内置经典事件的完整记录 (含轨道根数/图片/背景资料), 仅 5 条量级不分页 */
export async function fetchBuiltinRecords(signal?: AbortSignal): Promise<EventRecord[]> {
  const { data } = await http.get('/api/events/builtin', { signal })
  return data.data
}

/* --------------------- 用户推演事件 CRUD (入库共享) --------------------- */

/** 推演事件: 直径以米为单位 (表单口径), 与后端 sim_dto 同形 */
export interface SimEvent {
  id: string
  name: string
  desc: string
  type: EventType
  targetType: string
  diam: number
  dateUTC: string
  el: { a: number; e: number; i: number; O: number; w: number }
  missKm?: number
  impactLat?: number
  impactLon?: number
  /** 撞击专属: 爆炸高度 km (0=地表), 冲击波范围 km², 能量 Mt TNT 当量 */
  burstAltKm?: number
  shockAreaKm2?: number
  energyMt?: number
  leadH: number
}

export type SimEventInput = Omit<SimEvent, 'id'>

export async function fetchSimEvents(signal?: AbortSignal): Promise<SimEvent[]> {
  const { data } = await http.get('/api/sim-events', { signal })
  return data.data
}

export async function createSimEvent(input: SimEventInput): Promise<SimEvent> {
  const { data } = await http.post('/api/sim-events', input)
  return data
}

export async function updateSimEvent(id: string, input: SimEventInput): Promise<SimEvent> {
  const { data } = await http.put(`/api/sim-events/${encodeURIComponent(id)}`, input)
  return data
}

export async function deleteSimEvent(id: string): Promise<void> {
  await http.delete(`/api/sim-events/${encodeURIComponent(id)}`)
}

/* --------------------- N 体事件推演 (按需数值积分) --------------------- */

/** POST /api/propagate 响应: points 为 [jd, x, y, z] 时间升序 (日心黄道 J2000, AU) */
export interface PropagateArcResult {
  meta: ComputationMeta
  designation: string
  /** 积分初值时刻 (儒略日) */
  initJd: number
  /** 初值来源: ephemeris=烘焙星历网格点 / elements=历元根数 */
  source: 'ephemeris' | 'elements'
  requestedOrbitSolutionId: string | null
  orbitSolutionId: string | null
  orbitSolutionMatch: boolean
  points: [number, number, number, number][]
}

/**
 * 按需 N 体推演 (离线可用, 库中已缓存天体均可): 数值积分耗时较长故放宽超时;
 * 404 = 库中无此天体, 返回 null (区别于网络/服务异常)
 */
export async function propagateArc(
  designation: string,
  t0: number,
  t1: number,
  stepD: number,
  orbitSolutionId?: string | null,
): Promise<PropagateArcResult | null> {
  try {
    const { data } = await http.post(
      '/api/propagate',
      { designation, t0, t1, stepD, orbitSolutionId },
      { timeout: 60000 },
    )
    return data
  } catch (e) {
    if (axios.isAxiosError(e) && e.response?.status === 404) return null
    throw e
  }
}

/* --------------------- 系统指标: 数据同步状态 --------------------- */

/** 单个数据源的同步状态 (GET /api/sync/status 的值元素) */
export interface SyncStatusEntry {
  lastSyncAt: string | null
  recordCount: number
  status: string
  message: string | null
}

/** 各数据源同步状态, 键为数据源标识 (named / cad / mpcorb / ephem / ephem_ast / sentry) */
export async function fetchSyncStatus(): Promise<Record<string, SyncStatusEntry>> {
  const { data } = await http.get('/api/sync/status')
  return data
}
