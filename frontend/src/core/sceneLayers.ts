import type { LayerBoolKey } from '@/store/layerStore'

export type SceneLayerProfile =
  | 'overview'
  | 'event-center'
  | 'event-detail'
  | 'event-create'
  | 'asteroid-detail'
  | 'l1-survey'
  | 'ground-survey'
  | 'search'

export type SceneLayerAvailability = 'available' | 'loading' | 'unavailable'
export type SceneLayerGlyphKind = 'point' | 'line' | 'area' | 'text'

export interface SceneVisualToken {
  kind: SceneLayerGlyphKind
  color: number
  opacity?: number
  dashed?: boolean
  filled?: boolean
}

export interface SceneLayerItem {
  id: string
  label: string
  detail?: string
  visual: SceneVisualToken
  /** 有 key 才能点击切换；纯语义图例不伪装成控制项。 */
  visibilityKey?: LayerBoolKey
  /** 共享父图层可见性但不可独立切换，例如有效撞击截面。 */
  followsVisibilityKey?: LayerBoolKey
  /** 少数业务图层由领域 store 管理，例如观测计划足迹。 */
  active?: boolean
  onToggle?: () => void
  availability?: SceneLayerAvailability
}

export interface SceneLayerSection {
  id: string
  title: string
  defaultOpen: boolean
  items: SceneLayerItem[]
}

/**
 * 场景视觉语义的唯一来源。DOM 图例与 Three.js 渲染器共同读取这些 token，
 * 避免颜色、线型在两个组件中各写一份后逐渐漂移。
 */
export const SCENE_VISUALS = {
  asteroid: { kind: 'point', color: 0x38bdf8 },
  warning: { kind: 'point', color: 0xf87171 },
  surveySample: { kind: 'point', color: 0xfbbf24 },
  selected: { kind: 'point', color: 0xffb74d },
  riskBoundary: { kind: 'area', color: 0xffa0a0, opacity: 0.45 },
  orbit: { kind: 'line', color: 0x8fc3d4, opacity: 0.45 },
  grid: { kind: 'line', color: 0x3d89bd, opacity: 0.7 },
  axes: { kind: 'line', color: 0x73d8ff, opacity: 0.8 },
  labels: { kind: 'text', color: 0xbfe7ff },
  sky: { kind: 'point', color: 0x9ac7ff },
  eventTrajectory: { kind: 'line', color: 0x36e2c2 },
  eventReference: { kind: 'line', color: 0x8aa3b5, opacity: 0.48, dashed: true },
  uncertaintyTube: { kind: 'area', color: 0xf08cff, opacity: 0.3 },
  bPlane: { kind: 'area', color: 0x56caff, opacity: 0.25 },
  encounterDensity: { kind: 'area', color: 0x62edff, opacity: 0.6, filled: true },
  impactSection: { kind: 'area', color: 0xff9d3b, opacity: 0.5, filled: true },
  plannedFootprint: { kind: 'line', color: 0x74baff },
  exposedFootprint: { kind: 'area', color: 0x66ffcc, opacity: 0.45, filled: true },
  invalidFootprint: { kind: 'line', color: 0xffba55 },
  viewCone: { kind: 'line', color: 0x9dffdd },
  occult: { kind: 'area', color: 0xff5c5c, opacity: 0.35, filled: true },
  avoidance: { kind: 'area', color: 0xee7777, opacity: 0.25 },
  antiSunLimit: { kind: 'area', color: 0xb998f0, opacity: 0.18 },
  earthAvoidance: { kind: 'area', color: 0x33aaff, opacity: 0.22 },
  moonAvoidance: { kind: 'area', color: 0x9999ee, opacity: 0.25 },
  zodiac: { kind: 'area', color: 0xfbbf24, opacity: 0.2 },
} as const satisfies Record<string, SceneVisualToken>

export function sceneColorCss(color: number, opacity = 1): string {
  const hex = color.toString(16).padStart(6, '0')
  if (opacity >= 1) return `#${hex}`
  const alpha = Math.round(Math.max(0, Math.min(1, opacity)) * 255)
    .toString(16)
    .padStart(2, '0')
  return `#${hex}${alpha}`
}

export function commonSceneLayerSection(profile: SceneLayerProfile): SceneLayerSection {
  const includeCloud = profile !== 'ground-survey'
  const hasRiskInPrimary = profile === 'overview'
    || profile === 'event-center'
    || profile === 'asteroid-detail'
    || profile === 'search'
  return {
    id: 'base',
    title: '基础场景',
    defaultOpen: false,
    items: [
      ...(includeCloud ? [{
        id: 'asteroid-cloud',
        label: '小行星云',
        visual: SCENE_VISUALS.asteroid,
        visibilityKey: 'showBelt' as const,
      }] : []),
      {
        id: 'earth-terrain',
        label: '地球影像与地形',
        detail: '接近地球时按视野加载',
        visual: { kind: 'area', color: 0x7dd3fc, filled: true },
        visibilityKey: 'showTerrain',
      },
      {
        id: 'system-orbits',
        label: '天体轨道',
        visual: SCENE_VISUALS.orbit,
        visibilityKey: 'showOrbits',
      },
      {
        id: 'labels',
        label: '文字标签',
        visual: SCENE_VISUALS.labels,
        visibilityKey: 'showLabels',
      },
      {
        id: 'grid',
        label: '参考网格',
        visual: SCENE_VISUALS.grid,
        visibilityKey: 'showGrid',
      },
      {
        id: 'axes',
        label: '局部坐标轴',
        detail: '非日心观察系',
        visual: SCENE_VISUALS.axes,
        visibilityKey: 'showAxes',
      },
      ...(!hasRiskInPrimary ? [{
        id: 'risk-boundary',
        label: '短临预警边界',
        visual: SCENE_VISUALS.riskBoundary,
        visibilityKey: 'showRiskBoundary' as const,
      }] : []),
      {
        id: 'sky',
        label: '星空背景',
        visual: SCENE_VISUALS.sky,
        visibilityKey: 'showSky',
      },
    ],
  }
}

export function overviewSceneLayerSection(): SceneLayerSection {
  return {
    id: 'overview',
    title: '态势目标',
    defaultOpen: true,
    items: [
      { id: 'asteroid', label: '一般小行星', visual: SCENE_VISUALS.asteroid, followsVisibilityKey: 'showBelt' },
      { id: 'warning', label: '重点关注 / 预警', visual: SCENE_VISUALS.warning, followsVisibilityKey: 'showBelt' },
      { id: 'selected', label: '选中目标', visual: SCENE_VISUALS.selected },
      {
        id: 'risk-boundary',
        label: '短临预警边界',
        visual: SCENE_VISUALS.riskBoundary,
        visibilityKey: 'showRiskBoundary',
      },
    ],
  }
}
