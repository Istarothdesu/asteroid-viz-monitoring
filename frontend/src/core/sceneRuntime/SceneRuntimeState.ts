import { getL1MissionSnapshot } from '@/features/l1/missionProvider'
import { useObservationPlanStore } from '@/features/l1/planRuntime'
import { isGroundMissionMode, isL1MissionMode, selectedStationIndex } from '@/services/viewPolicy'
import { useCameraStore } from '@/store/cameraStore'
import { useDataStore } from '@/store/dataStore'
import { useFrameStore, FRAME_INFO } from '@/store/frameStore'
import { useLayerStore } from '@/store/layerStore'
import { useEventSimulationStore } from '@/store/eventSimulationStore'
import { useSelectionStore } from '@/store/selectionStore'
import { useSimStore } from '@/store/simStore'
import { useUIStore } from '@/store/uiStore'
import { useSceneProductStore } from '../sceneProducts/store'
import type { CloudSeed } from '@/types/asteroid'
import type { FrameType, SelectionTarget } from '@/types/scene'

/**
 * 渲染运行时的数据入口。
 *
 * 当前实现从 Zustand 读取；未来接入外部星历、事件或任务分系统时，只需在这一层
 * 组装同样的帧快照，场景子系统不需要感知数据来自接口、缓存还是模拟器。
 */
export class SceneRuntimeState {
  get initialAsteroids() {
    return useDataStore.getState().asteroids
  }

  simulation() {
    return useSimStore.getState()
  }

  readFrame(jd: number) {
    const sim = useSimStore.getState()
    const layers = useLayerStore.getState()
    const frameState = useFrameStore.getState()
    const selection = useSelectionStore.getState()
    const ui = useUIStore.getState()
    const replay = useEventSimulationStore.getState()
    const camera = useCameraStore.getState()
    const l1Mission = getL1MissionSnapshot(jd, isL1MissionMode(ui.mode))

    return {
      sim,
      layers: replay.activeEvent ? { ...layers, sizeScale: 1, showEventReferenceOrbit: false,
        showEventTrajectory: false, showBPlane: false, showEncounterDensity: false,
        showUncertaintyTube: false, showRiskBoundary: false, showAllCones: false,
        showGrid: false, showAxes: false, showLabels: false, showTerrain: true } : layers,
      frameState,
      selection,
      ui,
      replay,
      camera,
      asteroids: useDataStore.getState().asteroids,
      eventScene: useSceneProductStore.getState(),
      planLayers: useObservationPlanStore.getState(),
      l1Mission,
      stationIndex: selectedStationIndex(ui.mode, selection.selected),
      following: camera.followRequest && selection.selected !== null,
      l1Mode: isL1MissionMode(ui.mode),
      groundMode: isGroundMissionMode(ui.mode),
    }
  }

  frameInfo(frame: FrameType) {
    return FRAME_INFO[frame]
  }

  frameLayerVisibility() {
    const layers = useLayerStore.getState()
    return { showGrid: layers.showGrid, showAxes: layers.showAxes }
  }

  companionDisplay() {
    const replay = useEventSimulationStore.getState()
    const frame = useFrameStore.getState()
    const asteroids = useDataStore.getState().asteroids
    return {
      diameterKm: replay.activeEvent?.diam ?? asteroids[frame.compIdx].diam,
      sizeScale: useLayerStore.getState().sizeScale,
    }
  }

  previewCamera() {
    const replay = useEventSimulationStore.getState()
    return {
      record: replay.previewRec,
      orbit: replay.previewEl,
      sizeScale: useLayerStore.getState().sizeScale,
    }
  }

  zoomContext() {
    const replay = useEventSimulationStore.getState()
    return {
      selected: useSelectionStore.getState().selected,
      asteroids: useDataStore.getState().asteroids,
      sizeScale: useLayerStore.getState().sizeScale,
      eventDiameterKm: replay.activeEvent?.diam ?? replay.previewRec?.diam ?? 0.05,
    }
  }

  subscribeCloudSeeds(onChange: (seeds: CloudSeed[]) => void): () => void {
    return useDataStore.subscribe((state, previous) => {
      if (state.cloudSeeds && state.cloudSeeds !== previous.cloudSeeds) {
        onChange(state.cloudSeeds)
      }
    })
  }

  applyPickedTarget(target: SelectionTarget | null): void {
    const selection = useSelectionStore.getState()
    if (selection.locked) return
    selection.setSelected(target)
    if (!target) this.setFollowRequested(false)
    else if (target.kind === 'ast') useFrameStore.getState().setCompIdx(target.idx)
  }

  setSurveyGeometricCount(count: number): void {
    useSimStore.getState().setSurveyGeometricCount(count)
  }

  setFollowRequested(requested: boolean): void {
    useCameraStore.getState().setFollowRequest(requested)
  }

  pause(): void {
    useSimStore.getState().setPlaying(false)
  }

  commitJd(jd: number): void {
    useSimStore.setState({ jd })
  }

  markReplayAftermath(): void {
    useEventSimulationStore.getState().setPhase('aftermath')
  }

  markReplayImpact(): void {
    useEventSimulationStore.getState().setPhase('impact')
  }
}

export type SceneRuntimeFrame = ReturnType<SceneRuntimeState['readFrame']>
