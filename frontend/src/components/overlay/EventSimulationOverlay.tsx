import BottomControlDock from '@/components/layout/BottomControlDock'
import { TransitionGroup } from '@/components/common/transition'
import { VALIDATION_SCENARIOS } from '@/core/eventSimulation/scenarios'
import DigitalTimeDisplay from './DigitalTimeDisplay'
import { EventSimulationLeftColumn, EventSimulationRightColumn } from './eventSimulation/EventSimulationSidebars'
import EventSimulationTimelineBar from './eventSimulation/EventSimulationTimelineBar'
import EventSimulationViewSwitcher from './eventSimulation/EventSimulationViewSwitcher'
import { useEventSimulationTimeline } from './eventSimulation/useEventSimulationTimeline'

/**
 * 独立的事件过程仿真布局。
 * 结构与事件专题保持一致（左右信息列 + 中央场景 + 底部控制坞），
 * 但不复用 EventDetailLayout 的业务数据组件，避免两个模块相互耦合。
 */
export default function EventSimulationOverlay() {
  const timeline = useEventSimulationTimeline()
  const { state, jd, phase } = timeline
  if (!state.activeEvent) return null

  const validation = VALIDATION_SCENARIOS.some(scenario => scenario.id === state.config?.id)
  const clockLabel = validation ? '验证场景时间' : '事件仿真时刻'

  return <>
    <div className="pointer-events-none absolute inset-0 z-20 flex min-h-0 pt-[10px]">
      <aside className="w-[var(--left-col-w)] shrink-0 overflow-y-auto pb-[var(--control-dock-h,240px)] pl-2.5 hud-scroll pointer-events-auto">
        <TransitionGroup k="event-simulation-left" side="left" className="flex min-h-full flex-col gap-2.5">
          <EventSimulationLeftColumn timeline={timeline} />
        </TransitionGroup>
      </aside>

      <main className="relative min-w-0 flex-1">
        <div className="absolute left-1/2 top-4 z-10 flex -translate-x-1/2 flex-col items-center gap-1.5 text-center">
          <span className="text-[10px] tracking-[2px] text-sky-400/80">
            {validation ? '验证场景 · 非历史事件时刻' : state.activeEvent.name}
          </span>
          <DigitalTimeDisplay jd={jd} label={clockLabel} />
          <span className="text-[11px] tracking-[2px] text-sky-300/90 glow-text">{phase} · 事件过程仿真</span>
        </div>
      </main>

      <aside className="w-[var(--right-col-w)] shrink-0 overflow-y-auto pb-[var(--control-dock-h,240px)] pr-2.5 hud-scroll pointer-events-auto">
        <TransitionGroup k="event-simulation-right" side="right" className="flex min-h-full flex-col gap-2.5">
          <EventSimulationRightColumn timeline={timeline} />
        </TransitionGroup>
      </aside>
    </div>

    <BottomControlDock
      compact
      upper={<EventSimulationViewSwitcher />}
      lower={<EventSimulationTimelineBar timeline={timeline} />}
    />
  </>
}
