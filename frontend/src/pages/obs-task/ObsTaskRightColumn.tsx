import { Play, Timer } from 'lucide-react';
import Panel from '@/components/ui/Panel';
import { OBS_TYPE_ZH } from '@/services/obsTaskService';
import { fmtJDMinute } from '@/utils/orbital/time';
import { KV } from '@/components/common/atoms';
import { TASK_STATUS_META } from '@/components/common/detailMeta';
import { useObsTask } from './ObsTaskContext';

/** 右列: 仿真执行 (窗口状态 + 进度 + 仿真按钮) / 工程细节 (演示口径) */
export default function ObsTaskRightColumn() {
  const m = useObsTask();
  if (!m) return null;
  const { task, detail, status, progress } = m;
  const meta = TASK_STATUS_META[status];

  return (
    <>
      {/* 仿真执行: 窗口状态/进度 + 跳转与倍速播放 */}
      <Panel title="仿真执行">
        <div className="px-1 pb-1">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[10px] text-sky-400/70">窗口状态</span>
            <span
              className={`text-[9px] px-1.5 py-0.5 rounded-sm border ${meta.cls}`}
            >
              {meta.zh}
            </span>
          </div>
          <KV k="仿真时刻" v={fmtJDMinute(m.jd)} />
          <KV k="窗口开始" v={fmtJDMinute(task.windowStart)} />
          <KV k="窗口结束" v={fmtJDMinute(task.windowEnd)} />

          {/* 窗口进度 */}
          <div className="mt-1.5 mb-1 text-[9px] text-sky-400/70">
            窗口进度 {(progress * 100).toFixed(0)}%
          </div>
          <div className="h-[3px] rounded-full bg-sky-400/10 overflow-hidden mb-2">
            <div
              className={`h-full transition-all duration-500 ${
                status === 'executing'
                  ? 'bg-gradient-to-r from-emerald-400/80 to-sky-400/80'
                  : 'bg-sky-400/40'
              }`}
              style={{ width: `${progress * 100}%` }}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <button
              type="button"
              title="时间轴跳转至窗口开始时刻"
              onClick={m.jumpToStart}
              className="flex items-center justify-center gap-1.5 w-full px-3 py-1.5 rounded-sm text-[12px]
                text-sky-300/90 border border-sky-400/25 bg-[rgba(8,20,42,0.75)]
                hover:border-sky-300/70 hover:text-sky-100 hover:shadow-[0_0_10px_rgba(125,211,252,0.4)]
                transition-all cursor-pointer whitespace-nowrap"
            >
              <Timer size={13} /> 跳转窗口开始
            </button>
            <button
              type="button"
              title="跳转窗口开始, 按窗口时长按档适配倍速播放"
              onClick={m.simulate}
              className="flex items-center justify-center gap-1.5 w-full px-3 py-1.5 rounded-sm text-[12px] tracking-[1px]
                text-sky-50 cursor-pointer bg-gradient-to-r from-emerald-600/80 to-sky-600/80
                border border-emerald-300/40 hover:from-emerald-500 hover:to-sky-500
                hover:shadow-[0_0_16px_rgba(52,211,153,0.45)] transition-all whitespace-nowrap"
            >
              <Play size={13} /> 开始仿真模拟
            </button>
          </div>
          <div className="mt-1.5 text-[9px] text-sky-500/70 leading-relaxed">
            三维场景随仿真时钟联动: 单站聚焦视角呈现本站标记与视场光锥,
            目标按轨道要素实时推演。
          </div>
        </div>
      </Panel>

      {/* 工程细节: 曝光计划/精度/数据产品 (演示口径) */}
      <Panel
        title="工程细节"
        extra={
          <span className="text-[9px] text-amber-300/80">演示口径 · mock</span>
        }
      >
        <div className="px-1 pb-1">
          <KV k="提案编号" v={detail.proposal} />
          <KV k="首席观测员" v={detail.pi} />
          <KV k="单次曝光" v={detail.exposure} />
          <KV k="拍摄计划" v={detail.frames} />
          <KV k="观测节奏" v={detail.cadence} />
          <KV k="预期信噪比" v={detail.snr} />
          <KV k="预期精度" v={detail.precision} />
          <div className="mt-1.5 pt-1.5 border-t border-sky-400/15 text-[10px] leading-relaxed text-sky-300/85">
            <div className="text-sky-400/70 mb-0.5">预期成果</div>
            {detail.outcome}
            <div className="text-sky-400/70 mt-1.5 mb-0.5">数据归档</div>
            {detail.archive}
          </div>
          <div className="mt-1.5 text-[9px] text-sky-500/70 leading-relaxed">
            任务窗口与可见性由轨道几何真实推演; 曝光计划与预期精度等
            工程细节为按任务 ID 确定性派生的演示数据。
          </div>
        </div>
      </Panel>

      {/* 观测口径说明: 任务类型语义 */}
      <Panel title="任务口径说明">
        <div className="px-1 pb-1 text-[10px] leading-relaxed text-sky-300/85">
          {task.type === 'radar'
            ? '雷达观测: 利用行星雷达主动照射, 获取延迟-多普勒回波, 直接测量目标距离与径向速度, 对形状/自转状态约束最强, 仅适用于近地目标。'
            : `${OBS_TYPE_ZH[task.type]}: 被动成像测光, 延长观测弧段以收敛轨道不确定度, 兼顾光度变化监测。`}
        </div>
      </Panel>
    </>
  );
}
