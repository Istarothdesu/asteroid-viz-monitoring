import { useMemo } from 'react'
import {
  commonSceneLayerSection,
  overviewSceneLayerSection,
  type SceneLayerProfile,
  type SceneLayerSection,
} from '@/core/sceneLayers'
import { useSceneProductStore } from '@/core/sceneProducts/store'
import { eventPreviewSceneLayerSection, eventSceneLayerSection } from '@/features/event-analysis/sceneLayers'
import { useEventSceneStore } from '@/features/event-analysis/eventSceneStore'
import { groundSceneLayerSections } from '@/features/ground/sceneLayers'
import { l1SceneLayerSections } from '@/features/l1/sceneLayers'
import { useL1Store } from '@/features/l1/store'
import { useObservationPlanStore } from '@/features/l1/planRuntime'
import { useEventSimulationStore } from '@/store/eventSimulationStore'
import { useSimStore } from '@/store/simStore'

/**
 * 页面只声明 profile；各领域模块提供自己的图层清单，本 hook 负责把它们与
 * 当前数据产品、任务状态和用户显示偏好组合，UI 不再编写业务分支。
 */
export function useSceneLayerSections(profile: SceneLayerProfile): SceneLayerSection[] {
  const referenceOrbit = useEventSimulationStore(state => !!state.previewEl)
  const products = useSceneProductStore(state => state.products)
  const tasks = useEventSceneStore(state => state.tasks)
  const surveySampleCount = useSimStore(state => state.surveyGeometricCount)
  const referenceInstrument = useL1Store(state => state.reference?.profile.instrument ?? null)
  const externalInstrument = useObservationPlanStore(state => state.externalPlan?.instrument ?? null)
  const plannedVisible = useObservationPlanStore(state => state.showPlanned)
  const exposedVisible = useObservationPlanStore(state => state.showExposed)

  return useMemo(() => {
    const sections: SceneLayerSection[] = []
    if (profile === 'event-detail') {
      sections.push(eventSceneLayerSection({
        referenceOrbit,
        trajectory: products.trajectory?.payload ?? null,
        bPlane: products.bPlane?.payload ?? null,
        uncertaintyTube: products.uncertaintyTube?.payload ?? null,
        encounterDensity: products.encounterDensity?.payload ?? null,
        propagationState: tasks.propagation.state,
        uncertaintyState: tasks.uncertainty.state,
      }))
    } else if (profile === 'event-create') {
      sections.push(eventPreviewSceneLayerSection(referenceOrbit))
    } else if (profile === 'l1-survey') {
      sections.push(...l1SceneLayerSections(
        surveySampleCount,
        externalInstrument ?? referenceInstrument,
        {
          plannedVisible,
          exposedVisible,
          togglePlanned: useObservationPlanStore.getState().togglePlanned,
          toggleExposed: useObservationPlanStore.getState().toggleExposed,
        },
      ))
    } else if (profile === 'ground-survey') {
      sections.push(...groundSceneLayerSections())
    } else {
      sections.push(overviewSceneLayerSection())
    }
    sections.push(commonSceneLayerSection(profile))
    return sections
  }, [profile, referenceOrbit, products, tasks.propagation.state, tasks.uncertainty.state,
    surveySampleCount, referenceInstrument, externalInstrument, plannedVisible, exposedVisible])
}
