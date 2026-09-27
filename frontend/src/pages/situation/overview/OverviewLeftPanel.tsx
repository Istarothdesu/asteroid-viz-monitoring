import { useEffect, useState } from 'react';
import Panel from '@/components/ui/Panel';
import MetricCard from '@/components/hud/MetricCard';
import DonutChart from '@/components/charts/DonutChart';
import BarChart from '@/components/charts/BarChart';
import { PanelLoadingShell } from '@/components/ui/Loading';
import { getOverviewStats, type OverviewStats } from '@/services/statsService';

/**
 * 小行星态势 · 左侧面板: 概览指标 + 风险/距离/轨道类型分布图表。
 */
export default function OverviewLeftPanel() {
  const [stats, setStats] = useState<OverviewStats | null>(null);

  useEffect(() => {
    void getOverviewStats().then(setStats);
  }, []);

  if (!stats) return <PanelLoadingShell title="小行星态势" />;

  return (
    <>
      <Panel
        title="小行星态势"
        extra={
          <span className="text-[10px] text-sky-400/60">
            更新时间 {stats.updateTime}
          </span>
        }
      >
        <div className="grid grid-cols-2 gap-2 px-3 pb-3 pt-1">
          <MetricCard label="监测目标" value={stats.total} />
          <MetricCard label="近地小行星" value={stats.neo} accent="#38bdf8" />
          <MetricCard label="重点关注" value={stats.focus} accent="#fbbf24" />
          <MetricCard label="高风险" value={stats.highRisk} accent="#f87171" />
        </div>
      </Panel>

      <Panel title="风险等级分布">
        <DonutChart data={stats.riskDist} centerTotal={stats.total} />
      </Panel>

      <Panel title="距离分布 (AU)">
        <BarChart
          labels={stats.distBuckets.map((b) => b.label)}
          values={stats.distBuckets.map((b) => b.value)}
        />
      </Panel>

      <Panel title="轨道类型分布">
        <DonutChart data={stats.orbitTypes} centerTotal={stats.total} />
      </Panel>
    </>
  );
}
