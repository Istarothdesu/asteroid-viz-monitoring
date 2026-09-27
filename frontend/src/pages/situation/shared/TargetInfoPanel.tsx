import { useSelectionStore } from '@/store/selectionStore';
import { useLiveJd } from '@/hooks/useLiveJd';
import AsteroidInfoCard from './AsteroidInfoCard';
import StationInfoCard from './StationInfoCard';
import CelestialInfoCard from './CelestialInfoCard';
import EventInfoCard from './EventInfoCard';

/**
 * 目标信息面板: 按选中目标类型分派到各领域信息卡
 * (小行星/云粒子、监测站、自然天体、仿真事件)。
 */
export default function TargetInfoPanel() {
  const selected = useSelectionStore((s) => s.selected);
  const jd = useLiveJd();

  if (!selected) return null;

  switch (selected.kind) {
    case 'ast':
    case 'cloud':
      return <AsteroidInfoCard kind={selected.kind} idx={selected.idx} />;
    case 'station':
      return <StationInfoCard idx={selected.idx} />;
    case 'sun':
    case 'planet':
    case 'moon':
    case 'sat':
      return (
        <CelestialInfoCard kind={selected.kind} idx={selected.idx} jd={jd} />
      );
    case 'event':
      return <EventInfoCard />;
    default:
      return null;
  }
}
