import { useState, type ReactNode } from 'react'
import { Cpu, Database, Telescope, Workflow } from 'lucide-react'
import { TransitionGroup } from '@/components/common/transition'
import HexActionButton from '@/components/ui/HexActionButton'
import ComputeMetricsSection from './ComputeMetricsSection'
import DataMetricsSection from './DataMetricsSection'
import LogicMetricsSection from './LogicMetricsSection'
import ObservationMetricsSection from './ObservationMetricsSection'

type LayerKey = 'data' | 'compute' | 'logic' | 'observation'

const LAYERS: { key: LayerKey; label: string; icon: ReactNode; blurb: string }[] = [
  { key: 'data', label: '数据层', icon: <Database size={16} />, blurb: '数据从哪来 · 多久同步一次 · 现在有多少' },
  { key: 'compute', label: '计算层', icon: <Cpu size={16} />, blurb: '轨道数据经过哪些加工才画到屏幕上' },
  { key: 'logic', label: '逻辑层', icon: <Workflow size={16} />, blurb: '事件如何整理 · 参数如何计算 · 风险如何分析' },
  { key: 'observation', label: '观测层', icon: <Telescope size={16} />, blurb: '载荷看向哪里 · 何时曝光 · 巡天如何形成覆盖' },
]

const SECTION_COMPONENTS: Record<LayerKey, () => ReactNode> = {
  data: () => <DataMetricsSection />,
  compute: () => <ComputeMetricsSection />,
  logic: () => <LogicMetricsSection />,
  observation: () => <ObservationMetricsSection />,
}

/** 技术指标页面只负责层级切换与版式，具体内容由各层组件维护。 */
export default function MetricsPage() {
  const [layer, setLayer] = useState<LayerKey>('data')
  const active = LAYERS.find((item) => item.key === layer)!
  const Content = SECTION_COMPONENTS[layer]

  return (
    <div className="relative size-full overflow-hidden pointer-events-none">
      <div className="flex min-h-0 size-full justify-center pt-[10px]">
        <div className="w-[860px] max-w-[92vw] shrink overflow-y-auto pb-6 hud-scroll pointer-events-auto">
          <div className="flex flex-col gap-2.5">
            <div className="hud-panel relative flex items-center justify-between gap-4 rounded-sm px-4 py-3">
              <div className="min-w-0">
                <div className="hud-title text-[13px]">系统技术指标</div>
                <div className="mt-1 text-[11px] text-sky-300/60">{active.blurb}</div>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                {LAYERS.map((item) => (
                  <HexActionButton
                    key={item.key}
                    icon={item.icon}
                    label={item.label}
                    active={layer === item.key}
                    title={item.blurb}
                    onClick={() => setLayer(item.key)}
                  />
                ))}
              </div>
            </div>

            <TransitionGroup
              k={layer}
              side="right"
              className="pointer-events-auto flex flex-col gap-2.5"
            >
              <Content />
            </TransitionGroup>
          </div>
        </div>
      </div>
    </div>
  )
}
