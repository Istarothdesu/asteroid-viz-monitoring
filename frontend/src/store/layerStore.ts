import { create } from 'zustand'

export type LayerBoolKey =
  | 'showOrbits' | 'showLabels' | 'showBelt' | 'showGrid'
  | 'showRiskBoundary' | 'showAllCones' | 'showAxes'
  | 'showEventReferenceOrbit'
  | 'showEventTrajectory'
  | 'showBPlane'
  | 'showEncounterDensity'
  | 'showUncertaintyTube'
  | 'showSky'
  | 'showTerrain'
  | 'showL1Sphere' | 'showL1GratLabels'
  | 'showOccult' | 'showSunAvoid' | 'showAntiSunLimit' | 'showEarthAvoid'
  | 'showGroundOccult' | 'showGSunAvoid' | 'showMoonAvoid' | 'showZodiacBand'
  | 'showGratLabels'

interface LayerState {
  // System layers (all frames)
  showOrbits: boolean
  showLabels: boolean
  showBelt: boolean
  showGrid: boolean
  showRiskBoundary: boolean
  showEventReferenceOrbit: boolean // 事件轨道根数生成的二体参考轨道
  showEventTrajectory: boolean     // 星历/轨道解初值的 N 体名义传播轨道
  showBPlane: boolean         // 名义地球遭遇 B 平面（有按需计算结果时才出现）
  showEncounterDensity: boolean // B 平面协方差遭遇密度热图与等密度廊道
  showUncertaintyTube: boolean // 局部 sigma 传播得到的 3σ 不确定性管
  showAllCones: boolean
  showAxes: boolean           // 非日心坐标系下目标天体中心的坐标轴
  showSky: boolean            // 星空背景 (星云天球 + 点状星光)
  showTerrain: boolean        // 按视野加载地球影像与曲面地形
  sizeScale: number           // 天体尺寸倍数: 等比作用于所有天体几何与特效锚点

  // L1 frame survey layers
  showL1Sphere: boolean     // 天球赤道网格与黄道大圆
  showL1GratLabels: boolean // J2000 赤经/赤纬刻度文字
  showOccult: boolean       // sun + earth occlusion caps
  showSunAvoid: boolean     // 45° sun avoidance zone
  showAntiSunLimit: boolean // 反太阳方向的最大伸长角边界
  showEarthAvoid: boolean   // 地球视半径＋仿真规避余量
  sphereR: number           // celestial sphere radius (AU)

  // Ground frame survey layers
  showGroundOccult: boolean // sun + moon occlusion caps
  showGSunAvoid: boolean    // 45° ground sun avoidance zone
  showMoonAvoid: boolean    // 45° ground moon avoidance zone
  showZodiacBand: boolean   // 黄道带 ±15° (小行星密集区)
  showGratLabels: boolean   // 天球赤道网格坐标标注 (赤经/赤纬刻度)
  gSphereR: number          // ground celestial sphere radius (AU)

  toggle: (key: LayerBoolKey) => void
  set: (key: LayerBoolKey, value: boolean) => void
  setSphereR: (r: number) => void
  setGSphereR: (r: number) => void
  setSizeScale: (v: number) => void
}

export const useLayerStore = create<LayerState>((set, get) => ({
  showOrbits: true,
  showLabels: true,
  showBelt: true,
  showGrid: false,
  showRiskBoundary: true,
  showEventReferenceOrbit: true,
  showEventTrajectory: true,
  showBPlane: true,
  showEncounterDensity: true,
  showUncertaintyTube: true,
  showAllCones: true,
  showAxes: false,
  showSky: true,
  showTerrain: true,
  sizeScale: 1,

  showL1Sphere: true,
  showL1GratLabels: true,
  showOccult: true,
  showSunAvoid: false,
  showAntiSunLimit: false,
  showEarthAvoid: false,
  sphereR: 0.1,

  showGroundOccult: true,
  showGSunAvoid: false,
  showMoonAvoid: false,
  showZodiacBand: false,
  showGratLabels: true,
  gSphereR: 0.1,

  toggle: (key) => set({ [key]: !get()[key] }),
  set: (key, value) => set({ [key]: value }),
  setSphereR: (r) => set({ sphereR: r }),
  setGSphereR: (r) => set({ gSphereR: r }),
  setSizeScale: (v) => set({ sizeScale: v }),
}))
