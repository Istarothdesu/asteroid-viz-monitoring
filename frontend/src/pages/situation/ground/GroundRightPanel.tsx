import { useSelectionStore } from '@/store/selectionStore';
import StationListPanel from './StationListPanel';
import TargetInfoPanel from '../shared/TargetInfoPanel';
import ReplayPanel from '../shared/ReplayPanel';

/**
 * 地面监测态势 · 右栏组装: 地面监测站列表 + 目标信息 + 仿真信息。
 */
export default function GroundRightPanel() {
  const setSelected = useSelectionStore((s) => s.setSelected);

  return (
    <div className="flex h-full min-h-0 flex-col gap-2.5 pointer-events-auto">
      <StationListPanel onSelect={setSelected} />
      <TargetInfoPanel />
      <ReplayPanel />
    </div>
  );
}
