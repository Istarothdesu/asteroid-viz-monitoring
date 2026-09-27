import { PAUSE_SPEED_INDEX } from '@/store/simStore'
import { JULIAN_YEAR_DAYS } from '@/utils/orbital/constants'
import { jdToDate } from '@/utils/orbital/time'

export const TIME_SCALE_OPTIONS = [
  { label: '1小时', days: 1 / 24 },
  { label: '6小时', days: 0.25 },
  { label: '1天', days: 1 },
  { label: '7天', days: 7 },
  { label: '30天', days: 30 },
  { label: '3个月', days: JULIAN_YEAR_DAYS / 4 },
  { label: '半年', days: JULIAN_YEAR_DAYS / 2 },
  { label: '1年', days: JULIAN_YEAR_DAYS },
] as const

export const RATE_TICKS = [0, 2, 5, PAUSE_SPEED_INDEX, 9, 12, 14]

export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

function pad(value: number): string {
  return String(value).padStart(2, '0')
}

export function formatTimelineBoundary(jd: number, full: boolean): string {
  const date = jdToDate(jd)
  if (!full) return String(date.getUTCFullYear())
  return (
    `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())} ` +
    `${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}`
  )
}

export function formatUtcDateTime(jd: number): string {
  // JD 使用浮点天数，Date → JD → Date 往返可能落在目标秒前几个微秒。
  // 时间输入框按秒展示，因此先归整到最近秒，避免偶发少显示 1 秒。
  const rawDate = jdToDate(jd)
  const date = new Date(Math.round(rawDate.getTime() / 1000) * 1000)
  return (
    `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())} ` +
    `${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}:${pad(date.getUTCSeconds())}`
  )
}

export function formatNativeDateTime(jd: number): string {
  return formatUtcDateTime(jd).replace(' ', 'T')
}

export function isoToNativeDateTime(iso: string): string {
  return iso.replace('Z', '').slice(0, 19)
}

export function parseUtcDateTime(text: string): Date | null {
  const match = text.trim().match(
    /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?(?:\s*UTC)?$/i,
  )
  if (!match) return null
  const [, year, month, day, hour, minute, second = '0'] = match
  const value = new Date(Date.UTC(+year, +month - 1, +day, +hour, +minute, +second))
  return Number.isNaN(value.getTime()) ? null : value
}
