import EventAnalyticsPanel from './EventAnalyticsPanel'
import EventIntroPanel from './EventIntroPanel'
import type { EventItem } from '@/services/eventCenter'
import type { EventCatalogModel } from './useEventCatalog'

export type EventContextView = 'stats' | 'detail'

export default function EventContextPanel({
  model,
  selected,
  view,
  onViewChange,
  onSelect,
}: {
  model: EventCatalogModel
  selected: EventItem | null
  view: EventContextView
  onViewChange: (view: EventContextView) => void
  onSelect: (event: EventItem) => void
}) {
  return (
    <div className="flex min-h-0 h-full flex-col gap-2.5">
      <div className="hud-panel relative flex shrink-0 gap-1 rounded-sm p-1">
        <button type="button" onClick={() => onViewChange('stats')} className={`flex-1 rounded-sm border py-1 text-[10px] ${view === 'stats' ? 'border-sky-300/60 bg-sky-400/15 text-sky-50' : 'border-transparent text-sky-400/75 hover:text-sky-200'}`}>
          统计概览
        </button>
        <button type="button" disabled={!selected} onClick={() => onViewChange('detail')} className={`flex-1 rounded-sm border py-1 text-[10px] ${view === 'detail' ? 'border-sky-300/60 bg-sky-400/15 text-sky-50' : 'border-transparent text-sky-400/75 enabled:hover:text-sky-200 disabled:cursor-not-allowed disabled:opacity-35'}`}>
          事件详情
        </button>
      </div>
      {view === 'detail' && selected ? (
        <div className="flex min-h-0 flex-1 flex-col gap-2.5 overflow-y-auto hud-scroll">
          <EventIntroPanel ev={selected} />
        </div>
      ) : (
        <EventAnalyticsPanel model={model} onSelect={onSelect} />
      )}
    </div>
  )
}
