import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FileSearch } from 'lucide-react';
import Panel from '@/components/ui/Panel';
import { Button } from '@/components/ui/button';
import { useDataStore } from '@/store/dataStore';
import { OBS_TYPE_ZH, type ObsTask } from '@/services/obsTaskService';
import { fmtJDMinute } from '@/utils/orbital/time';
import { useStationDetail } from './StationDetailContext';
import TaskRow from './widgets/TaskRow';

const PRIO_ZH: Record<ObsTask['priority'], string> = {
  urgent: '紧急',
  high: '高',
  medium: '中',
  low: '低',
};

/** 右列: 计划观测任务 (选中态) / 选中任务详情 */
export default function StationRightColumn() {
  const m = useStationDetail();
  const navigate = useNavigate();
  const asteroids = useDataStore((s) => s.asteroids);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  if (!m) return null;
  const { stationTasks } = m;

  /* 默认选中首条; 列表刷新后选中项失效时回退首条 */
  const selected =
    stationTasks.find((t) => t.id === selectedId) ?? stationTasks[0];

  const targetName =
    selected?.params.find(([k]) => k === '目标')?.[1] ?? '';
  const targetIdx = targetName
    ? asteroids.findIndex((a) => a.name === targetName)
    : -1;

  return (
    <>
      {/* 计划观测任务: 未来 21 天窗口推演, 点击选中并跳转窗口开始 */}
      <Panel
        title="计划观测任务"
        extra={
          <span className="text-[9px] text-sky-400/80">
            共 {stationTasks.length} 项 · 未来 21 天窗口 · 点击选中
          </span>
        }
      >
        {stationTasks.length === 0 ? (
          <div className="px-1 pb-2 text-[10px] text-sky-500/70">
            未来 21 天内本站对命名小行星库无有效观测窗口
            (目标处于不可观测几何位形)。
          </div>
        ) : (
          <div className="flex flex-col gap-1.5 px-1 pb-1">
            {stationTasks.map((t) => (
              <TaskRow
                key={t.id}
                task={t}
                selected={t.id === selected?.id}
                onSelect={(task) => setSelectedId(task.id)}
              />
            ))}
          </div>
        )}
      </Panel>

      {/* 选中任务详情: 任务介绍 + 观测目标 + 专题入口 */}
      <Panel
        title="选中任务详情"
        extra={
          selected && (
            <span className="text-[9px] text-sky-400/70 tabular-nums">
              {selected.id}
            </span>
          )
        }
      >
        {!selected ? (
          <div className="px-1 pb-2 text-[10px] text-sky-500/70">
            请在上方任务列表中选择一个观测任务。
          </div>
        ) : (
          <div className="flex flex-col gap-2 px-1 pb-1">
            <div className="text-[10px] text-sky-300/85 leading-relaxed">
              {selected.purpose}
            </div>
            <div className="flex flex-col gap-[3px]">
              {[
                ['任务类型', OBS_TYPE_ZH[selected.type]],
                ['优先级', PRIO_ZH[selected.priority]],
                ['执行设施', selected.facility],
                ['窗口开始', fmtJDMinute(selected.windowStart)],
                ['窗口结束', fmtJDMinute(selected.windowEnd)],
              ].map(([k, v]) => (
                <div
                  key={k}
                  className="flex items-baseline justify-between gap-2"
                >
                  <span className="text-[10px] text-sky-400/70 shrink-0">
                    {k}
                  </span>
                  <span className="text-[10px] text-sky-100 tabular-nums text-right">
                    {v}
                  </span>
                </div>
              ))}
              {selected.params
                .filter(([k]) => k !== '目标')
                .map(([k, v]) => (
                  <div
                    key={k}
                    className="flex items-baseline justify-between gap-2"
                  >
                    <span className="text-[10px] text-sky-400/70 shrink-0">
                      {k}
                    </span>
                    <span className="text-[10px] text-sky-100 text-right">
                      {v}
                    </span>
                  </div>
                ))}
            </div>

            {/* 观测目标列表: 点击直达小行星专题 */}
            <div className="pt-1.5 border-t border-sky-400/15">
              <div className="text-[10px] text-sky-400/70 mb-1">观测目标</div>
              <button
                type="button"
                title="进入小行星专题页"
                onClick={() => {
                  if (targetIdx >= 0) {
                    window.open(`/asteroid/${targetIdx}`, '_blank');
                    // navigate(`/asteroid/${targetIdx}`);
                  }
                }}
                className="w-full flex items-center gap-2 rounded-sm border border-sky-400/15 bg-sky-400/[0.04]
                  hover:border-sky-400/40 hover:bg-sky-400/[0.09] transition-colors px-2 py-1.5 text-left"
              >
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0" />
                <span className="text-[11px] text-sky-100 truncate flex-1">
                  {targetName || '—'}
                </span>
                <span className="text-[9px] text-sky-400/80 shrink-0">
                  {targetIdx >= 0 ? '查看专题 ↗' : '库外目标'}
                </span>
              </button>
            </div>

            {/* 专题详情入口: 携带任务对象跳转观测任务专题页 */}
            <Button
              type="button"
              variant="hudPrimary"
              onClick={() =>
                navigate(`/obs-task/${encodeURIComponent(selected.id)}`, {
                  state: { task: selected },
                })
              }
              className="w-full tracking-[1px] text-[12px]"
            >
              <FileSearch size={13} /> 专题详情
            </Button>
          </div>
        )}
      </Panel>
    </>
  );
}
