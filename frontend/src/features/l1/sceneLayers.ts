import { SCENE_VISUALS, type SceneLayerSection } from '@/core/sceneLayers'
import type { MissionProfile } from './types'

interface L1LayerControls {
  plannedVisible: boolean
  exposedVisible: boolean
  togglePlanned: () => void
  toggleExposed: () => void
}

export function l1SceneLayerSections(
  sampleCount: number,
  instrument: MissionProfile['instrument'] | null,
  controls: L1LayerControls,
): SceneLayerSection[] {
  return [
    {
      id: 'l1-survey',
      title: 'L1 巡天',
      defaultOpen: true,
      items: [
      { id: 'l1-sphere', label: '天球网格', detail: 'J2000 赤道坐标', visual: SCENE_VISUALS.grid, visibilityKey: 'showL1Sphere' },
      { id: 'l1-labels', label: '天球坐标文字', detail: '赤经 h / 赤纬 °', visual: SCENE_VISUALS.labels, visibilityKey: 'showL1GratLabels' },
      {
        id: 'planned-footprint', label: '计划曝光足迹', detail: '含未来计划', visual: SCENE_VISUALS.plannedFootprint,
        active: controls.plannedVisible, onToggle: controls.togglePlanned,
      },
      {
        id: 'exposed-footprint', label: '仿真已曝光足迹', detail: '几何通过', visual: SCENE_VISUALS.exposedFootprint,
        active: controls.exposedVisible, onToggle: controls.toggleExposed,
      },
      { id: 'invalid-footprint', label: '几何未通过足迹', visual: SCENE_VISUALS.invalidFootprint, active: controls.plannedVisible },
      { id: 'view-cone', label: '当前视场 / 扫描光锥', visual: SCENE_VISUALS.viewCone },
      {
        id: 'survey-sample',
        label: '视场样本',
        detail: `${sampleCount} 颗 · 仅几何判定`,
        visual: SCENE_VISUALS.surveySample,
        followsVisibilityKey: 'showBelt',
      },
      ],
    },
    {
      id: 'l1-constraints',
      title: '观测约束',
      defaultOpen: false,
      items: [
        { id: 'sun-occult', label: '日地盘面遮挡', detail: '随视距离变化', visual: SCENE_VISUALS.occult, visibilityKey: 'showOccult' },
        { id: 'sun-avoid', label: '太阳规避区', detail: instrument ? `${instrument.sunAvoidanceDeg}° · 太阳侧` : undefined, visual: SCENE_VISUALS.avoidance, visibilityKey: 'showSunAvoid' },
        { id: 'anti-sun-limit', label: '太阳伸长角上限', detail: instrument ? `>${instrument.maxSunElongationDeg}° · NEO Surveyor 参考` : undefined, visual: SCENE_VISUALS.antiSunLimit, visibilityKey: 'showAntiSunLimit' },
        { id: 'earth-avoid', label: '地球规避区', detail: instrument ? `视半径＋${instrument.earthAvoidanceMarginDeg}° · 仿真` : undefined, visual: SCENE_VISUALS.earthAvoidance, visibilityKey: 'showEarthAvoid' },
      ],
    },
  ]
}
