import { PLANETS, MOON } from '@/data/planets'
import { getGroundStationProvider } from '@/features/ground/stationProvider'
import { useDataStore } from '@/store/dataStore'
import { useEventSimulationStore } from '@/store/eventSimulationStore'
import type { SelectionTarget } from '@/types/scene'

/**
 * 选中目标的短名 —— 全系统单一取名口径。
 * 相机状态签 (FrameSwitcher) 与自然天体信息卡标题共用, 避免各处硬编码漂移。
 * 命令式读取 store: 调用方需自行订阅相关 store 以驱动重渲染。
 */
export function selectionName(sel: SelectionTarget): string {
  switch (sel.kind) {
    case 'sun':
      return '太阳'
    case 'planet':
      return PLANETS[sel.idx]?.name ?? '行星'
    case 'moon':
      return MOON.name
    case 'sat':
      return 'L1 仿真巡天卫星'
    case 'ast':
      return useDataStore.getState().asteroids[sel.idx]?.name ?? `小行星 #${sel.idx + 1}`
    case 'cloud': {
      const seed = useDataStore.getState().cloudSeeds?.[sel.idx]
      return seed?.des ?? `云粒子 #${sel.idx + 1}`
    }
    case 'station':
      return getGroundStationProvider().getStations()[sel.idx]?.name ?? `监测站 #${sel.idx + 1}`
    case 'event': {
      const r = useEventSimulationStore.getState()
      return (r.activeEvent ?? r.previewRec)?.name ?? '事件目标'
    }
  }
}
