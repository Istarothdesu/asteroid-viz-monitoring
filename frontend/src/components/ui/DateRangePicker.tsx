import { useCallback, useState } from 'react';
import { CalendarRange } from 'lucide-react';
import type { DateRange } from 'react-day-picker';
import { zhCN } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { Calendar } from '@/components/ui/calendar';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { jdToDate } from '@/utils/orbital/time';
import { JD_MAX, JD_MIN } from '@/utils/orbital/constants';
import {
  isoDay,
  type DateRangePreset,
  type DateRangeValue,
} from './dateRangeModel';

/** 触发按钮文案: 同年只写一次年份省宽度, 完整区间放在 title 里 */
function rangeLabel(from: string, to: string): string {
  return from.slice(0, 4) === to.slice(0, 4)
    ? `${from.slice(0, 4)} 年 ${from.slice(5)} ~ ${to.slice(5)}`
    : `${from} ~ ${to}`;
}

const chipCls = (on: boolean) =>
  cn(
    'px-1.5 py-0.5 rounded-sm text-[10px] border transition-all cursor-pointer whitespace-nowrap',
    on
      ? 'text-sky-100 border-sky-400/60 bg-sky-400/15 shadow-[0_0_8px_rgba(125,211,252,0.25)]'
      : 'text-sky-400/80 border-sky-400/20 hover:text-sky-200 hover:border-sky-400/45',
  );

/**
 * 时间范围选择器 (原子组件, HUD 皮肤): 快捷预设片 + 自定义起止日期日历弹窗。
 *
 * 日历口径与底部时间轴一致 (react-day-picker, zhCN + timeZone="UTC"),
 * 选完起止两天立即提交并关闭, 未选完就关闭则丢弃临时选区;
 * 预设与自定义互斥, 点任一预设即退出自定义区间。
 * 组件不解释预设语义 (相对仿真时钟/绝对年代由调用方换算), 便于跨页面复用。
 */
export function DateRangePicker({
  value,
  onChange,
  presets,
  anchorJd,
  className,
}: {
  value: DateRangeValue;
  onChange: (v: DateRangeValue) => void;
  presets: DateRangePreset[];
  /** 日历定位月份 (通常传仿真时钟 JD): 自定义区间外以此为中心展示 */
  anchorJd?: number;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  /* 弹窗内的临时选区: 支持「先选起点、再选终点」的中间态 */
  const [range, setRange] = useState<DateRange | undefined>(undefined);

  const custom = value.kind === 'custom' ? value : null;

  const handleOpenChange = useCallback(
    (next: boolean) => {
      if (next) {
        setRange(
          custom
            ? { from: new Date(`${custom.from}T00:00:00Z`), to: new Date(`${custom.to}T00:00:00Z`) }
            : undefined,
        );
      }
      setOpen(next);
    },
    [custom],
  );

  const handleSelect = useCallback(
    (r: DateRange | undefined) => {
      setRange(r);
      if (!r?.from || !r?.to) return; // 只选了起点, 等终点, 暂不提交
      onChange({ kind: 'custom', from: isoDay(r.from), to: isoDay(r.to) });
      setOpen(false);
    },
    [onChange],
  );

  const defaultMonth = custom
    ? new Date(`${custom.from}T00:00:00Z`)
    : anchorJd != null
      ? jdToDate(anchorJd)
      : new Date();

  return (
    <div className={cn('flex flex-wrap items-center gap-1', className)}>
      {presets.map((p) => (
        <button
          key={p.key}
          type="button"
          title={p.title ?? p.label}
          className={chipCls(value.kind === 'preset' && value.key === p.key)}
          onClick={() => onChange({ kind: 'preset', key: p.key })}
        >
          {p.label}
        </button>
      ))}

      <Popover open={open} onOpenChange={handleOpenChange}>
        <PopoverTrigger asChild>
          <button
            type="button"
            title={custom ? `${custom.from} ~ ${custom.to} (UTC)` : '自定义时间范围'}
            className={cn(
              'inline-flex items-center gap-1 px-1.5 py-0.5 rounded-sm text-[10px] border transition-all cursor-pointer whitespace-nowrap tabular-nums',
              custom
                ? 'text-sky-100 border-sky-300/60 bg-sky-400/15 shadow-[0_0_8px_rgba(125,211,252,0.25)]'
                : 'text-sky-400/80 border-sky-400/20 bg-[rgba(8,20,42,0.9)] hover:text-sky-200 hover:border-sky-400/45',
            )}
          >
            <CalendarRange size={11} className="shrink-0" />
            {custom ? rangeLabel(custom.from, custom.to) : '自定义'}
          </button>
        </PopoverTrigger>
        <PopoverContent side="bottom" align="start" className="w-auto p-2">
          <Calendar
            mode="range"
            numberOfMonths={2}
            locale={zhCN}
            timeZone="UTC"
            selected={range}
            onSelect={handleSelect}
            defaultMonth={defaultMonth}
            startMonth={jdToDate(JD_MIN)}
            endMonth={jdToDate(JD_MAX)}
            disabled={[{ before: jdToDate(JD_MIN) }, { after: jdToDate(JD_MAX) }]}
          />
          <div className="flex items-center justify-between gap-2 border-t border-sky-400/15 px-1 pt-1.5 text-[10px] text-sky-400/80">
            <span className="tabular-nums">
              {range?.from
                ? range.to
                  ? `${isoDay(range.from)} ~ ${isoDay(range.to)}`
                  : `${isoDay(range.from)} ~ 请选择结束日期`
                : '请选择起始日期'}
            </span>
            <span className="shrink-0 text-sky-500/70">UTC</span>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}

export default DateRangePicker;
