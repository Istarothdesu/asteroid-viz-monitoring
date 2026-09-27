import { useRef, useState } from 'react'
import Panel from '@/components/ui/Panel'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useSimStore } from '@/store/simStore'
import { useUIStore } from '@/store/uiStore'
import { useObservationPlanStore } from '@/features/l1/planRuntime'
import { getL1MissionProvider } from '@/features/l1/missionProvider'
import { useObservationPlayback } from '@/features/l1/useObservationPlayback'
import { formatL1Time } from '@/features/l1/store'
import { summarizePlanCoverage, type ObservationPlan } from '@/features/l1/observationPlan'

export default function ObservationPlanPanel({ jd }: { jd: number }) {
  const playback = useObservationPlayback(jd), p = playback?.prepared.plan
  const scenario = useObservationPlanStore(s => s.scenario)
  const external = useObservationPlanStore(s => s.externalPlan)
  const setScenario = useObservationPlanStore(s => s.setScenario)
  const importPlan = useObservationPlanStore(s => s.importPlan)
  const input = useRef<HTMLInputElement>(null)
  const [error, setError] = useState('')
  const coverage = playback ? summarizePlanCoverage(playback.prepared, jd) : null
  const jump = () => {
    const first = playback?.prepared.exposures.find(e => e.check.valid)
    if (!first) return
    useSimStore.getState().setPlaying(false)
    useSimStore.getState().setJD(first.activity.start)
    useUIStore.getState().setMode('survey')
  }
  return <Panel className="shrink-0" title="观测计划输入" extra={<Badge variant="outline">{external ? '外部计划' : '模拟计划'}</Badge>}>
    <div className="flex flex-col gap-2 px-3 py-2">
      <Select value={external ? 'external' : scenario} onValueChange={value => {
        if (value !== 'external') { setScenario(value as 'survey' | 'tracking'); setError('') }
      }}>
        <SelectTrigger size="sm" aria-label="选择观测计划来源"><SelectValue /></SelectTrigger>
        <SelectContent><SelectGroup>
          <SelectItem value="survey">模拟 · 分区巡天与复访</SelectItem>
          <SelectItem value="tracking">模拟 · 已知目标跟踪</SelectItem>
          {external && <SelectItem value="external">外部 · {external.name}</SelectItem>}
        </SelectGroup></SelectContent>
      </Select>
      <div className="flex gap-2">
        <Button variant="outline" size="sm" onClick={() => input.current?.click()}>导入计划 JSON</Button>
        <Button variant="outline" size="sm" disabled={!playback?.validExposures} onClick={jump}>定位首个曝光</Button>
      </div>
      <input ref={input} type="file" accept=".json,application/json" className="hidden" aria-label="导入观测计划文件"
        onChange={async event => {
          const file = event.target.files?.[0]
          event.target.value = ''
          if (!file) return
          try { importPlan(JSON.parse(await file.text()) as ObservationPlan); setError('') }
          catch (e) { setError(e instanceof Error ? e.message : '计划导入失败') }
        }} />
      <p className="text-xs text-muted-foreground">展示系统只消费计划。回放及仿真曝光不是卫星真实执行反馈。</p>
      {(error || !p) && <p role="status" className="text-xs text-destructive">{error || getL1MissionProvider().getPlanError()}</p>}
      {p && <>
        <div className="text-xs text-muted-foreground">{p.name} · v{p.version}<br />{formatL1Time(p.start)} → {formatL1Time(p.end)}</div>
        <div className="text-xs tabular-nums">仿真已曝光 {playback.completedExposures} / 几何通过 {playback.validExposures} / 计划曝光 {playback.prepared.exposures.length}</div>
        {coverage && coverage.plannedFields > 0 ? (
          <div className="rounded-sm border border-sky-400/20 bg-sky-400/5 px-2 py-1.5 text-xs">
            <div className="flex items-center justify-between">
              <span className="text-sky-400/70">计划天区完成度</span>
              <span className="text-sky-100 tabular-nums">{coverage.fieldCompletionPercent.toFixed(1)}%</span>
            </div>
            <div className="mt-1 flex items-center justify-between text-[10px] text-muted-foreground tabular-nums">
              <span>已触达 {coverage.coveredFields} / {coverage.plannedFields} 天区</span>
              <span>复访完成 {coverage.completedVisits} / {coverage.plannedVisits}</span>
            </div>
          </div>
        ) : (
          <div className="text-xs text-muted-foreground">计划未提供 fieldId，无法统计计划天区完成度。</div>
        )}
        <div className="text-xs text-muted-foreground">按有效曝光的 fieldId 计数；不等同于球面面积覆盖率、探测率或巡天完备度。</div>
        <a className="text-xs underline" href={p.provenance.startsWith('https://') ? p.provenance : undefined} target="_blank" rel="noreferrer">
          策略参考 / 来源：{p.source === 'external-plan' ? p.provenance
            : scenario === 'survey' ? 'NEO Surveyor 公开工作方式' : '缓存星历目标跟踪模拟器'}
        </a>
      </>}
    </div>
  </Panel>
}
