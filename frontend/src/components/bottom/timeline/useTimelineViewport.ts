import { useCallback, useEffect, useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent } from 'react'
import { useLiveJd } from '@/hooks/useLiveJd'
import { useSimStore } from '@/store/simStore'
import { clamp } from './model'

export function useTimelineViewport() {
  const jd = useLiveJd()
  const playing = useSimStore((state) => state.playing)
  const playRate = useSimStore((state) => state.playRate)
  const jdMin = useSimStore((state) => state.jdMin)
  const jdMax = useSimStore((state) => state.jdMax)
  const scaleDays = useSimStore((state) => state.timelineScaleDays)
  const centerJd = useSimStore((state) => state.timelineCenterJd)
  const setPlaying = useSimStore((state) => state.setPlaying)
  const setPlayRate = useSimStore((state) => state.setPlayRate)
  const setJD = useSimStore((state) => state.setJD)
  const setSimulationRange = useSimStore((state) => state.setSimulationRange)
  const setScaleDays = useSimStore((state) => state.setTimelineScaleDays)
  const setCenterJd = useSimStore((state) => state.setTimelineCenterJd)

  const trackRef = useRef<HTMLDivElement>(null)
  const seekFrame = useRef<number | null>(null)
  const dragging = useRef(false)
  const dragRange = useRef<{ min: number; span: number } | null>(null)
  const [hoverPoint, setHoverPoint] = useState<{ jd: number; pct: number } | null>(null)

  const scenarioSpan = Math.max(jdMax - jdMin, 1 / 86400)
  const span = Math.min(scaleDays, scenarioSpan)
  const min = clamp(centerJd - span / 2, jdMin, jdMax - span)
  const max = min + span

  const revealJD = useCallback((nextJD: number, recenter = false) => {
    const value = clamp(nextJD, jdMin, jdMax)
    setJD(value)
    if (recenter) setCenterJd(value)
  }, [jdMax, jdMin, setCenterJd, setJD])

  const applySimulationRange = useCallback((nextMin: number, nextMax: number) => {
    const nextJD = clamp(jd, nextMin, nextMax)
    setPlaying(false)
    setSimulationRange(nextMin, nextMax)
    setJD(nextJD)
    setCenterJd(nextJD)
  }, [jd, setCenterJd, setJD, setPlaying, setSimulationRange])

  useEffect(() => {
    setCenterJd(clamp(useSimStore.getState().jd, jdMin, jdMax))
  }, [jdMin, jdMax, setCenterJd])

  useEffect(() => {
    if (!playing || (jd >= min && jd <= max)) return
    setCenterJd(clamp(jd, jdMin, jdMax))
  }, [jd, jdMin, jdMax, max, min, playing, setCenterJd])

  const seekFromX = useCallback((clientX: number, fixedRange?: { min: number; span: number }) => {
    const rect = trackRef.current?.getBoundingClientRect()
    if (!rect || rect.width <= 0) return
    const ratio = clamp((clientX - rect.left) / rect.width, 0, 1)
    const range = fixedRange ?? { min, span }
    setJD(range.min + ratio * range.span)
  }, [min, setJD, span])

  const updateHover = useCallback((clientX: number) => {
    const rect = trackRef.current?.getBoundingClientRect()
    if (!rect || rect.width <= 0) return
    const ratio = clamp((clientX - rect.left) / rect.width, 0, 1)
    const range = dragRange.current ?? { min, span }
    setHoverPoint({ jd: range.min + ratio * range.span, pct: ratio * 100 })
  }, [min, span])

  const seekThrottled = useCallback((clientX: number) => {
    if (seekFrame.current !== null) cancelAnimationFrame(seekFrame.current)
    const fixedRange = dragRange.current ?? undefined
    seekFrame.current = requestAnimationFrame(() => {
      seekFromX(clientX, fixedRange)
      seekFrame.current = null
    })
  }, [seekFromX])

  useEffect(() => () => {
    if (seekFrame.current !== null) cancelAnimationFrame(seekFrame.current)
  }, [])

  const onPointerDown = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    setPlaying(false)
    dragging.current = true
    dragRange.current = { min, span }
    event.currentTarget.setPointerCapture(event.pointerId)
    updateHover(event.clientX)
    seekFromX(event.clientX, dragRange.current)
  }, [min, seekFromX, setPlaying, span, updateHover])

  const onPointerMove = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    updateHover(event.clientX)
    if (dragging.current) seekThrottled(event.clientX)
  }, [seekThrottled, updateHover])

  const onPointerEnd = useCallback(() => {
    dragging.current = false
    dragRange.current = null
    if (seekFrame.current !== null) {
      cancelAnimationFrame(seekFrame.current)
      seekFrame.current = null
    }
  }, [])

  const stepTime = useCallback((direction: -1 | 1) => {
    setPlaying(false)
    const stepDays = clamp(span / 100, 1 / 86400, 1)
    const nextJD = jd + direction * stepDays
    revealJD(nextJD, nextJD < min || nextJD > max)
  }, [jd, max, min, revealJD, setPlaying, span])

  const changeScale = useCallback((days: number) => {
    setScaleDays(days)
    setCenterJd(clamp(jd, jdMin, jdMax))
  }, [jd, jdMax, jdMin, setCenterJd, setScaleDays])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null
      if (target?.matches('input, textarea, select, button, [contenteditable="true"]')) return
      if (event.code === 'Space') {
        event.preventDefault()
        setPlaying(!useSimStore.getState().playing)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [setPlaying])

  return {
    jd,
    playing,
    playRate,
    jdMin,
    jdMax,
    scaleDays,
    min,
    max,
    span,
    trackRef,
    hoverPoint,
    setPlaying,
    setPlayRate,
    revealJD,
    applySimulationRange,
    stepTime,
    changeScale,
    onPointerDown,
    onPointerMove,
    onPointerEnd,
    onPointerEnter: (event: ReactPointerEvent<HTMLDivElement>) => updateHover(event.clientX),
    onPointerLeave: () => { if (!dragging.current) setHoverPoint(null) },
  }
}
