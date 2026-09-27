import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Panel from '@/components/ui/Panel';
import { useLiveJd } from '@/hooks/useLiveJd';
import { formatL1Time, useL1Store } from '@/features/l1/store';
import { useMissionClock } from '@/features/l1/useMissionClock';
import { useMissionTasks } from '@/features/l1/useMissionTasks';
import {
  taskStatus,
  type L1Task,
  type L1TaskType,
} from '@/services/l1MissionService';
import ObservationPlanPanel from './ObservationPlanPanel';
import CurrentPlanPlaybackPanel from './CurrentPlanPlaybackPanel';

const TYPE_DOT: Record<L1TaskType, string> = {
  survey: 'bg-sky-400',
  characterization: 'bg-orange-400',
  calibration: 'bg-emerald-400',
};

/** 任务行: 类型色条 + 名称 + 窗口, 点击进入任务详情 */
function TaskRow({ task, onClick }: { task: L1Task; onClick: () => void }) {
  useL1Store(s => s.timeAxis);
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full flex items-center gap-2 px-2 py-1.5 rounded-sm text-left border border-transparent
        hover:bg-sky-400/[0.08] hover:border-sky-400/25 transition-colors"
    >
      <span
        className={`w-1 h-5 rounded-full shrink-0 ${TYPE_DOT[task.type]}`}
      />
      <span className="flex-1 min-w-0">
        <span className="block text-[11px] text-sky-100 truncate">
          {task.name}
        </span>
        <span className="block text-[9px] text-sky-400/70 tabular-nums">
          {formatL1Time(task.start)} → {formatL1Time(task.end)}
        </span>
      </span>
      <span className="text-sky-400/50 text-[11px] shrink-0">›</span>
    </button>
  );
}

/**
 * L1星运行态势 · 右栏: 计划输入、当前回放与任务列表。
 * 任务列表独立滚动，避免整列滚动导致关键计划状态离开视口。
 */
export default function L1RightPanel() {
  const jd = useLiveJd(500);
  const navigate = useNavigate();
  const [listTab, setListTab] = useState<'history' | 'plan'>('plan');
  useMissionClock(jd);

  /* 任务计划按仿真日生成 (随时间轴跨日刷新), 状态随实时时钟派生 */
  const tasks = useMissionTasks(jd);
  const list = useMemo(() => {
    const arr = tasks.filter((t) =>
      listTab === 'history'
        ? taskStatus(t, jd) === 'completed'
        : taskStatus(t, jd) !== 'completed',
    );
    return arr.sort((a, b) =>
      listTab === 'history' ? b.start - a.start : a.start - b.start,
    );
  }, [tasks, jd, listTab]);

  return (
    <div className="flex h-full min-h-0 flex-col gap-2.5 overflow-hidden pointer-events-auto">
      <ObservationPlanPanel jd={jd} />
      <CurrentPlanPlaybackPanel jd={jd} />
      <Panel
        className="flex-1 min-h-0"
        noPadding
        title="计划访问 / 校准时段"
        extra={
          <div className="flex gap-1">
            {(['plan', 'history'] as const).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setListTab(t)}
                className={`text-[10px] px-1.5 py-px rounded-sm border transition-all ${
                  listTab === t
                    ? 'text-sky-100 border-sky-400/60 bg-sky-400/15'
                    : 'text-sky-400/70 border-sky-400/15 hover:border-sky-400/40'
                }`}
              >
                {t === 'plan' ? '当前 / 未来' : '已过去'}
              </button>
            ))}
          </div>
        }
      >
        <div className="shrink-0 px-2 py-1 text-xs text-muted-foreground">由当前输入计划派生；每次访问包括转向、稳定和曝光。已过去不代表真实执行。</div>
        <div className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto px-1.5 pb-2 pt-0.5 hud-scroll">
          {list.map((t) => (
            <TaskRow
              key={t.id}
              task={t}
              onClick={() => navigate(`/situation/l1/task/${t.id}`)}
            />
          ))}
          {list.length === 0 && (
            <div className="px-2 py-2 text-[10px] text-sky-500/70">
              无任务记录
            </div>
          )}
        </div>
      </Panel>
    </div>
  );
}
