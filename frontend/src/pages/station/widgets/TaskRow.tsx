import { useSimStore } from '@/store/simStore';
import { OBS_TYPE_ZH, type ObsTask } from '@/services/obsTaskService';
import { fmtJDShort } from '@/utils/orbital/time';
import { PRIORITY_META } from '@/components/common/detailMeta';

/** 计划任务行: 目标 + 优先级 + 窗口; 点击选中并跳转时间轴至窗口开始 */
export default function TaskRow({
  task,
  selected,
  onSelect,
}: {
  task: ObsTask;
  selected?: boolean;
  onSelect?: (task: ObsTask) => void;
}) {
  const setJD = useSimStore((s) => s.setJD);
  const prio = PRIORITY_META[task.priority];
  const target = task.params.find(([k]) => k === '目标')?.[1] ?? '—';
  return (
    <button
      type="button"
      title={`${task.purpose} · 点击选中并跳转时间轴至窗口开始`}
      onClick={() => {
        onSelect?.(task);
        setJD(task.windowStart);
      }}
      className={`text-left rounded-sm border transition-colors px-2 py-1.5 ${
        selected
          ? 'border-amber-300/60 bg-amber-400/10 shadow-[0_0_8px_rgba(251,191,36,0.15)]'
          : 'border-sky-400/15 bg-sky-400/[0.04] hover:border-sky-400/40 hover:bg-sky-400/[0.09]'
      }`}
    >
      <div className="flex items-center gap-1.5 min-w-0">
        <span className="text-[11px] text-sky-100 truncate">{target}</span>
        <span className="ml-auto flex items-center gap-1 shrink-0">
          <span className="text-[9px] text-sky-400/80">
            {OBS_TYPE_ZH[task.type]}
          </span>
          <span className={`text-[9px] px-1 rounded-sm border ${prio.cls}`}>
            {prio.zh}
          </span>
        </span>
      </div>
      <div className="mt-1 flex items-center justify-between text-[9px] text-sky-400/80 tabular-nums">
        <span>
          {fmtJDShort(task.windowStart)} → {fmtJDShort(task.windowEnd)} UTC
        </span>
        <span>{task.params[3]?.[1]}</span>
      </div>
    </button>
  );
}
