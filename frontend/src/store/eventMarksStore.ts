import { create } from 'zustand'

/** 时间轴刻度类型: 与 TimelineBar 的 Marker 图标一一对应 */
export type MarkKind = 'cad' | 'impact' | 'flyby' | 'replay'

export interface TimelineMark {
  /** 事件路由键 (r-/c-/s- 前缀), 兼作 React key */
  key: string
  /** 遭遇时刻 (儒略日) */
  jd: number
  kind: MarkKind
  /** 悬停 Tooltip 文案 */
  label: string
}

interface EventMarksState {
  /** 事件中心列表「当前页」派生的时间轴刻度; 离开事件中心页时清空 */
  marks: TimelineMark[]
  setMarks: (marks: TimelineMark[]) => void
  clearMarks: () => void
}

/**
 * 时间轴事件刻度桥接 store。
 * 事件列表 (EventListPanel) 分页后把当前页事件写进来, 底部时间轴 (TimelineBar)
 * 只消费这一份数据: 全量 CAD 收录数百条, 直接铺到时间轴上刻度会糊成一片,
 * 与分页后的列表所见保持一致 (只显示本页) 才有对照价值。
 */
export const useEventMarksStore = create<EventMarksState>((set) => ({
  marks: [],
  setMarks: (marks) => set({ marks }),
  clearMarks: () => set({ marks: [] }),
}))
