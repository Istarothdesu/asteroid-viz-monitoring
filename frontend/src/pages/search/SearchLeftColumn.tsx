import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Search, X } from 'lucide-react';
import Panel from '@/components/ui/Panel';
import { Input } from '@/components/ui/input';
import { DetailPageHeader } from '@/components/common/atoms';
import {
  searchLocal,
  searchEvents,
  SEARCH_KIND_META,
  SEARCH_KIND_ORDER,
  type SearchHit,
  type SearchKind,
} from '@/services/searchService';

/* 类别强调色: 与系统语义色一致 (小行星橙 / 站青 / 事件红 / 任务绿 / L1紫) */
const KIND_DOT: Record<SearchKind, string> = {
  asteroid: '#fb923c',
  station: '#38bdf8',
  event: '#ff6b6b',
  obsTask: '#34d399',
  l1Task: '#a78bfa',
};

/** 事件检索防抖 (ms): 关键字已下推后端, 逐字符发分页查询没有意义 */
const EV_DEBOUNCE = 280;

/**
 * 检索页左列: 搜索框 + 分组结果列表。
 * 查询词与选中项均收敛在路由参数 (?q=&sel=): 输入以 replace 更新
 * (不堆积历史), 选中以 push 写入 —— 进入详情后浏览器回退即回到结果列表。
 * 本地类目 (小行星/监测站/任务) 同步即得, 风险事件类目异步补齐。
 */
export default function SearchLeftColumn() {
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const q = params.get('q') ?? '';
  const sel = params.get('sel');

  const localHits = useMemo(() => searchLocal(q), [q]);

  /* 事件命中走服务端检索: 防抖 + AbortController, 关键字变化时旧请求直接作废 */
  const [evHits, setEvHits] = useState<SearchHit[]>([]);
  const [evPending, setEvPending] = useState(false);
  useEffect(() => {
    if (!q.trim()) {
      setEvHits([]);
      setEvPending(false);
      return;
    }
    const ctrl = new AbortController();
    setEvPending(true);
    const t = window.setTimeout(() => {
      searchEvents(q, ctrl.signal)
        .then((rows) => {
          setEvHits(rows);
          setEvPending(false);
        })
        /* 主动取消 (关键字已变) 交给下一次请求接管, 不得提前收尾 */
        .catch(() => {
          if (!ctrl.signal.aborted) setEvPending(false);
        });
    }, EV_DEBOUNCE);
    return () => {
      window.clearTimeout(t);
      ctrl.abort();
    };
  }, [q]);

  const hits = useMemo(() => [...localHits, ...evHits], [localHits, evHits]);

  /* 按类别分组: 顺序固定为 SEARCH_KIND_ORDER, 不随事件结果异步到达的先后漂移 */
  const groups = useMemo(() => {
    const map = new Map<SearchKind, SearchHit[]>();
    for (const h of hits) {
      const arr = map.get(h.kind) ?? [];
      arr.push(h);
      map.set(h.kind, arr);
    }
    return SEARCH_KIND_ORDER.filter((k) => map.has(k)).map(
      (k) => [k, map.get(k)!] as [SearchKind, SearchHit[]],
    );
  }, [hits]);

  const setQuery = (v: string) => {
    const next = new URLSearchParams(params);
    if (v) next.set('q', v);
    else next.delete('q');
    next.delete('sel');
    // 逐字符输入不堆积历史记录
    setParams(next, { replace: true });
  };

  const select = (key: string) => {
    const next = new URLSearchParams(params);
    next.set('sel', key);
    setParams(next);
  };

  return (
    <>
      {/* 返回 + 页标题 */}
      <DetailPageHeader
        backLabel="实时态势"
        onBack={() => navigate('/situation/overview')}
        title="全局检索"
      />

      <Panel title="搜索">
        <div className="px-2.5 py-2">
          <div className="relative">
            <Input
              className="px-2.5 py-1.5 bg-[rgba(4,12,28,0.85)] border-sky-400/30"
              placeholder="小行星 / 监测站 / 事件 / 任务…"
              value={q}
              autoFocus
              onChange={(e) => setQuery(e.target.value)}
            />
            {q ? (
              <button
                type="button"
                className="absolute right-1.5 top-1/2 -translate-y-1/2 text-sky-500/70 hover:text-sky-200 cursor-pointer"
                title="清空"
                onClick={() => setQuery('')}
              >
                <X size={12} />
              </button>
            ) : (
              <Search
                size={12}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-sky-500/50 pointer-events-none"
              />
            )}
          </div>
          <div className="mt-1.5 text-[10px] text-sky-400/60">
            支持中文名 / 英文编号 / 任务编号, 如 "谷神"、"Bennu"、"OBS-"
          </div>
        </div>
      </Panel>

      <Panel
        title="检索结果"
        extra={
          q.trim() ? (
            <span className="text-[10px] text-sky-400/70 tabular-nums">
              {hits.length} 项
            </span>
          ) : undefined
        }
      >
        <div className="px-1.5 pb-1.5">
          {q.trim() === '' && (
            <div className="px-1 py-5 text-center text-[11px] text-sky-400/60">
              输入关键字开始检索
            </div>
          )}
          {q.trim() !== '' && hits.length === 0 && (
            <div className="px-1 py-5 text-center text-[11px] text-sky-400/60">
              {evPending ? '正在检索事件目录…' : '未检索到匹配的对象'}
            </div>
          )}
          {groups.map(([kind, arr]) => (
            <div key={kind} className="mb-1.5 last:mb-0">
              <div className="flex items-center gap-1.5 px-1 py-1 text-[10px] text-sky-400/70 tracking-wider">
                <span
                  className="inline-block w-1.5 h-1.5 rounded-full"
                  style={{ background: KIND_DOT[kind] }}
                />
                {SEARCH_KIND_META[kind].label} · {arr.length}
              </div>
              {arr.map((hit) => (
                <button
                  key={hit.key}
                  type="button"
                  className={`flex w-full flex-col gap-0.5 rounded-sm border px-2 py-1.5 text-left transition-all cursor-pointer ${
                    sel === hit.key
                      ? 'border-sky-300/60 bg-sky-400/15 shadow-[0_0_8px_rgba(125,211,252,0.25)]'
                      : 'border-transparent hover:bg-sky-400/10'
                  }`}
                  onClick={() => select(hit.key)}
                >
                  <span className="text-[12px] text-sky-100 leading-tight">
                    {hit.title}
                  </span>
                  <span className="text-[10px] text-sky-400/60 tabular-nums leading-tight">
                    {hit.subtitle}
                  </span>
                </button>
              ))}
            </div>
          ))}
        </div>
      </Panel>
    </>
  );
}
