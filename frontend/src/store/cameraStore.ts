import { create } from 'zustand'
import { useSelectionStore } from './selectionStore'

/**
 * 相机层状态 (视角三层模型的"我站在哪、看哪里")。
 * 与坐标系层 (frameStore: 世界原点是谁) 和选择层 (selectionStore: 关注谁) 正交:
 * 右键平移/滚轮缩放只改相机, 不影响坐标系按钮的选中态。
 */
interface CameraState {
  /** 跟随请求: 由路由意图/用户按钮写入。实际是否跟随见 isFollowing (还需存在选中目标) */
  followRequest: boolean
  /** 完整复位信号: 注视点归零 + 相机回 FRAME_INFO 标准机位 (SceneManager 逐帧消费) */
  resetTick: number
  /** 视角回中信号: 仅注视点回世界中心, 保持当前距离与方位 */
  recenterTick: number

  setFollowRequest: (v: boolean) => void
  requestReset: () => void
  requestRecenter: () => void
}

export const useCameraStore = create<CameraState>((set) => ({
  followRequest: false,
  resetTick: 0,
  recenterTick: 0,

  setFollowRequest: (followRequest) => set({ followRequest }),
  /* 两个动作都隐含"解除跟随": 否则下一帧注视点又会被跟随逻辑拉回目标 */
  requestReset: () =>
    set((s) => ({ followRequest: false, resetTick: s.resetTick + 1 })),
  requestRecenter: () =>
    set((s) => ({ followRequest: false, recenterTick: s.recenterTick + 1 })),
}))

/**
 * 跟随是否实际生效 = 请求跟随 且 存在可跟随目标。
 * 派生态而非独立字段: "路由意图要求跟随"与"页面写入选中目标"谁先谁后都不影响结果,
 * 也不需要依赖 React effect 的执行顺序。
 */
export function isFollowing(): boolean {
  return (
    useCameraStore.getState().followRequest &&
    useSelectionStore.getState().selected !== null
  )
}

/** isFollowing 的 React 订阅版 */
export function useFollowing(): boolean {
  const req = useCameraStore((s) => s.followRequest)
  const sel = useSelectionStore((s) => s.selected)
  return req && sel !== null
}
