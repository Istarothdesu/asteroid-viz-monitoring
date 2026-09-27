/* ============================================================================
 * eventCenter.ts — 事件中心展示模型
 *
 * 三源事件 (内置经典 / JPL CAD / 用户推演) 已在服务端归一为统一 EventItem:
 * 危险等级、时序分类、直径估算、过滤·排序·分页均由 /api/events 下推,
 * 前端不再持有全量目录。本模块只保留展示层口径:
 *  · 等级/来源/分类的中文标签与主题色 (驱动专题页配色);
 *  · 事件专题仿真范围推算 eventWindow;
 *  · 文本格式化 fmtSpan / fmtEventDate;
 *  · CAD 事件「现查 SBDB 根数 → 组装可仿真记录」的适配器 cadToRecord。
 * ========================================================================== */

import type { EventRecord } from '@/types/scene'
import type { CadEvent, EventItem } from '@/api/client'
import { dateToJD, jdToDate } from '@/utils/orbital/time'

/* 服务端为事件模型的唯一定义处, 此处转出以保持既有导入路径不变 */
export type {
  CadEvent,
  EventCategory,
  EventCounts,
  EventDetail,
  EventItem,
  EventListParams,
  EventPage,
  EventStats,
  EventMonthBucket,
  EventSeverity,
  EventSource,
  EventType,
} from '@/api/client'

export const LD_KM = 384400 // 月地平均距离 (km)

export const SEVERITY_META: Record<
  EventItem['severity'],
  { label: string; color: string }
> = {
  critical: { label: '极高关注', color: '#ff4d4f' },
  high: { label: '高关注', color: '#ff7043' },
  medium: { label: '中关注', color: '#fbbf24' },
  low: { label: '低关注', color: '#38bdf8' },
}

export const SOURCE_META: Record<
  EventItem['source'],
  { label: string; cls: string }
> = {
  builtin: { label: '内置经典', cls: 'text-sky-300/80 border-sky-400/25 bg-sky-400/[0.06]' },
  cad: { label: 'JPL CAD', cls: 'text-emerald-300 border-emerald-400/30 bg-emerald-400/10' },
  sim: { label: '推演', cls: 'text-violet-300 border-violet-400/35 bg-violet-400/10' },
}

export const CATEGORY_META: Record<EventItem['category'], { label: string }> = {
  current: { label: '未来一年' },
  upcoming: { label: '远期' },
  past: { label: '历史' },
}

/** H 绝对星等 → 直径估算 (km), 反照率取 0.15 (S/C 型石质均值); 与服务端同口径 */
export function diamFromH(h: number): number {
  return (1329 / Math.sqrt(0.15)) * 10 ** (-h / 5)
}

/** CAD 事件无本地根数: 用 SBDB 根数组装可仿真/预览的完整事件记录 */
export function cadToRecord(
  cad: CadEvent,
  o: { a: number; e: number; i: number; O: number; w: number; des?: string },
): EventRecord {
  const missKm = cad.distLd * LD_KM
  return {
    id: `cad-${cad.cdId}`,
    name: `${cad.des} 真实接近 (JPL CAD)`,
    type: 'flyby',
    dateUTC: cad.dateIso + 'Z',
    diam: cad.diamKm ?? (cad.h != null ? diamFromH(cad.h) : 0.05),
    missKm,
    leadH: 48,
    el: o,
    img: '',
    credit: '数据: NASA/JPL CAD + SBDB',
    news: '',
    desc: `JPL CAD 真实数据: ${cad.dateIso} TDB 以约 ${(missKm / 1e6).toFixed(2)} 百万公里 (${cad.distLd.toFixed(2)} 个月球距离) 接近地球。`,
  }
}

/**
 * 事件专题仿真范围（动态计算，供观察/仿真使用）：
 * - 撞击: 撞击前至少 3 天接近几何 (发现时刻更早则含发现前 0.5 天余量),
 *   撞击后 0.5 天容纳大气层进入与撞击特效收尾;
 * - 飞掠: 遭遇前按提前期 1.5 倍 (至少 10 天) 观察接近, 遭遇后 10 天观察离去。
 * 内置事件 leadH 仅数小时~数十小时, 直接取发现→遭遇会导致窗口过窄,
 * 故用下限保证接近/离去过程可完整观察。
 */
export function eventWindow(ev: EventItem): { start: number; end: number } {
  const leadD = ev.leadH / 24
  if (ev.type === 'impact') {
    return { start: ev.jdEnc - Math.max(leadD + 0.5, 3), end: ev.jdEnc + 0.5 }
  }
  return { start: ev.jdEnc - Math.max(leadD * 1.5, 10), end: ev.jdEnc + 10 }
}

/** 时间跨度格式化: ≥1年 → "X 年"; ≥1天 → "D 天 HH:MM:SS"; 否则 "HH:MM:SS" */
export function fmtSpan(days: number): string {
  const d = Math.abs(days)
  if (d >= 365.25) return `${(d / 365.25).toFixed(2)}y`
  const whole = Math.floor(d)
  const secs = Math.round((d - whole) * 86400)
  const hh = String(Math.floor(secs / 3600)).padStart(2, '0')
  const mm = String(Math.floor((secs % 3600) / 60)).padStart(2, '0')
  const ss = String(secs % 60).padStart(2, '0')
  return whole > 0 ? `${whole}d ${hh}:${mm}:${ss}` : `${hh}:${mm}:${ss}`
}

/** ISO 样式的事件时刻显示；CAD 的 calendar 字段按 JPL 定义标注为 TDB。 */
export function fmtEventDate(dateUTC: string, scale: 'UTC' | 'TDB' = 'UTC'): string {
  return jdToDate(dateToJD(new Date(dateUTC))).toISOString().slice(0, 16).replace('T', ' ') + ` ${scale}`
}
