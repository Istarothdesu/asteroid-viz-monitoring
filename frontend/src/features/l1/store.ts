import { create } from 'zustand'
import { fetchL1Reference, fetchL1TimeAxis } from '@/api/client'
import { setL1Reference } from './runtime'
import type { L1Reference, TimeAxis } from './types'

interface State {
  reference: L1Reference | null; status: 'loading' | 'ready' | 'unavailable'
  timeAxis: TimeAxis | null
  load: () => Promise<void>; ensureTimeAxis: (jdTdb: number) => Promise<void>
}
let timeRequest: Promise<void> | null = null
export const useL1Store = create<State>((set, get) => ({
  reference: null, status: 'loading', timeAxis: null,
  load: async () => {
    try {
      const reference = await fetchL1Reference()
      setL1Reference(reference)
      set({ reference, status: 'ready' })
    } catch { setL1Reference(null); set({ reference: null, status: 'unavailable' }) }
  },
  ensureTimeAxis: async (jd) => {
    const axis = get().timeAxis
    if (axis && Math.max(jd - 31, 2441318.5) >= axis.startJdTdb && jd + 31 <= axis.endJdTdb) return
    if (jd < 2441318.5 || jd > 2488069.5 || timeRequest) return
    const start = Math.max(2441318.5, Math.floor((jd - 2441318.5) / 32) * 32 + 2441318.5 - 32)
    timeRequest = fetchL1TimeAxis(start)
      .then(timeAxis => { set({ timeAxis }) }).catch(() => {}).finally(() => { timeRequest = null })
    await timeRequest
  },
}))

export function formatL1Time(jd: number, axis = useL1Store.getState().timeAxis): string {
  if (!axis || jd < axis.startJdTdb || jd > axis.endJdTdb) return `JD ${jd.toFixed(6)} TDB`
  const leap = axis.leaps.find(item => jd >= item.startJdTdb && jd < item.endJdTdb)
  if (leap) return leap.label
  const samples = axis.samples
  let low = 0, high = samples.length - 1
  while (high - low > 1) { const mid = (low + high) >> 1; if (samples[mid][0] <= jd) low = mid; else high = mid }
  const a = samples[low], b = samples[high]
  // 闰秒前后不插值跨越跳变；直接沿对应分段的 SI 秒推进。
  const jump = axis.leaps.find(item => item.startJdTdb >= a[0] && item.endJdTdb <= b[0])
  const ms = jump ? (jd < jump.startJdTdb ? a[1] + (jd - a[0])*86400000 : b[1] + (jd - b[0])*86400000)
    : a[1] + (b[1] - a[1]) * (jd - a[0]) / (b[0] - a[0])
  return new Date(ms).toISOString().replace('T', ' ').slice(0, 19) + ' UTC'
}
