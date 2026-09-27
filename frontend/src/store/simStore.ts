import { create } from 'zustand'
import { nowJD, defaultSimulationRange } from '@/utils/orbital'

export interface SpeedOption {
  label: string
  multiplier: number
}

export const SPEED_OPTIONS: SpeedOption[] = [
  { label: '-30 天/秒', multiplier: -2592000 },
  { label: '-7 天/秒', multiplier: -604800 },
  { label: '-1 天/秒', multiplier: -86400 },
  { label: '-1 小时/秒', multiplier: -3600 },
  { label: '-600×', multiplier: -600 },
  { label: '-60×', multiplier: -60 },
  { label: '-1×', multiplier: -1 },
  { label: '暂停', multiplier: 0 },
  { label: '1× 实时', multiplier: 1 },
  { label: '60×', multiplier: 60 },
  { label: '600×', multiplier: 600 },
  { label: '1 小时/秒', multiplier: 3600 },
  { label: '1 天/秒', multiplier: 86400 },
  { label: '7 天/秒', multiplier: 604800 },
  { label: '30 天/秒', multiplier: 2592000 },
]

export const PAUSE_SPEED_INDEX = SPEED_OPTIONS.findIndex((item) => item.multiplier === 0)

export function speedIndexOf(multiplier: number): number {
  const exact = SPEED_OPTIONS.findIndex((item) => item.multiplier === multiplier)
  if (exact >= 0) return exact
  return SPEED_OPTIONS.reduce((best, item, index) =>
    Math.abs(item.multiplier - multiplier) < Math.abs(SPEED_OPTIONS[best].multiplier - multiplier)
      ? index
      : best, 0)
}

interface SimState {
  jd: number
  /** 显式定位标记：跳回播放起点时，即使 jd 数值未变也要更新运行时时钟。 */
  seekRevision: number
  playing: boolean
  /** 仿真秒 / 现实秒；允许负数倒放。0 仅由速率滑杆的中性位置使用。 */
  playRate: number
  /** 仿真数据的硬边界，不随时间轴缩放改变。 */
  jdMin: number
  jdMax: number
  /** 时间轴刻度跨度（天）。 */
  timelineScaleDays: number
  /** 时间轴刻度中心；拖动游标时保持不变。 */
  timelineCenterJd: number
  /** 光锥内几何样本数量，不是探测/发现结果。 */
  surveyGeometricCount: number

  setJD: (jd: number) => void
  setPlaying: (playing: boolean) => void
  setPlayRate: (rate: number) => void
  jumpToNow: () => void
  /** 切换业务场景时重置仿真数据边界。 */
  setSimulationRange: (min: number, max: number) => void
  setTimelineScaleDays: (days: number) => void
  setTimelineCenterJd: (jd: number) => void
  setSurveyGeometricCount: (n: number) => void
}

const initialJd = nowJD()
const [initJdMin, initJdMax] = defaultSimulationRange()

export const useSimStore = create<SimState>((set) => ({
  jd: initialJd,
  seekRevision: 0,
  playing: true,
  playRate: 60,
  jdMin: initJdMin,
  jdMax: initJdMax,
  timelineScaleDays: 30,
  timelineCenterJd: initialJd,
  surveyGeometricCount: 0,

  setJD: (jd) => set(s => ({ jd, seekRevision: s.seekRevision + 1 })),
  setPlaying: (playing) => set((state) => {
    if (!playing) return { playing: false }
    const playRate = state.playRate === 0 ? 60 : state.playRate
    const atForwardEnd = playRate > 0 && state.jd >= state.jdMax - 1 / 86400000
    const atReverseEnd = playRate < 0 && state.jd <= state.jdMin + 1 / 86400000
    return {
      playing: true,
      playRate,
      jd: atForwardEnd ? state.jdMin : atReverseEnd ? state.jdMax : state.jd,
    }
  }),
  setPlayRate: (playRate) => set({ playRate, playing: playRate !== 0 }),
  jumpToNow: () => set({ jd: nowJD() }),
  setSimulationRange: (jdMin, jdMax) => set({ jdMin, jdMax }),
  setTimelineScaleDays: (timelineScaleDays) => set({ timelineScaleDays }),
  setTimelineCenterJd: (timelineCenterJd) => set({ timelineCenterJd }),
  setSurveyGeometricCount: (surveyGeometricCount) => set({ surveyGeometricCount }),
}))
