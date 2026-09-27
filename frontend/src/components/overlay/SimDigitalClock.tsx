import { useLiveJd } from '@/hooks/useLiveJd';
import { useUIStore } from '@/store/uiStore';
import { useMissionClock } from '@/features/l1/useMissionClock';
import DigitalTimeDisplay from './DigitalTimeDisplay';

/**
 * 仿真电子钟 (顶部居中): 显示随播放/拖拽跳动的场景时间 jd。
 * 日期与时刻同一排、同字号 (七段数码管), 末尾 UTC 小标签; 时刻冒号每秒闪。
 * 走 useLiveJd(1000) 共享 1s 时钟 (读数仅秒精度, 无需更高频重渲染)。
 */
export default function SimDigitalClock() {
  const isL1Mission = useUIStore(s => s.mode === 'survey');
  const jd = useLiveJd(isL1Mission ? 500 : 1000);
  const missionTime = useMissionClock(jd, isL1Mission);
  if (isL1Mission && missionTime.startsWith('JD ')) {
    return <div role="timer" className="pointer-events-none rounded-sm border border-border bg-background/80 px-5 py-2 text-sm text-muted-foreground">仿真时间 {missionTime}</div>;
  }
  return <DigitalTimeDisplay
    jd={jd}
    dateText={isL1Mission ? missionTime.slice(0, 10) : undefined}
    timeText={isL1Mission ? missionTime.slice(11, 19) : undefined}
  />;
}
