import { D2R, JD_J2000, JULIAN_YEAR_DAYS } from './constants'

export function nowJD(): number {
  return Date.now() / 86400000 + 2440587.5
}

/** 默认仿真范围半宽（天）：当前时刻前后各半个儒略年。 */
export const DEFAULT_HALF_SPAN_DAYS = JULIAN_YEAR_DAYS / 2

/** 默认仿真数据范围；JD_MIN/JD_MAX 仅作为系统支持的绝对边界。 */
export function defaultSimulationRange(): [number, number] {
  const now = nowJD()
  return [now - DEFAULT_HALF_SPAN_DAYS, now + DEFAULT_HALF_SPAN_DAYS]
}

export function jdToDate(jd: number): Date {
  return new Date((jd - 2440587.5) * 86400000)
}

export function dateToJD(date: Date): number {
  return date.getTime() / 86400000 + 2440587.5
}

export function gmstRad(jd: number): number {
  return (280.46061837 + 360.98564736629 * (jd - JD_J2000)) * D2R
}

export function spinTheta(periodHours: number, jd: number): number {
  return (2 * Math.PI) * (jd - JD_J2000) * 24 / periodHours
}

function pad(n: number): string {
  return String(n).padStart(2, '0')
}

export function fmtJD(jd: number): string {
  const t = jdToDate(jd)
  return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())} ${pad(t.getUTCHours())}:${pad(t.getUTCMinutes())}:${pad(t.getUTCSeconds())} UTC`
}

/** 精确到分钟的 UTC 时间 (yyyy-MM-dd HH:mm), 列表/卡片窗口展示用 */
export function fmtJDMinute(jd: number): string {
  const t = jdToDate(jd)
  return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())} ${pad(t.getUTCHours())}:${pad(t.getUTCMinutes())}`
}

/** 短格式时间 (M/D HH:mm), 紧凑卡片与时间轴标签用 */
export function fmtJDShort(jd: number): string {
  const t = jdToDate(jd)
  return `${t.getUTCMonth() + 1}/${t.getUTCDate()} ${pad(t.getUTCHours())}:${pad(t.getUTCMinutes())}`
}

export function fmtKm(km: number): string {
  if (km >= 1e8) return (km / 1e8).toFixed(2) + ' 亿公里'
  if (km >= 1e4) return (km / 1e4).toFixed(1) + ' 万公里'
  return Math.round(km).toLocaleString() + ' 公里'
}
