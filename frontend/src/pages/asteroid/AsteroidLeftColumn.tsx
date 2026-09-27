import { useNavigate } from 'react-router-dom';
import { ChevronLeft, Rocket, Undo2 } from 'lucide-react';
import Panel from '@/components/ui/Panel';
import { Button } from '@/components/ui/button';
import RiskBadge from '@/components/common/RiskBadge';
import { AU_KM } from '@/utils/orbital/constants';
import { fmtKm, fmtJD } from '@/utils/orbital/time';
import { useAsteroidDetail } from '@/features/asteroids/detail/AsteroidDetailContext';
import { DetailPageHeader, Chip, Tile } from '@/components/common/atoms';
import { DETAIL_BACK_BUTTON_CLASS } from '@/components/common/detailMeta';
import RiskScale from './widgets/RiskScale';
import ObsTaskCard from './widgets/ObsTaskCard';

/** 左列: 返回 + 页标题 / 目标概览 / 实时推演 / 危险评估 / 观测任务 */
export default function AsteroidLeftColumn() {
  const m = useAsteroidDetail();
  const navigate = useNavigate();

  if (!m) {
    return (
      <Panel title="小行星详情">
        <div className="flex flex-col items-center gap-2.5 py-6">
          <div className="text-[12px] text-sky-300/80">未找到该小行星记录</div>
          <button
            type="button"
            className={DETAIL_BACK_BUTTON_CLASS}
            onClick={() => navigate('/situation/overview')}
          >
            <ChevronLeft size={13} /> 返回实时态势
          </button>
        </div>
      </Panel>
    );
  }

  const {
    vm,
    jd,
    realtime,
    analysis,
    obsTasks,
    risk,
    reasons,
    inComp,
    toggleComp,
  } = m;

  return (
    <>
      {/* 返回按钮 + 页标题 */}
      <DetailPageHeader backLabel="返回态势" onBack={m.back} title="小行星详情" />

      {/* 目标概览: 图像 + 名称 + 语义徽章组 */}
      <Panel
        title="目标概览"
        extra={
          <span className="text-[10px] text-sky-500/70 tabular-nums">
            #{vm.en}
          </span>
        }
      >
        <div className="flex gap-2.5 px-1 pb-1.5">
          <div className="relative w-[84px] h-[84px] shrink-0 rounded-sm overflow-hidden border border-sky-400/25">
            <img
              src="/image/4k_ceres_fictional.jpg"
              alt={vm.name}
              className="w-full h-full object-cover"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-[rgba(3,10,25,0.7)] via-transparent to-transparent" />
          </div>
          <div className="flex-1 min-w-0 flex flex-col gap-2.5">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="hud-title text-[14px] text-sky-50">
                {vm.name}
              </span>
              <RiskBadge level={risk} />
            </div>
            <div className="text-[10px] text-sky-400/80">{vm.en}</div>
            <div className="flex flex-wrap gap-1">
              <Chip ok={analysis.neo}>
                {analysis.neo ? '近地小行星' : '非近地'}
              </Chip>
              <Chip ok={analysis.pha}>
                {analysis.pha ? '潜在危险' : 'PHA 未达标'}
              </Chip>
              <Chip ok={analysis.relation.label.includes('相交')}>
                {analysis.relation.kind.split(' ')[0]}
              </Chip>
            </div>
          </div>
        </div>
        <div className="px-1 pb-0.5 text-[10px] text-sky-300/75 leading-relaxed border-t border-sky-400/10 pt-1.5">
          {vm.cls}
        </div>
        {/* 伴飞切换: compIdx 已随选中同步, 原地切换坐标系即可, 不跳路由;
             云粒子不接入伴飞系 (compIdx 仅面向命名小行星), 保留聚焦跟随 */}
        {vm.kind === 'ast' && (
          <Button
            type="button"
            variant={inComp ? 'hud' : 'hudPrimary'}
            onClick={toggleComp}
            className="mx-1 mb-1 flex justify-center tracking-[1px] text-[12px]"
          >
            {inComp ? (
              <>
                <Undo2 size={13} /> 退出伴飞 · 返回日心跟随
              </>
            ) : (
              <>
                <Rocket size={13} /> 伴飞跟随视角
              </>
            )}
          </Button>
        )}
      </Panel>

      {/* 实时推演状态: 三瓦片随时间轴刷新 */}
      <Panel
        title="实时推演状态"
        extra={
          <span className="flex items-center gap-1 text-[9px] text-sky-400/80">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse-glow" />
            {fmtJD(jd).slice(0, 10)}
          </span>
        }
      >
        <div className="grid grid-cols-3 gap-2.5 px-1 pb-1.5">
          <Tile sym="r☉" v={realtime.distSun.toFixed(3)} label="距日 AU" />
          <Tile
            sym="r⊕"
            v={realtime.distEarth.toFixed(3)}
            label="距地 AU"
            color="#fbbf24"
          />
          <Tile
            sym="v"
            v={realtime.speed.toFixed(1)}
            label="相对 km/s"
            color="#f87171"
          />
        </div>
        <div className="px-1 pb-0.5 text-[9px] text-sky-500/70">
          距地 {fmtKm(realtime.distEarth * AU_KM)} · 随时间轴推演刷新
        </div>
      </Panel>

      {/* 危险等级评估: 五级刻度尺 + 能量对比 + 关注原因 */}
      <Panel title="危险等级评估" extra={<RiskBadge level={risk} />}>
        <div className="flex flex-col gap-2 px-1 pb-1">
          <RiskScale level={risk} />
          <div className="flex items-baseline justify-between">
            <span className="text-[10px] text-sky-400/70">撞击动能当量</span>
            <span className="text-[13px] tabular-nums text-orange-300 glow-text">
              {analysis.energyMt >= 1
                ? `${analysis.energyMt.toExponential(1)} Mt`
                : `${(analysis.energyMt * 1000).toFixed(1)} kt`}
            </span>
          </div>
          {/* 能量对比条: 广岛 0.015 Mt / 通古斯 12 Mt 双参照 */}
          <div className="flex flex-col gap-1">
            {[
              { label: '广岛原子弹', ref: 0.015 },
              { label: '通古斯事件', ref: 12 },
            ].map(({ label, ref }) => {
              const ratio = Math.min(analysis.energyMt / ref, 3) / 3;
              return (
                <div key={label} className="flex items-center gap-1.5">
                  <span className="w-14 text-[9px] text-sky-500/70 shrink-0">
                    {label}
                  </span>
                  <div className="flex-1 h-[4px] rounded-full bg-sky-400/10 overflow-hidden">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-orange-500/80 to-red-400"
                      style={{ width: `${Math.max(ratio * 100, 3)}%` }}
                    />
                  </div>
                  <span className="text-[9px] tabular-nums text-sky-300/80 w-12 text-right shrink-0">
                    ×{(analysis.energyMt / ref).toExponential(1)}
                  </span>
                </div>
              );
            })}
          </div>
          <div className="pt-1.5 border-t border-sky-400/15">
            <div className="text-[10px] text-sky-400/70 mb-1">关注原因</div>
            <ul className="flex flex-col gap-1">
              {reasons.map((r) => (
                <li
                  key={r}
                  className="flex gap-1.5 text-[10px] text-sky-200/90 leading-relaxed"
                >
                  <span className="text-orange-400 shrink-0">◆</span>
                  {r}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </Panel>

      {/* 相关观测任务: 各设施在可观测窗口内对该目标的观测安排 (由轨道几何推演) */}
      <Panel
        title="相关观测任务"
        extra={
          <span className="text-[9px] text-sky-400/80">
            共 {obsTasks.length} 项 · 未来 21–45 天窗口推演 · 点击跳转时刻
          </span>
        }
      >
        {obsTasks.length === 0 ? (
          <div className="px-1 pb-2 text-[10px] text-sky-500/70">
            未来 21–45 天内各观测设施无有效观测窗口 (目标处于不可观测几何位形)。
          </div>
        ) : (
          <div className="flex flex-col gap-1.5 px-1 pb-1">
            {obsTasks.map((t) => (
              <ObsTaskCard key={t.id} task={t} />
            ))}
          </div>
        )}
      </Panel>
    </>
  );
}
