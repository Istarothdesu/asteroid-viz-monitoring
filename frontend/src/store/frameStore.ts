import { create } from 'zustand'
import type { FrameType } from '@/types/scene'

export interface FrameInfo {
  label: string
  /** 世界中心天体 (comp 帧为占位, 实际取伴飞目标名, 见 FrameSwitcher) */
  center: string
  /** 该坐标系的标准机位 (相机位置, 世界单位 AU) */
  cam: [number, number, number]
  /** 环绕轴: 全帧统一 Z-up (场景为黄道面=XY、黄道法向=Z) */
  up: [number, number, number]
  minDist: number
  maxDist: number
}

/* 全帧统一 Z-up: 日心系若用 Y-up, OrbitControls 的环绕轴会落在黄道面内,
   拖拽手感与其余坐标系脱节。cam 由原 (0,6,14) 绕 X 轴旋至 Z-up,
   视线方向/距离不变。本表是"默认机位"的唯一权威定义, SceneManager 直接消费 */
export const FRAME_INFO: Record<FrameType, FrameInfo> = {
  helio: { label: '日心黄道参考系',   center: '太阳',       cam: [0, -6, 14],              up: [0, 0, 1], minDist: 5e-5,   maxDist: 1500 },
  geo:   { label: '地心黄道参考系',   center: '地球',       cam: [0.0012, 0.0022, 0.0055], up: [0, 0, 1], minDist: 4.5e-5, maxDist: 5 },
  l1:    { label: 'L1观测中心参考系', center: 'L1仿真卫星', cam: [-0.004, 0.005, 0.014],   up: [0, 0, 1], minDist: 1.2e-4, maxDist: 200 },
  comp:  { label: '目标伴飞参考系',   center: '伴飞目标',   cam: [2.5e-4, 3.5e-4, 9e-4],   up: [0, 0, 1], minDist: 1.2e-4, maxDist: 100 },
}

interface FrameState {
  frame: FrameType
  compIdx: number
  followSpin: boolean

  setFrame: (frame: FrameType) => void
  setCompIdx: (idx: number) => void
  setFollowSpin: (v: boolean) => void
}

export const useFrameStore = create<FrameState>((set) => ({
  frame: 'helio',
  compIdx: 0,
  followSpin: false,

  setFrame: (frame) => set({ frame }),
  setCompIdx: (compIdx) => set({ compIdx }),
  setFollowSpin: (followSpin) => set({ followSpin }),
}))
