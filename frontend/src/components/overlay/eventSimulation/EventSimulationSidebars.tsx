import { KV, DetailPageHeader } from '@/components/common/atoms'
import { Button } from '@/components/ui/button'
import Panel from '@/components/ui/Panel'
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { sampleEvent } from '@/core/eventSimulation/event.js'
import { VALIDATION_SCENARIOS } from '@/core/eventSimulation/scenarios'
import { dateToJD, fmtJD } from '@/utils/orbital/time'
import EarthSurfaceStatus from '../EarthSurfaceStatus'
import type { useEventSimulationTimeline } from './useEventSimulationTimeline'

type Timeline = ReturnType<typeof useEventSimulationTimeline>

function selectedScenarioOf(timeline: Timeline) {
  const configId = timeline.state.config?.id
  return VALIDATION_SCENARIOS.some(scenario => scenario.id === configId) ? configId! : 'event'
}

export function EventSimulationLeftColumn({ timeline }: { timeline: Timeline }) {
  const { state, event, phase } = timeline
  const scenario = selectedScenarioOf(timeline)
  const validation = scenario !== 'event'
  const config = state.config
  const eventJd = state.activeEvent ? dateToJD(new Date(state.activeEvent.dateUTC)) : state.jdEnc

  return <>
    <DetailPageHeader
      backLabel="退出仿真"
      onBack={() => state.stopSimulation()}
      title="事件仿真"
      accentColor="#38bdf8"
    />
    <Panel title="事件信息">
      <KV k="事件名称" v={state.activeEvent?.name} hl />
      <KV k="过程类型" v={state.activeEvent?.type === 'impact' ? '撞击过程' : '近距飞掠'} />
      <KV k="事件时刻" v={fmtJD(eventJd)} />
      <KV k="当前阶段" v={phase} hl />
    </Panel>
    <Panel title="演示参数">
      <label htmlFor="simulation-scenario" className="mb-1 text-[10px] text-sky-400/70">仿真场景</label>
      <Select value={scenario} onValueChange={state.selectScenario}>
        <SelectTrigger id="simulation-scenario" size="sm" className="w-full"><SelectValue /></SelectTrigger>
        <SelectContent><SelectGroup>
          <SelectItem value="event">当前事件参数</SelectItem>
          {VALIDATION_SCENARIOS.map(item => <SelectItem key={item.id} value={item.id}>{item.name}</SelectItem>)}
        </SelectGroup></SelectContent>
      </Select>
      <div className="mt-2">
        <KV k="数据口径" v={validation ? '验证场景 · 非历史记录' : '当前事件记录'} />
        {validation && <KV k="场景基准时刻" v={fmtJD(state.jdEnc)} />}
        {config && <>
          <KV k="落点" v={`${config.lon.toFixed(3)}° / ${config.lat.toFixed(3)}°`} />
          <KV k="直径" v={`${config.diameter.toFixed(0)} m`} />
          <KV k="进入速度" v={`${config.speed.toFixed(2)} km/s`} />
          <KV k="入射角 / 方位角" v={`${config.angle}° / ${config.bearing}°`} />
        </>}
        {!config && event == null && <p className="mt-2 text-[10px] leading-relaxed text-sky-300/65">当前事件没有可用的地表终态模型，可切换验证场景查看完整演示流程。</p>}
      </div>
    </Panel>
    <Panel title="模型说明">
      <p role="status" className="text-[10px] leading-relaxed text-sky-200/75">{state.message}</p>
      {state.preparation === 'error' && <Button variant="hud" size="sm" className="mt-2" onClick={() => state.selectScenario(scenario)}>重试地形加载</Button>}
      <p className="mt-2 text-[10px] leading-relaxed text-amber-200/70">进入段缺失值采用明确的演示假设；坑径、烟尘、冲击波仅作视觉示意，不代表灾害预测结果。</p>
    </Panel>
  </>
}

export function EventSimulationRightColumn({ timeline }: { timeline: Timeline }) {
  const { state, event, elapsed, duration, rate, playing, phase } = timeline
  const sample = event ? sampleEvent(event, elapsed) : null

  return <>
    <Panel title="仿真实时状态" extra={<span className="text-[10px] text-amber-200/80">{phase}</span>}>
      <KV k="运行状态" v={state.preparation === 'ready' ? playing ? '播放中' : '已暂停' : '等待模型'} hl />
      <KV k="过程进度" v={`${elapsed.toFixed(1)} / ${duration.toFixed(1)} s`} />
      <KV k="当前倍率" v={playing ? `${rate}×` : '0×'} />
      {sample && event && <>
        <KV k="经纬度" v={`${sample.lon.toFixed(3)}° / ${sample.lat.toFixed(3)}°`} />
        <KV k="离地高度" v={`${(Math.max(0, sample.height - event.groundHeight) / 1000).toFixed(2)} km`} hl />
        <KV k="目标速度" v={`${elapsed < event.impactTime ? (sample.speed / 1000).toFixed(2) : '0.00'} km/s`} />
      </>}
    </Panel>
    {event && <Panel title="地表浏览状态"><EarthSurfaceStatus /></Panel>}
    <Panel title="操作提示">
      <p className="text-[10px] leading-relaxed text-sky-300/65">拖动场景进入自由观察 · 滚轮缩放 · 空格播放/暂停 · 时间轴按秒定位过程阶段。</p>
    </Panel>
  </>
}
