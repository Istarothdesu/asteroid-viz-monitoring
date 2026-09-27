import { getGroundStationProvider } from '@/features/ground/stationProvider';
import { sceneRef } from '@/core/SceneManager';
import { useLiveJd } from '@/hooks/useLiveJd';
import InfoCardView, { type TargetInfo } from './InfoCardView';

/**
 * 地面监测站目标信息卡: 站址/设备/昼夜观测状态
 * (昼夜随仿真时钟低频刷新)。
 */
export default function StationInfoCard({ idx }: { idx: number }) {
  /* 低频订阅仿真时刻, 驱动昼夜状态刷新 */
  const jd = useLiveJd(2000);

  void jd;
  const station = getGroundStationProvider().getStations()[idx];
  const info: TargetInfo | null = station
    ? {
      title: station.name,
      rows: [
        ['国家', station.country],
        ['设备类型', station.type],
        [
          '纬度',
          `${Math.abs(station.lat).toFixed(2)}° ${station.lat >= 0 ? 'N' : 'S'}`,
        ],
        [
          '经度',
          `${Math.abs(station.lon).toFixed(2)}° ${station.lon >= 0 ? 'E' : 'W'}`,
        ],
        ['当前状态', sceneRef.current?.getStationNight(idx) ? '黑天, 观测光锥开启' : '白天, 观测光锥关闭'],
      ],
      desc: station.desc,
    }
    : null;

  return <InfoCardView info={info} />;
}
