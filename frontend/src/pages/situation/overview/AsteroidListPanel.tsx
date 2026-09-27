import { useState, useMemo } from 'react';
import { cn } from '@/lib/utils';
import Panel from '@/components/ui/Panel';
import RiskBadge from '@/components/common/RiskBadge';
import { useSelectionStore } from '@/store/selectionStore';
import { useUIStore } from '@/store/uiStore';
import { useDataStore } from '@/store/dataStore';
import { useLiveJd } from '@/hooks/useLiveJd';
import { riskOf } from '@/services/statsService';
import { PLANETS } from '@/data/planets';
import { planetPos } from '@/utils/orbital/planets';
import { astPos } from '@/utils/orbital/asteroids';
import { AU_KM } from '@/utils/orbital/constants';
import { fmtKm } from '@/utils/orbital/time';
import { v3, dist3 } from '../shared/vec';
import { ListSearch } from '../shared/atoms';
import type { SelectionTarget } from '@/types/scene';

// ---- category classify ----
function astCat(cls: string): 'neo' | 'trojan' | 'main' {
  if (
    cls.includes('近地') ||
    cls.includes('阿波罗') ||
    cls.includes('阿莫尔') ||
    cls.includes('阿登') ||
    cls.includes('飞掠')
  )
    return 'neo';
  if (cls.includes('特洛伊') || cls.includes('希尔达')) return 'trojan';
  return 'main';
}
function catTag(cls: string): string {
  const c = astCat(cls);
  if (c === 'neo') return 'NEO';
  if (c === 'trojan') return '特洛伊';
  return '主带';
}

/** 列表行左侧发光色条 (按类别) */
const CAT_BAR: Record<'neo' | 'trojan' | 'main', string> = {
  neo: 'bg-red-400 shadow-[0_0_6px_#f87171]',
  trojan: 'bg-amber-400/80',
  main: 'bg-sky-400/80',
};

/**
 * 小行星库: 搜索 + 类别筛选 (近地/主带/特洛伊) + 实时距地列表。
 * 小行星态势右栏的库面板; 选中回调由组装层注入 (附带伴飞目标同步)。
 */
export default function AsteroidListPanel({
  onSelect,
}: {
  onSelect: (t: SelectionTarget) => void;
}) {
  const selected = useSelectionStore((s) => s.selected);
  const asteroids = useDataStore((s) => s.asteroids);
  /* 全局搜索词 (面板内搜索框) */
  const search = useUIStore((s) => s.searchQuery);
  const [filter, setFilter] = useState<'all' | 'neo' | 'main' | 'trojan'>(
    'all',
  );
  /* 低频刷新当前距地, 供列表距离列使用 */
  const jd = useLiveJd(2000);

  const distKm = useMemo(() => {
    const earth = v3();
    planetPos(PLANETS[2], jd, earth);
    return asteroids.map((a) => {
      const p = v3();
      astPos(a, jd, p);
      return dist3(p, earth) * AU_KM;
    });
  }, [asteroids, jd]);

  const filtered = useMemo(
    () =>
      asteroids.filter((a) => {
        const q = search.trim().toLowerCase();
        const matchSearch =
          !q || a.name.includes(q) || a.en.toLowerCase().includes(q);
        const cat = astCat(a.cls);
        const matchFilter = filter === 'all' || cat === filter;
        return matchSearch && matchFilter;
      }),
    [asteroids, search, filter],
  );

  return (
    <Panel
      className="flex-1 min-h-0"
      title={`小行星库 ${filtered.length}`}
      extra={
        <div className="flex gap-1">
          {(['all', 'neo', 'main', 'trojan'] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={cn(
                'text-[10px] px-1.5 py-px rounded-sm border transition-all cursor-pointer',
                filter === f
                  ? 'text-sky-100 border-sky-400/60 bg-sky-400/15 shadow-[0_0_8px_rgba(125,211,252,0.3)]'
                  : 'text-sky-400/80 border-sky-400/15 hover:border-sky-400/40',
              )}
            >
              {f === 'all'
                ? '全部'
                : f === 'neo'
                  ? '近地'
                  : f === 'main'
                    ? '主带'
                    : '特洛伊'}
            </button>
          ))}
        </div>
      }
    >
      <ListSearch placeholder="搜索小行星…" />
      <div className="flex-1 min-h-0 overflow-y-auto hud-scroll px-2 pb-2">
        {filtered.map((a) => {
          const realIdx = asteroids.indexOf(a);
          const cat = astCat(a.cls);
          const isSel = selected?.kind === 'ast' && selected.idx === realIdx;
          return (
            <button
              key={a.en}
              onClick={() => onSelect({ kind: 'ast', idx: realIdx })}
              className={cn(
                'w-full flex items-center gap-2 px-2 py-2.5 rounded-sm text-left transition-all border border-transparent cursor-pointer',
                isSel
                  ? 'bg-gradient-to-r from-sky-400/20 to-transparent border-sky-400/40 shadow-[inset_0_0_12px_rgba(125,211,252,0.12)]'
                  : 'hover:bg-sky-400/[0.07]',
              )}
            >
              <span
                className={cn('w-1 h-6 rounded-full shrink-0', CAT_BAR[cat])}
              />
              <span className="flex-1 min-w-0">
                <span className="block text-[12px] text-sky-100 truncate">
                  {a.name}
                  <span className="text-sky-500/80 text-[10px] ml-1.5">
                    {a.en} · {catTag(a.cls)}
                  </span>
                </span>
              </span>
              <RiskBadge level={riskOf(a.en)} />
              <span className="text-[11px] text-sky-300/90 tabular-nums w-25 text-right shrink-0">
                {fmtKm(distKm[realIdx])}
              </span>
            </button>
          );
        })}
      </div>
    </Panel>
  );
}
