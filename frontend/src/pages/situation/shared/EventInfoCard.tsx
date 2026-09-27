import { useMemo } from 'react';
import { useEventSimulationStore } from '@/store/eventSimulationStore';
import { fmtKm, fmtJD } from '@/utils/orbital/time';
import { fmtEnergy } from '@/utils/orbital/impact';
import InfoCardView, { type TargetInfo } from './InfoCardView';

/**
 * 仿真事件信息卡: 撞击/飞掠事件参数 (仿真激活时显示)。
 */
export default function EventInfoCard() {
  const activeEvent = useEventSimulationStore((s) => s.activeEvent);
  const jdEnc = useEventSimulationStore((s) => s.jdEnc);

  const info = useMemo((): TargetInfo | null => {
    if (!activeEvent) return null;
    const rows: [string, string][] = [
      ['类型', activeEvent.type === 'impact' ? '撞击事件' : '近距离飞掠预警'],
      ['遭遇时刻', fmtJD(jdEnc)],
      ['直径', `${Math.round(activeEvent.diam * 1000)} 米`],
    ];
    if (activeEvent.type === 'flyby' && activeEvent.missKm != null) {
      rows.push(['飞掠最近距离', fmtKm(activeEvent.missKm)]);
    }
    if (activeEvent.type === 'impact' && activeEvent.impactLat != null) {
      rows.push([
        '坠落地点',
        `${activeEvent.impactLat.toFixed(1)}°, ${activeEvent.impactLon?.toFixed(1)}°`,
      ]);
    }
    if (activeEvent.type === 'impact') {
      rows.push([
        '爆炸高度',
        activeEvent.burstAltKm ? `${activeEvent.burstAltKm} km (空爆)` : '地表',
      ]);
      if (activeEvent.energyMt != null)
        rows.push(['爆炸能量', fmtEnergy(activeEvent.energyMt)]);
      if (activeEvent.shockAreaKm2 != null) {
        rows.push([
          '冲击波范围',
          `${Math.round(activeEvent.shockAreaKm2).toLocaleString()} km²`,
        ]);
      }
    }
    return {
      title: activeEvent.name,
      rows,
      desc: activeEvent.desc,
    };
  }, [activeEvent, jdEnc]);

  return <InfoCardView info={info} />;
}
