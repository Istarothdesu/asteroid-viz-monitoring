import { memo } from 'react'
import {
  CATEGORY_META,
  LD_KM,
  SEVERITY_META,
  SOURCE_META,
  fmtSpan,
  type EventItem,
} from '@/services/eventCenter'
import { fmtJDMinute } from '@/utils/orbital/time'

function ReferenceDistance({ eventJd, referenceJd }: { eventJd: number; referenceJd: number }) {
  const future = eventJd >= referenceJd
  return (
    <span className={`text-[11px] tabular-nums ${future ? 'text-amber-300' : 'text-sky-500/80'}`}>
      {future ? `${fmtSpan(eventJd - referenceJd)} 后遭遇` : `已发生 ${fmtSpan(eventJd - referenceJd)}`}
    </span>
  )
}

/** 事件目录卡片：仅呈现事件，不直接订阅时钟和查询状态。 */
const EventCard = memo(function EventCard({
  event,
  referenceJd,
  selected,
  onSelect,
}: {
  event: EventItem
  referenceJd: number
  selected: boolean
  onSelect: (event: EventItem) => void
}) {
  const severity = SEVERITY_META[event.severity]
  const source = SOURCE_META[event.source]
  return (
    <button
      type="button"
      onClick={() => onSelect(event)}
      className={`group relative w-full cursor-pointer rounded-sm border py-2 pl-3 pr-2.5 text-left transition-all ${
        selected
          ? 'border-sky-300/70 bg-sky-400/[0.12] shadow-[0_0_12px_rgba(125,211,252,0.3)]'
          : 'border-sky-400/15 bg-sky-400/[0.04] hover:border-sky-300/50 hover:bg-sky-400/[0.09] hover:shadow-[0_0_12px_rgba(125,211,252,0.15)]'
      }`}
    >
      <span
        className="absolute bottom-1.5 left-0 top-1.5 w-[3px] rounded-full"
        style={{ background: severity.color, boxShadow: `0 0 7px ${severity.color}` }}
      />
      <div className="flex items-center gap-1.5">
        <span className="min-w-0 flex-1 truncate text-[12px] text-sky-100 group-hover:text-sky-50">
          {event.name}
        </span>
        <span
          title="系统关注等级；飞掠按距离与直径分档，不代表 Sentry 撞击概率"
          className="shrink-0 rounded-sm border px-1.5 text-[10px] tabular-nums"
          style={{ color: severity.color, borderColor: `${severity.color}66`, background: `${severity.color}1a` }}
        >
          {severity.label}
        </span>
      </div>
      <div className="mt-1 flex flex-wrap items-center gap-1.5">
        <span className={`rounded-sm border px-1 py-px text-[9px] ${
          event.type === 'impact'
            ? 'border-red-400/35 bg-red-400/10 text-red-300'
            : 'border-sky-400/30 bg-sky-400/[0.06] text-sky-300'
        }`}>
          {event.type === 'impact' ? '撞击' : '飞掠'}
        </span>
        <span className={`rounded-sm border px-1 py-px text-[9px] ${source.cls}`}>{source.label}</span>
        <span className="rounded-sm border border-sky-400/20 bg-sky-400/[0.05] px-1 py-px text-[9px] text-sky-400/80">
          {CATEGORY_META[event.category].label}
        </span>
      </div>
      <div className="mt-1.5 flex items-baseline justify-between">
        <span className="text-[10px] tabular-nums text-sky-400/80">{fmtJDMinute(event.jdEnc)}</span>
        <ReferenceDistance eventJd={event.jdEnc} referenceJd={referenceJd} />
      </div>
      <div className="mt-0.5 text-[10px] tabular-nums text-sky-300/70">
        {event.type === 'impact'
          ? `能量 ${event.energyMt != null && event.energyMt >= 1 ? `${event.energyMt} Mt` : `${((event.energyMt ?? 0) * 1000).toFixed(1)} kt`} TNT`
          : `最近 ${(event.missKm ?? 0) < LD_KM ? `${(event.missKm ?? 0).toLocaleString()} km` : `${((event.missKm ?? 0) / LD_KM).toFixed(2)} LD`} · Ø ${(event.diam * 1000).toFixed(0)} m`}
      </div>
    </button>
  )
})

export default EventCard
