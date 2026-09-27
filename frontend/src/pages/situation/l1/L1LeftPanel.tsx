import Panel from '@/components/ui/Panel';
import MetricCard from '@/components/hud/MetricCard';
import { useSimStore } from '@/store/simStore';
import { useLiveJd } from '@/hooks/useLiveJd';
import { AU_KM } from '@/utils/orbital/constants';
import { norm } from '@/features/l1/runtime';
import { getL1MissionProvider } from '@/features/l1/missionProvider';
import { useL1Store } from '@/features/l1/store';
import { useMissionClock } from '@/features/l1/useMissionClock';
import { useDataStore } from '@/store/dataStore';
import { Badge } from '@/components/ui/badge';
import { useObservationPlayback } from '@/features/l1/useObservationPlayback';

/**
 * L1星运行态势 · 左侧面板: 运行状态与遥测、当前任务、轨道参数。
 * 图层显隐和显示尺度统一由中央场景的交互式图层图例负责。
 * 任务列表 (计划/历史) 见右栏 (同目录 L1RightPanel)。
 */
export default function L1LeftPanel() {
  const detected = useSimStore((s) => s.surveyGeometricCount);
  const jd = useLiveJd(500);
  const reference = useL1Store(s => s.reference);
  const status = useL1Store(s => s.status);
  const loaded = useDataStore(s => s.loaded);
  const clock = useMissionClock(jd);
  const observer = getL1MissionProvider().getObserverState(jd);
  const profile = reference?.profile;
  const playback = useObservationPlayback(jd);

  return (
    <div className="flex shrink-0 flex-col gap-2.5">
      <Panel title="L1 巡天仿真状态" extra={<Badge variant="outline">模拟任务</Badge>}>
        <div className="px-3 py-2 text-xs text-muted-foreground">
          {observer ? '三体参考轨道 · 日地星历随动缩放映射' :
            status === 'loading' || !loaded ? '正在装载参考模型与星历' :
            status === 'unavailable' ? '参考模型不可用，未绘制卫星' : '地球星历未覆盖当前时刻，未绘制卫星'}
          <div className="mt-1 tabular-nums">{clock}</div>
        </div>
        <div className="grid grid-cols-2 gap-2 px-3 pb-2 pt-1">
          <MetricCard label="视场样本（几何）" value={observer ? detected : '—'} accent="#fbbf24" />
          <MetricCard label="距地距离" value={observer ? `${(observer.earthDistanceAu * AU_KM / 10000).toFixed(2)} 万km` : '—'} accent="#38bdf8" />
        </div>
        <div className="px-2.5 pb-2 text-xs">
          {[
            ['载荷状态', '仿真参考配置，非在轨遥测'],
            ['温度 / 下行', '未建模'],
            ['视场', playback ? `${playback.prepared.plan.instrument.fovWidthDeg}° × ${playback.prepared.plan.instrument.fovHeightDeg}°` : '—'],
            ['配置版本', profile ? `${profile.id} / v${profile.version}` : '—'],
            ['坐标 / 时标', 'ECLIPJ2000 / TDB'],
          ].map(([k, v]) => (
            <div key={k} className="flex items-center justify-between py-1">
              <span className="text-sky-400/70">{k}</span>
              <span className="text-sky-100">{v}</span>
            </div>
          ))}
        </div>
      </Panel>

      <Panel title="轨道参数">
        <div className="px-2.5 py-2 text-xs">
          {[
            ['轨道模型', 'L1 北支 Halo 三体参考解'],
            ['参考周期', reference ? `${reference.orbit.periodDays.toFixed(2)} 天` : '—'],
            ['距日距离', observer ? `${norm(observer.positionAu).toFixed(6)} AU` : '—'],
            ['轨道线', '当前日地随动基下的参考形状'],
            ['计划策略', playback?.prepared.plan.name ?? '—'],
          ].map(([k, v]) => (
            <div key={k} className="flex items-center justify-between py-1">
              <span className="text-sky-400/70">{k}</span>
              <span className="text-sky-100">{v}</span>
            </div>
          ))}
        </div>
        <div className="px-2.5 pb-2 text-xs text-muted-foreground">
          {profile?.assumptions.map(text => <p key={text} className="py-1">{text}</p>)}
          {reference && <a className="underline" href={reference.orbit.source} target="_blank" rel="noreferrer">NASA/JPL 参考初值来源</a>}
        </div>
      </Panel>
    </div>
  );
}
