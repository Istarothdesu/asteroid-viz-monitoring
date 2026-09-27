import {
  SCENE_VISUALS,
  type SceneLayerAvailability,
  type SceneLayerSection,
} from '@/core/sceneLayers'
import type { EventSceneTaskState } from './eventSceneStore'
import type {
  BPlaneScenePayload,
  EncounterDensityScenePayload,
  TrajectoryScenePayload,
  UncertaintyTubeScenePayload,
} from '@/core/sceneProducts/types'

export function eventPreviewSceneLayerSection(referenceOrbit: boolean): SceneLayerSection {
  return {
    id: 'event-preview',
    title: '推演预览',
    defaultOpen: true,
    items: [
      { id: 'event-target', label: '事件目标', visual: SCENE_VISUALS.selected },
      {
        id: 'event-reference',
        label: '根数参考轨道',
        detail: referenceOrbit ? '轨道根数 · 二体' : '等待有效轨道根数',
        visual: SCENE_VISUALS.eventReference,
        visibilityKey: 'showEventReferenceOrbit',
        availability: referenceOrbit ? 'available' : 'unavailable',
      },
    ],
  }
}

interface EventSceneLayerContext {
  referenceOrbit: boolean
  trajectory: TrajectoryScenePayload | null
  bPlane: BPlaneScenePayload | null
  uncertaintyTube: UncertaintyTubeScenePayload | null
  encounterDensity: EncounterDensityScenePayload | null
  propagationState: EventSceneTaskState
  uncertaintyState: EventSceneTaskState
}

function availability(value: unknown, state: EventSceneTaskState): SceneLayerAvailability {
  if (value) return 'available'
  return state === 'loading' ? 'loading' : 'unavailable'
}

export function eventSceneLayerSection(context: EventSceneLayerContext): SceneLayerSection {
  const {
    referenceOrbit,
    trajectory,
    bPlane,
    uncertaintyTube,
    encounterDensity,
    propagationState,
    uncertaintyState,
  } = context
  return {
    id: 'event-analysis',
    title: '事件分析',
    defaultOpen: true,
    items: [
      {
        id: 'event-trajectory',
        label: '名义传播轨道',
        detail: trajectory
          ? `${trajectory.source === 'ephemeris' ? '星历初值' : '轨道解初值'} · N 体`
          : propagationState === 'loading' ? '正在计算' : '暂无传播结果',
        visual: SCENE_VISUALS.eventTrajectory,
        visibilityKey: 'showEventTrajectory',
        availability: availability(trajectory, propagationState),
      },
      {
        id: 'event-reference',
        label: '根数参考轨道',
        detail: referenceOrbit ? '轨道根数 · 二体' : '暂无轨道根数',
        visual: SCENE_VISUALS.eventReference,
        visibilityKey: 'showEventReferenceOrbit',
        availability: referenceOrbit ? 'available' : 'unavailable',
      },
      {
        id: 'uncertainty-tube',
        label: '3σ 不确定性管',
        detail: uncertaintyTube
          ? `${uncertaintyTube.sections.length} 个传播截面`
          : uncertaintyState === 'loading' ? '正在计算' : '暂无协方差结果',
        visual: SCENE_VISUALS.uncertaintyTube,
        visibilityKey: 'showUncertaintyTube',
        availability: availability(uncertaintyTube, uncertaintyState),
      },
      {
        id: 'b-plane',
        label: 'B 平面分析',
        detail: bPlane ? '含 B 向量、ξ/ζ 轴' : uncertaintyState === 'loading' ? '正在计算' : '暂无 B 平面结果',
        visual: SCENE_VISUALS.bPlane,
        visibilityKey: 'showBPlane',
        availability: availability(bPlane, uncertaintyState),
      },
      {
        id: 'encounter-density',
        label: '遭遇概率密度',
        detail: encounterDensity ? '热图与 1σ/3σ 等密度廊道' : '暂无协方差密度',
        visual: SCENE_VISUALS.encounterDensity,
        visibilityKey: 'showEncounterDensity',
        availability: availability(encounterDensity, uncertaintyState),
      },
      {
        id: 'impact-section',
        label: '有效撞击截面',
        detail: bPlane ? `Rₑff ${Math.round(bPlane.effectiveImpactRadiusKm).toLocaleString()} km` : '随 B 平面结果生成',
        visual: SCENE_VISUALS.impactSection,
        followsVisibilityKey: 'showBPlane',
        availability: availability(bPlane, uncertaintyState),
      },
    ],
  }
}
