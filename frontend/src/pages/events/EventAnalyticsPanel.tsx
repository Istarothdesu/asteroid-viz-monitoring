import { CalendarClock, Database, FlaskConical, ShieldAlert } from 'lucide-react'
import Panel from '@/components/ui/Panel'
import BarChart from '@/components/charts/BarChart'
import ProportionBarChart from '@/components/charts/ProportionBarChart'
import MetricCard from '@/components/hud/MetricCard'
import {
  LD_KM,
  SEVERITY_META,
  SOURCE_META,
  type EventItem,
  type EventSeverity,
} from '@/services/eventCenter'
import { fmtJDMinute } from '@/utils/orbital/time'
import type { EventCatalogModel } from './useEventCatalog'

const SEVERITY_KEYS = Object.keys(SEVERITY_META) as EventSeverity[]

function SeverityDistribution({ model }: { model: EventCatalogModel }) {
  const stats = model.response?.stats
  if (!stats) return null
  const data = SEVERITY_KEYS.map((key) => ({
    id: key,
    name: SEVERITY_META[key].label,
    value: stats.bySeverity[key],
    color: SEVERITY_META[key].color,
  }))
  return (
    <section>
      <div className="mb-1 flex items-center justify-between text-[10px] text-sky-400/80">
        <span>系统关注等级</span><span>点击过滤列表</span>
      </div>
      <ProportionBarChart
        data={data}
        ariaLabel="系统关注等级分布"
        onItemClick={(datum) => {
          const key = datum.id as EventSeverity
          model.setSeverity(model.severity === key ? 'all' : key)
        }}
      />
      <div className="mt-1.5 grid grid-cols-2 gap-1">
        {SEVERITY_KEYS.map(key => {
          const meta = SEVERITY_META[key]
          return (
            <button
              key={key}
              type="button"
              onClick={() => model.setSeverity(model.severity === key ? 'all' : key)}
              className={`flex items-center gap-1.5 rounded-sm border px-1.5 py-1 text-[9px] ${model.severity === key ? 'border-sky-200/60 bg-sky-400/12 text-sky-50' : 'border-sky-400/15 text-sky-300/80'}`}
            >
              <i className="size-2 rounded-full" style={{ background: meta.color, boxShadow: `0 0 5px ${meta.color}` }} />
              <span className="flex-1 text-left">{meta.label}</span>
              <strong className="tabular-nums">{stats.bySeverity[key]}</strong>
            </button>
          )
        })}
      </div>
    </section>
  )
}

function MonthlyDistribution({ model }: { model: EventCatalogModel }) {
  const buckets = model.response?.stats.monthly ?? []
  return (
    <section>
      <div className="mb-1 text-[10px] text-sky-400/80">未来12个月事件分布</div>
      <div className="rounded-sm border border-sky-400/15 bg-black/10 px-1">
        <BarChart
          labels={buckets.map((bucket) => bucket.label)}
          values={buckets.map((bucket) => bucket.count)}
          height={88}
          compact
          ariaLabel="未来十二个月事件数量"
          onItemClick={(index) => {
            const bucket = buckets[index]
            if (!bucket) return
            model.setTab('all')
            model.setRange({ kind: 'custom', from: bucket.dateFrom, to: bucket.dateTo })
          }}
        />
      </div>
    </section>
  )
}

function HighlightButton({
  label,
  event,
  metric,
  onSelect,
}: {
  label: string
  event: EventItem | null
  metric: 'time' | 'distance' | 'diameter'
  onSelect: (event: EventItem) => void
}) {
  if (!event) return null
  const metricText = metric === 'time'
    ? fmtJDMinute(event.jdEnc).slice(5)
    : metric === 'distance'
      ? `${((event.missKm ?? 0) / LD_KM).toFixed(2)} LD`
      : event.diam >= 1 ? `${event.diam.toFixed(1)} km` : `${(event.diam * 1000).toFixed(0)} m`
  return (
    <button type="button" onClick={() => onSelect(event)} className="flex items-center gap-2 rounded-sm border border-sky-400/15 bg-sky-400/[0.04] px-2 py-1.5 text-left hover:border-sky-300/50 hover:bg-sky-400/[0.08]">
      <span className="w-12 shrink-0 text-[9px] text-sky-500/80">{label}</span>
      <span className="min-w-0 flex-1 truncate text-[10px] text-sky-100">{event.name}</span>
      <span className={`shrink-0 text-[8px] ${SOURCE_META[event.source].cls.split(' ')[0]}`}>{metricText}</span>
    </button>
  )
}

export default function EventAnalyticsPanel({ model, onSelect }: { model: EventCatalogModel; onSelect: (event: EventItem) => void }) {
  const stats = model.response?.stats
  return (
    <Panel title="事件统计" className="min-h-0 flex-1" extra={<span className="text-[9px] text-sky-400/70">当前筛选口径</span>}>
      {!stats ? (
        <div className="py-8 text-center text-[11px] text-sky-400/65">正在汇总事件目录…</div>
      ) : (
        <div className={`flex flex-col gap-3 transition-opacity ${model.loading ? 'opacity-60' : ''}`}>
          <div className="grid grid-cols-2 gap-1.5">
            <MetricCard compact label="筛选结果" value={stats.total} icon={<Database size={13} />} />
            <MetricCard compact label="真实事件" value={stats.real} icon={<ShieldAlert size={13} />} />
            <MetricCard compact label="未来一年" value={stats.future365d} icon={<CalendarClock size={13} />} onClick={() => model.setTab('current')} />
            <MetricCard compact label="推演事件" value={stats.simulated} icon={<FlaskConical size={13} />} onClick={() => model.setTab('sim')} />
          </div>
          <SeverityDistribution model={model} />
          <MonthlyDistribution model={model} />
          <section className="flex flex-col gap-1">
            <div className="text-[10px] text-sky-400/80">关键事件</div>
            <HighlightButton label="最近发生" event={stats.highlights.next} metric="time" onSelect={onSelect} />
            <HighlightButton label="最近地球" event={stats.highlights.closest} metric="distance" onSelect={onSelect} />
            <HighlightButton label="最大目标" event={stats.highlights.largest} metric="diameter" onSelect={onSelect} />
          </section>
          <div className="border-t border-sky-400/15 pt-2 text-[9px] leading-relaxed text-sky-500/65">
            关注等级是系统的参考分级：飞掠按接近距离与直径，撞击按能量当量；不等同于 JPL Sentry 撞击概率。
          </div>
        </div>
      )}
    </Panel>
  )
}
