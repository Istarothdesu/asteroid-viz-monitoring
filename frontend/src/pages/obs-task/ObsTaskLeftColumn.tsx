import { useNavigate } from 'react-router-dom';
import { ChevronLeft, Orbit, RadioTower } from 'lucide-react';
import Panel from '@/components/ui/Panel';
import { OBS_TYPE_ZH } from '@/services/obsTaskService';
import { fmtJDMinute, fmtKm } from '@/utils/orbital/time';
import {
  DetailPageHeader,
  KV,
} from '@/components/common/atoms';
import {
  DETAIL_BACK_BUTTON_CLASS,
  PRIORITY_META,
} from '@/components/common/detailMeta';
import { useObsTask } from './ObsTaskContext';

const btnCls =
  'flex items-center justify-center gap-1.5 w-full px-3 py-1.5 rounded-sm text-[12px] border transition-all cursor-pointer whitespace-nowrap';

/** 左列: 返回 + 页标题 / 任务概览 / 观测目标 / 设施观测能力 */
export default function ObsTaskLeftColumn() {
  const m = useObsTask();
  const navigate = useNavigate();

  if (!m) {
    return (
      <Panel title="观测任务详情">
        <div className="flex flex-col items-center gap-2.5 py-6">
          <div className="text-[12px] text-sky-300/80">
            未找到该任务记录 (请从监测站详情页进入)
          </div>
          <button
            type="button"
            className={DETAIL_BACK_BUTTON_CLASS}
            onClick={() => navigate('/situation/ground')}
          >
            <ChevronLeft size={13} /> 返回地面监测态势
          </button>
        </div>
      </Panel>
    );
  }

  const { task, st, spec, target, targetDistKm } = m;
  const prio = PRIORITY_META[task.priority];
  const durH = (task.windowEnd - task.windowStart) * 24;

  return (
    <>
      {/* 返回按钮 + 页标题 */}
      <DetailPageHeader backLabel="返回监测站" onBack={m.back} title="观测任务详情" />

      {/* 任务概览: 类型/优先级徽章 + 窗口信息 + 任务目的 */}
      <Panel
        title="任务概览"
        extra={
          <span className="text-[9px] text-sky-400/70 tabular-nums">
            {task.id}
          </span>
        }
      >
        <div className="px-1 pb-1">
          <div className="flex flex-wrap items-center gap-1 mb-1.5">
            <span className="text-[9px] px-1.5 py-0.5 rounded-sm border border-orange-400/40 text-orange-300 bg-orange-400/10">
              {OBS_TYPE_ZH[task.type]}
            </span>
            <span
              className={`text-[9px] px-1.5 py-0.5 rounded-sm border ${prio.cls}`}
            >
              优先级 · {prio.zh}
            </span>
          </div>
          <KV k="执行设施" v={task.facility} />
          <KV k="窗口开始" v={fmtJDMinute(task.windowStart)} />
          <KV k="窗口结束" v={fmtJDMinute(task.windowEnd)} />
          <KV
            k="窗口时长"
            v={durH >= 24 ? `${(durH / 24).toFixed(1)} 天` : `${durH} 小时`}
          />
          {task.params
            .filter(([k]) => k !== '目标')
            .map(([k, v]) => (
              <KV key={k} k={k} v={v} />
            ))}
          <div className="mt-1.5 pt-1.5 border-t border-sky-400/15 text-[10px] leading-relaxed text-sky-300/85">
            {task.purpose}
          </div>
        </div>
      </Panel>

      {/* 观测目标: 目标档案 + 窗口时刻距离 + 目标专题入口 */}
      <Panel
        title="观测目标"
        extra={
          <span className="text-[9px] text-sky-400/80">
            窗口时刻距地 {target ? fmtKm(targetDistKm) : '—'}
          </span>
        }
      >
        {target ? (
          <div className="px-1 pb-1">
            <div className="text-[13px] text-sky-50 leading-snug">
              {target.name}
            </div>
            <div className="text-[10px] text-sky-400/80 mb-1.5">
              {target.en}
            </div>
            <KV k="轨道分类" v={target.cls} />
            <KV
              k="估算直径"
              v={
                target.diam >= 1
                  ? `${target.diam.toFixed(2)} km`
                  : `${(target.diam * 1000).toFixed(0)} m`
              }
            />
            <KV k="半长轴" v={`${target.a.toFixed(3)} AU`} />
            <KV k="偏心率" v={target.e.toFixed(3)} />
            <button
              type="button"
              className={`${btnCls} mt-1.5 text-orange-200 border-orange-400/40 bg-orange-400/10 hover:bg-orange-400/20`}
              onClick={() => navigate(`/asteroid/${m.targetIdx}`)}
            >
              <Orbit size={13} /> 进入目标专题推演
            </button>
          </div>
        ) : (
          <div className="px-1 pb-2 text-[10px] text-sky-500/70">
            目标不在命名小行星库内, 暂无档案数据。
          </div>
        )}
      </Panel>

      {/* 设施观测能力: 台址设备规格 (监测站知识库) + 站点专题入口 */}
      {st && (
        <Panel title="设施观测能力">
          <div className="px-1 pb-1">
            <div className="text-[12px] text-sky-50 leading-snug">
              {st.name}
            </div>
            <div className="text-[10px] text-sky-400/80 mb-1.5">
              {st.type} · {st.country}
            </div>
            {spec?.aperture && <KV k="主镜口径" v={spec.aperture} />}
            {spec?.fov && <KV k="视场" v={spec.fov} />}
            {spec?.limitMag && <KV k="极限星等" v={spec.limitMag} />}
            {spec?.detector && <KV k="探测器" v={spec.detector} />}
            {spec?.band && <KV k="工作波段" v={spec.band} />}
            {spec?.exposure && <KV k="曝光策略" v={spec.exposure} />}
            {task.stationIdx != null && (
              <button
                type="button"
                className={`${btnCls} mt-1.5 text-sky-300/90 border-sky-400/25 bg-[rgba(8,20,42,0.75)] hover:border-sky-300/70 hover:text-sky-100`}
                onClick={() => navigate(`/station/${task.stationIdx}`)}
              >
                <RadioTower size={13} /> 进入监测站专题
              </button>
            )}
          </div>
        </Panel>
      )}
    </>
  );
}
