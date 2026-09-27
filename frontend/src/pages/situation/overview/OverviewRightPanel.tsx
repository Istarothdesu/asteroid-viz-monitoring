import { useSelectionStore } from '@/store/selectionStore';
import { useFrameStore } from '@/store/frameStore';
import AsteroidListPanel from './AsteroidListPanel';
import TargetInfoPanel from '../shared/TargetInfoPanel';
import ReplayPanel from '../shared/ReplayPanel';
import type { SelectionTarget } from '@/types/scene';

/**
 * 小行星态势 · 右栏组装: 小行星库 + 目标信息 + 仿真信息。
 */
export default function OverviewRightPanel() {
  const setSelected = useSelectionStore((s) => s.setSelected);
  const setCompIdx = useFrameStore((s) => s.setCompIdx);

  // 选中小行星同时设为伴飞目标 (随体固连坐标系)
  const handleAstSelect = (t: SelectionTarget) => {
    setSelected(t);
    setCompIdx(t.idx);
  };

  return (
    <div className="flex h-full min-h-0 flex-col gap-2.5 pointer-events-auto">
      <AsteroidListPanel onSelect={handleAstSelect} />
      <TargetInfoPanel />
      <ReplayPanel />
    </div>
  );
}
