import { describe, expect, it } from 'vitest'
import {
  clamp,
  formatNativeDateTime,
  formatTimelineBoundary,
  isoToNativeDateTime,
  parseUtcDateTime,
} from './model'
import { dateToJD } from '@/utils/orbital/time'

describe('时间轴纯函数', () => {
  const jd = dateToJD(new Date('2026-09-21T03:04:05Z'))

  it('限制数值范围', () => {
    expect(clamp(-1, 0, 10)).toBe(0)
    expect(clamp(4, 0, 10)).toBe(4)
    expect(clamp(11, 0, 10)).toBe(10)
  })

  it('按 UTC 格式化时间轴时间', () => {
    expect(formatTimelineBoundary(jd, false)).toBe('2026')
    expect(formatTimelineBoundary(jd, true)).toBe('2026-09-21 03:04')
    expect(formatNativeDateTime(jd)).toBe('2026-09-21T03:04:05')
  })

  it('解析时间输入并拒绝无效格式', () => {
    expect(parseUtcDateTime('2026-09-21 03:04 UTC')?.toISOString()).toBe(
      '2026-09-21T03:04:00.000Z',
    )
    expect(parseUtcDateTime('not-a-date')).toBeNull()
  })

  it('将 ISO 时间转换为原生 datetime-local 值', () => {
    expect(isoToNativeDateTime('2026-09-21T03:04:05.000Z')).toBe(
      '2026-09-21T03:04:05',
    )
  })
})
