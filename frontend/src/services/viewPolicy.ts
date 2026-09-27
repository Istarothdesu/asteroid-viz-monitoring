import type { ViewMode } from '@/store/uiStore'
import type { SelectionKind, SelectionTarget } from '@/types/scene'

export type MissionLayerMode = 'l1' | 'ground' | null

const REQUIRED_MODE_BY_SELECTION: Partial<Record<SelectionKind, ViewMode>> = {
  station: 'ground',
}

/** 业务模式决定加载哪套任务图层；观察参考系不参与业务内容选择。 */
export function missionLayerMode(mode: ViewMode): MissionLayerMode {
  if (mode === 'survey') return 'l1'
  if (mode === 'ground') return 'ground'
  return null
}

export function isL1MissionMode(mode: ViewMode): boolean {
  return missionLayerMode(mode) === 'l1'
}

export function isGroundMissionMode(mode: ViewMode): boolean {
  return missionLayerMode(mode) === 'ground'
}

/** 防止监测站等领域对象跨模块残留；未声明的通用天体可跨参考系观察。 */
export function isSelectionCompatible(mode: ViewMode, selected: SelectionTarget | null): boolean {
  if (!selected) return true
  const required = REQUIRED_MODE_BY_SELECTION[selected.kind]
  return required == null || required === mode
}

export function selectedStationIndex(mode: ViewMode, selected: SelectionTarget | null): number | null {
  return isGroundMissionMode(mode) && selected?.kind === 'station' ? selected.idx : null
}
