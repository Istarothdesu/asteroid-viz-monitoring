import { useMemo } from 'react';
import Panel from '@/components/ui/Panel';
import MetricCard from '@/components/hud/MetricCard';
import DonutChart from '@/components/charts/DonutChart';
import { getGroundStationProvider } from '@/features/ground/stationProvider';
import { sceneRef } from '@/core/SceneManager';
import { useLiveJd } from '@/hooks/useLiveJd';

const COUNTRY_COLORS = [
  '#38bdf8',
  '#fb923c',
  '#fbbf24',
  '#34d399',
  '#7da2c9',
  '#c792ea',
  '#ff9ecb',
];

/**
 * 地面监测态势 · 左侧面板: 观测站统计、昼夜观测状态与国家分布。
 */
export default function GroundLeftPanel() {
  const stations = getGroundStationProvider().getStations();
  /* 低频订阅仿真时刻, 驱动昼夜状态刷新 */
  const jd = useLiveJd(2000);

  void jd;
  const nightCount = stations.reduce(
    (count, _station, index) => count + (sceneRef.current?.getStationNight(index) ? 1 : 0),
    0,
  );

  const countryDist = useMemo(() => {
    const map = new Map<string, number>();
    for (const st of stations)
      map.set(st.country, (map.get(st.country) ?? 0) + 1);
    return [...map.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([name, value], i) => ({
        name,
        value,
        color: COUNTRY_COLORS[i % COUNTRY_COLORS.length],
      }));
  }, [stations]);

  return (
    <>
      <Panel title="地面监测概况">
        <div className="grid grid-cols-2 gap-2 px-3 pb-3 pt-1">
          <MetricCard label="观测站总数" value={stations.length} />
          <MetricCard label="夜间观测中" value={nightCount} accent="#fbbf24" />
          <MetricCard
            label="白昼待命"
            value={stations.length - nightCount}
            accent="#7da2c9"
            className="col-span-2"
          />
        </div>
      </Panel>

      <Panel title="观测站国家分布">
        <DonutChart
          data={countryDist}
          centerTotal={stations.length}
          centerLabel="观测站"
        />
      </Panel>
    </>
  );
}
