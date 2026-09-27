import { useSimStore } from '@/store/simStore';
import { OBS_TYPE_ZH, type ObsTask } from '@/services/obsTaskService';
import { fmtJDShort } from '@/utils/orbital/time';
import { PRIORITY_META } from '@/components/common/detailMeta';

const TYPE_META: Record<ObsTask['type'], { dot: string; label: string }> = {
  characterization: { dot: 'bg-orange-400', label: 'L1' },
  followup: { dot: 'bg-emerald-400', label: '地面' },
  radar: { dot: 'bg-rose-400', label: '雷达' },
};

/** 单条观测任务: 设施 + 类型/优先级徽章 + 窗口 + 参数; 点击跳转时间轴至窗口开始 */
export default function ObsTaskCard({ task }: { task: ObsTask }) {
  const setJD = useSimStore((s) => s.setJD);
  const prio = PRIORITY_META[task.priority];
  const tm = TYPE_META[task.type];
  return (
    <button
      type="button"
      title={`${task.purpose} · 点击将时间轴跳转至窗口开始`}
      onClick={() => setJD(task.windowStart)}
      className="text-left rounded-sm border border-sky-400/15 bg-sky-400/[0.04]
        hover:border-sky-400/40 hover:bg-sky-400/[0.09] transition-colors px-2 py-1.5"
    >
      <div className="flex items-center gap-1.5 min-w-0">
        <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${tm.dot}`} />
        <span className="text-[11px] text-sky-100 truncate">
          {task.facility}
        </span>
        <span className="ml-auto flex items-center gap-1 shrink-0">
          <span className="text-[9px] text-sky-400/80">
            {OBS_TYPE_ZH[task.type]}
          </span>
          <span className={`text-[9px] px-1 rounded-sm border ${prio.cls}`}>
            {prio.zh}
          </span>
        </span>
      </div>
      <div className="mt-1 flex items-center justify-between text-[9px] text-sky-400/80">
        <span className="tabular-nums">
          {fmtJDShort(task.windowStart)} → {fmtJDShort(task.windowEnd)} UTC
        </span>
        <span>{tm.label}</span>
      </div>
      <div className="mt-0.5 flex flex-wrap gap-x-2.5 gap-y-0">
        {task.params.map(([k, v]) => (
          <span key={k} className="text-[9px] text-sky-500/70">
            {k} <span className="text-sky-300/80">{v}</span>
          </span>
        ))}
      </div>
    </button>
  );
}
