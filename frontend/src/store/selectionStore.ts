import { create } from 'zustand'
import type { SelectionTarget } from '@/types/scene'

/**
 * 选择层 (视角三层模型的"关注谁"): 纯查询态, 只驱动高亮/光圈/信息卡, 不驱动相机。
 * 跟随属相机层, 见 cameraStore.followRequest 与 isFollowing()。
 */
interface SelectionState {
  selected: SelectionTarget | null
  /** 选中锁: 为 true 时场景拾取不得变更/清除选中 (观测任务详情页单站聚焦) */
  locked: boolean

  setSelected: (target: SelectionTarget | null) => void
  setLocked: (v: boolean) => void
  clearSelection: () => void
}

export const useSelectionStore = create<SelectionState>((set) => ({
  selected: null,
  locked: false,

  setSelected: (selected) => set({ selected }),
  setLocked: (locked) => set({ locked }),
  clearSelection: () => set({ selected: null }),
}))
