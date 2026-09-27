import { useEffect } from 'react'
import { phaseAt, playbackRate } from '@/core/eventSimulation/event.js'
import { useLiveJd } from '@/hooks/useLiveJd'
import { useEventSimulationStore } from '@/store/eventSimulationStore'
import { useSimStore } from '@/store/simStore'

const SECONDS_PER_DAY = 86400
const clamp = (value: number, max: number) => Math.max(0, Math.min(max, value))

/** 仿真时间统一从场景 JD 读取；场景供应器只定义秒数与阶段。 */
export function useEventSimulationTimeline() {
  const state = useEventSimulationStore()
  const playing = useSimStore(s => s.playing)
  const manualRate = useSimStore(s => s.playRate)
  const jdMin = useSimStore(s => s.jdMin)
  const jdMax = useSimStore(s => s.jdMax)
  const jd = useLiveJd(100)
  const event = state.session
  const ready = state.preparation === 'ready'
  const displayJd = ready ? jd : state.jdEnc
  const duration = ready ? event?.duration ?? (jdMax - jdMin) * SECONDS_PER_DAY : 0
  const elapsed = ready
    ? clamp(event ? (jd - state.jdEnc) * SECONDS_PER_DAY + event.impactTime : (jd - jdMin) * SECONDS_PER_DAY, duration)
    : 0
  const rate = event && state.automaticRate ? playbackRate(event, elapsed) : manualRate
  const phase = event ? phaseAt(event, elapsed) : ready ? '近距飞掠' : state.preparation === 'loading' ? '准备场景' : '等待可用模型'

  useEffect(() => {
    const onKey = (keyboardEvent: KeyboardEvent) => {
      const target = keyboardEvent.target as HTMLElement
      if (keyboardEvent.code !== 'Space' || keyboardEvent.repeat ||
        /^(INPUT|TEXTAREA|SELECT|BUTTON)$/.test(target.tagName) || target.isContentEditable) return
      if (!useEventSimulationStore.getState().activeEvent || useEventSimulationStore.getState().preparation !== 'ready') return
      keyboardEvent.preventDefault()
      const sim = useSimStore.getState()
      sim.setPlaying(!sim.playing)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const seek = (seconds: number) => {
    if (!ready) return
    const sim = useSimStore.getState()
    sim.setPlaying(false)
    sim.setJD(jdMin + clamp(seconds, duration) / SECONDS_PER_DAY)
  }
  const togglePlaying = () => useSimStore.getState().setPlaying(!useSimStore.getState().playing)
  const replay = () => {
    seek(0)
    useSimStore.getState().setPlaying(true)
  }
  const setRate = (value: string) => {
    state.setAutomaticRate(value === 'auto')
    if (value === 'auto') return
    const sim = useSimStore.getState()
    const wasPlaying = sim.playing
    sim.setPlayRate(Number(value))
    sim.setPlaying(wasPlaying)
  }

  return { state, event, ready, jd: displayJd, jdMin, duration, elapsed, rate, phase,
    playing, manualRate, seek, togglePlaying, replay, setRate }
}
