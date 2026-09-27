import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ExternalLink, X } from 'lucide-react';
import Panel from '@/components/ui/Panel';
import {
  resolveHit,
  SEARCH_KIND_META,
  type SearchDetail,
} from '@/services/searchService';

const btnCls =
  'flex items-center justify-center gap-1.5 w-full px-3 py-1.5 rounded-sm text-[12px] border transition-all cursor-pointer whitespace-nowrap';

/* 类别徽章色: 与左列色点同一语义口径 */
const KIND_BADGE: Record<string, string> = {
  asteroid: 'text-orange-300 border-orange-400/40 bg-orange-400/10',
  station: 'text-sky-300 border-sky-400/40 bg-sky-400/10',
  event: 'text-red-300 border-red-400/40 bg-red-400/10',
  obsTask: 'text-emerald-300 border-emerald-400/40 bg-emerald-400/10',
  l1Task: 'text-violet-300 border-violet-400/40 bg-violet-400/10',
};

/**
 * 检索页右列: 选中结果详情 + 进入专题入口。
 * 选中项由路由参数 ?sel= 驱动 (浏览器回退/前进可复现),
 * 详情经 resolveHit 即时解析, 不依赖导航 state;
 * 事件类目需向服务端现取, 故解析为异步 (切换选中项时旧请求作废)。
 */
export default function SearchRightColumn() {
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const sel = params.get('sel');

  const [detail, setDetail] = useState<SearchDetail | null>(null);
  const [pending, setPending] = useState(false);
  useEffect(() => {
    if (!sel) {
      setDetail(null);
      setPending(false);
      return;
    }
    const ctrl = new AbortController();
    /* 卸载/换选中项后不得再写回: 旧响应既不得覆盖新详情, 也不得误清加载态 */
    let alive = true;
    setPending(true);
    resolveHit(sel, ctrl.signal)
      .then((d) => {
        if (!alive) return;
        setDetail(d);
        setPending(false);
      })
      .catch(() => {
        if (!alive) return;
        setDetail(null);
        setPending(false);
      });
    return () => {
      alive = false;
      ctrl.abort();
    };
  }, [sel]);

  if (pending) {
    return (
      <Panel title="结果详情">
        <div className="px-2.5 py-6 text-center text-[11px] text-sky-400/60">
          正在调取详情…
        </div>
      </Panel>
    );
  }

  if (!detail) {
    return (
      <Panel title="结果详情">
        <div className="px-2.5 py-6 text-center text-[11px] text-sky-400/60">
          在左侧选择检索结果后, 此处展示详情
        </div>
      </Panel>
    );
  }

  const clearSel = () => {
    const next = new URLSearchParams(params);
    next.delete('sel');
    setParams(next);
  };

  return (
    <>
      <Panel
        title="结果详情"
        extra={
          <button
            type="button"
            className="flex items-center gap-0.5 text-[10px] text-sky-400/70 hover:text-sky-200 transition-colors cursor-pointer"
            title="取消选中"
            onClick={clearSel}
          >
            <X size={11} /> 取消
          </button>
        }
      >
        <div className="px-2.5 pb-2 flex flex-col gap-1.5">
          <div className="text-[14px] text-sky-50 glow-text leading-snug">
            {detail.title}
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <span
              className={`text-[9px] px-1.5 py-px rounded-sm border ${KIND_BADGE[detail.kind]}`}
            >
              {SEARCH_KIND_META[detail.kind].label}
            </span>
            {detail.subtitle && (
              <span className="text-[9px] text-sky-400/70 tabular-nums">
                {detail.subtitle}
              </span>
            )}
          </div>
        </div>
      </Panel>

      <Panel title="详细信息">
        <div className="px-2.5 py-2 text-xs flex flex-col gap-1">
          {detail.rows.map(([k, v]) => (
            <div key={k} className="flex items-center justify-between gap-2">
              <span className="text-sky-400/70 whitespace-nowrap">{k}</span>
              <span className="text-sky-100 text-right tabular-nums">{v}</span>
            </div>
          ))}
        </div>
        {detail.desc && (
          <div className="px-2.5 pb-2 pt-1 border-t border-sky-400/15 text-[11px] text-sky-300/85 leading-relaxed">
            {detail.desc}
          </div>
        )}
      </Panel>

      <Panel title="操作">
        <div className="px-2.5 py-2 flex flex-col gap-1.5">
          <button
            type="button"
            className={`${btnCls} text-orange-200 border-orange-400/40 bg-orange-400/10 hover:bg-orange-400/20`}
            onClick={() =>
              navigate(detail.to, detail.state ? { state: detail.state } : undefined)
            }
          >
            <ExternalLink size={13} /> 进入专题页
          </button>
          <button
            type="button"
            className={`${btnCls} text-sky-300/90 border-sky-400/25 bg-[rgba(8,20,42,0.75)] hover:border-sky-300/70 hover:text-sky-100`}
            onClick={clearSel}
          >
            返回结果列表
          </button>
        </div>
      </Panel>
    </>
  );
}
