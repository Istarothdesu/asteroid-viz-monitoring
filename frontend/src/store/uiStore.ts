import { create } from 'zustand'

export type ViewMode = 'overview' | 'survey' | 'ground'

export interface LoadingState {
  visible: boolean
  text: string
  subText?: string
  /** 不透明深底: 场景尚未就绪的阻塞操作 (如首屏数据同步) 需完全遮住底下画面, 避免透出白屏 */
  opaque?: boolean
}

interface UIState {
  mode: ViewMode
  /** 顶栏全局搜索词 (联动右侧目标列表筛选) */
  searchQuery: string
  /** 全局加载遮罩状态 (耗时操作防假死反馈) */
  loading: LoadingState
  /** 光锥扫掠痕迹: 单站聚焦播放时在天球累积光锥扫过区域 (观测任务专题) */
  coneSweep: boolean
  setMode: (mode: ViewMode) => void
  setSearchQuery: (q: string) => void
  setConeSweep: (v: boolean) => void
  showLoading: (text: string, subText?: string, opaque?: boolean) => void
  hideLoading: () => void
}

export const useUIStore = create<UIState>((set) => ({
  mode: 'overview',
  searchQuery: '',
  loading: { visible: false, text: '' },
  coneSweep: false,
  setMode: (mode) => set({ mode }),
  setSearchQuery: (searchQuery) => set({ searchQuery }),
  setConeSweep: (coneSweep) => set({ coneSweep }),
  showLoading: (text, subText, opaque) =>
    set({ loading: { visible: true, text, subText, opaque: !!opaque } }),
  hideLoading: () =>
    set((s) => ({ loading: { ...s.loading, visible: false } })),
}))
