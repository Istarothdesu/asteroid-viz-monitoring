import { Plus, RefreshCw, Search } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { DateRangePicker } from '@/components/ui/DateRangePicker'
import type { DateRangePreset } from '@/components/ui/dateRangeModel'
import { SEVERITY_META, fmtSpan, type EventSeverity } from '@/services/eventCenter'
import { fmtJDMinute } from '@/utils/orbital/time'
import type { EventCatalogModel, EventTab } from './useEventCatalog'

const TABS: { key: EventTab; label: string }[] = [
  { key: 'all', label: '全部' },
  { key: 'current', label: '未来一年' },
  { key: 'upcoming', label: '远期' },
  { key: 'past', label: '历史' },
  { key: 'sim', label: '推演' },
]

const RANGE_PRESETS: DateRangePreset[] = [
  { key: '30d', label: '30 天内', title: '自分析基准起未来 30 天' },
  { key: '180d', label: '半年内', title: '自分析基准起未来 180 天' },
  { key: '365d', label: '一年内', title: '自分析基准起未来 365 天' },
  { key: 'all', label: '不限', title: '不按发生时刻过滤' },
]

const selectClass = 'min-w-0 flex-1 cursor-pointer rounded-sm border border-sky-400/25 bg-[rgba(8,20,42,0.9)] px-1.5 py-1 text-[11px] text-sky-200 outline-none hover:border-sky-300/60'

function SeverityFilter({ model }: { model: EventCatalogModel }) {
  const values: Array<'all' | EventSeverity> = ['all', 'critical', 'high', 'medium', 'low']
  return (
    <div className="flex items-center gap-1">
      <span className="mr-0.5 shrink-0 text-[10px] text-sky-500/80">关注</span>
      {values.map(value => {
        const meta = value === 'all' ? null : SEVERITY_META[value]
        const active = model.severity === value
        return (
          <button
            key={value}
            type="button"
            onClick={() => model.setSeverity(value)}
            className={`flex min-w-0 flex-1 items-center justify-center gap-1 rounded-sm border px-1 py-0.5 text-[9px] transition-colors ${
              active ? 'border-sky-300/65 bg-sky-400/15 text-sky-50' : 'border-sky-400/20 text-sky-400/75 hover:border-sky-300/50'
            }`}
          >
            {meta && <i className="size-1.5 shrink-0 rounded-full" style={{ background: meta.color, boxShadow: `0 0 5px ${meta.color}` }} />}
            {meta?.label.replace('关注', '') ?? '全部'}
          </button>
        )
      })}
    </div>
  )
}

function TimeBasisControl({ model }: { model: EventCatalogModel }) {
  const drifted = Math.abs(model.simulationDriftDays) >= 1 / 1440
  return (
    <div className="rounded-sm border border-sky-400/15 bg-sky-400/[0.04] px-1.5 py-1">
      <div className="flex items-center gap-1">
        <span className="mr-auto text-[10px] text-sky-500/80">分析基准</span>
        <button
          type="button"
          onClick={model.useSystemTime}
          className={`rounded-sm border px-1.5 py-0.5 text-[9px] ${model.timeBasis === 'system' ? 'border-sky-300/60 bg-sky-400/15 text-sky-100' : 'border-sky-400/20 text-sky-400/75'}`}
        >
          系统当前
        </button>
        <button
          type="button"
          onClick={model.useSimulationTime}
          className={`rounded-sm border px-1.5 py-0.5 text-[9px] ${model.timeBasis === 'simulation' ? 'border-violet-300/60 bg-violet-400/15 text-violet-100' : 'border-sky-400/20 text-sky-400/75'}`}
        >
          取推演时刻
        </button>
      </div>
      <div className="mt-1 flex items-center justify-between gap-2 text-[9px] tabular-nums text-sky-400/70">
        <span>{fmtJDMinute(model.referenceJd)} UTC</span>
        {model.timeBasis === 'simulation' && drifted && (
          <button type="button" onClick={model.syncSimulationTime} className="flex items-center gap-1 text-amber-300 hover:text-amber-200">
            <RefreshCw size={9} /> 推演已变化 {fmtSpan(model.simulationDriftDays)}，同步
          </button>
        )}
      </div>
    </div>
  )
}

export default function EventFilterBar({ model }: { model: EventCatalogModel }) {
  const navigate = useNavigate()
  const counts = model.response?.counts
  return (
    <div className="flex shrink-0 flex-col gap-1.5 px-1 pb-1.5">
      <div className="flex flex-wrap gap-1">
        {TABS.map(tab => (
          <button
            key={tab.key}
            type="button"
            title="数量为全量目录口径；搜索与筛选结果见面板标题和右侧统计"
            onClick={() => model.setTab(tab.key)}
            className={`rounded-sm border px-2 py-0.5 text-[10px] transition-all ${
              model.tab === tab.key
                ? 'border-sky-400/60 bg-sky-400/15 text-sky-100 shadow-[0_0_8px_rgba(125,211,252,0.25)]'
                : 'border-sky-400/20 text-sky-400/80 hover:border-sky-400/45 hover:text-sky-200'
            }`}
          >
            {tab.label} <span className="tabular-nums opacity-75">{counts ? counts[tab.key] : '—'}</span>
          </button>
        ))}
        {model.tab === 'sim' && (
          <Button size="sm" variant="hud" onClick={() => navigate('/events/create-sim')} className="ml-auto h-5 gap-1 px-1.5 text-[9px]">
            <Plus size={10} /> 新增
          </Button>
        )}
      </div>
      <div className="relative">
        <Search size={12} className="absolute left-2 top-1/2 -translate-y-1/2 text-sky-400/60" />
        <input
          value={model.keyword}
          onChange={event => model.setKeyword(event.target.value)}
          placeholder="搜索事件名称 / 风险目标…"
          className="w-full rounded-sm border border-sky-400/25 bg-[rgba(8,20,42,0.9)] py-1 pl-6 pr-2 text-[11px] text-sky-100 outline-none placeholder:text-sky-500/50 hover:border-sky-300/45 focus:border-sky-300/60"
        />
      </div>
      <div className="flex gap-1.5">
        <select value={model.type} onChange={event => model.setType(event.target.value as EventCatalogModel['type'])} className={selectClass}>
          <option value="all">类型：全部</option><option value="impact">撞击</option><option value="flyby">飞掠</option>
        </select>
        <select value={model.source} onChange={event => model.setSource(event.target.value as EventCatalogModel['source'])} className={selectClass}>
          <option value="all">来源：全部</option><option value="builtin">内置经典</option><option value="cad">JPL CAD</option><option value="sim">推演</option>
        </select>
      </div>
      <SeverityFilter model={model} />
      <DateRangePicker value={model.range} onChange={model.setRange} presets={RANGE_PRESETS} anchorJd={model.referenceJd} />
      <TimeBasisControl model={model} />
    </div>
  )
}
