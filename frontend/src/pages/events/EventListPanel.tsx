import { useEffect, useRef } from 'react'
import { Bell, Loader2 } from 'lucide-react'
import Panel from '@/components/ui/Panel'
import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from '@/components/ui/pagination'
import type { EventItem } from '@/services/eventCenter'
import EventCard from './EventCard'
import EventFilterBar from './EventFilterBar'
import type { EventCatalogModel } from './useEventCatalog'

const PAGE_SIZE = 10

function pageItems(current: number, total: number): (number | 'gap')[] {
  if (total <= 7) return Array.from({ length: total }, (_, index) => index + 1)
  const items: (number | 'gap')[] = [1]
  const left = Math.max(2, current - 1)
  const right = Math.min(total - 1, current + 1)
  if (left > 2) items.push('gap')
  for (let page = left; page <= right; page++) items.push(page)
  if (right < total - 1) items.push('gap')
  items.push(total)
  return items
}

function EmptyState({ model }: { model: EventCatalogModel }) {
  if (model.error) {
    return (
      <div className="flex flex-col items-center gap-2 py-7">
        <Bell size={22} className="text-red-400/70" />
        <div className="text-[11px] text-red-300/85">{model.error}</div>
      </div>
    )
  }
  if (model.loading) {
    return (
      <div className="flex items-center justify-center gap-2 py-7 text-[11px] text-sky-400/70">
        <Loader2 size={13} className="animate-spin" /> 正在检索事件目录…
      </div>
    )
  }
  return (
    <div className="flex flex-col items-center gap-2 py-7">
      <Bell size={22} className="text-sky-400/60" />
      <div className="text-[11px] text-sky-400/70">
        {model.filtered ? '无符合检索条件的事件，请调整条件或时间范围' : '事件目录暂无数据'}
      </div>
    </div>
  )
}

function EventPagination({ model }: { model: EventCatalogModel }) {
  const total = model.response?.total ?? 0
  const pages = model.response?.pages ?? 1
  if (total <= PAGE_SIZE) return null
  return (
    <div className="shrink-0 border-t border-sky-400/15 px-1 pb-0.5 pt-1.5">
      <div className="flex items-center justify-between text-[10px] tabular-nums text-sky-500/80">
        <span>共 {total} 条</span><span className="text-sky-300/90">第 {model.page} / {pages} 页</span>
      </div>
      <Pagination className="mt-1.5">
        <PaginationContent>
          <PaginationItem><PaginationPrevious disabled={model.page <= 1 || model.loading} onClick={() => model.setPage(model.page - 1)} /></PaginationItem>
          {pageItems(model.page, pages).map((item, index) => item === 'gap' ? (
            <PaginationItem key={`gap-${index}`}><PaginationEllipsis /></PaginationItem>
          ) : (
            <PaginationItem key={item}>
              <PaginationLink isActive={item === model.page} disabled={model.loading} onClick={() => model.setPage(item)}>{item}</PaginationLink>
            </PaginationItem>
          ))}
          <PaginationItem><PaginationNext disabled={model.page >= pages || model.loading} onClick={() => model.setPage(model.page + 1)} /></PaginationItem>
        </PaginationContent>
      </Pagination>
    </div>
  )
}

/** 左侧事件目录：筛选、列表、分页；请求与统计状态由 useEventCatalog 统一管理。 */
export default function EventListPanel({
  model,
  selectedKey,
  onSelect,
}: {
  model: EventCatalogModel
  selectedKey: string | null
  onSelect: (event: EventItem) => void
}) {
  const listRef = useRef<HTMLDivElement>(null)
  useEffect(() => { listRef.current?.scrollTo({ top: 0 }) }, [model.page])
  return (
    <Panel
      title="事件目录"
      className="min-h-0 flex-1"
      extra={<span className="text-[9px] tabular-nums text-sky-400/70">{model.response?.total ?? '—'} 条</span>}
    >
      <EventFilterBar model={model} />
      <div
        ref={listRef}
        className={`flex min-h-0 flex-1 flex-col gap-1.5 overflow-y-auto px-1 pb-1 transition-opacity ${model.loading && model.rows.length > 0 ? 'opacity-60' : ''}`}
      >
        {model.rows.length === 0 ? <EmptyState model={model} /> : model.rows.map(event => (
          <EventCard
            key={event.key}
            event={event}
            referenceJd={model.referenceJd}
            selected={event.key === selectedKey}
            onSelect={onSelect}
          />
        ))}
      </div>
      <EventPagination model={model} />
    </Panel>
  )
}
