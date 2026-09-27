import { useCallback, useEffect, useRef, useState } from 'react'
import { convertL1Time } from '@/api/client'
import { dateToJD } from '@/utils/orbital/time'
import { JD_MAX, JD_MIN } from '@/utils/orbital/constants'
import {
  formatNativeDateTime,
  isoToNativeDateTime,
  parseUtcDateTime,
} from './model'

export function useTimelineRangeInputs({
  isL1,
  jdMin,
  jdMax,
  revealJD,
  applySimulationRange,
}: {
  isL1: boolean
  jdMin: number
  jdMax: number
  revealJD: (jd: number, recenter?: boolean) => void
  applySimulationRange: (min: number, max: number) => void
}) {
  const [timeError, setTimeError] = useState('')
  const [startText, setStartText] = useState(() => formatNativeDateTime(jdMin))
  const [endText, setEndText] = useState(() => formatNativeDateTime(jdMax))
  const lastValidText = useRef({
    start: formatNativeDateTime(jdMin),
    end: formatNativeDateTime(jdMax),
  })

  useEffect(() => {
    let active = true
    const syncInputs = async () => {
      try {
        const values = isL1
          ? await Promise.all([
              convertL1Time({ jd_tdb: jdMin }),
              convertL1Time({ jd_tdb: jdMax }),
            ]).then(([start, end]) => ({
              start: isoToNativeDateTime(start.utcIso),
              end: isoToNativeDateTime(end.utcIso),
            }))
          : { start: formatNativeDateTime(jdMin), end: formatNativeDateTime(jdMax) }
        if (!active) return
        lastValidText.current = values
        setStartText(values.start)
        setEndText(values.end)
      } catch {
        if (active) setTimeError('UTC/TDB 换算服务不可用，时间范围保持不变')
      }
    }
    void syncInputs()
    return () => { active = false }
  }, [isL1, jdMin, jdMax])

  const commitBoundary = useCallback(async (kind: 'start' | 'end', text: string) => {
    const parsed = parseUtcDateTime(text)
    const reset = () => {
      setStartText(lastValidText.current.start)
      setEndText(lastValidText.current.end)
    }
    if (!parsed) {
      reset()
      setTimeError('请选择完整的 UTC 日期和时间')
      return
    }
    try {
      const value = isL1
        ? (await convertL1Time({ utc_iso: parsed.toISOString() })).jdTdb
        : dateToJD(parsed)
      const nextMin = kind === 'start' ? value : jdMin
      const nextMax = kind === 'end' ? value : jdMax
      if (value < JD_MIN || value > JD_MAX || nextMin >= nextMax) {
        reset()
        setTimeError('开始时间必须早于结束时间，且需位于系统支持范围内')
        return
      }
      applySimulationRange(nextMin, nextMax)
      setTimeError('')
    } catch {
      reset()
      setTimeError('UTC/TDB 换算服务不可用，时间范围保持不变')
    }
  }, [applySimulationRange, isL1, jdMin, jdMax])

  const goToToday = useCallback(async () => {
    try {
      const now = new Date()
      const nextJD = isL1
        ? (await convertL1Time({ utc_iso: now.toISOString() })).jdTdb
        : dateToJD(now)
      if (nextJD < jdMin || nextJD > jdMax) {
        setTimeError('当前时刻不在本场景的仿真范围内')
        return
      }
      revealJD(nextJD, true)
      setTimeError('')
    } catch {
      setTimeError('UTC/TDB 换算服务不可用，未修改时刻')
    }
  }, [isL1, jdMin, jdMax, revealJD])

  return {
    timeError,
    startText,
    endText,
    setStartText,
    setEndText,
    commitBoundary,
    goToToday,
  }
}
