import { useMemo } from 'react';
import { cn } from '@/lib/utils';
import Panel from '@/components/ui/Panel';
import { useSelectionStore } from '@/store/selectionStore';
import { useUIStore } from '@/store/uiStore';
import { getGroundStationProvider } from '@/features/ground/stationProvider';
import { ListSearch } from '../shared/atoms';
import type { SelectionTarget } from '@/types/scene';

/**
 * 地面监测站列表: 搜索 + 单站聚焦选中 (再次点击取消)。
 * 地面监测态势右栏的库面板, 替换小行星态势的小行星库。
 */
export default function StationListPanel({
  onSelect,
}: {
  onSelect: (t: SelectionTarget) => void;
}) {
  const selected = useSelectionStore((s) => s.selected);
  const clearSelection = useSelectionStore((s) => s.clearSelection);
  /* 全局搜索词 (面板内搜索框) */
  const search = useUIStore((s) => s.searchQuery);
  const stations = getGroundStationProvider().getStations();

  const filtered = useMemo(
    () =>
      stations
        .map((station, index) => ({ station, index }))
        .filter(({ station }) => {
          const q = search.trim();
          return !q || station.name.includes(q) || station.country.includes(q);
        }),
    [search, stations],
  );

  return (
    <Panel className="flex-1 min-h-0" title={`地面监测站 ${filtered.length}`}>
      <ListSearch placeholder="搜索监测站…" />
      <div className="flex-1 min-h-0 overflow-y-auto hud-scroll px-2 pb-2">
        {filtered.map(({ station: st, index: realIdx }) => {
          const isSel =
            selected?.kind === 'station' && selected.idx === realIdx;
          return (
            <button
              key={st.name}
              /* 选中即单站聚焦 (三维只显示该站); 再次点击取消选择 */
              onClick={() =>
                isSel
                  ? clearSelection()
                  : onSelect({ kind: 'station', idx: realIdx })
              }
              title={
                isSel ? '再次点击取消选择' : '选中后三维区域仅显示该监测站'
              }
              className={cn(
                'w-full flex items-center gap-2 px-2 py-1.5 rounded-sm text-left transition-all border border-transparent cursor-pointer',
                isSel
                  ? 'bg-gradient-to-r from-sky-400/20 to-transparent border-sky-400/40 shadow-[inset_0_0_12px_rgba(125,211,252,0.12)]'
                  : 'hover:bg-sky-400/[0.07]',
              )}
            >
              <span className="w-1 h-6 rounded-full shrink-0 bg-emerald-400/70" />
              <span className="flex-1 min-w-0">
                <span className="block text-[12px] text-sky-100 truncate">
                  {st.name}
                  <span className="text-sky-500/80 text-[10px] ml-1.5">
                    {st.country} · {st.type}
                  </span>
                </span>
              </span>
            </button>
          );
        })}
      </div>
    </Panel>
  );
}
