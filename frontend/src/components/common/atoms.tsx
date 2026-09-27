import type { ReactNode } from 'react';
import { ChevronLeft } from 'lucide-react';
import { cn } from '@/lib/utils';
import { DETAIL_BACK_BUTTON_CLASS } from './detailMeta';

/* =====================================================================
 * 跨页面共享展示原子库
 * 收敛各专题页 (小行星/地面站/观测任务/L1/事件) 中重复定义的
 * 键值行、徽章、瓦片、返回栏等展示原子, 保证全局视觉语言一致。
 * ===================================================================== */

/** 键值行: 标签居左 / 数值居右, 缺失值自动跳过, hl 高亮关键数值 */
export function KV({ k, v, hl }: { k: string; v?: ReactNode; hl?: boolean }) {
  if (v == null || v === '') return null;
  return (
    <div className="flex items-baseline justify-between gap-2 py-[3px] min-w-0">
      <span className="text-[10px] text-sky-400/70 whitespace-nowrap">{k}</span>
      <span
        className={cn(
          'text-[11px] tabular-nums truncate text-right',
          hl ? 'text-sky-100' : 'text-sky-200/90',
        )}
      >
        {v}
      </span>
    </div>
  );
}

/** 键值项 (两列网格中的一格: 标签在上 / 数值在下, 首行可高亮) */
export function KVCell({ k, v, hl }: { k: string; v: string; hl?: boolean }) {
  return (
    <div className="min-w-0">
      <div className="text-[10px] text-sky-500/80">{k}</div>
      <div
        className={cn(
          'tabular-nums truncate',
          hl ? 'text-sky-300 font-semibold glow-text' : 'text-sky-100',
        )}
      >
        {v}
      </div>
    </div>
  );
}

/** 徽章芯片: 是/否语义标签 */
export function Chip({ ok, children }: { ok: boolean; children: ReactNode }) {
  return (
    <span
      className={`inline-flex items-center gap-1 px-1.5 py-px rounded-sm text-[10px] whitespace-nowrap border ${
        ok
          ? 'text-amber-300 border-amber-400/40 bg-amber-400/10'
          : 'text-sky-400/70 border-sky-400/20 bg-sky-400/[0.05]'
      }`}
    >
      <span
        className={`w-1 h-1 rounded-full ${ok ? 'bg-amber-400' : 'bg-sky-500/60'}`}
      />
      {children}
    </span>
  );
}

/** 大数字瓦片: 实时状态 / 六根数 */
export function Tile({
  sym,
  v,
  label,
  color = '#7dd3fc',
}: {
  sym: string;
  v: string;
  label?: string;
  color?: string;
}) {
  return (
    <div className="rounded-sm border border-sky-400/15 bg-sky-400/[0.04] px-1.5 py-1.5 min-w-0">
      <div className="flex items-baseline gap-1">
        <span className="text-[10px] text-sky-400/80 italic">{sym}</span>
        <span
          className="text-[13px] tabular-nums leading-none truncate"
          style={{ color }}
        >
          {v}
        </span>
      </div>
      {label && (
        <div className="text-[9px] text-sky-500/70 mt-0.5 truncate">
          {label}
        </div>
      )}
    </div>
  );
}

/** 专题详情页头: 返回按钮居左 + 发光标题居右 (accentColor 可覆盖标题色条) */
export function DetailPageHeader({
  backLabel,
  onBack,
  title,
  accentColor,
}: {
  backLabel: string;
  onBack: () => void;
  title: ReactNode;
  /** 标题色条自定义颜色 (如事件等级色), 缺省为天空蓝渐变 */
  accentColor?: string;
}) {
  return (
    <div className="flex items-center justify-between shrink-0 z-1">
      <button type="button" className={DETAIL_BACK_BUTTON_CLASS} onClick={onBack}>
        <ChevronLeft size={13} />
        {backLabel}
      </button>
      <div className="hud-title flex items-center gap-2 text-[14px] text-sky-50">
        <span
          className="inline-block w-1 h-3.5 rounded-[1px]"
          style={
            accentColor
              ? {
                  background: `linear-gradient(180deg, ${accentColor}, ${accentColor}66)`,
                  boxShadow: `0 0 6px ${accentColor}`,
                }
              : {
                  background:
                    'linear-gradient(180deg, #7dd3fc, #0369a1)',
                  boxShadow: '0 0 6px rgba(59,130,246,0.9)',
                }
          }
        />
        {title}
      </div>
    </div>
  );
}
