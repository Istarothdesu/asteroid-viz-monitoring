import { PLANETS, MOON } from '@/data/planets';
import { planetPos, moonPosRel } from '@/utils/orbital/planets';
import { AU_KM } from '@/utils/orbital/constants';
import { norm } from '@/features/l1/runtime';
import { getL1MissionProvider } from '@/features/l1/missionProvider';
import { useL1Store } from '@/features/l1/store';
import { useDataStore } from '@/store/dataStore';
import { fmtKm } from '@/utils/orbital/time';
import { selectionName } from '@/services/selection';
import { v3, dist3 } from './vec';
import InfoCardView, { type TargetInfo } from './InfoCardView';

/**
 * 自然天体信息卡: 太阳 / 行星 / 月球 / L1 巡天卫星。
 */
export default function CelestialInfoCard({
  kind,
  idx,
  jd,
}: {
  kind: 'sun' | 'planet' | 'moon' | 'sat';
  idx: number;
  jd: number;
}) {
  useL1Store(s => s.reference);
  useDataStore(s => s.loaded);
  const info = ((): TargetInfo | null => {
    /* 标题统一走 selectionName: 与相机状态签同一取名口径, 避免两处漂移 */
    const title = selectionName({ kind, idx });
    const earth = v3();
    planetPos(PLANETS[2], jd, earth);

    if (kind === 'sun') {
      return {
        title,
        rows: [
          ['类型', '恒星 (G2V)'],
          ['直径', '1,392,700 km'],
          ['质量', '1.989 × 10³⁰ kg'],
          ['光度', '3.828 × 10²⁶ W'],
        ],
        desc: '太阳系的中心天体，约占太阳系总质量的99.86%。',
      };
    }

    if (kind === 'planet') {
      const pl = PLANETS[idx];
      const pos = v3();
      planetPos(pl, jd, pos);
      const distSun = Math.sqrt(pos.x ** 2 + pos.y ** 2 + pos.z ** 2);
      const distEarth = dist3(pos, earth);
      return {
        title,
        rows: [
          ['赤道半径', `${pl.rKm.toLocaleString()} km`],
          ['当前距日', `${distSun.toFixed(4)} AU`],
          ['当前距地', `${fmtKm(distEarth * AU_KM)}`],
          ['轨道半长轴', `${pl.a0.toFixed(4)} AU`],
          ['轨道偏心率', pl.e0.toFixed(4)],
          ['轨道倾角', `${pl.i0.toFixed(2)}°`],
        ],
        desc: '',
      };
    }

    if (kind === 'moon') {
      const moonPos = moonPosRel(jd, v3());
      const moonWorld = {
        x: earth.x + moonPos.x,
        y: earth.y + moonPos.y,
        z: earth.z + moonPos.z,
        set() {},
      };
      const distEarth = dist3(moonWorld, earth) * AU_KM;
      return {
        title,
        rows: [
          ['半径', '1,737.4 km'],
          ['当前距地', fmtKm(distEarth)],
          ['轨道半长轴', `${MOON.a.toFixed(5)} AU (${fmtKm(MOON.a * AU_KM)})`],
          ['轨道偏心率', MOON.e.toFixed(4)],
          ['轨道周期', '27.32 天'],
        ],
        desc: '地球的唯一天然卫星。',
      };
    }

    const observer = getL1MissionProvider().getObserverState(jd);
    return {
      title,
      rows: [
        ['轨道模型', 'L1 Halo 三体参考解（仿真）'],
        ['距地', observer ? fmtKm(observer.earthDistanceAu * AU_KM) : '星历不可用'],
        ['距日', observer ? fmtKm(norm(observer.positionAu) * AU_KM) : '星历不可用'],
      ],
      desc: '仿真卫星，不是真实飞行任务；参考轨道映射到当前日地随动坐标基。',
    };
  })();

  return <InfoCardView info={info} />;
}
