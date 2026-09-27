import { Binoculars, Clapperboard, Crosshair, Earth, MapPinned, MousePointer2 } from 'lucide-react'
import type { ReactNode } from 'react'
import HexActionButton from '@/components/ui/HexActionButton'
import { HudCorners } from '@/components/ui/Panel'
import type { SimulationView } from '@/core/eventSimulation/types'
import { useEventSimulationStore } from '@/store/eventSimulationStore'

const views: { value: SimulationView; label: string; icon: ReactNode }[] = [
  { value: 'auto', label: '全程运镜', icon: <Clapperboard size={16} /> },
  { value: 'space', label: '太空全景', icon: <Earth size={16} /> },
  { value: 'follow', label: '跟随目标', icon: <Crosshair size={16} /> },
  { value: 'ground', label: '地面观测', icon: <Binoculars size={16} /> },
  { value: 'overview', label: '落区总览', icon: <MapPinned size={16} /> },
  { value: 'free', label: '自由观察', icon: <MousePointer2 size={16} /> },
]

/** 与 FrameSwitcher 同构，但只表达过程仿真的观察视角，不混入参考系语义。 */
export default function EventSimulationViewSwitcher() {
  const view = useEventSimulationStore(state => state.view)
  const ready = useEventSimulationStore(state => !!state.session)
  const setView = useEventSimulationStore(state => state.setView)

  return <div className="hud-panel relative flex items-center gap-2 rounded-sm px-4 py-2">
    <HudCorners />
    <span className="mr-1 shrink-0 whitespace-nowrap text-[10px] tracking-[2px] text-sky-500/75">观察视角</span>
    {views.map(item => <HexActionButton
      key={item.value}
      icon={item.icon}
      label={item.label}
      active={view === item.value}
      disabled={!ready}
      title={`过程仿真观察视角：${item.label}`}
      onClick={() => setView(item.value)}
    />)}
  </div>
}
