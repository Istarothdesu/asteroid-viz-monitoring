import { useCallback, useEffect } from 'react';
import { useCameraStore } from '@/store/cameraStore';
import { useFrameStore } from '@/store/frameStore';
import { useSelectionStore } from '@/store/selectionStore';
import type { SelectionTarget } from '@/types/scene';

interface Options {
  subject: SelectionTarget | null;
  onTargetChange: (target: SelectionTarget) => void;
}

/** 保持专题主体、场景选中态与伴飞坐标系同步。 */
export function useAsteroidDetailScene({ subject, onTargetChange }: Options) {
  const frame = useFrameStore((state) => state.frame);
  const setFrame = useFrameStore((state) => state.setFrame);
  const setSelected = useSelectionStore((state) => state.setSelected);

  useEffect(() => {
    if (subject) setSelected(subject);
  }, [subject, setSelected]);

  useEffect(() => {
    return useSelectionStore.subscribe((state) => {
      const selected = state.selected;
      if (!selected) {
        if (subject) setSelected(subject);
        return;
      }
      if (
        (selected.kind === 'ast' || selected.kind === 'cloud')
        && (selected.kind !== subject?.kind || selected.idx !== subject.idx)
      ) {
        onTargetChange(selected);
      }
    });
  }, [onTargetChange, setSelected, subject]);

  const inComp = frame === 'comp';
  const toggleComp = useCallback(() => {
    const camera = useCameraStore.getState();
    camera.setFollowRequest(inComp);
    setFrame(inComp ? 'helio' : 'comp');
  }, [inComp, setFrame]);

  return { inComp, toggleComp };
}
