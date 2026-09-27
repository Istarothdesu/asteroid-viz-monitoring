import { useNavigate, useParams } from 'react-router-dom';
import { ChevronLeft, Orbit, Rocket } from 'lucide-react';
import Panel from '@/components/ui/Panel';
import { useSimStore } from '@/store/simStore';
import { useLiveJd } from '@/hooks/useLiveJd';
import { formatL1Time } from '@/features/l1/store';
import { useMissionClock } from '@/features/l1/useMissionClock';
import { useMissionTasks } from '@/features/l1/useMissionTasks';
import {
  findL1Task,
  taskStatus,
  type L1TaskType,
} from '@/services/l1MissionService';
import {
  DetailPageHeader,
} from '@/components/common/atoms';
import {
  DETAIL_BACK_BUTTON_CLASS,
  TASK_STATUS_META,
} from '@/components/common/detailMeta';

const TYPE_ZH: Record<L1TaskType, string> = {
  survey: '天区巡天',
  characterization: '目标跟踪',
  calibration: '载荷校准',
};

const btnCls =
  'flex items-center justify-center gap-1.5 w-full px-3 py-1.5 rounded-sm text-[12px] border transition-all cursor-pointer whitespace-nowrap';

/**
 * L1 星任务详情 (路由 /situation/l1/task/:taskId): 任务基本信息、观测参数
 * 与窗口推演入口; 表征任务可直达目标小行星专题页。
 */
export default function L1TaskDetailPanel() {
  const { taskId } = useParams();
  const navigate = useNavigate();
  const jd = useLiveJd(500);
  const setJD = useSimStore((s) => s.setJD);
  useMissionClock(jd);

  const tasks = useMissionTasks(jd);
  const task = taskId ? findL1Task(tasks, taskId) : undefined;

  if (!task) {
    return (
      <Panel title="任务详情">
        <div className="flex flex-col items-center gap-2.5 py-6">
          <div className="text-[12px] text-sky-300/80">未找到该任务记录</div>
          <button
            type="button"
            className={DETAIL_BACK_BUTTON_CLASS}
            onClick={() => navigate('/situation/l1')}
          >
            <ChevronLeft size={13} /> 返回 L1星运行态势
          </button>
        </div>
      </Panel>
    );
  }

  const status = taskStatus(task, jd);
  const sm = TASK_STATUS_META[status];
  const durH = (task.end - task.start) * 24;
  const progress =
    status === 'executing'
      ? Math.min(1, Math.max(0, (jd - task.start) / (task.end - task.start)))
      : status === 'completed'
        ? 1
        : 0;

  return (
    <>
      {/* 返回按钮 + 页标题 */}
      <DetailPageHeader
        backLabel="L1星运行态势"
        onBack={() => navigate('/situation/l1')}
        title="任务详情"
      />
      <Panel
        title="任务详情"
        extra={
          <span
            className={`rounded px-1.5 py-0.5 text-[10px] border ${sm.cls}`}
          >
            {status === 'completed' ? '时段已过去' : status === 'executing' ? '时段内' : '未来时段'}
          </span>
        }
      >
        <div className="px-2.5 pb-2 flex flex-col gap-1.5">
          <div className="text-[14px] text-sky-50 glow-text leading-snug">
            {task.name}
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[9px] px-1.5 py-px rounded-sm border border-orange-400/40 text-orange-300 bg-orange-400/10">
              {TYPE_ZH[task.type]}
            </span>
            <span className="text-[9px] text-sky-400/70 tabular-nums">
              {task.id}
            </span>
          </div>

          <div className="pt-1 border-t border-sky-400/15 text-xs">
            {[
              ['窗口开始', formatL1Time(task.start)],
              ['窗口结束', formatL1Time(task.end)],
              [
                '窗口时长',
                durH >= 24
                  ? `${(durH / 24).toFixed(1)} 天`
                  : `${durH.toFixed(1)} 小时`,
              ],
            ].map(([k, v]) => (
              <div key={k} className="flex items-center justify-between py-1">
                <span className="text-sky-400/70">{k}</span>
                <span className="text-sky-100 tabular-nums">{v}</span>
              </div>
            ))}
          </div>

          {status === 'executing' && (
            <div className="pt-1">
              <div className="flex items-center justify-between text-[9px] text-sky-400/70 mb-1">
                <span>时段进度（非曝光完成率）</span>
                <span className="tabular-nums">
                  {Math.round(progress * 100)}%
                </span>
              </div>
              <div className="h-1 rounded-full bg-sky-400/10 overflow-hidden">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-emerald-400/80 to-sky-300"
                  style={{ width: `${Math.max(progress * 100, 2)}%` }}
                />
              </div>
            </div>
          )}

          {status === 'planned' && (
            <button
              type="button"
              className={`${btnCls} text-sky-200 border-sky-400/40 bg-sky-400/10 hover:bg-sky-400/20`}
              onClick={() => setJD(task.start)}
              title="将时间轴跳转至任务窗口开始"
            >
              推演至窗口开始
            </button>
          )}
        </div>
      </Panel>

      <Panel title="观测参数">
        <div className="px-2.5 py-2 text-xs flex flex-col gap-1">
          {task.params.map(([k, v]) => (
            <div key={k} className="flex items-center justify-between gap-2">
              <span className="text-sky-400/70 whitespace-nowrap">{k}</span>
              <span className="text-sky-100 text-right">{v}</span>
            </div>
          ))}
        </div>
        <div className="px-2.5 pb-2 pt-1 border-t border-sky-400/15 text-[11px] text-sky-300/85 leading-relaxed">
          {task.purpose}
        </div>
      </Panel>

      {task.type === 'characterization' && task.targetIdx != null && (
        <Panel title="关联目标">
          <div className="px-2.5 py-2 flex flex-col gap-1.5">
            <div className="flex items-center justify-between text-xs">
              <span className="text-sky-400/70">目标天体</span>
              <span className="text-sky-100">{task.targetName}</span>
            </div>
            <button
              type="button"
              className={`${btnCls} text-orange-200 border-orange-400/40 bg-orange-400/10 hover:bg-orange-400/20`}
              onClick={() => navigate(`/asteroid/${task.targetIdx}`)}
            >
              <Orbit size={13} /> 进入目标专题推演
            </button>
          </div>
        </Panel>
      )}

      <Panel title="计划回放说明">
        <div className="px-2.5 py-2 text-[11px] text-sky-300/85 leading-relaxed">
          {task.type === 'survey' &&
            '本次访问来自统一观测计划。姿态和有效曝光足迹由仿真时间派生，倒退时间会撤回未来足迹；未模拟探测与发现。'}
          {task.type === 'characterization' &&
            '已知目标跟踪计划使用缓存星历计算视线，并给出曝光姿态采样。几何检查不等于探测成功，未建模光行时、月球遮挡或信噪比。'}
          {task.type === 'calibration' &&
            '输入计划中的极区驻留校准示意，不生成科学曝光覆盖，未建模探测器响应或定标精度。'}
        </div>
        {task.type !== 'calibration' && (
          <div className="px-2.5 pb-2">
            <button
              type="button"
              className={`${btnCls} text-sky-300/90 border-sky-400/25 bg-[rgba(8,20,42,0.75)] hover:border-sky-300/70 hover:text-sky-100`}
              onClick={() => setJD(task.start)}
            >
              <Rocket size={13} /> 时间轴跳转至窗口开始
            </button>
          </div>
        )}
      </Panel>
    </>
  );
}
